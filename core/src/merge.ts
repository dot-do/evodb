// Merge compaction with alarm support (~1.3KB budget)

import { type Column, type StorageAdapter } from './types.js';
import { readBlock, writeBlock } from './block.js';
import { encode, isNullAt } from './encode.js';
import { makeBlockId, parseBlockId } from './storage.js';
import {
  DEFAULT_TARGET_ROWS_PER_BLOCK,
  MIN_COMPACT_BLOCKS,
  MAX_MERGE_BLOCKS,
  MERGE_CHECK_INTERVAL_MS,
  MERGE_RECHECK_DELAY_MS,
  MERGE_SCHEDULE_DELAY_MS,
} from './constants.js';
import { ValidationError, StorageError, ErrorCode } from './errors.js';

/** Merge configuration */
export interface MergeConfig {
  /** Target rows per block (default: 10000) */
  targetRows: number;
  /** Max blocks to merge at once (default: 4) */
  maxMerge: number;
  /** Min blocks to trigger merge (default: 4) */
  minBlocks: number;
  /** Block prefix */
  prefix: string;
}

const DEFAULT_CONFIG: MergeConfig = {
  targetRows: DEFAULT_TARGET_ROWS_PER_BLOCK,
  maxMerge: MAX_MERGE_BLOCKS,
  minBlocks: MIN_COMPACT_BLOCKS,
  prefix: 'blk',
};

/** Merge state for alarm-based compaction */
export interface MergeState {
  lastMergeTime: number;
  pendingBlocks: string[];
  mergeInProgress: boolean;
}

/** Check if merge is needed */
export async function shouldMerge(adapter: StorageAdapter, config: Partial<MergeConfig> = {}): Promise<boolean> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const blocks = await adapter.listBlocks(cfg.prefix);
  return blocks.length >= cfg.minBlocks;
}

/** Select blocks for merging */
export async function selectBlocksForMerge(
  adapter: StorageAdapter,
  config: Partial<MergeConfig> = {}
): Promise<string[]> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const blocks = await adapter.listBlocks(cfg.prefix);

  if (blocks.length < cfg.minBlocks) return [];

  // Select oldest blocks up to maxMerge
  return blocks.slice(0, Math.min(cfg.maxMerge, blocks.length));
}

/** Merge multiple blocks into one */
export async function mergeBlocks(
  adapter: StorageAdapter,
  blockIds: string[],
  config: Partial<MergeConfig> = {}
): Promise<{ newBlockId: string; deletedIds: string[] }> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (blockIds.length === 0) {
    throw new ValidationError(
      'Cannot merge: no blocks provided',
      ErrorCode.VALIDATION_ERROR,
      { operation: 'mergeBlocks', blockCount: 0, minRequired: 1 },
      `Provide at least one block ID to merge. Use selectBlocksForMerge() to find mergeable blocks.`
    );
  }

  // Read all blocks
  const blocks = await Promise.all(
    blockIds.map(async id => {
      const data = await adapter.readBlock(id);
      if (!data) {
        throw StorageError.notFound(id, {
          operation: 'mergeBlocks',
          blockId: id,
          context: 'Block may have been deleted or moved during merge operation',
        });
      }
      return readBlock(data);
    })
  );

  // Merge columns
  const mergedColumns = mergeColumns(blocks.map(b => b.columns));

  // Find LSN range
  let minLsn = blocks[0].header.minLsn;
  let maxLsn = blocks[0].header.maxLsn;
  for (const b of blocks) {
    if (b.header.minLsn < minLsn) minLsn = b.header.minLsn;
    if (b.header.maxLsn > maxLsn) maxLsn = b.header.maxLsn;
  }

  // Calculate total row count
  const totalRowCount = blocks.reduce((sum, b) => sum + b.header.rowCount, 0);

  // Encode and write
  const encoded = encode(mergedColumns);
  const newBlock = writeBlock(encoded, {
    schemaId: blocks[0].header.schemaId,
    minLsn,
    maxLsn,
    rowCount: totalRowCount,
  });

  const newBlockId = makeBlockId(cfg.prefix, Date.now());
  await adapter.writeBlock(newBlockId, newBlock);

  // Delete old blocks
  await Promise.all(blockIds.map(id => adapter.deleteBlock(id)));

  return { newBlockId, deletedIds: blockIds };
}

/** Merge column arrays from multiple blocks */
function mergeColumns(columnSets: Column[][]): Column[] {
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
    const columns = columnSets.map(cols => cols.find(c => c.path === path)).filter(Boolean) as Column[];

    if (columns.length === 0) continue;

    // Pre-allocate based on total size (evodb-jo7: avoid spread operator memory overhead)
    const totalRows = columns.reduce((sum, c) => sum + c.values.length, 0);
    const values = new Array(totalRows);
    const nulls = new Array(totalRows);
    let nullable = false;
    let offset = 0;

    for (const col of columns) {
      const len = col.values.length;
      for (let i = 0; i < len; i++) {
        values[offset + i] = col.values[i];
        // Use isNullAt helper for NullBitmap compatibility (evodb-80q)
        nulls[offset + i] = isNullAt(col.nulls, i);
      }
      offset += len;
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

/** Alarm-based merge scheduler */
export function createMergeScheduler(
  adapter: StorageAdapter,
  config: Partial<MergeConfig> = {}
): {
  onAlarm: () => Promise<number | null>;
  scheduleNext: (setState: (alarm: number | null) => void) => Promise<void>;
} {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  return {
    async onAlarm(): Promise<number | null> {
      const blocks = await selectBlocksForMerge(adapter, cfg);

      if (blocks.length >= cfg.minBlocks) {
        await mergeBlocks(adapter, blocks, cfg);
        // Check again soon in case more merges needed
        return Date.now() + MERGE_RECHECK_DELAY_MS;
      }

      // No merge needed, check again later
      return Date.now() + MERGE_CHECK_INTERVAL_MS;
    },

    async scheduleNext(setState: (alarm: number | null) => void): Promise<void> {
      const needsMerge = await shouldMerge(adapter, cfg);
      if (needsMerge) {
        setState(Date.now() + MERGE_SCHEDULE_DELAY_MS); // Soon
      } else {
        setState(Date.now() + MERGE_CHECK_INTERVAL_MS);
      }
    },
  };
}

/** Get merge statistics */
export async function getMergeStats(
  adapter: StorageAdapter,
  prefix = 'blk'
): Promise<{
  blockCount: number;
  totalRows: number;
  oldestBlock: number | null;
  newestBlock: number | null;
}> {
  const blocks = await adapter.listBlocks(prefix);

  if (blocks.length === 0) {
    return { blockCount: 0, totalRows: 0, oldestBlock: null, newestBlock: null };
  }

  let totalRows = 0;
  let oldest: number | null = null;
  let newest: number | null = null;

  for (const id of blocks) {
    const parsed = parseBlockId(id);
    if (parsed) {
      if (oldest === null || parsed.timestamp < oldest) oldest = parsed.timestamp;
      if (newest === null || parsed.timestamp > newest) newest = parsed.timestamp;
    }

    const data = await adapter.readBlock(id);
    if (data) {
      const { header } = readBlock(data);
      totalRows += header.rowCount;
    }
  }

  return { blockCount: blocks.length, totalRows, oldestBlock: oldest, newestBlock: newest };
}
