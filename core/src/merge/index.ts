/**
 * @evodb/core/merge - Merge/compaction operations
 *
 * This submodule exports merge and compaction functionality with
 * alarm-based scheduling support.
 *
 * @module merge
 */

export {
  shouldMerge,
  selectBlocksForMerge,
  mergeBlocks,
  createMergeScheduler,
  getMergeStats,
  type MergeConfig,
  type MergeState,
} from '../merge.js';
