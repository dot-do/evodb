/**
 * JSONBench Dataset Utilities
 *
 * Complete toolkit for loading, generating, and benchmarking Bluesky event data.
 *
 * @example
 * ```typescript
 * import { generateDataset, benchmarkFull, formatBenchmarkResult } from '@evodb/benchmark/datasets';
 *
 * // Generate synthetic data
 * const events = generateDataset('small');
 *
 * // Run benchmark
 * const result = benchmarkFull(events);
 * console.log(formatBenchmarkResult(result));
 * ```
 */

// Types
export type {
  BlueskyEvent,
  BlueskyEventJson,
  BlueskyEventKind,
  CommitOperation,
  DataSize,
  ShredResult,
  BenchmarkResult,
  CollectionType,
  BlueskyRecord,
  PostRecord,
  LikeRecord,
  RepostRecord,
  FollowRecord,
  ProfileRecord,
  Embed,
  ReplyRef,
  Facet,
} from './types.js';

export { DATA_SIZES } from './types.js';

// Generator
export {
  generateEvents,
  generateDataset,
  generateEventsIterator,
  estimateMemoryUsage,
  estimateJsonSize,
  type GeneratorConfig,
} from './generator.js';

// Downloader
export {
  downloadDataset,
  loadDataset,
  streamDataset,
  loadFromFile,
  streamFromFile,
  clearCache,
  getCacheStatus,
  getCurlCommand,
  printDownloadInstructions,
  DATASET_FILES,
  type DownloadConfig,
} from './downloader.js';

// Shredder
export {
  shredEvents,
  benchmarkShred,
  benchmarkFull,
  benchmarkStreaming,
  runBenchmarks,
  getColumnStats,
  analyzeSchema,
  formatBenchmarkResult,
  compareBenchmarks,
  type ShredOptions,
} from './shredder.js';
