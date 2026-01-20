/**
 * Block Compactor
 *
 * Merges small blocks into larger ones for:
 * - Better read performance (fewer R2 requests)
 * - Better compression ratios
 * - Reduced storage costs
 *
 * Supports partition modes for different cache sizes:
 * - do-sqlite: 2MB target (16MB compacted)
 * - edge-cache: 128MB target (500MB compacted)
 * - enterprise: 1GB target (5GB compacted)
 */

import type {
  BlockMetadata,
  CompactResult,
  R2Bucket,
  ColumnZoneMap,
  PartitionMode,
  PARTITION_MODES as _PARTITION_MODES,
  ResolvedWriterOptions,
} from './types.js';
import { R2BlockWriter, makeR2BlockKey, generateBlockId } from './r2-writer.js';
import {
  readBlock,
  writeBlock,
  encode,
  type Column,
  type EncodedColumn,
} from '@evodb/core';

/**
 * Compaction strategy
 */
export type CompactionStrategy = 'size' | 'time' | 'lsn';

/**
 * Compaction configuration
 */
export interface CompactionConfig {
  /** Minimum blocks to trigger compaction */
  minBlocks: number;
  /** Target block size after compaction */
  targetSize: number;
  /** Maximum block size (don't exceed) */
  maxSize: number;
  /** Strategy for selecting blocks */
  strategy: CompactionStrategy;
  /** Maximum blocks to merge at once */
  maxMergeBlocks: number;
  /** Partition mode for size thresholds */
  partitionMode: PartitionMode;
}

/**
 * Default compaction config factory based on partition mode
 */
export function getDefaultCompactionConfig(partitionMode: PartitionMode): CompactionConfig {
  const modes: Record<PartitionMode, Omit<CompactionConfig, 'minBlocks' | 'strategy' | 'maxMergeBlocks' | 'partitionMode'>> = {
    'do-sqlite': {
      targetSize: 16 * 1024 * 1024,  // 16MB
      maxSize: 32 * 1024 * 1024,     // 32MB
    },
    'edge-cache': {
      targetSize: 500 * 1024 * 1024,   // 500MB
      maxSize: 512 * 1024 * 1024,      // 512MB
    },
    'enterprise': {
      targetSize: 5 * 1024 * 1024 * 1024,  // 5GB
      maxSize: 5 * 1024 * 1024 * 1024,     // 5GB (hard limit)
    },
  };

  return {
    ...modes[partitionMode],
    minBlocks: 4,
    strategy: 'time',
    maxMergeBlocks: partitionMode === 'enterprise' ? 16 : 8,
    partitionMode,
  };
}

/**
 * Block Compactor for merging small blocks
 */
export class BlockCompactor {
  private readonly writer: R2BlockWriter;
  private readonly config: CompactionConfig;
  private readonly tableLocation: string;

  constructor(
    r2Bucket: R2Bucket,
    tableLocation: string,
    config?: Partial<CompactionConfig>,
    writerOptions?: Pick<ResolvedWriterOptions, 'schemaId' | 'maxRetries' | 'retryBackoffMs' | 'partitionMode'>
  ) {
    this.tableLocation = tableLocation;

    const partitionMode = config?.partitionMode ?? writerOptions?.partitionMode ?? 'do-sqlite';
    const defaultConfig = getDefaultCompactionConfig(partitionMode);

    this.config = { ...defaultConfig, ...config };

    this.writer = new R2BlockWriter(r2Bucket, {
      tableLocation,
      schemaId: writerOptions?.schemaId ?? 0,
      maxRetries: writerOptions?.maxRetries ?? 3,
      retryBackoffMs: writerOptions?.retryBackoffMs ?? 100,
      partitionMode,
    });
  }

  /**
   * Create compactor from resolved writer options
   */
  static fromWriterOptions(
    r2Bucket: R2Bucket,
    options: ResolvedWriterOptions
  ): BlockCompactor {
    return new BlockCompactor(
      r2Bucket,
      options.tableLocation,
      {
        targetSize: options.targetCompactSize,
        partitionMode: options.partitionMode,
        minBlocks: options.minCompactBlocks,
      },
      {
        schemaId: options.schemaId,
        maxRetries: options.maxRetries,
        retryBackoffMs: options.retryBackoffMs,
        partitionMode: options.partitionMode,
      }
    );
  }

  /**
   * Get the partition mode
   */
  getPartitionMode(): PartitionMode {
    return this.config.partitionMode;
  }

  /**
   * Check if compaction is needed
   */
  shouldCompact(blocks: BlockMetadata[]): boolean {
    const smallBlocks = this.selectSmallBlocks(blocks);
    return smallBlocks.length >= this.config.minBlocks;
  }

  /**
   * Select small blocks eligible for compaction
   */
  selectSmallBlocks(blocks: BlockMetadata[]): BlockMetadata[] {
    return blocks.filter(b => !b.compacted && b.sizeBytes < this.config.targetSize / 2);
  }

  /**
   * Select blocks for a compaction run
   */
  selectBlocksForCompaction(blocks: BlockMetadata[]): BlockMetadata[] {
    const smallBlocks = this.selectSmallBlocks(blocks);

    if (smallBlocks.length < this.config.minBlocks) {
      return [];
    }

    // Sort by strategy
    const sorted = this.sortByStrategy(smallBlocks);

    // Select blocks up to target size or max count
    const selected: BlockMetadata[] = [];
    let totalSize = 0;

    for (const block of sorted) {
      if (selected.length >= this.config.maxMergeBlocks) break;
      if (totalSize + block.sizeBytes > this.config.maxSize) break;

      selected.push(block);
      totalSize += block.sizeBytes;
    }

    // Need at least 2 blocks to merge
    return selected.length >= 2 ? selected : [];
  }

  /**
   * Sort blocks by compaction strategy
   */
  private sortByStrategy(blocks: BlockMetadata[]): BlockMetadata[] {
    const sorted = [...blocks];

    switch (this.config.strategy) {
      case 'time':
        // Oldest first (FIFO compaction)
        sorted.sort((a, b) => a.createdAt - b.createdAt);
        break;

      case 'size':
        // Smallest first
        sorted.sort((a, b) => a.sizeBytes - b.sizeBytes);
        break;

      case 'lsn':
        // Lowest LSN first (maintain order)
        sorted.sort((a, b) => {
          if (a.minLsn < b.minLsn) return -1;
          if (a.minLsn > b.minLsn) return 1;
          return 0;
        });
        break;
    }

    return sorted;
  }

  /**
   * Perform compaction on selected blocks
   */
  async compact(blocks: BlockMetadata[], newSeq: number): Promise<CompactResult> {
    const startTime = Date.now();

    if (blocks.length < 2) {
      return {
        status: 'skipped',
        blocksMerged: 0,
        blocksDeleted: [],
        durationMs: Date.now() - startTime,
      };
    }

    try {
      // Read all blocks from R2
      const blockDataList = await this.readBlocks(blocks);

      // Check for missing blocks
      const validBlocks: { metadata: BlockMetadata; data: Uint8Array }[] = [];
      for (let i = 0; i < blocks.length; i++) {
        if (blockDataList[i] !== null) {
          validBlocks.push({ metadata: blocks[i], data: blockDataList[i]! });
        }
      }

      if (validBlocks.length < 2) {
        return {
          status: 'skipped',
          blocksMerged: 0,
          blocksDeleted: [],
          durationMs: Date.now() - startTime,
          error: 'Not enough valid blocks to merge',
        };
      }

      // Decode all blocks
      const decodedBlocks = validBlocks.map(b => {
        const { header, columns } = readBlock(b.data);
        return { metadata: b.metadata, header, columns };
      });

      // Merge columns
      const mergedColumns = this.mergeColumns(decodedBlocks.map(b => b.columns));

      // Calculate LSN range
      let minLsn = decodedBlocks[0].header.minLsn;
      let maxLsn = decodedBlocks[0].header.maxLsn;
      let totalRows = 0;

      for (const block of decodedBlocks) {
        if (block.header.minLsn < minLsn) minLsn = block.header.minLsn;
        if (block.header.maxLsn > maxLsn) maxLsn = block.header.maxLsn;
        totalRows += block.header.rowCount;
      }

      // Encode merged columns
      const encodedColumns = encode(mergedColumns);

      // Write new block
      const newBlockData = writeBlock(encodedColumns, {
        schemaId: decodedBlocks[0].header.schemaId,
        minLsn,
        maxLsn,
        rowCount: totalRows,
      });

      const timestamp = Date.now();
      const r2Key = makeR2BlockKey(this.tableLocation, timestamp, newSeq);
      const blockId = generateBlockId(timestamp, newSeq);

      // Write to R2
      await this.writer.writeRawBlock(r2Key, newBlockData, {
        rowCount: totalRows,
        compacted: true,
        mergedCount: validBlocks.length,
      });

      // Delete old blocks
      const deletedKeys = validBlocks.map(b => b.metadata.r2Key);
      await this.writer.deleteBlocks(deletedKeys);

      // Create metadata for new block
      const newBlockMetadata: BlockMetadata = {
        id: blockId,
        r2Key,
        rowCount: totalRows,
        sizeBytes: newBlockData.byteLength,
        minLsn,
        maxLsn,
        createdAt: timestamp,
        compacted: true,
        columnStats: this.extractColumnStats(encodedColumns),
      };

      return {
        status: 'completed',
        blocksMerged: validBlocks.length,
        newBlock: newBlockMetadata,
        blocksDeleted: validBlocks.map(b => b.metadata.id),
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        status: 'failed',
        blocksMerged: 0,
        blocksDeleted: [],
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Read multiple blocks from R2 in parallel
   */
  private async readBlocks(blocks: BlockMetadata[]): Promise<(Uint8Array | null)[]> {
    return Promise.all(
      blocks.map(async block => {
        try {
          return await this.writer.readBlock(block.r2Key);
        } catch {
          return null;
        }
      })
    );
  }

  /**
   * Merge columns from multiple blocks
   */
  private mergeColumns(columnSets: Column[][]): Column[] {
    if (columnSets.length === 0) return [];
    if (columnSets.length === 1) return columnSets[0];

    // Get all unique paths
    const pathSet = new Set<string>();
    for (const cols of columnSets) {
      for (const col of cols) pathSet.add(col.path);
    }

    // Merge each path
    const result: Column[] = [];

    for (const path of pathSet) {
      const columns = columnSets
        .map(cols => cols.find(c => c.path === path))
        .filter((c): c is Column => c !== undefined);

      if (columns.length === 0) continue;

      // Concatenate values
      const values: unknown[] = [];
      const nulls: boolean[] = [];
      let nullable = false;

      for (const col of columns) {
        values.push(...col.values);
        nulls.push(...col.nulls);
        if (col.nullable) nullable = true;
      }

      result.push({
        path,
        type: columns[0].type,
        nullable,
        values,
        nulls,
      });
    }

    // Ensure all columns have same length
    const maxLen = Math.max(...result.map(c => c.values.length));
    for (const col of result) {
      while (col.values.length < maxLen) {
        col.values.push(null);
        col.nulls.push(true);
        col.nullable = true;
      }
    }

    return result;
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
   * Estimate size savings from compaction
   */
  estimateSavings(blocks: BlockMetadata[]): {
    currentSize: number;
    estimatedNewSize: number;
    estimatedSavings: number;
    savingsPercent: number;
  } {
    const currentSize = blocks.reduce((sum, b) => sum + b.sizeBytes, 0);

    // Assume ~20% size reduction from better compression on larger blocks
    const estimatedNewSize = Math.floor(currentSize * 0.8);
    const estimatedSavings = currentSize - estimatedNewSize;
    const savingsPercent = (estimatedSavings / currentSize) * 100;

    return {
      currentSize,
      estimatedNewSize,
      estimatedSavings,
      savingsPercent,
    };
  }

  /**
   * Get compaction metrics for monitoring
   */
  getMetrics(blocks: BlockMetadata[]): {
    totalBlocks: number;
    smallBlocks: number;
    compactedBlocks: number;
    eligibleForCompaction: boolean;
    partitionMode: PartitionMode;
    targetSize: number;
    maxSize: number;
  } {
    const smallBlocks = this.selectSmallBlocks(blocks);
    const compactedBlocks = blocks.filter(b => b.compacted);

    return {
      totalBlocks: blocks.length,
      smallBlocks: smallBlocks.length,
      compactedBlocks: compactedBlocks.length,
      eligibleForCompaction: smallBlocks.length >= this.config.minBlocks,
      partitionMode: this.config.partitionMode,
      targetSize: this.config.targetSize,
      maxSize: this.config.maxSize,
    };
  }
}

/**
 * Automatic compaction scheduler
 */
export class CompactionScheduler {
  private readonly compactor: BlockCompactor;
  private isRunning = false;
  private lastCompactionTime: number | null = null;
  private consecutiveFailures = 0;
  private readonly maxConsecutiveFailures = 3;

  constructor(compactor: BlockCompactor) {
    this.compactor = compactor;
  }

  /**
   * Run compaction if needed
   */
  async runIfNeeded(
    blocks: BlockMetadata[],
    getNextSeq: () => number
  ): Promise<CompactResult | null> {
    if (this.isRunning) {
      return null;
    }

    // Back off if too many consecutive failures
    if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
      const backoffTime = Math.pow(2, this.consecutiveFailures) * 60000; // Exponential backoff
      if (this.lastCompactionTime && Date.now() - this.lastCompactionTime < backoffTime) {
        return null;
      }
    }

    if (!this.compactor.shouldCompact(blocks)) {
      return null;
    }

    const selectedBlocks = this.compactor.selectBlocksForCompaction(blocks);
    if (selectedBlocks.length < 2) {
      return null;
    }

    this.isRunning = true;
    try {
      const result = await this.compactor.compact(selectedBlocks, getNextSeq());
      this.lastCompactionTime = Date.now();

      if (result.status === 'completed') {
        this.consecutiveFailures = 0;
      } else if (result.status === 'failed') {
        this.consecutiveFailures++;
      }

      return result;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Force a compaction run regardless of thresholds
   */
  async forceCompaction(
    blocks: BlockMetadata[],
    getNextSeq: () => number
  ): Promise<CompactResult | null> {
    if (this.isRunning) {
      return null;
    }

    const smallBlocks = this.compactor.selectSmallBlocks(blocks);
    if (smallBlocks.length < 2) {
      return {
        status: 'skipped',
        blocksMerged: 0,
        blocksDeleted: [],
        durationMs: 0,
        error: 'Not enough blocks to compact',
      };
    }

    this.isRunning = true;
    try {
      // Select up to max merge blocks
      const selectedBlocks = smallBlocks.slice(0, 8);
      const result = await this.compactor.compact(selectedBlocks, getNextSeq());
      this.lastCompactionTime = Date.now();
      return result;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Check if compaction is currently running
   */
  get running(): boolean {
    return this.isRunning;
  }

  /**
   * Get time since last compaction
   */
  get timeSinceLastCompaction(): number | null {
    if (this.lastCompactionTime === null) return null;
    return Date.now() - this.lastCompactionTime;
  }

  /**
   * Get consecutive failure count
   */
  get failureCount(): number {
    return this.consecutiveFailures;
  }

  /**
   * Reset failure counter
   */
  resetFailures(): void {
    this.consecutiveFailures = 0;
  }

  /**
   * Get scheduler status for monitoring
   */
  getStatus(): {
    running: boolean;
    lastCompactionTime: number | null;
    consecutiveFailures: number;
    partitionMode: PartitionMode;
  } {
    return {
      running: this.isRunning,
      lastCompactionTime: this.lastCompactionTime,
      consecutiveFailures: this.consecutiveFailures,
      partitionMode: this.compactor.getPartitionMode(),
    };
  }
}

/**
 * Tiered compaction strategy for partition modes
 * Automatically promotes blocks through size tiers
 */
export class TieredCompactor {
  private readonly compactors: Map<PartitionMode, BlockCompactor> = new Map();

  constructor(
    r2Bucket: R2Bucket,
    tableLocation: string,
    writerOptions?: Pick<ResolvedWriterOptions, 'schemaId' | 'maxRetries' | 'retryBackoffMs'>
  ) {
    // Create compactors for each tier
    const modes: PartitionMode[] = ['do-sqlite', 'edge-cache', 'enterprise'];
    for (const mode of modes) {
      this.compactors.set(
        mode,
        new BlockCompactor(r2Bucket, tableLocation, { partitionMode: mode }, {
          maxRetries: writerOptions?.maxRetries ?? 3,
          retryBackoffMs: writerOptions?.retryBackoffMs ?? 1000,
          schemaId: writerOptions?.schemaId,
          partitionMode: mode,
        })
      );
    }
  }

  /**
   * Get the appropriate compactor for a set of blocks
   */
  getCompactorForBlocks(blocks: BlockMetadata[]): BlockCompactor {
    const totalSize = blocks.reduce((sum, b) => sum + b.sizeBytes, 0);

    // Select tier based on total size
    if (totalSize < 500 * 1024 * 1024) {
      return this.compactors.get('do-sqlite')!;
    } else if (totalSize < 5 * 1024 * 1024 * 1024) {
      return this.compactors.get('edge-cache')!;
    } else {
      return this.compactors.get('enterprise')!;
    }
  }

  /**
   * Run tiered compaction
   */
  async compact(
    blocks: BlockMetadata[],
    getNextSeq: () => number
  ): Promise<CompactResult | null> {
    const compactor = this.getCompactorForBlocks(blocks);

    if (!compactor.shouldCompact(blocks)) {
      return null;
    }

    const selectedBlocks = compactor.selectBlocksForCompaction(blocks);
    if (selectedBlocks.length < 2) {
      return null;
    }

    return compactor.compact(selectedBlocks, getNextSeq());
  }
}
