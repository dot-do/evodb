/**
 * LakehouseWriter
 *
 * Main writer class that coordinates:
 * - CDC buffering from child DOs
 * - Block writing to R2
 * - Fallback to DO storage on R2 failure
 * - Compaction scheduling
 * - Partition mode support (2MB, 500MB, 5GB)
 *
 * Now supports dependency injection via strategy pattern for:
 * - Buffer strategy (CDCBufferStrategy)
 * - Block writer (BlockWriter)
 * - Compaction strategy (CompactionStrategy)
 */

import type { WalEntry } from '@evodb/core';
import type {
  WriterOptions,
  FlushResult,
  CompactResult,
  WriterStats,
  BlockMetadata,
  PersistentState,
  SourceStats,
  PartitionMode,
  ResolvedWriterOptions,
} from './types.js';
import { resolveWriterOptions } from './types.js';
import { CDCBuffer, BackpressureController } from './buffer.js';
import { R2BlockWriter } from './r2-writer.js';
import { BlockCompactor, CompactionScheduler } from './compactor.js';

// Strategy imports
import type {
  CDCBufferStrategy,
  BlockWriter,
  CompactionStrategy,
} from './strategies/interfaces.js';
import { HybridBufferStrategy } from './strategies/buffer-strategy.js';
import { R2BlockWriterAdapter } from './strategies/block-writer.js';
import { TimeBasedCompaction } from './strategies/compaction-strategy.js';

/**
 * Durable Object storage interface
 */
export interface DOStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
  list(options?: { prefix?: string }): Promise<Map<string, unknown>>;
}

/**
 * Configuration for dependency injection
 */
export interface LakehouseWriterDeps {
  /** Custom buffer strategy */
  bufferStrategy?: CDCBufferStrategy;
  /** Custom block writer */
  blockWriter?: BlockWriter;
  /** Custom compaction strategy */
  compactionStrategy?: CompactionStrategy;
}

/**
 * LakehouseWriter - Coordinates CDC buffering and block writing
 *
 * Supports two modes:
 * 1. Simple mode: Pass options and let the writer create default strategies
 * 2. DI mode: Pass custom strategies for testing or advanced configurations
 */
export class LakehouseWriter {
  private readonly options: ResolvedWriterOptions;

  // Strategy implementations (new pattern)
  private readonly bufferStrategy: CDCBufferStrategy;
  private readonly blockWriter: BlockWriter;
  private readonly compactionStrategy: CompactionStrategy;

  // Legacy components (for backward compatibility with existing API)
  private readonly buffer: CDCBuffer;
  private readonly r2Writer: R2BlockWriter;
  private readonly compactor: BlockCompactor;
  private readonly compactionScheduler: CompactionScheduler;

  // Shared components
  private readonly backpressure: BackpressureController;

  // State
  private blockIndex: BlockMetadata[] = [];
  private pendingBlocks: string[] = [];
  private lastBlockSeq = 0;
  private lastSnapshotId = 0;

  // Statistics
  private cdcEntriesReceived = 0;
  private flushCount = 0;
  private compactCount = 0;
  private r2WriteFailures = 0;
  private retryCount = 0;
  private flushDurations: number[] = [];
  private compactDurations: number[] = [];
  private lastFlushTime: number | null = null;
  private lastCompactTime: number | null = null;
  private sourceStats: Map<string, SourceStats> = new Map();

  // DO storage for fallback
  private doStorage: DOStorage | null = null;

  /**
   * Create a LakehouseWriter
   *
   * @param options - Writer configuration (r2Bucket and tableLocation required)
   * @param deps - Optional dependency injection for strategies
   */
  constructor(
    options: Partial<WriterOptions> & Pick<WriterOptions, 'r2Bucket' | 'tableLocation'>,
    deps?: LakehouseWriterDeps
  ) {
    this.options = resolveWriterOptions(options);

    // Initialize legacy components (for backward compatibility)
    this.buffer = CDCBuffer.fromWriterOptions(this.options);
    this.r2Writer = R2BlockWriter.fromWriterOptions(this.options.r2Bucket, this.options);
    this.compactor = BlockCompactor.fromWriterOptions(this.options.r2Bucket, this.options);
    this.compactionScheduler = new CompactionScheduler(this.compactor);
    this.backpressure = new BackpressureController();

    // Initialize strategy implementations (new pattern)
    // Use injected dependencies if provided, otherwise create defaults
    this.bufferStrategy = deps?.bufferStrategy ??
      HybridBufferStrategy.fromWriterOptions(this.options);

    this.blockWriter = deps?.blockWriter ??
      R2BlockWriterAdapter.fromWriterOptions(this.options.r2Bucket, this.options);

    this.compactionStrategy = deps?.compactionStrategy ??
      TimeBasedCompaction.fromWriterOptions(this.options.r2Bucket, this.options);
  }

  /**
   * Factory method for creating a writer with custom strategies
   */
  static withStrategies(
    options: Partial<WriterOptions> & Pick<WriterOptions, 'r2Bucket' | 'tableLocation'>,
    deps: LakehouseWriterDeps
  ): LakehouseWriter {
    return new LakehouseWriter(options, deps);
  }

  /**
   * Get the partition mode
   */
  getPartitionMode(): PartitionMode {
    return this.options.partitionMode;
  }

  /**
   * Set DO storage for fallback writes
   */
  setDOStorage(storage: DOStorage): void {
    this.doStorage = storage;
  }

  /**
   * Load persistent state from DO storage
   */
  async loadState(): Promise<void> {
    if (!this.doStorage) return;

    const state = await this.doStorage.get<PersistentState>('writer:state');
    if (state) {
      this.lastBlockSeq = state.lastBlockSeq;
      this.pendingBlocks = state.pendingBlocks;
      this.blockIndex = state.blockIndex;
      this.lastSnapshotId = state.lastSnapshotId;

      // Restore source cursors
      for (const [sourceDoId, lsnStr] of Object.entries(state.sourceCursors)) {
        const stats: SourceStats = {
          sourceDoId,
          entriesReceived: 0,
          lastLsn: BigInt(lsnStr),
          lastEntryTime: 0,
          connected: false,
        };
        this.sourceStats.set(sourceDoId, stats);
      }

      // Restore stats
      this.cdcEntriesReceived = state.stats.cdcEntriesReceived;
      this.flushCount = state.stats.flushCount;
      this.compactCount = state.stats.compactCount;
      this.r2WriteFailures = state.stats.r2WriteFailures;
    }
  }

  /**
   * Save persistent state to DO storage
   */
  async saveState(): Promise<void> {
    if (!this.doStorage) return;

    const sourceCursors: Record<string, string> = {};
    for (const [id, stats] of this.sourceStats) {
      sourceCursors[id] = stats.lastLsn.toString();
    }

    const state: PersistentState = {
      lastBlockSeq: this.lastBlockSeq,
      pendingBlocks: this.pendingBlocks,
      blockIndex: this.blockIndex,
      lastSnapshotId: this.lastSnapshotId,
      partitionMode: this.options.partitionMode,
      sourceCursors,
      stats: {
        cdcEntriesReceived: this.cdcEntriesReceived,
        flushCount: this.flushCount,
        compactCount: this.compactCount,
        r2WriteFailures: this.r2WriteFailures,
      },
    };

    await this.doStorage.put('writer:state', state);
  }

  /**
   * Receive CDC entries from a child DO
   */
  async receiveCDC(sourceDoId: string, entries: WalEntry[]): Promise<void> {
    if (entries.length === 0) return;

    // Update source stats
    let stats = this.sourceStats.get(sourceDoId);
    if (!stats) {
      stats = {
        sourceDoId,
        entriesReceived: 0,
        lastLsn: 0n,
        lastEntryTime: 0,
        connected: true,
      };
      this.sourceStats.set(sourceDoId, stats);
    }

    stats.entriesReceived += entries.length;
    stats.lastLsn = entries[entries.length - 1].lsn;
    stats.lastEntryTime = Date.now();
    stats.connected = true;

    // Update global stats
    this.cdcEntriesReceived += entries.length;

    // Add to both buffers (strategy and legacy)
    this.buffer.add(sourceDoId, entries);
    this.bufferStrategy.append(sourceDoId, entries);

    // Update backpressure
    this.backpressure.update(this.buffer.getStats(), this.pendingBlocks.length);
  }

  /**
   * Check if backpressure should be applied
   */
  shouldApplyBackpressure(): boolean {
    return this.backpressure.shouldApplyBackpressure();
  }

  /**
   * Get suggested backpressure delay
   */
  getBackpressureDelay(): number {
    return this.backpressure.getSuggestedDelay();
  }

  /**
   * Flush buffer to R2
   */
  async flush(): Promise<FlushResult> {
    const startTime = Date.now();

    // Check if buffer has data
    if (this.buffer.isEmpty()) {
      return {
        status: 'empty',
        entryCount: 0,
        durationMs: 0,
      };
    }

    // Drain buffer (use legacy buffer for consistency with existing tests)
    const { entries, state } = this.buffer.drain();

    // Also clear the strategy buffer to keep them in sync
    this.bufferStrategy.clear();

    const seq = ++this.lastBlockSeq;

    // Try to write to R2
    const result = await this.r2Writer.writeEntries(entries, state.minLsn, state.maxLsn, seq);

    const durationMs = Date.now() - startTime;

    if (result.success) {
      // Success - update state
      this.blockIndex.push(result.metadata);
      this.flushCount++;
      this.lastFlushTime = Date.now();
      this.flushDurations.push(durationMs);

      // Keep only last 100 durations for average calculation
      if (this.flushDurations.length > 100) {
        this.flushDurations.shift();
      }

      // Save state
      await this.saveState();

      return {
        status: 'persisted',
        location: 'r2',
        block: result.metadata,
        entryCount: entries.length,
        durationMs,
      };
    } else {
      // R2 write failed - fallback to DO storage
      this.r2WriteFailures++;
      this.retryCount++;

      if (this.doStorage) {
        // Store block data in DO for later retry
        const blockId = `pending:${Date.now().toString(36)}-${seq.toString(36)}`;
        const blockData = {
          entries: entries.map(e => ({
            lsn: e.lsn.toString(),
            timestamp: e.timestamp.toString(),
            op: e.op,
            flags: e.flags,
            data: Array.from(e.data),
            checksum: e.checksum,
          })),
          minLsn: state.minLsn.toString(),
          maxLsn: state.maxLsn.toString(),
          seq,
        };

        await this.doStorage.put(blockId, blockData);
        this.pendingBlocks.push(blockId);

        await this.saveState();

        return {
          status: 'buffered',
          location: 'do',
          entryCount: entries.length,
          durationMs,
          retryScheduled: true,
          error: result.error,
        };
      }

      // No DO storage available - data loss risk
      return {
        status: 'buffered',
        entryCount: entries.length,
        durationMs,
        retryScheduled: false,
        error: result.error,
      };
    }
  }

  /**
   * Retry pending blocks (from DO storage to R2)
   */
  async retryPendingBlocks(): Promise<{ succeeded: number; failed: number }> {
    if (!this.doStorage || this.pendingBlocks.length === 0) {
      return { succeeded: 0, failed: 0 };
    }

    let succeeded = 0;
    let failed = 0;
    const remainingPending: string[] = [];

    for (const blockId of this.pendingBlocks) {
      const blockData = await this.doStorage.get<{
        entries: Array<{
          lsn: string;
          timestamp: string;
          op: number;
          flags: number;
          data: number[];
          checksum: number;
        }>;
        minLsn: string;
        maxLsn: string;
        seq: number;
      }>(blockId);

      if (!blockData) {
        // Block data missing, skip
        continue;
      }

      // Reconstruct WAL entries
      const entries: WalEntry[] = blockData.entries.map(e => ({
        lsn: BigInt(e.lsn),
        timestamp: BigInt(e.timestamp),
        op: e.op,
        flags: e.flags,
        data: new Uint8Array(e.data),
        checksum: e.checksum,
      }));

      const result = await this.r2Writer.writeEntries(
        entries,
        BigInt(blockData.minLsn),
        BigInt(blockData.maxLsn),
        blockData.seq
      );

      if (result.success) {
        // Success - remove from DO storage
        await this.doStorage.delete(blockId);
        this.blockIndex.push(result.metadata);
        succeeded++;
      } else {
        // Still failing - keep in pending
        remainingPending.push(blockId);
        failed++;
      }
    }

    this.pendingBlocks = remainingPending;
    await this.saveState();

    return { succeeded, failed };
  }

  /**
   * Run compaction if needed
   */
  async compact(): Promise<CompactResult> {
    const startTime = Date.now();

    const result = await this.compactionScheduler.runIfNeeded(
      this.blockIndex,
      () => ++this.lastBlockSeq
    );

    if (result === null) {
      return {
        status: 'skipped',
        blocksMerged: 0,
        blocksDeleted: [],
        durationMs: Date.now() - startTime,
      };
    }

    const durationMs = Date.now() - startTime;

    if (result.status === 'completed' && result.newBlock) {
      // Update block index
      this.blockIndex = this.blockIndex.filter(b => !result.blocksDeleted.includes(b.id));
      this.blockIndex.push(result.newBlock);

      this.compactCount++;
      this.lastCompactTime = Date.now();
      this.compactDurations.push(durationMs);

      if (this.compactDurations.length > 100) {
        this.compactDurations.shift();
      }

      await this.saveState();
    }

    return result;
  }

  /**
   * Force compaction regardless of thresholds
   */
  async forceCompact(): Promise<CompactResult> {
    const result = await this.compactionScheduler.forceCompaction(
      this.blockIndex,
      () => ++this.lastBlockSeq
    );

    if (result && result.status === 'completed' && result.newBlock) {
      this.blockIndex = this.blockIndex.filter(b => !result.blocksDeleted.includes(b.id));
      this.blockIndex.push(result.newBlock);
      this.compactCount++;
      this.lastCompactTime = Date.now();
      await this.saveState();
    }

    return result ?? {
      status: 'skipped',
      blocksMerged: 0,
      blocksDeleted: [],
      durationMs: 0,
    };
  }

  /**
   * Get writer statistics
   */
  getStats(): WriterStats {
    const bufferStats = this.buffer.getStats();
    const smallBlockCount = this.compactor.selectSmallBlocks(this.blockIndex).length;

    const avgFlushDuration =
      this.flushDurations.length > 0
        ? this.flushDurations.reduce((a, b) => a + b, 0) / this.flushDurations.length
        : 0;

    const avgCompactDuration =
      this.compactDurations.length > 0
        ? this.compactDurations.reduce((a, b) => a + b, 0) / this.compactDurations.length
        : 0;

    return {
      buffer: bufferStats,
      partitionMode: this.options.partitionMode,
      blocks: {
        r2BlockCount: this.blockIndex.length,
        pendingBlockCount: this.pendingBlocks.length,
        smallBlockCount,
        totalRows: this.blockIndex.reduce((sum, b) => sum + b.rowCount, 0),
        totalBytesR2: this.blockIndex.reduce((sum, b) => sum + b.sizeBytes, 0),
      },
      operations: {
        cdcEntriesReceived: this.cdcEntriesReceived,
        flushCount: this.flushCount,
        compactCount: this.compactCount,
        r2WriteFailures: this.r2WriteFailures,
        retryCount: this.retryCount,
      },
      timing: {
        lastFlushTime: this.lastFlushTime,
        lastCompactTime: this.lastCompactTime,
        avgFlushDurationMs: avgFlushDuration,
        avgCompactDurationMs: avgCompactDuration,
      },
      sources: new Map(this.sourceStats),
    };
  }

  /**
   * Get time until buffer should be flushed
   */
  getTimeToFlush(): number | null {
    return this.buffer.getTimeToFlush();
  }

  /**
   * Check if buffer should be flushed
   */
  shouldFlush(): boolean {
    return this.buffer.shouldFlush();
  }

  /**
   * Get block index for queries
   */
  getBlockIndex(): BlockMetadata[] {
    return [...this.blockIndex];
  }

  /**
   * Get pending block count
   */
  getPendingBlockCount(): number {
    return this.pendingBlocks.length;
  }

  /**
   * Mark a source as disconnected
   */
  markSourceDisconnected(sourceDoId: string): void {
    const stats = this.sourceStats.get(sourceDoId);
    if (stats) {
      stats.connected = false;
    }
  }

  /**
   * Get source statistics
   */
  getSourceStats(sourceDoId: string): SourceStats | undefined {
    return this.sourceStats.get(sourceDoId);
  }

  /**
   * Get all connected sources
   */
  getConnectedSources(): string[] {
    const connected: string[] = [];
    for (const [id, stats] of this.sourceStats) {
      if (stats.connected) {
        connected.push(id);
      }
    }
    return connected;
  }

  /**
   * Get next alarm time (for DO alarm)
   */
  getNextAlarmTime(): number | null {
    const timeToFlush = this.getTimeToFlush();

    // If buffer needs flushing soon, schedule alarm
    if (timeToFlush !== null) {
      return Date.now() + timeToFlush;
    }

    // If pending blocks exist, retry every 30 seconds
    if (this.pendingBlocks.length > 0) {
      return Date.now() + 30000;
    }

    // If compaction might be needed, check every minute
    if (this.blockIndex.length >= this.options.minCompactBlocks) {
      return Date.now() + 60000;
    }

    // Default: no alarm needed
    return null;
  }

  /**
   * Get the R2 writer instance (for advanced use)
   */
  getR2Writer(): R2BlockWriter {
    return this.r2Writer;
  }

  /**
   * Get the compactor instance (for advanced use)
   */
  getCompactor(): BlockCompactor {
    return this.compactor;
  }

  /**
   * Get compaction metrics
   */
  getCompactionMetrics(): ReturnType<BlockCompactor['getMetrics']> {
    return this.compactor.getMetrics(this.blockIndex);
  }

  /**
   * Get compaction scheduler status
   */
  getCompactionSchedulerStatus(): ReturnType<CompactionScheduler['getStatus']> {
    return this.compactionScheduler.getStatus();
  }

  // ==========================================================================
  // Strategy accessors (new pattern)
  // ==========================================================================

  /**
   * Get the buffer strategy (new pattern)
   */
  getBufferStrategy(): CDCBufferStrategy {
    return this.bufferStrategy;
  }

  /**
   * Get the block writer strategy (new pattern)
   */
  getBlockWriter(): BlockWriter {
    return this.blockWriter;
  }

  /**
   * Get the compaction strategy (new pattern)
   */
  getCompactionStrategy(): CompactionStrategy {
    return this.compactionStrategy;
  }
}
