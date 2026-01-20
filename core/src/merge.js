// Merge compaction with alarm support (~1.3KB budget)
import { readBlock, writeBlock } from './block.js';
import { encode } from './encode.js';
import { makeBlockId, parseBlockId } from './storage.js';
const DEFAULT_CONFIG = {
    targetRows: 10000,
    maxMerge: 4,
    minBlocks: 4,
    prefix: 'blk',
};
/** Check if merge is needed */
export async function shouldMerge(adapter, config = {}) {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const blocks = await adapter.listBlocks(cfg.prefix);
    return blocks.length >= cfg.minBlocks;
}
/** Select blocks for merging */
export async function selectBlocksForMerge(adapter, config = {}) {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const blocks = await adapter.listBlocks(cfg.prefix);
    if (blocks.length < cfg.minBlocks)
        return [];
    // Select oldest blocks up to maxMerge
    return blocks.slice(0, Math.min(cfg.maxMerge, blocks.length));
}
/** Merge multiple blocks into one */
export async function mergeBlocks(adapter, blockIds, config = {}) {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    if (blockIds.length === 0) {
        throw new Error('No blocks to merge');
    }
    // Read all blocks
    const blocks = await Promise.all(blockIds.map(async (id) => {
        const data = await adapter.readBlock(id);
        if (!data)
            throw new Error(`Block not found: ${id}`);
        return readBlock(data);
    }));
    // Merge columns
    const mergedColumns = mergeColumns(blocks.map(b => b.columns));
    // Find LSN range
    let minLsn = blocks[0].header.minLsn;
    let maxLsn = blocks[0].header.maxLsn;
    for (const b of blocks) {
        if (b.header.minLsn < minLsn)
            minLsn = b.header.minLsn;
        if (b.header.maxLsn > maxLsn)
            maxLsn = b.header.maxLsn;
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
function mergeColumns(columnSets) {
    if (columnSets.length === 0)
        return [];
    if (columnSets.length === 1)
        return columnSets[0];
    // Get all unique paths
    const pathSet = new Set();
    for (const cols of columnSets) {
        for (const col of cols)
            pathSet.add(col.path);
    }
    // Merge each path
    const result = [];
    for (const path of pathSet) {
        const columns = columnSets.map(cols => cols.find(c => c.path === path)).filter(Boolean);
        if (columns.length === 0)
            continue;
        // Concatenate values
        const values = [];
        const nulls = [];
        let nullable = false;
        for (const col of columns) {
            values.push(...col.values);
            nulls.push(...col.nulls);
            if (col.nullable)
                nullable = true;
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
export function createMergeScheduler(adapter, config = {}) {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const MERGE_INTERVAL = 60000; // 1 minute between checks
    return {
        async onAlarm() {
            const blocks = await selectBlocksForMerge(adapter, cfg);
            if (blocks.length >= cfg.minBlocks) {
                await mergeBlocks(adapter, blocks, cfg);
                // Check again soon in case more merges needed
                return Date.now() + 1000;
            }
            // No merge needed, check again later
            return Date.now() + MERGE_INTERVAL;
        },
        async scheduleNext(setState) {
            const needsMerge = await shouldMerge(adapter, cfg);
            if (needsMerge) {
                setState(Date.now() + 100); // Soon
            }
            else {
                setState(Date.now() + MERGE_INTERVAL);
            }
        },
    };
}
/** Get merge statistics */
export async function getMergeStats(adapter, prefix = 'blk') {
    const blocks = await adapter.listBlocks(prefix);
    if (blocks.length === 0) {
        return { blockCount: 0, totalRows: 0, oldestBlock: null, newestBlock: null };
    }
    let totalRows = 0;
    let oldest = null;
    let newest = null;
    for (const id of blocks) {
        const parsed = parseBlockId(id);
        if (parsed) {
            if (oldest === null || parsed.timestamp < oldest)
                oldest = parsed.timestamp;
            if (newest === null || parsed.timestamp > newest)
                newest = parsed.timestamp;
        }
        const data = await adapter.readBlock(id);
        if (data) {
            const { header } = readBlock(data);
            totalRows += header.rowCount;
        }
    }
    return { blockCount: blocks.length, totalRows, oldestBlock: oldest, newestBlock: newest };
}
//# sourceMappingURL=merge.js.map