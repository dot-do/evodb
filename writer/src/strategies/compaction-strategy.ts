/**
 * Compaction Strategy Implementations
 *
 * Provides different compaction strategies:
 * - SizeBasedCompaction: Compacts based on block size
 * - TimeBasedCompaction: Compacts based on block age
 * - TieredCompaction: Automatically selects strategy based on data volume
 */

import type { BlockMetadata, CompactResult, R2Bucket, ResolvedWriterOptions, PartitionMode } from '../types.js';
import { BlockCompactor, getDefaultCompactionConfig } from '../compactor.js';
import type { CompactionStrategy, CompactionMetrics } from './interfaces.js';

/**
 * Compaction strategy options
 */
export interface CompactionStrategyOptions {
  /** Minimum blocks to trigger compaction */
  minBlocks: number;
  /** Target size for compacted blocks */
  targetSize: number;
  /** Maximum size for compacted blocks */
  maxSize: number;
  /** Maximum blocks to merge at once */
  maxMergeBlocks: number;
  /** Partition mode */
  partitionMode: PartitionMode;
}

// =============================================================================
// Size-Based Compaction Strategy
// =============================================================================

/**
 * Compaction strategy that merges small blocks based on size thresholds
 */
export class SizeBasedCompaction implements CompactionStrategy {
  private readonly compactor: BlockCompactor;
  private readonly options: CompactionStrategyOptions;

  constructor(
    r2Bucket: R2Bucket,
    tableLocation: string,
    options: Partial<CompactionStrategyOptions> = {}
  ) {
    const partitionMode = options.partitionMode ?? 'do-sqlite';
    const defaultConfig = getDefaultCompactionConfig(partitionMode);

    this.options = {
      minBlocks: options.minBlocks ?? defaultConfig.minBlocks,
      targetSize: options.targetSize ?? defaultConfig.targetSize,
      maxSize: options.maxSize ?? defaultConfig.maxSize,
      maxMergeBlocks: options.maxMergeBlocks ?? defaultConfig.maxMergeBlocks,
      partitionMode,
    };

    this.compactor = new BlockCompactor(r2Bucket, tableLocation, {
      minBlocks: this.options.minBlocks,
      targetSize: this.options.targetSize,
      maxSize: this.options.maxSize,
      maxMergeBlocks: this.options.maxMergeBlocks,
      partitionMode: this.options.partitionMode,
      strategy: 'size',
    });
  }

  /**
   * Create from resolved writer options
   */
  static fromWriterOptions(
    r2Bucket: R2Bucket,
    options: ResolvedWriterOptions
  ): SizeBasedCompaction {
    return new SizeBasedCompaction(r2Bucket, options.tableLocation, {
      minBlocks: options.minCompactBlocks,
      targetSize: options.targetCompactSize,
      partitionMode: options.partitionMode,
    });
  }

  shouldCompact(blocks: BlockMetadata[]): boolean {
    return this.compactor.shouldCompact(blocks);
  }

  selectBlocks(blocks: BlockMetadata[]): BlockMetadata[] {
    return this.compactor.selectBlocksForCompaction(blocks);
  }

  async compact(blocks: BlockMetadata[], newSeq: number): Promise<CompactResult> {
    return this.compactor.compact(blocks, newSeq);
  }

  getMetrics(blocks: BlockMetadata[]): CompactionMetrics {
    const metrics = this.compactor.getMetrics(blocks);
    return {
      totalBlocks: metrics.totalBlocks,
      smallBlocks: metrics.smallBlocks,
      compactedBlocks: metrics.compactedBlocks,
      eligibleForCompaction: metrics.eligibleForCompaction,
      targetSize: metrics.targetSize,
      maxSize: metrics.maxSize,
    };
  }

  /**
   * Get the underlying BlockCompactor for advanced operations
   */
  getCompactor(): BlockCompactor {
    return this.compactor;
  }

  /**
   * Get the partition mode
   */
  getPartitionMode(): PartitionMode {
    return this.options.partitionMode;
  }
}

// =============================================================================
// Time-Based Compaction Strategy
// =============================================================================

/**
 * Compaction strategy that merges blocks based on creation time
 * Older blocks get priority for compaction (FIFO)
 */
export class TimeBasedCompaction implements CompactionStrategy {
  private readonly compactor: BlockCompactor;
  private readonly options: CompactionStrategyOptions;

  constructor(
    r2Bucket: R2Bucket,
    tableLocation: string,
    options: Partial<CompactionStrategyOptions> = {}
  ) {
    const partitionMode = options.partitionMode ?? 'do-sqlite';
    const defaultConfig = getDefaultCompactionConfig(partitionMode);

    this.options = {
      minBlocks: options.minBlocks ?? defaultConfig.minBlocks,
      targetSize: options.targetSize ?? defaultConfig.targetSize,
      maxSize: options.maxSize ?? defaultConfig.maxSize,
      maxMergeBlocks: options.maxMergeBlocks ?? defaultConfig.maxMergeBlocks,
      partitionMode,
    };

    this.compactor = new BlockCompactor(r2Bucket, tableLocation, {
      minBlocks: this.options.minBlocks,
      targetSize: this.options.targetSize,
      maxSize: this.options.maxSize,
      maxMergeBlocks: this.options.maxMergeBlocks,
      partitionMode: this.options.partitionMode,
      strategy: 'time',
    });
  }

  /**
   * Create from resolved writer options
   */
  static fromWriterOptions(
    r2Bucket: R2Bucket,
    options: ResolvedWriterOptions
  ): TimeBasedCompaction {
    return new TimeBasedCompaction(r2Bucket, options.tableLocation, {
      minBlocks: options.minCompactBlocks,
      targetSize: options.targetCompactSize,
      partitionMode: options.partitionMode,
    });
  }

  shouldCompact(blocks: BlockMetadata[]): boolean {
    return this.compactor.shouldCompact(blocks);
  }

  selectBlocks(blocks: BlockMetadata[]): BlockMetadata[] {
    return this.compactor.selectBlocksForCompaction(blocks);
  }

  async compact(blocks: BlockMetadata[], newSeq: number): Promise<CompactResult> {
    return this.compactor.compact(blocks, newSeq);
  }

  getMetrics(blocks: BlockMetadata[]): CompactionMetrics {
    const metrics = this.compactor.getMetrics(blocks);
    return {
      totalBlocks: metrics.totalBlocks,
      smallBlocks: metrics.smallBlocks,
      compactedBlocks: metrics.compactedBlocks,
      eligibleForCompaction: metrics.eligibleForCompaction,
      targetSize: metrics.targetSize,
      maxSize: metrics.maxSize,
    };
  }

  /**
   * Get the underlying BlockCompactor for advanced operations
   */
  getCompactor(): BlockCompactor {
    return this.compactor;
  }

  /**
   * Get the partition mode
   */
  getPartitionMode(): PartitionMode {
    return this.options.partitionMode;
  }
}

// =============================================================================
// LSN-Based Compaction Strategy
// =============================================================================

/**
 * Compaction strategy that maintains LSN order during merges
 */
export class LsnBasedCompaction implements CompactionStrategy {
  private readonly compactor: BlockCompactor;
  private readonly options: CompactionStrategyOptions;

  constructor(
    r2Bucket: R2Bucket,
    tableLocation: string,
    options: Partial<CompactionStrategyOptions> = {}
  ) {
    const partitionMode = options.partitionMode ?? 'do-sqlite';
    const defaultConfig = getDefaultCompactionConfig(partitionMode);

    this.options = {
      minBlocks: options.minBlocks ?? defaultConfig.minBlocks,
      targetSize: options.targetSize ?? defaultConfig.targetSize,
      maxSize: options.maxSize ?? defaultConfig.maxSize,
      maxMergeBlocks: options.maxMergeBlocks ?? defaultConfig.maxMergeBlocks,
      partitionMode,
    };

    this.compactor = new BlockCompactor(r2Bucket, tableLocation, {
      minBlocks: this.options.minBlocks,
      targetSize: this.options.targetSize,
      maxSize: this.options.maxSize,
      maxMergeBlocks: this.options.maxMergeBlocks,
      partitionMode: this.options.partitionMode,
      strategy: 'lsn',
    });
  }

  /**
   * Create from resolved writer options
   */
  static fromWriterOptions(
    r2Bucket: R2Bucket,
    options: ResolvedWriterOptions
  ): LsnBasedCompaction {
    return new LsnBasedCompaction(r2Bucket, options.tableLocation, {
      minBlocks: options.minCompactBlocks,
      targetSize: options.targetCompactSize,
      partitionMode: options.partitionMode,
    });
  }

  shouldCompact(blocks: BlockMetadata[]): boolean {
    return this.compactor.shouldCompact(blocks);
  }

  selectBlocks(blocks: BlockMetadata[]): BlockMetadata[] {
    return this.compactor.selectBlocksForCompaction(blocks);
  }

  async compact(blocks: BlockMetadata[], newSeq: number): Promise<CompactResult> {
    return this.compactor.compact(blocks, newSeq);
  }

  getMetrics(blocks: BlockMetadata[]): CompactionMetrics {
    const metrics = this.compactor.getMetrics(blocks);
    return {
      totalBlocks: metrics.totalBlocks,
      smallBlocks: metrics.smallBlocks,
      compactedBlocks: metrics.compactedBlocks,
      eligibleForCompaction: metrics.eligibleForCompaction,
      targetSize: metrics.targetSize,
      maxSize: metrics.maxSize,
    };
  }

  /**
   * Get the underlying BlockCompactor for advanced operations
   */
  getCompactor(): BlockCompactor {
    return this.compactor;
  }

  /**
   * Get the partition mode
   */
  getPartitionMode(): PartitionMode {
    return this.options.partitionMode;
  }
}

// =============================================================================
// No-Op Compaction Strategy
// =============================================================================

/**
 * Compaction strategy that never compacts (for testing or disabled compaction)
 */
export class NoOpCompaction implements CompactionStrategy {
  private readonly targetSize: number;
  private readonly maxSize: number;

  constructor(options?: { targetSize?: number; maxSize?: number }) {
    this.targetSize = options?.targetSize ?? 16 * 1024 * 1024;
    this.maxSize = options?.maxSize ?? 32 * 1024 * 1024;
  }

  shouldCompact(_blocks: BlockMetadata[]): boolean {
    return false;
  }

  selectBlocks(_blocks: BlockMetadata[]): BlockMetadata[] {
    return [];
  }

  async compact(_blocks: BlockMetadata[], _newSeq: number): Promise<CompactResult> {
    return {
      status: 'skipped',
      blocksMerged: 0,
      blocksDeleted: [],
      durationMs: 0,
      error: 'Compaction disabled',
    };
  }

  getMetrics(blocks: BlockMetadata[]): CompactionMetrics {
    const smallBlocks = blocks.filter(b => !b.compacted && b.sizeBytes < this.targetSize / 2);
    const compactedBlocks = blocks.filter(b => b.compacted);

    return {
      totalBlocks: blocks.length,
      smallBlocks: smallBlocks.length,
      compactedBlocks: compactedBlocks.length,
      eligibleForCompaction: false,
      targetSize: this.targetSize,
      maxSize: this.maxSize,
    };
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Compaction strategy type
 */
export type CompactionStrategyType = 'size' | 'time' | 'lsn' | 'none';

/**
 * Create a compaction strategy from writer options
 * Defaults to TimeBasedCompaction
 */
export function createCompactionStrategy(
  r2Bucket: R2Bucket,
  options: ResolvedWriterOptions
): CompactionStrategy {
  return TimeBasedCompaction.fromWriterOptions(r2Bucket, options);
}

/**
 * Create a specific compaction strategy type
 */
export function createCompactionStrategyOfType(
  type: CompactionStrategyType,
  r2Bucket: R2Bucket,
  options: ResolvedWriterOptions
): CompactionStrategy {
  switch (type) {
    case 'size':
      return SizeBasedCompaction.fromWriterOptions(r2Bucket, options);
    case 'time':
      return TimeBasedCompaction.fromWriterOptions(r2Bucket, options);
    case 'lsn':
      return LsnBasedCompaction.fromWriterOptions(r2Bucket, options);
    case 'none':
      return new NoOpCompaction({
        targetSize: options.targetCompactSize,
        maxSize: options.maxBlockSize,
      });
    default:
      return TimeBasedCompaction.fromWriterOptions(r2Bucket, options);
  }
}
