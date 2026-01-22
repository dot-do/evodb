/**
 * R2 Block Writer
 *
 * Handles writing columnar blocks to R2 with:
 * - Retry logic with exponential backoff
 * - Atomic writes with checksums
 * - Fallback to DO storage on failure
 * - Integration with @evodb/core for columnar encoding
 */

import type { R2Bucket, BlockMetadata, ResolvedWriterOptions, ColumnZoneMap, PartitionMode } from './types.js';
import {
  writeBlock,
  encode,
  shred,
  type EncodedColumn,
  type WalEntry,
  Type,
} from '@evodb/core';

/**
 * R2 writer options
 */
export interface R2WriterOptions {
  tableLocation: string;
  schemaId?: number;
  maxRetries: number;
  retryBackoffMs: number;
  partitionMode?: PartitionMode;
}

/**
 * R2 block key format: {tableLocation}/data/{timestamp}-{seq}.cjlb
 */
export function makeR2BlockKey(tableLocation: string, timestamp: number, seq: number): string {
  const ts = timestamp.toString(36).padStart(10, '0');
  const s = seq.toString(36).padStart(4, '0');
  return `${tableLocation}/data/${ts}-${s}.cjlb`;
}

/**
 * Parse R2 block key
 */
export function parseR2BlockKey(key: string): { tableLocation: string; timestamp: number; seq: number } | null {
  const match = key.match(/^(.+)\/data\/([a-z0-9]+)-([a-z0-9]+)\.cjlb$/);
  if (!match) return null;

  return {
    tableLocation: match[1],
    timestamp: parseInt(match[2], 36),
    seq: parseInt(match[3], 36),
  };
}

/**
 * Generate a unique block ID
 */
export function generateBlockId(timestamp: number, seq: number): string {
  return `${timestamp.toString(36)}-${seq.toString(36)}`;
}

/**
 * R2 writer for columnar blocks
 */
export class R2BlockWriter {
  private readonly r2Bucket: R2Bucket;
  private readonly options: R2WriterOptions;

  constructor(r2Bucket: R2Bucket, options: R2WriterOptions) {
    this.r2Bucket = r2Bucket;
    this.options = {
      schemaId: 0,
      partitionMode: 'do-sqlite',
      ...options,
    };
  }

  /**
   * Create an R2BlockWriter from resolved writer options
   */
  static fromWriterOptions(r2Bucket: R2Bucket, options: ResolvedWriterOptions): R2BlockWriter {
    return new R2BlockWriter(r2Bucket, {
      tableLocation: options.tableLocation,
      schemaId: options.schemaId,
      maxRetries: options.maxRetries,
      retryBackoffMs: options.retryBackoffMs,
      partitionMode: options.partitionMode,
    });
  }

  /**
   * Write a block of WAL entries to R2
   */
  async writeEntries(
    entries: WalEntry[],
    minLsn: bigint,
    maxLsn: bigint,
    seq: number
  ): Promise<{ success: true; metadata: BlockMetadata } | { success: false; error: string }> {
    if (entries.length === 0) {
      return { success: false, error: 'No entries to write' };
    }

    const timestamp = Date.now();
    const r2Key = makeR2BlockKey(this.options.tableLocation, timestamp, seq);
    const blockId = generateBlockId(timestamp, seq);

    try {
      // Decode WAL entries to documents
      const documents = this.decodeWalEntries(entries);

      // Shred documents to columns
      const columns = shred(documents);

      // Encode columns
      const encodedColumns = encode(columns);

      // Write block
      const blockData = writeBlock(encodedColumns, {
        schemaId: this.options.schemaId,
        minLsn,
        maxLsn,
        rowCount: documents.length,
      });

      // Extract column stats for zone maps
      const columnStats = this.extractColumnStats(encodedColumns);

      // Write to R2 with retries
      await this.writeWithRetry(r2Key, blockData, documents.length);

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

      return { success: true, metadata };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Write raw block data to R2 (for compaction)
   */
  async writeRawBlock(
    r2Key: string,
    data: Uint8Array,
    metadata: {
      rowCount: number;
      compacted: boolean;
      mergedCount?: number;
    }
  ): Promise<void> {
    await this.r2Bucket.put(r2Key, data, {
      httpMetadata: {
        contentType: 'application/x-cjlb',
      },
      customMetadata: {
        'x-block-version': '1',
        'x-row-count': String(metadata.rowCount),
        'x-compacted': metadata.compacted ? 'true' : 'false',
        ...(metadata.mergedCount ? { 'x-merged-count': String(metadata.mergedCount) } : {}),
      },
    });
  }

  /**
   * Write block data to R2 with retry logic
   */
  private async writeWithRetry(key: string, data: Uint8Array, rowCount: number): Promise<void> {
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
            'x-partition-mode': this.options.partitionMode ?? 'do-sqlite',
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
   * Decode WAL entries to JSON documents
   */
  private decodeWalEntries(entries: WalEntry[]): unknown[] {
    const documents: unknown[] = [];

    for (const entry of entries) {
      try {
        // WAL entry data contains encoded columns from a single document
        // We need to decode it back to a document
        const doc = this.decodeWalEntryData(entry.data);
        if (doc !== null) {
          documents.push(doc);
        }
      } catch {
        // Skip malformed entries - continue processing remaining entries
        // Note: In production, this should be logged through @evodb/observability
      }
    }

    return documents;
  }

  /**
   * Decode a single WAL entry's data to a document
   *
   * WAL entry format:
   * - 2 bytes: column count
   * - For each column:
   *   - 2 bytes: path length
   *   - N bytes: path
   *   - 1 byte: type
   *   - 1 byte: encoding
   *   - 4 bytes: null bitmap length
   *   - M bytes: null bitmap
   *   - 4 bytes: data length
   *   - K bytes: data
   */
  private decodeWalEntryData(data: Uint8Array): unknown {
    if (data.length < 2) return null;

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const decoder = new TextDecoder();
    let offset = 0;

    const columnCount = view.getUint16(offset, true);
    offset += 2;

    const doc: Record<string, unknown> = {};

    for (let i = 0; i < columnCount && offset < data.length; i++) {
      // Read path
      const pathLen = view.getUint16(offset, true);
      offset += 2;
      const path = decoder.decode(data.subarray(offset, offset + pathLen));
      offset += pathLen;

      // Read type and encoding
      const type = data[offset++];
      offset++; // Skip encoding byte

      // Read null bitmap
      const bitmapLen = view.getUint32(offset, true);
      offset += 4;
      const nullBitmap = data.subarray(offset, offset + bitmapLen);
      offset += bitmapLen;

      // Read data
      const dataLen = view.getUint32(offset, true);
      offset += 4;
      const colData = data.subarray(offset, offset + dataLen);
      offset += dataLen;

      // Check if value is null (first bit in bitmap)
      const isNull = bitmapLen > 0 && (nullBitmap[0] & 1) !== 0;

      if (!isNull) {
        // Decode value based on type
        const value = this.decodeValue(colData, type);
        this.setNestedPath(doc, path, value);
      }
    }

    return doc;
  }

  /**
   * Decode a value from column data based on type
   */
  private decodeValue(data: Uint8Array, type: number): unknown {
    if (data.length === 0) return null;

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const decoder = new TextDecoder();

    switch (type) {
      case Type.Null:
        return null;
      case Type.Bool:
        return data[0] === 1;
      case Type.Int32:
        return view.getInt32(0, true);
      case Type.Int64:
        return view.getBigInt64(0, true);
      case Type.Float64:
        return view.getFloat64(0, true);
      case Type.String:
        {
          const len = view.getUint16(0, true);
          return decoder.decode(data.subarray(2, 2 + len));
        }
      case Type.Binary:
        {
          const len = view.getUint32(0, true);
          return data.slice(4, 4 + len);
        }
      case Type.Timestamp:
        return new Date(Number(view.getBigInt64(0, true)));
      case Type.Date:
        {
          const len = view.getUint16(0, true);
          return decoder.decode(data.subarray(2, 2 + len));
        }
      default:
        return null;
    }
  }

  /**
   * Set a nested path value in an object
   */
  private setNestedPath(obj: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split('.');
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current)) {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }

    current[parts[parts.length - 1]] = value;
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
   * Delete a block from R2
   */
  async deleteBlock(r2Key: string): Promise<void> {
    await this.r2Bucket.delete(r2Key);
  }

  /**
   * Delete multiple blocks from R2
   */
  async deleteBlocks(r2Keys: string[]): Promise<void> {
    if (r2Keys.length === 0) return;
    await this.r2Bucket.delete(r2Keys);
  }

  /**
   * List blocks in R2 for this table
   */
  async listBlocks(options?: { limit?: number; cursor?: string }): Promise<{
    blocks: { key: string; size: number; uploaded: Date }[];
    cursor?: string;
    truncated: boolean;
  }> {
    const prefix = `${this.options.tableLocation}/data/`;
    const result = await this.r2Bucket.list({
      prefix,
      limit: options?.limit ?? 1000,
      cursor: options?.cursor,
    });

    return {
      blocks: result.objects.map(obj => ({
        key: obj.key,
        size: obj.size,
        uploaded: obj.uploaded,
      })),
      cursor: result.cursor,
      truncated: result.truncated,
    };
  }

  /**
   * Read a block from R2
   */
  async readBlock(r2Key: string): Promise<Uint8Array | null> {
    const obj = await this.r2Bucket.get(r2Key);
    if (!obj) return null;

    const buffer = await obj.arrayBuffer();
    return new Uint8Array(buffer);
  }

  /**
   * Check if a block exists in R2
   */
  async blockExists(r2Key: string): Promise<boolean> {
    const head = await this.r2Bucket.head(r2Key);
    return head !== null;
  }

  /**
   * Get block metadata from R2
   */
  async getBlockMetadata(r2Key: string): Promise<{
    size: number;
    uploaded: Date;
    rowCount?: number;
    compacted?: boolean;
    partitionMode?: string;
  } | null> {
    const head = await this.r2Bucket.head(r2Key);
    if (!head) return null;

    return {
      size: head.size,
      uploaded: head.uploaded,
      rowCount: head.customMetadata?.['x-row-count']
        ? parseInt(head.customMetadata['x-row-count'], 10)
        : undefined,
      compacted: head.customMetadata?.['x-compacted'] === 'true',
      partitionMode: head.customMetadata?.['x-partition-mode'],
    };
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Batch writer for efficient multi-block writes
 */
export class BatchR2Writer {
  private readonly writer: R2BlockWriter;
  private pendingWrites: Array<{
    entries: WalEntry[];
    minLsn: bigint;
    maxLsn: bigint;
    seq: number;
    resolve: (result: { success: true; metadata: BlockMetadata } | { success: false; error: string }) => void;
  }> = [];

  constructor(writer: R2BlockWriter) {
    this.writer = writer;
  }

  /**
   * Queue a write (returns promise)
   */
  queueWrite(
    entries: WalEntry[],
    minLsn: bigint,
    maxLsn: bigint,
    seq: number
  ): Promise<{ success: true; metadata: BlockMetadata } | { success: false; error: string }> {
    return new Promise(resolve => {
      this.pendingWrites.push({ entries, minLsn, maxLsn, seq, resolve });
    });
  }

  /**
   * Flush all pending writes (parallel execution)
   */
  async flush(): Promise<void> {
    if (this.pendingWrites.length === 0) return;

    const writes = this.pendingWrites.splice(0);

    await Promise.all(
      writes.map(async w => {
        const result = await this.writer.writeEntries(w.entries, w.minLsn, w.maxLsn, w.seq);
        w.resolve(result);
      })
    );
  }

  /**
   * Get number of pending writes
   */
  get pendingCount(): number {
    return this.pendingWrites.length;
  }
}

/**
 * R2 writer with manifest integration
 */
export class R2WriterWithManifest extends R2BlockWriter {
  private manifestUpdates: Array<{
    blockId: string;
    r2Key: string;
    rowCount: number;
    sizeBytes: number;
    minLsn: bigint;
    maxLsn: bigint;
    columnStats: ColumnZoneMap[];
  }> = [];

  /**
   * Track a written block for manifest update
   */
  trackBlock(metadata: BlockMetadata): void {
    this.manifestUpdates.push({
      blockId: metadata.id,
      r2Key: metadata.r2Key,
      rowCount: metadata.rowCount,
      sizeBytes: metadata.sizeBytes,
      minLsn: metadata.minLsn,
      maxLsn: metadata.maxLsn,
      columnStats: metadata.columnStats ?? [],
    });
  }

  /**
   * Get and clear pending manifest updates
   */
  drainManifestUpdates(): typeof this.manifestUpdates {
    const updates = this.manifestUpdates;
    this.manifestUpdates = [];
    return updates;
  }

  /**
   * Check if there are pending manifest updates
   */
  hasPendingManifestUpdates(): boolean {
    return this.manifestUpdates.length > 0;
  }
}
