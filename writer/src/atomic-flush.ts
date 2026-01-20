/**
 * Atomic Flush Writer
 *
 * Implements atomic block write + manifest update using a Write-Ahead Log (WAL) pattern.
 * This ensures that data is not lost if a process crashes between:
 * 1. Writing a block to R2
 * 2. Updating the manifest
 *
 * The pattern uses two-phase commit semantics:
 * - Phase 1 (Prepare): Write pending flush record to DO, then write block to R2
 * - Phase 2 (Commit): Mark flush as committed, remove from pending
 *
 * Recovery on startup:
 * - Check for pending flushes
 * - If R2 block exists: recover metadata for manifest update
 * - If R2 block missing: retry the R2 write
 */

import type { R2Bucket, BlockMetadata, WalEntry, ColumnZoneMap } from './types.js';
import {
  writeBlock,
  encode,
  shred,
  type EncodedColumn,
} from '@evodb/core';
import { makeR2BlockKey, generateBlockId } from './r2-writer.js';

/**
 * Status of a pending flush operation
 */
export type FlushStatus = 'pending' | 'r2_written' | 'committed' | 'failed';

/**
 * Pending flush record stored in DO for crash recovery
 */
export interface PendingFlush {
  /** Unique flush ID */
  id: string;
  /** R2 key where the block will be/was written */
  r2Key: string;
  /** Minimum LSN in the block */
  minLsn: string; // bigint as string for serialization
  /** Maximum LSN in the block */
  maxLsn: string; // bigint as string for serialization
  /** Block sequence number */
  seq: number;
  /** Timestamp when flush started */
  timestamp: number;
  /** Serialized WAL entries for retry */
  entriesJson: string;
  /** Current status */
  status: FlushStatus;
  /** Row count (if known) */
  rowCount?: number;
  /** Size in bytes (if known) */
  sizeBytes?: number;
  /** Column stats (if known) */
  columnStats?: ColumnZoneMap[];
  /** Error message if failed */
  error?: string;
}

/**
 * Result of an atomic flush operation
 */
export interface AtomicFlushResult {
  success: boolean;
  flushId?: string;
  metadata?: BlockMetadata;
  error?: string;
}

/**
 * Result of flush recovery
 */
export interface FlushRecoveryResult {
  /** Flushes that had R2 blocks and were recovered */
  recovered: BlockMetadata[];
  /** Flushes that were retried (R2 write was missing) */
  retried: BlockMetadata[];
  /** Flushes that failed and need manual intervention */
  failed: Array<{ flush: PendingFlush; error: string }>;
}

/**
 * DO storage interface
 */
export interface DOStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
  list(options?: { prefix?: string }): Promise<Map<string, unknown>>;
}

/**
 * Options for AtomicFlushWriter
 */
export interface AtomicFlushWriterOptions {
  tableLocation: string;
  schemaId?: number;
  maxRetries: number;
  retryBackoffMs: number;
}

/**
 * AtomicFlushWriter provides crash-safe block writes using a WAL pattern
 */
export class AtomicFlushWriter {
  private readonly r2Bucket: R2Bucket;
  private readonly options: AtomicFlushWriterOptions;
  private doStorage: DOStorage | null = null;
  private committedBlocks: BlockMetadata[] = [];

  constructor(r2Bucket: R2Bucket, options: AtomicFlushWriterOptions) {
    this.r2Bucket = r2Bucket;
    this.options = {
      schemaId: 0,
      ...options,
    };
  }

  /**
   * Set DO storage for persistence
   */
  setDOStorage(storage: DOStorage): void {
    this.doStorage = storage;
  }

  /**
   * Generate a unique flush ID
   */
  private generateFlushId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `flush-${timestamp}-${random}`;
  }

  /**
   * Get pending flushes from DO storage
   */
  private async getPendingFlushes(): Promise<PendingFlush[]> {
    if (!this.doStorage) return [];
    const pending = await this.doStorage.get<PendingFlush[]>('atomic:pending');
    return pending ?? [];
  }

  /**
   * Save pending flushes to DO storage
   */
  private async savePendingFlushes(flushes: PendingFlush[]): Promise<void> {
    if (!this.doStorage) return;
    await this.doStorage.put('atomic:pending', flushes);
  }

  /**
   * Add a pending flush
   */
  private async addPendingFlush(flush: PendingFlush): Promise<void> {
    const pending = await this.getPendingFlushes();
    pending.push(flush);
    await this.savePendingFlushes(pending);
  }

  /**
   * Update a pending flush
   */
  private async updatePendingFlush(flushId: string, updates: Partial<PendingFlush>): Promise<void> {
    const pending = await this.getPendingFlushes();
    const index = pending.findIndex(f => f.id === flushId);
    if (index !== -1) {
      pending[index] = { ...pending[index], ...updates };
      await this.savePendingFlushes(pending);
    }
  }

  /**
   * Remove a pending flush
   */
  private async removePendingFlush(flushId: string): Promise<void> {
    const pending = await this.getPendingFlushes();
    const filtered = pending.filter(f => f.id !== flushId);
    await this.savePendingFlushes(filtered);
  }

  /**
   * Serialize WAL entries for storage
   */
  private serializeEntries(entries: WalEntry[]): string {
    return JSON.stringify(entries.map(e => ({
      lsn: e.lsn.toString(),
      timestamp: e.timestamp.toString(),
      op: e.op,
      flags: e.flags,
      data: Array.from(e.data),
      checksum: e.checksum,
    })));
  }

  /**
   * Deserialize WAL entries from storage
   */
  private deserializeEntries(json: string): WalEntry[] {
    const parsed = JSON.parse(json) as Array<{
      lsn: string;
      timestamp: string;
      op: number;
      flags: number;
      data: number[];
      checksum: number;
    }>;
    return parsed.map(e => ({
      lsn: BigInt(e.lsn),
      timestamp: BigInt(e.timestamp),
      op: e.op,
      flags: e.flags,
      data: new Uint8Array(e.data),
      checksum: e.checksum,
    }));
  }

  /**
   * Decode WAL entries to documents for block writing
   */
  private decodeWalEntries(entries: WalEntry[]): unknown[] {
    const documents: unknown[] = [];
    const decoder = new TextDecoder();

    for (const entry of entries) {
      try {
        // Try to decode as JSON first
        const text = decoder.decode(entry.data);
        try {
          documents.push(JSON.parse(text));
        } catch {
          // If not JSON, use as string
          documents.push({ value: text });
        }
      } catch {
        // Skip malformed entries
        console.warn('Failed to decode WAL entry:', entry.lsn);
      }
    }

    return documents;
  }

  /**
   * Extract column statistics for zone maps
   */
  private extractColumnStats(columns: EncodedColumn[]): ColumnZoneMap[] {
    return columns.map(col => ({
      path: col.path,
      min: col.stats.min,
      max: col.stats.max,
      nullCount: col.stats.nullCount,
      distinctEst: col.stats.distinctEst,
    }));
  }

  /**
   * Write block data to R2 with retry logic
   */
  private async writeToR2WithRetry(key: string, data: Uint8Array, rowCount: number): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.options.maxRetries; attempt++) {
      try {
        await this.r2Bucket.put(key, data, {
          httpMetadata: {
            contentType: 'application/x-cjlb',
          },
          customMetadata: {
            'x-block-version': '1',
            'x-row-count': String(rowCount),
            'x-atomic-flush': 'true',
          },
        });
        return; // Success
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.options.maxRetries - 1) {
          // Wait before retry with exponential backoff
          const delay = this.options.retryBackoffMs * Math.pow(2, attempt);
          await this.sleep(delay);
        }
      }
    }

    throw lastError ?? new Error('Write failed after retries');
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Phase 1: Prepare a flush (write pending record, then write to R2)
   */
  async prepareFlush(
    entries: WalEntry[],
    minLsn: bigint,
    maxLsn: bigint,
    seq: number
  ): Promise<AtomicFlushResult> {
    if (entries.length === 0) {
      return { success: false, error: 'No entries to flush' };
    }

    const timestamp = Date.now();
    const flushId = this.generateFlushId();
    const r2Key = makeR2BlockKey(this.options.tableLocation, timestamp, seq);
    const blockId = generateBlockId(timestamp, seq);

    try {
      // Step 1: Record pending flush in DO (WAL record)
      const pendingFlush: PendingFlush = {
        id: flushId,
        r2Key,
        minLsn: minLsn.toString(),
        maxLsn: maxLsn.toString(),
        seq,
        timestamp,
        entriesJson: this.serializeEntries(entries),
        status: 'pending',
      };

      await this.addPendingFlush(pendingFlush);

      // Step 2: Write block to R2
      const documents = this.decodeWalEntries(entries);
      const columns = shred(documents);
      const encodedColumns = encode(columns);
      const blockData = writeBlock(encodedColumns, {
        schemaId: this.options.schemaId,
        minLsn,
        maxLsn,
        rowCount: documents.length,
      });

      const columnStats = this.extractColumnStats(encodedColumns);

      await this.writeToR2WithRetry(r2Key, blockData, documents.length);

      // Step 3: Update pending flush status
      await this.updatePendingFlush(flushId, {
        status: 'r2_written',
        rowCount: documents.length,
        sizeBytes: blockData.byteLength,
        columnStats,
      });

      const metadata: BlockMetadata = {
        id: blockId,
        r2Key,
        rowCount: documents.length,
        sizeBytes: blockData.byteLength,
        minLsn,
        maxLsn,
        createdAt: timestamp,
        compacted: false,
        columnStats,
      };

      return {
        success: true,
        flushId,
        metadata,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Update pending flush with error
      await this.updatePendingFlush(flushId, {
        status: 'failed',
        error: errorMessage,
      });

      return {
        success: false,
        flushId,
        error: errorMessage,
      };
    }
  }

  /**
   * Phase 2: Commit a flush (mark as committed, remove from pending)
   */
  async commitFlush(flushId: string): Promise<boolean> {
    try {
      // Get the pending flush
      const pending = await this.getPendingFlushes();
      const flush = pending.find(f => f.id === flushId);

      if (!flush) {
        // Already committed or never existed - idempotent success
        return true;
      }

      // Remove from pending
      await this.removePendingFlush(flushId);

      return true;
    } catch (error) {
      console.error('Failed to commit flush:', error);
      return false;
    }
  }

  /**
   * Rollback a prepared flush (delete R2 block, remove from pending)
   */
  async rollbackFlush(flushId: string): Promise<boolean> {
    try {
      const pending = await this.getPendingFlushes();
      const flush = pending.find(f => f.id === flushId);

      if (!flush) {
        // Nothing to rollback
        return true;
      }

      // Delete the R2 block if it exists
      try {
        await this.r2Bucket.delete(flush.r2Key);
      } catch {
        // Ignore delete errors - block may not exist
      }

      // Remove from pending
      await this.removePendingFlush(flushId);

      return true;
    } catch (error) {
      console.error('Failed to rollback flush:', error);
      return false;
    }
  }

  /**
   * Atomic flush: prepare and commit in one operation
   */
  async atomicFlush(
    entries: WalEntry[],
    minLsn: bigint,
    maxLsn: bigint,
    seq: number
  ): Promise<AtomicFlushResult> {
    // Prepare
    const prepareResult = await this.prepareFlush(entries, minLsn, maxLsn, seq);

    if (!prepareResult.success) {
      return prepareResult;
    }

    // Commit
    const committed = await this.commitFlush(prepareResult.flushId!);

    if (!committed) {
      return {
        success: false,
        flushId: prepareResult.flushId,
        error: 'Failed to commit flush',
      };
    }

    // Track committed block for manifest integration
    if (prepareResult.metadata) {
      this.committedBlocks.push(prepareResult.metadata);
    }

    return prepareResult;
  }

  /**
   * Recover pending flushes after a crash
   */
  async recoverPendingFlushes(): Promise<FlushRecoveryResult> {
    const result: FlushRecoveryResult = {
      recovered: [],
      retried: [],
      failed: [],
    };

    const pending = await this.getPendingFlushes();

    for (const flush of pending) {
      try {
        // Check if R2 block exists
        const head = await this.r2Bucket.head(flush.r2Key);

        if (head) {
          // Block exists - recover metadata
          const metadata: BlockMetadata = {
            id: generateBlockId(flush.timestamp, flush.seq),
            r2Key: flush.r2Key,
            rowCount: flush.rowCount ?? parseInt(head.customMetadata?.['x-row-count'] ?? '0', 10),
            sizeBytes: flush.sizeBytes ?? head.size,
            minLsn: BigInt(flush.minLsn),
            maxLsn: BigInt(flush.maxLsn),
            createdAt: flush.timestamp,
            compacted: false,
            columnStats: flush.columnStats,
          };

          result.recovered.push(metadata);
          this.committedBlocks.push(metadata);

          // Remove from pending
          await this.removePendingFlush(flush.id);
        } else if (flush.status === 'pending' || flush.status === 'failed') {
          // Block doesn't exist - retry the write
          try {
            const entries = this.deserializeEntries(flush.entriesJson);
            const documents = this.decodeWalEntries(entries);
            const columns = shred(documents);
            const encodedColumns = encode(columns);
            const blockData = writeBlock(encodedColumns, {
              schemaId: this.options.schemaId,
              minLsn: BigInt(flush.minLsn),
              maxLsn: BigInt(flush.maxLsn),
              rowCount: documents.length,
            });

            const columnStats = this.extractColumnStats(encodedColumns);

            await this.writeToR2WithRetry(flush.r2Key, blockData, documents.length);

            const metadata: BlockMetadata = {
              id: generateBlockId(flush.timestamp, flush.seq),
              r2Key: flush.r2Key,
              rowCount: documents.length,
              sizeBytes: blockData.byteLength,
              minLsn: BigInt(flush.minLsn),
              maxLsn: BigInt(flush.maxLsn),
              createdAt: flush.timestamp,
              compacted: false,
              columnStats,
            };

            result.retried.push(metadata);
            this.committedBlocks.push(metadata);

            // Remove from pending
            await this.removePendingFlush(flush.id);
          } catch (retryError) {
            const errorMessage = retryError instanceof Error ? retryError.message : String(retryError);
            result.failed.push({ flush, error: errorMessage });

            // Update status
            await this.updatePendingFlush(flush.id, {
              status: 'failed',
              error: errorMessage,
            });
          }
        } else {
          // r2_written status but block doesn't exist - inconsistent state
          result.failed.push({
            flush,
            error: 'R2 block missing despite r2_written status',
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        result.failed.push({ flush, error: errorMessage });
      }
    }

    return result;
  }

  /**
   * Get committed blocks for manifest integration
   */
  getCommittedBlocks(): BlockMetadata[] {
    return [...this.committedBlocks];
  }

  /**
   * Clear committed blocks after manifest update
   */
  clearCommittedBlocks(): void {
    this.committedBlocks = [];
  }

  /**
   * Check if there are pending flushes
   */
  async hasPendingFlushes(): Promise<boolean> {
    const pending = await this.getPendingFlushes();
    return pending.length > 0;
  }

  /**
   * Get count of pending flushes
   */
  async getPendingFlushCount(): Promise<number> {
    const pending = await this.getPendingFlushes();
    return pending.length;
  }
}
