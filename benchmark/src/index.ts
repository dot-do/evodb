/**
 * @evodb/benchmark
 *
 * Scale-out benchmark harness for EvoDB + Cloudflare Workers.
 * Demonstrates parallel query execution advantage.
 *
 * Features:
 * - Concurrent queries (1K, 10K users simulation)
 * - Partition parallel scan (multiple Workers)
 * - Edge cache effectiveness (cold vs warm)
 * - Scatter-gather pattern
 * - JSONBench Bluesky data loader
 *
 * @example
 * ```typescript
 * import { runBenchmark, generateForSize, USER_ACTIVITY_SCHEMA } from '@evodb/benchmark';
 *
 * // Run full benchmark suite
 * const report = await runBenchmark({
 *   dataSizes: ['10K', '100K'],
 *   workerCounts: [1, 2, 4, 8],
 * });
 *
 * // Or run individual scenarios
 * const dataset = generateForSize(USER_ACTIVITY_SCHEMA, '100K');
 * const result = await benchmarkParallelScan(dataset.partitions);
 * ```
 */

// ============================================================================
// Existing datasets module (JSONBench Bluesky)
// ============================================================================

// Re-export datasets module
export * as datasets from './datasets/index.js';

// Convenience re-exports from datasets
export {
  generateDataset as generateBlueskyDataset,
  generateEvents,
  benchmarkFull,
  benchmarkShred,
  formatBenchmarkResult,
  runBenchmarks,
  DATA_SIZES,
  type DataSize as BlueskyDataSize,
  type BenchmarkResult as BlueskyBenchmarkResult,
  type BlueskyEventJson,
} from './datasets/index.js';

// ============================================================================
// Scale-out benchmark harness
// ============================================================================

// Types
export type {
  // Configuration
  BenchmarkConfig,
  DataSize,
  ScenarioConfig,
  ScenarioType,
  ConcurrentQueriesConfig,
  PartitionParallelScanConfig,
  CacheEffectivenessConfig,
  ScatterGatherConfig,
  AnyScenarioConfig,

  // Results & Metrics
  BenchmarkResult,
  LatencyMetrics,
  ThroughputMetrics,
  CacheMetrics,
  ResourceMetrics,
  CostMetrics,
  ComparisonResult,

  // Workers
  SimulatedWorker,
  WorkerStatus,
  WorkerStats,
  QueryTask,
  QueryResult,
  QueryFilter,
  AggregationSpec,
  PartialAggregation,

  // Data Generation
  DataGeneratorConfig,
  DataSchema,
  ColumnDef,
  ColumnType,
  GeneratorHint,
  PartitionMetadata,
  ColumnStats,

  // Baselines
  BaselineSystem,
  PublishedBaseline,
  PublishedResult,

  // Reporting
  BenchmarkReport,
  ReportSummary,
  ScenarioReport,
  ComparisonReport,
} from './types.js';

export { DATA_SIZE_ROWS, DEFAULT_BENCHMARK_CONFIG } from './types.js';

// Utilities
export {
  SeededRandom,
  random,
  createRandom,
} from './utils/random.js';

export {
  computeLatencyMetrics,
  computeThroughputMetrics,
  computeCacheMetrics,
  computeCostMetrics,
  percentile,
  createHistogram,
  formatBytes,
  formatDuration,
  formatNumber,
  calculateSpeedup,
  calculateScalingEfficiency,
  CF_PRICING,
} from './utils/metrics.js';

// Generators
export {
  DataGenerator,
  generateDataset,
  generateForSize,
} from './generators/data-generator.js';

export {
  USER_ACTIVITY_SCHEMA,
  ECOMMERCE_EVENTS_SCHEMA,
  IOT_SENSOR_SCHEMA,
  LOG_ANALYTICS_SCHEMA,
  FINANCIAL_TRANSACTIONS_SCHEMA,
  getSchema,
  listSchemas,
} from './generators/schemas.js';

// Workers Simulation
export {
  WorkerSimulator,
  createWorkerSimulator,
  DEFAULT_SIMULATOR_CONFIG,
} from './workers/worker-simulator.js';

export type { WorkerSimulatorConfig } from './workers/worker-simulator.js';

export {
  TaskScheduler,
  createTaskScheduler,
  generateBenchmarkFilters,
  generateBenchmarkAggregations,
  DEFAULT_SCHEDULER_CONFIG,
} from './workers/task-scheduler.js';

export type { TaskSchedulerConfig, SchedulingStrategy, TaskBatch } from './workers/task-scheduler.js';

// Scenarios
export {
  ConcurrentQueriesScenario,
  createConcurrentQueriesScenario,
  benchmarkConcurrentQueries,
  DEFAULT_CONCURRENT_CONFIG,
} from './scenarios/concurrent-queries.js';

export {
  PartitionParallelScanScenario,
  createPartitionParallelScanScenario,
  benchmarkParallelScan,
  DEFAULT_PARALLEL_SCAN_CONFIG,
} from './scenarios/partition-parallel-scan.js';

export {
  CacheEffectivenessScenario,
  createCacheEffectivenessScenario,
  benchmarkCacheEffectiveness,
  DEFAULT_CACHE_CONFIG,
} from './scenarios/cache-effectiveness.js';

export {
  ScatterGatherScenario,
  createScatterGatherScenario,
  benchmarkScatterGather,
  DEFAULT_SCATTER_GATHER_CONFIG,
} from './scenarios/scatter-gather.js';

// Baselines
export {
  CLICKBENCH_BASELINE,
  DUCKDB_BASELINE,
  BIGQUERY_BASELINE,
  EVODB_THEORETICAL_TARGETS,
  getAllBaselines,
  getBaseline,
  compareToBaseline,
  generateComparisonTable,
  CF_WORKERS_PRICING,
  estimateWorkloadCost,
} from './baselines/clickhouse-baselines.js';

// Runner
export {
  BenchmarkRunner,
  createBenchmarkRunner,
  runBenchmark,
  DEFAULT_CONFIG,
} from './runner.js';
