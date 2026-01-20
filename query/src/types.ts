/**
 * @evodb/query - Type Definitions
 *
 * Types for the EvoDB Query Engine that reads columnar data from R2.
 */

// =============================================================================
// Core Query Types
// =============================================================================

/**
 * Query definition for scanning R2-stored columnar data
 */
export interface Query {
  /** Table location (R2 path or URL) */
  table: string;

  /** Columns to project (null = all columns) */
  projection?: Projection;

  /** Row filter predicates */
  predicates?: Predicate[];

  /** Aggregations to compute */
  aggregations?: Aggregation[];

  /** GROUP BY columns */
  groupBy?: string[];

  /** ORDER BY specification */
  orderBy?: OrderBy[];

  /** Maximum rows to return */
  limit?: number;

  /** Rows to skip */
  offset?: number;

  /** Time-travel: query as-of specific snapshot */
  snapshotId?: string;

  /** Time-travel: query as-of timestamp */
  asOfTimestamp?: number;

  /** Query execution hints */
  hints?: QueryHints;
}

/**
 * Column projection specification
 */
export interface Projection {
  /** Column names/paths to include */
  columns: string[];

  /** Whether to include row metadata (_id, _version, etc.) */
  includeMetadata?: boolean;
}

/**
 * Predicate for filtering rows
 */
export interface Predicate {
  /** Column name/path */
  column: string;

  /** Comparison operator */
  operator: PredicateOperator;

  /** Value to compare against */
  value: PredicateValue;

  /** Optional: negate the predicate */
  not?: boolean;
}

/**
 * Supported predicate operators
 */
export type PredicateOperator =
  | 'eq'      // =
  | 'ne'      // !=
  | 'gt'      // >
  | 'gte'     // >=
  | 'lt'      // <
  | 'lte'     // <=
  | 'in'      // IN (...)
  | 'notIn'   // NOT IN (...)
  | 'between' // BETWEEN ... AND ...
  | 'like'    // LIKE pattern
  | 'isNull'  // IS NULL
  | 'isNotNull'; // IS NOT NULL

/**
 * Value types for predicates
 */
export type PredicateValue =
  | string
  | number
  | boolean
  | null
  | Date
  | bigint
  | string[]      // For IN operator
  | number[]      // For IN operator
  | [unknown, unknown]; // For BETWEEN operator

/**
 * Aggregation function specification
 */
export interface Aggregation {
  /** Aggregation function */
  function: AggregationFunction;

  /** Column to aggregate (null for COUNT(*)) */
  column: string | null;

  /** Output alias */
  alias: string;

  /** DISTINCT modifier */
  distinct?: boolean;

  /** Filter for conditional aggregation */
  filter?: Predicate;
}

/**
 * Supported aggregation functions
 */
export type AggregationFunction =
  | 'count'
  | 'sum'
  | 'avg'
  | 'min'
  | 'max'
  | 'countDistinct'
  | 'sumDistinct'
  | 'avgDistinct'
  | 'first'
  | 'last'
  | 'stddev'
  | 'variance';

/**
 * ORDER BY specification
 */
export interface OrderBy {
  /** Column to sort by */
  column: string;

  /** Sort direction */
  direction: 'asc' | 'desc';

  /** Null handling */
  nulls?: 'first' | 'last';
}

/**
 * Query execution hints
 */
export interface QueryHints {
  /** Prefer cached partitions */
  preferCache?: boolean;

  /** Maximum partitions to read in parallel */
  maxParallelism?: number;

  /** Skip zone map optimization */
  skipZoneMapPruning?: boolean;

  /** Skip bloom filter checks */
  skipBloomFilters?: boolean;

  /** Force full scan (for benchmarking) */
  forceScan?: boolean;

  /** Timeout in milliseconds */
  timeoutMs?: number;

  /** Memory limit in bytes */
  memoryLimitBytes?: number;
}

// =============================================================================
// Query Plan Types
// =============================================================================

/**
 * Query execution plan
 */
export interface QueryPlan {
  /** Unique plan ID */
  planId: string;

  /** Original query */
  query: Query;

  /** Root operator of the plan tree */
  rootOperator: PlanOperator;

  /** Estimated cost metrics */
  estimatedCost: QueryCost;

  /** Partitions selected after pruning */
  selectedPartitions: PartitionInfo[];

  /** Partitions pruned by zone maps */
  prunedPartitions: PrunedPartition[];

  /** Whether plan uses zone map optimization */
  usesZoneMaps: boolean;

  /** Whether plan uses bloom filters */
  usesBloomFilters: boolean;

  /** Plan creation timestamp */
  createdAt: number;
}

/**
 * Plan operator types (execution tree nodes)
 */
export type PlanOperator =
  | ScanOperator
  | FilterOperator
  | ProjectOperator
  | AggregateOperator
  | SortOperator
  | LimitOperator
  | MergeOperator;

/**
 * Base operator properties
 */
interface BaseOperator {
  /** Estimated output row count */
  estimatedRows: number;

  /** Estimated cost */
  estimatedCost: number;
}

/**
 * Scan operator - reads data from R2 partitions
 */
export interface ScanOperator extends BaseOperator {
  type: 'scan';

  /** Partitions to scan */
  partitions: PartitionInfo[];

  /** Column projection at scan level */
  columns: string[];
}

/**
 * Filter operator - applies predicates
 */
export interface FilterOperator extends BaseOperator {
  type: 'filter';

  /** Child operator */
  input: PlanOperator;

  /** Predicates to apply */
  predicates: Predicate[];
}

/**
 * Project operator - column projection
 */
export interface ProjectOperator extends BaseOperator {
  type: 'project';

  /** Child operator */
  input: PlanOperator;

  /** Columns to output */
  columns: string[];
}

/**
 * Aggregate operator - computes aggregations
 */
export interface AggregateOperator extends BaseOperator {
  type: 'aggregate';

  /** Child operator */
  input: PlanOperator;

  /** Aggregations to compute */
  aggregations: Aggregation[];

  /** Group by columns */
  groupBy: string[];
}

/**
 * Sort operator - sorts results
 */
export interface SortOperator extends BaseOperator {
  type: 'sort';

  /** Child operator */
  input: PlanOperator;

  /** Sort specification */
  orderBy: OrderBy[];
}

/**
 * Limit operator - limits result count
 */
export interface LimitOperator extends BaseOperator {
  type: 'limit';

  /** Child operator */
  input: PlanOperator;

  /** Maximum rows */
  limit: number;

  /** Rows to skip */
  offset: number;
}

/**
 * Merge operator - merges results from multiple partitions
 */
export interface MergeOperator extends BaseOperator {
  type: 'merge';

  /** Child operators (one per partition) */
  inputs: PlanOperator[];

  /** Sort-merge key (if ordered) */
  mergeKey?: string[];
}

/**
 * Partition information
 */
export interface PartitionInfo {
  /** Partition file path */
  path: string;

  /** Partition values */
  partitionValues: Record<string, unknown>;

  /** File size in bytes */
  sizeBytes: number;

  /** Row count */
  rowCount: number;

  /** Zone map statistics */
  zoneMap: ZoneMap;

  /** Optional bloom filter */
  bloomFilter?: BloomFilterInfo;

  /** Whether partition is cached */
  isCached: boolean;

  /** Cache key if cached */
  cacheKey?: string;
}

/**
 * Zone map (min/max statistics per column)
 */
export interface ZoneMap {
  /** Column statistics */
  columns: Record<string, ZoneMapColumn>;
}

/**
 * Zone map column statistics
 */
export interface ZoneMapColumn {
  /** Minimum value */
  min: unknown;

  /** Maximum value */
  max: unknown;

  /** Null count */
  nullCount: number;

  /** Whether all values are null */
  allNull: boolean;

  /** Estimated distinct count */
  distinctCount?: number;
}

/**
 * Bloom filter information
 */
export interface BloomFilterInfo {
  /** Column name */
  column: string;

  /** Filter size in bits */
  sizeBits: number;

  /** Number of hash functions */
  numHashFunctions: number;

  /** Approximate false positive rate */
  falsePositiveRate: number;
}

/**
 * Information about a pruned partition
 */
export interface PrunedPartition {
  /** Partition path */
  path: string;

  /** Reason for pruning */
  reason: PruneReason;

  /** Column that triggered pruning */
  column?: string;

  /** Predicate that triggered pruning */
  predicate?: Predicate;
}

/**
 * Reason for partition pruning
 */
export type PruneReason =
  | 'zone_map_min_max'
  | 'zone_map_null'
  | 'bloom_filter'
  | 'partition_filter';

/**
 * Query cost estimation
 */
export interface QueryCost {
  /** Estimated rows to scan */
  rowsToScan: number;

  /** Estimated bytes to read from R2 */
  bytesToRead: number;

  /** Estimated output rows */
  outputRows: number;

  /** Estimated memory usage */
  memoryBytes: number;

  /** Estimated CPU cost (relative) */
  cpuCost: number;

  /** Estimated I/O cost (relative) */
  ioCost: number;

  /** Total cost (weighted combination) */
  totalCost: number;
}

// =============================================================================
// Query Result Types
// =============================================================================

/**
 * Query result
 */
export interface QueryResult<T = Record<string, unknown>> {
  /** Result rows */
  rows: T[];

  /** Total row count (before LIMIT) */
  totalRowCount: number;

  /** Whether more rows are available */
  hasMore: boolean;

  /** Execution statistics */
  stats: QueryStats;

  /** Continuation token for pagination */
  continuationToken?: string;
}

/**
 * Query execution statistics
 */
export interface QueryStats {
  /** Total execution time in milliseconds */
  executionTimeMs: number;

  /** Planning time in milliseconds */
  planningTimeMs: number;

  /** I/O time in milliseconds */
  ioTimeMs: number;

  /** Partitions scanned */
  partitionsScanned: number;

  /** Partitions pruned */
  partitionsPruned: number;

  /** Rows scanned */
  rowsScanned: number;

  /** Rows matched (after predicates) */
  rowsMatched: number;

  /** Bytes read from R2 */
  bytesRead: number;

  /** Bytes served from cache */
  bytesFromCache: number;

  /** Cache hit ratio */
  cacheHitRatio: number;

  /** Zone map pruning effectiveness */
  zoneMapEffectiveness: number;

  /** Bloom filter checks */
  bloomFilterChecks: number;

  /** Bloom filter true positives */
  bloomFilterHits: number;

  /** Peak memory usage in bytes */
  peakMemoryBytes: number;
}

/**
 * Streaming query result
 */
export interface StreamingQueryResult<T = Record<string, unknown>> {
  /** Async iterator for rows */
  rows: AsyncIterableIterator<T>;

  /** Get execution stats (available after iteration) */
  getStats(): Promise<QueryStats>;

  /** Cancel the query */
  cancel(): Promise<void>;

  /** Whether query is still running */
  isRunning(): boolean;
}

// =============================================================================
// Cache Types
// =============================================================================

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Cache hits */
  hits: number;

  /** Cache misses */
  misses: number;

  /** Bytes served from cache */
  bytesFromCache: number;

  /** Bytes read from R2 */
  bytesFromR2: number;

  /** Cache hit ratio */
  hitRatio: number;
}

/**
 * Cache entry metadata
 */
export interface CacheEntry {
  /** Cache key */
  key: string;

  /** Partition path */
  path: string;

  /** Entry size in bytes */
  sizeBytes: number;

  /** When cached */
  cachedAt: number;

  /** Last accessed */
  lastAccessedAt: number;

  /** Access count */
  accessCount: number;

  /** TTL in seconds */
  ttlSeconds: number;
}

// =============================================================================
// Query Engine Configuration
// =============================================================================

/**
 * Query engine configuration
 */
export interface QueryEngineConfig {
  /** R2 bucket for data storage */
  bucket: R2Bucket;

  /** Optional cache configuration */
  cache?: CacheConfig;

  /** Default query hints */
  defaultHints?: QueryHints;

  /** Maximum concurrent partition reads */
  maxParallelism?: number;

  /** Default timeout in milliseconds */
  defaultTimeoutMs?: number;

  /** Memory limit in bytes */
  memoryLimitBytes?: number;

  /** Enable query statistics collection */
  enableStats?: boolean;

  /** Enable query plan caching */
  enablePlanCache?: boolean;
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  /** Enable caching */
  enabled: boolean;

  /** Cache TTL in seconds */
  ttlSeconds: number;

  /** Maximum cache size in bytes */
  maxSizeBytes: number;

  /** Cache key prefix */
  keyPrefix: string;
}

// =============================================================================
// R2 Types (from Cloudflare Workers)
// =============================================================================

/**
 * R2 Bucket interface (subset needed for query engine)
 */
export interface R2Bucket {
  get(key: string, options?: R2GetOptions): Promise<R2Object | null>;
  head(key: string): Promise<R2Object | null>;
  list(options?: R2ListOptions): Promise<R2Objects>;
}

export interface R2GetOptions {
  range?: R2Range;
}

export interface R2Range {
  offset?: number;
  length?: number;
}

export interface R2Object {
  key: string;
  size: number;
  etag: string;
  httpMetadata?: R2HttpMetadata;
  customMetadata?: Record<string, string>;
  body?: ReadableStream;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface R2HttpMetadata {
  contentType?: string;
  contentEncoding?: string;
}

export interface R2Objects {
  objects: R2Object[];
  truncated: boolean;
  cursor?: string;
}

export interface R2ListOptions {
  prefix?: string;
  cursor?: string;
  limit?: number;
  delimiter?: string;
}
