import { type StorageAdapter } from './types.js';
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
/** Merge state for alarm-based compaction */
export interface MergeState {
    lastMergeTime: number;
    pendingBlocks: string[];
    mergeInProgress: boolean;
}
/** Check if merge is needed */
export declare function shouldMerge(adapter: StorageAdapter, config?: Partial<MergeConfig>): Promise<boolean>;
/** Select blocks for merging */
export declare function selectBlocksForMerge(adapter: StorageAdapter, config?: Partial<MergeConfig>): Promise<string[]>;
/** Merge multiple blocks into one */
export declare function mergeBlocks(adapter: StorageAdapter, blockIds: string[], config?: Partial<MergeConfig>): Promise<{
    newBlockId: string;
    deletedIds: string[];
}>;
/** Alarm-based merge scheduler */
export declare function createMergeScheduler(adapter: StorageAdapter, config?: Partial<MergeConfig>): {
    onAlarm: () => Promise<number | null>;
    scheduleNext: (setState: (alarm: number | null) => void) => Promise<void>;
};
/** Get merge statistics */
export declare function getMergeStats(adapter: StorageAdapter, prefix?: string): Promise<{
    blockCount: number;
    totalRows: number;
    oldestBlock: number | null;
    newestBlock: number | null;
}>;
//# sourceMappingURL=merge.d.ts.map