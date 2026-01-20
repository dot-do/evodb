/**
 * @evodb/benchmark - Core Types
 *
 * Type definitions for the scale-out benchmark harness.
 * Designed to measure Workers parallel query execution advantages.
 */

// =============================================================================
// Benchmark Configuration
// =============================================================================

/**
 * Global benchmark configuration
 */
export interface BenchmarkConfig {
  /** Name of the benchmark run */
  name: string;

  /** Description of what is being measured */
  description?: string;

  /** Number of warmup iterations (not included in results) */
  warmupIterations: number;

  /** Number of measurement iterations */
  measurementIterations: number;

  /** Target concurrency levels to test */
  concurrencyLevels: number[];

  /** Data sizes to test (number of rows) */
  dataSizes: DataSize[];

  /** Whether to collect detailed metrics */
  detailedMetrics: boolean;

  /** Timeout per operation in milliseconds */
  operationTimeoutMs: number;

  /** Random seed for reproducibility */
  randomSeed?: number;
}

/**
 * Standard data sizes for benchmarking
 */
export type DataSize = '1K' | '10K' | '100K' | '1M' | '10M' | '100M';

/**
 * Map data size labels to row counts
 */
export const DATA_SIZE_ROWS: Record<DataSize, number> = {
  '1K': 1_000,
  '10K': 10_000,
  '100K': 100_000,
  '1M': 1_000_000,
  '10M': 10_000_000,
  '100M': 100_000_000,
};

/**
 * Default benchmark configuration
 */
export const DEFAULT_BENCHMARK_CONFIG: BenchmarkConfig = {
  name: 'EvoDB Scale-out Benchmark',
  warmupIterations: 3,
  measurementIterations: 10,
  concurrencyLevels: [1, 10, 100, 1000],
  dataSizes: ['1K', '100K', '1M'],
  detailedMetrics: true,
  operationTimeoutMs: 30_000,
};

// =============================================================================
// Metrics & Results
// =============================================================================

/**
 * Latency metrics with percentiles
 */
export interface LatencyMetrics {
  /** Minimum latency in milliseconds */
  min: number;

  /** Maximum latency in milliseconds */
  max: number;

  /** Mean latency in milliseconds */
  mean: number;

  /** Median (p50) latency in milliseconds */
  p50: number;

  /** 95th percentile latency in milliseconds */
  p95: number;

  /** 99th percentile latency in milliseconds */
  p99: number;

  /** Standard deviation */
  stdDev: number;
}

/**
 * Throughput metrics
 */
export interface ThroughputMetrics {
  /** Queries per second */
  qps: number;

  /** Rows scanned per second */
  rowsPerSecond: number;

  /** Bytes scanned per second */
  bytesPerSecond: number;

  /** Total operations completed */
  totalOperations: number;

  /** Total duration in milliseconds */
  totalDurationMs: number;
}

/**
 * Cache metrics
 */
export interface CacheMetrics {
  /** Total cache hits */
  hits: number;

  /** Total cache misses */
  misses: number;

  /** Cache hit ratio (0-1) */
  hitRatio: number;

  /** Bytes served from cache */
  bytesFromCache: number;

  /** Bytes fetched from origin */
  bytesFromOrigin: number;

  /** Average cache lookup time in ms */
  avgLookupTimeMs: number;
}

/**
 * Resource utilization metrics
 */
export interface ResourceMetrics {
  /** Peak memory usage in bytes */
  peakMemoryBytes: number;

  /** Average CPU utilization (0-1) */
  avgCpuUtilization: number;

  /** Total bytes scanned */
  bytesScanned: number;

  /** Total network bytes transferred */
  networkBytesTransferred: number;
}

/**
 * Cost estimation metrics
 */
export interface CostMetrics {
  /** Estimated cost per query in USD */
  costPerQuery: number;

  /** Estimated cost per 1M queries in USD */
  costPerMillionQueries: number;

  /** Workers CPU time cost */
  workersCpuCost: number;

  /** R2 read operations cost */
  r2ReadCost: number;

  /** R2 egress cost */
  r2EgressCost: number;
}

/**
 * Complete benchmark result for a single run
 */
export interface BenchmarkResult {
  /** Scenario name */
  scenario: string;

  /** Configuration used */
  config: ScenarioConfig;

  /** Timestamp of the run */
  timestamp: number;

  /** Duration of the entire benchmark */
  durationMs: number;

  /** Latency metrics */
  latency: LatencyMetrics;

  /** Throughput metrics */
  throughput: ThroughputMetrics;

  /** Cache metrics (if applicable) */
  cache?: CacheMetrics;

  /** Resource metrics */
  resources: ResourceMetrics;

  /** Cost estimation */
  cost: CostMetrics;

  /** Raw latency samples */
  samples?: number[];

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Comparison result between two benchmark runs
 */
export interface ComparisonResult {
  /** Baseline result */
  baseline: BenchmarkResult;

  /** Comparison result */
  comparison: BenchmarkResult;

  /** Speedup factor (comparison vs baseline) */
  speedup: number;

  /** QPS improvement factor */
  qpsImprovement: number;

  /** Latency reduction percentage */
  latencyReduction: {
    p50: number;
    p95: number;
    p99: number;
  };

  /** Cost efficiency improvement */
  costEfficiencyImprovement: number;
}

// =============================================================================
// Scenario Configuration
// =============================================================================

/**
 * Base scenario configuration
 */
export interface ScenarioConfig {
  /** Scenario type */
  type: ScenarioType;

  /** Number of concurrent users/queries */
  concurrency: number;

  /** Data size */
  dataSize: DataSize;

  /** Number of Workers (for parallel scenarios) */
  workerCount: number;

  /** Enable caching */
  enableCache: boolean;

  /** Cache TTL in seconds */
  cacheTtlSeconds: number;
}

/**
 * Supported scenario types
 */
export type ScenarioType =
  | 'concurrent_queries'
  | 'partition_parallel_scan'
  | 'cache_effectiveness'
  | 'scatter_gather';

/**
 * Concurrent queries scenario configuration
 */
export interface ConcurrentQueriesConfig extends ScenarioConfig {
  type: 'concurrent_queries';

  /** Simulated users (1K, 10K, etc.) */
  simulatedUsers: number;

  /** Query mix (read/write ratio) */
  readWriteRatio: number;

  /** Think time between queries (ms) */
  thinkTimeMs: number;

  /** Query complexity distribution */
  queryComplexity: 'simple' | 'medium' | 'complex' | 'mixed';
}

/**
 * Partition parallel scan scenario configuration
 */
export interface PartitionParallelScanConfig extends ScenarioConfig {
  type: 'partition_parallel_scan';

  /** Number of partitions */
  partitionCount: number;

  /** Partition scheme */
  partitionScheme: 'hash' | 'range' | 'time';

  /** Files per partition */
  filesPerPartition: number;

  /** Rows per file */
  rowsPerFile: number;

  /** Scan type */
  scanType: 'full' | 'filtered' | 'aggregated';

  /** Filter selectivity (0-1, lower = more selective) */
  filterSelectivity: number;
}

/**
 * Cache effectiveness scenario configuration
 */
export interface CacheEffectivenessConfig extends ScenarioConfig {
  type: 'cache_effectiveness';

  /** Hot data percentage (0-1) */
  hotDataPercentage: number;

  /** Access pattern */
  accessPattern: 'uniform' | 'zipf' | 'temporal';

  /** Zipf skew (if using zipf pattern) */
  zipfSkew: number;

  /** Cache warm-up queries */
  warmupQueries: number;

  /** Measurement queries */
  measurementQueries: number;
}

/**
 * Scatter-gather pattern scenario configuration
 */
export interface ScatterGatherConfig extends ScenarioConfig {
  type: 'scatter_gather';

  /** Number of scatter targets */
  scatterFanOut: number;

  /** Gather aggregation type */
  aggregationType: 'sum' | 'avg' | 'count' | 'topk' | 'distinct';

  /** Result set size limit */
  resultLimit: number;

  /** Enable partial results */
  allowPartialResults: boolean;

  /** Timeout per scatter in ms */
  scatterTimeoutMs: number;
}

/**
 * Union type of all scenario configs
 */
export type AnyScenarioConfig =
  | ConcurrentQueriesConfig
  | PartitionParallelScanConfig
  | CacheEffectivenessConfig
  | ScatterGatherConfig;

// =============================================================================
// Workers Simulation Types
// =============================================================================

/**
 * Simulated Worker instance
 */
export interface SimulatedWorker {
  /** Worker ID */
  id: string;

  /** Worker region/location */
  region: string;

  /** Current status */
  status: WorkerStatus;

  /** Assigned partitions */
  assignedPartitions: string[];

  /** Current load (0-1) */
  load: number;

  /** Statistics */
  stats: WorkerStats;
}

/**
 * Worker status
 */
export type WorkerStatus = 'idle' | 'processing' | 'waiting' | 'error';

/**
 * Worker statistics
 */
export interface WorkerStats {
  /** Total queries processed */
  queriesProcessed: number;

  /** Total bytes scanned */
  bytesScanned: number;

  /** Total CPU time in ms */
  cpuTimeMs: number;

  /** Total wall time in ms */
  wallTimeMs: number;

  /** Cache hits */
  cacheHits: number;

  /** Cache misses */
  cacheMisses: number;
}

/**
 * Query task for Workers
 */
export interface QueryTask {
  /** Task ID */
  id: string;

  /** Query type */
  type: 'scan' | 'filter' | 'aggregate' | 'join';

  /** Target partitions */
  partitions: string[];

  /** Filter predicate (if applicable) */
  filter?: QueryFilter;

  /** Projection columns */
  columns?: string[];

  /** Aggregation spec */
  aggregation?: AggregationSpec;

  /** Priority (higher = more urgent) */
  priority: number;

  /** Deadline in ms from now */
  deadlineMs: number;
}

/**
 * Query filter predicate
 */
export interface QueryFilter {
  /** Column to filter */
  column: string;

  /** Filter operator */
  operator: 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte' | 'in' | 'between';

  /** Filter value(s) */
  value: unknown;
}

/**
 * Aggregation specification
 */
export interface AggregationSpec {
  /** Aggregation function */
  function: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'distinct';

  /** Column to aggregate */
  column: string;

  /** Group by columns */
  groupBy?: string[];
}

/**
 * Query result from a Worker
 */
export interface QueryResult {
  /** Task ID */
  taskId: string;

  /** Worker ID that processed this */
  workerId: string;

  /** Success status */
  success: boolean;

  /** Result data */
  data?: unknown[];

  /** Partial result (for aggregations) */
  partialResult?: PartialAggregation;

  /** Rows scanned */
  rowsScanned: number;

  /** Rows returned */
  rowsReturned: number;

  /** Bytes scanned */
  bytesScanned: number;

  /** Execution time in ms */
  executionTimeMs: number;

  /** From cache */
  fromCache: boolean;

  /** Error message (if failed) */
  error?: string;
}

/**
 * Partial aggregation result for scatter-gather
 */
export interface PartialAggregation {
  /** Aggregation function */
  function: string;

  /** Partial value */
  value: number;

  /** Count (for avg) */
  count?: number;

  /** Distinct values (for distinct) */
  distinctValues?: unknown[];
}

// =============================================================================
// Data Generation Types
// =============================================================================

/**
 * Data generator configuration
 */
export interface DataGeneratorConfig {
  /** Schema to generate */
  schema: DataSchema;

  /** Number of rows to generate */
  rowCount: number;

  /** Number of partitions */
  partitionCount: number;

  /** Partition key column */
  partitionKey: string;

  /** Cardinality hints for columns */
  cardinalityHints?: Record<string, number>;

  /** Null percentage for nullable columns */
  nullPercentage?: number;

  /** Random seed */
  seed?: number;
}

/**
 * Schema definition for generated data
 */
export interface DataSchema {
  /** Schema name */
  name: string;

  /** Column definitions */
  columns: ColumnDef[];
}

/**
 * Column definition
 */
export interface ColumnDef {
  /** Column name */
  name: string;

  /** Column type */
  type: ColumnType;

  /** Is nullable */
  nullable: boolean;

  /** Is primary key */
  primaryKey?: boolean;

  /** Is partition key */
  partitionKey?: boolean;

  /** Value generator hint */
  generator?: GeneratorHint;
}

/**
 * Column types
 */
export type ColumnType =
  | 'int32'
  | 'int64'
  | 'float64'
  | 'string'
  | 'bool'
  | 'timestamp'
  | 'date'
  | 'uuid'
  | 'json';

/**
 * Value generator hints
 */
export interface GeneratorHint {
  /** Generator type */
  type: 'sequential' | 'random' | 'uniform' | 'zipf' | 'gaussian' | 'enum';

  /** Minimum value (for numeric) */
  min?: number;

  /** Maximum value (for numeric) */
  max?: number;

  /** Enum values */
  values?: unknown[];

  /** Cardinality (for string/enum) */
  cardinality?: number;

  /** Zipf skew parameter */
  zipfSkew?: number;

  /** Gaussian mean */
  mean?: number;

  /** Gaussian stddev */
  stdDev?: number;

  /** String length range */
  lengthRange?: [number, number];

  /** Prefix for strings */
  prefix?: string;
}

/**
 * Generated partition metadata
 */
export interface PartitionMetadata {
  /** Partition ID */
  id: string;

  /** Partition key values */
  partitionValues: Record<string, unknown>;

  /** Row count in this partition */
  rowCount: number;

  /** Size in bytes */
  sizeBytes: number;

  /** Column statistics */
  columnStats: Record<string, ColumnStats>;

  /** File paths */
  files: string[];
}

/**
 * Column statistics
 */
export interface ColumnStats {
  /** Minimum value */
  min: unknown;

  /** Maximum value */
  max: unknown;

  /** Null count */
  nullCount: number;

  /** Distinct count (estimated) */
  distinctCount: number;

  /** Average length (for strings) */
  avgLength?: number;
}

// =============================================================================
// Baseline Comparison Types
// =============================================================================

/**
 * Baseline system for comparison
 */
export type BaselineSystem =
  | 'single_worker'
  | 'n_workers_parallel'
  | 'clickhouse_published'
  | 'duckdb_published'
  | 'bigquery_published';

/**
 * Published benchmark baseline data
 */
export interface PublishedBaseline {
  /** System name */
  system: BaselineSystem;

  /** Benchmark name (e.g., "ClickBench", "TPC-H") */
  benchmarkName: string;

  /** Source URL for the benchmark */
  sourceUrl: string;

  /** Date of the benchmark */
  benchmarkDate: string;

  /** Hardware/configuration description */
  configuration: string;

  /** Results by query type */
  results: PublishedResult[];
}

/**
 * Published benchmark result
 */
export interface PublishedResult {
  /** Query identifier */
  queryId: string;

  /** Query description */
  queryDescription: string;

  /** Data size */
  dataSize: string;

  /** Execution time in seconds */
  executionTimeSec: number;

  /** Rows processed */
  rowsProcessed?: number;

  /** QPS (if provided) */
  qps?: number;

  /** Cost (if provided) */
  costUsd?: number;
}

// =============================================================================
// Reporting Types
// =============================================================================

/**
 * Benchmark report
 */
export interface BenchmarkReport {
  /** Report title */
  title: string;

  /** Report timestamp */
  generatedAt: number;

  /** Summary statistics */
  summary: ReportSummary;

  /** Detailed results by scenario */
  scenarios: ScenarioReport[];

  /** Comparison with baselines */
  comparisons: ComparisonReport[];

  /** Recommendations */
  recommendations: string[];
}

/**
 * Report summary
 */
export interface ReportSummary {
  /** Total scenarios run */
  scenariosRun: number;

  /** Total duration */
  totalDurationMs: number;

  /** Best QPS achieved */
  bestQps: number;

  /** Best p99 latency achieved */
  bestP99Ms: number;

  /** Average cost per query */
  avgCostPerQuery: number;

  /** Maximum parallel Workers used */
  maxWorkersUsed: number;
}

/**
 * Report for a single scenario
 */
export interface ScenarioReport {
  /** Scenario name */
  name: string;

  /** Scenario type */
  type: ScenarioType;

  /** Configuration */
  config: AnyScenarioConfig;

  /** Results by concurrency level */
  resultsByConcurrency: Map<number, BenchmarkResult>;

  /** Results by worker count */
  resultsByWorkerCount: Map<number, BenchmarkResult>;

  /** Scaling efficiency */
  scalingEfficiency: number;

  /** Optimal configuration */
  optimalConfig: {
    workerCount: number;
    concurrency: number;
    qps: number;
    costPerQuery: number;
  };
}

/**
 * Comparison report
 */
export interface ComparisonReport {
  /** Baseline system */
  baseline: BaselineSystem;

  /** EvoDB results */
  evodbResult: BenchmarkResult;

  /** Baseline results */
  baselineResult: PublishedBaseline;

  /** Speedup factor */
  speedupFactor: number;

  /** Cost comparison */
  costRatio: number;

  /** Notes */
  notes: string[];
}
