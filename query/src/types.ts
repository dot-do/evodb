/**
 * @evodb/query - Type Definitions
 *
 * Types for the EvoDB Query Engine that reads columnar data from R2.
 *
 * @packageDocumentation
 * @module @evodb/query
 */

// =============================================================================
// Core Query Types
// =============================================================================

/**
 * Query definition for scanning R2-stored columnar data.
 *
 * Represents a declarative query specification that the query engine
 * translates into an optimized execution plan. Supports filtering,
 * projection, aggregation, grouping, sorting, and time-travel queries.
 *
 * @example
 * ```typescript
 * // Simple query with filtering and projection
 * const query: Query = {
 *   table: 'events/2024',
 *   projection: { columns: ['user_id', 'event_type', 'timestamp'] },
 *   predicates: [
 *     { column: 'event_type', operator: 'eq', value: 'purchase' },
 *     { column: 'timestamp', operator: 'gte', value: Date.now() - 86400000 }
 *   ],
 *   orderBy: [{ column: 'timestamp', direction: 'desc' }],
 *   limit: 100
 * };
 *
 * // Aggregation query with grouping
 * const aggregateQuery: Query = {
 *   table: 'sales',
 *   aggregations: [
 *     { function: 'sum', column: 'amount', alias: 'total_sales' },
 *     { function: 'count', column: null, alias: 'order_count' }
 *   ],
 *   groupBy: ['region', 'product_category'],
 *   predicates: [
 *     { column: 'sale_date', operator: 'between', value: ['2024-01-01', '2024-12-31'] }
 *   ]
 * };
 *
 * // Time-travel query
 * const historicalQuery: Query = {
 *   table: 'inventory',
 *   snapshotId: 'snap-abc123',
 *   projection: { columns: ['sku', 'quantity'] }
 * };
 * ```
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
 * Column projection specification.
 *
 * Defines which columns to include in query results. Supports nested column
 * paths using dot notation (e.g., 'user.address.city'). Projection pushdown
 * to the storage layer reduces I/O by only reading required columns.
 *
 * @example
 * ```typescript
 * // Select specific columns
 * const projection: Projection = {
 *   columns: ['id', 'name', 'email'],
 *   includeMetadata: false
 * };
 *
 * // Include nested columns and metadata
 * const nestedProjection: Projection = {
 *   columns: ['user.name', 'user.address.city', 'order.total'],
 *   includeMetadata: true
 * };
 * ```
 */
export interface Projection {
  /** Column names/paths to include */
  columns: string[];

  /** Whether to include row metadata (_id, _version, etc.) */
  includeMetadata?: boolean;
}

/**
 * Predicate for filtering rows.
 *
 * Represents a single filter condition that can be applied to rows during
 * query execution. Predicates are pushed down to the storage layer when
 * possible, and zone maps / bloom filters are used to prune partitions
 * that cannot match the predicate.
 *
 * @example
 * ```typescript
 * // Equality predicate
 * const eqPredicate: Predicate = {
 *   column: 'status',
 *   operator: 'eq',
 *   value: 'active'
 * };
 *
 * // Range predicate
 * const rangePredicate: Predicate = {
 *   column: 'price',
 *   operator: 'between',
 *   value: [100, 500]
 * };
 *
 * // IN predicate
 * const inPredicate: Predicate = {
 *   column: 'region',
 *   operator: 'in',
 *   value: ['US', 'EU', 'APAC']
 * };
 *
 * // NULL check
 * const nullPredicate: Predicate = {
 *   column: 'deleted_at',
 *   operator: 'isNull',
 *   value: null
 * };
 * ```
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
 * Supported predicate operators.
 *
 * Maps to SQL-style comparison operations. Zone map optimization
 * works best with 'eq', 'gt', 'gte', 'lt', 'lte', and 'between'.
 * Bloom filter optimization applies to 'eq' and 'in' operators.
 *
 * | Operator   | SQL Equivalent     | Zone Map | Bloom Filter |
 * |------------|-------------------|----------|--------------|
 * | eq         | =                 | Yes      | Yes          |
 * | ne         | !=                | Partial  | No           |
 * | gt         | >                 | Yes      | No           |
 * | gte        | >=                | Yes      | No           |
 * | lt         | <                 | Yes      | No           |
 * | lte        | <=                | Yes      | No           |
 * | in         | IN (...)          | Yes      | Yes          |
 * | notIn      | NOT IN (...)      | Partial  | No           |
 * | between    | BETWEEN ... AND   | Yes      | No           |
 * | like       | LIKE pattern      | Partial  | No           |
 * | isNull     | IS NULL           | Yes      | No           |
 * | isNotNull  | IS NOT NULL       | Yes      | No           |
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
 * Value types for predicates.
 *
 * The type of value depends on the predicate operator being used:
 * - Scalar types (string, number, boolean, null, Date, bigint): Used with
 *   comparison operators (eq, ne, gt, gte, lt, lte, like)
 * - Array types (string[], number[]): Used with set operators (in, notIn)
 * - Tuple type ([unknown, unknown]): Used with range operator (between)
 *
 * @example
 * ```typescript
 * // Scalar value for equality
 * const scalarValue: PredicateValue = 'active';
 *
 * // Array value for IN operator
 * const arrayValue: PredicateValue = ['pending', 'processing', 'shipped'];
 *
 * // Tuple value for BETWEEN operator (inclusive range)
 * const rangeValue: PredicateValue = [100, 500];
 *
 * // Date value for timestamp comparison
 * const dateValue: PredicateValue = new Date('2024-01-01');
 * ```
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
 * Aggregation function specification.
 *
 * Defines an aggregation operation to compute over grouped or ungrouped data.
 * Supports all standard SQL aggregation functions with DISTINCT and
 * conditional (filtered) aggregation modifiers.
 *
 * @example
 * ```typescript
 * // Simple COUNT(*)
 * const countAll: Aggregation = {
 *   function: 'count',
 *   column: null,
 *   alias: 'total_count'
 * };
 *
 * // SUM with column
 * const sumAmount: Aggregation = {
 *   function: 'sum',
 *   column: 'amount',
 *   alias: 'total_amount'
 * };
 *
 * // COUNT DISTINCT
 * const uniqueUsers: Aggregation = {
 *   function: 'count',
 *   column: 'user_id',
 *   alias: 'unique_users',
 *   distinct: true
 * };
 *
 * // Conditional aggregation (like SQL FILTER clause)
 * const activeSum: Aggregation = {
 *   function: 'sum',
 *   column: 'revenue',
 *   alias: 'active_revenue',
 *   filter: { column: 'status', operator: 'eq', value: 'active' }
 * };
 * ```
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
 * Supported aggregation functions.
 *
 * Standard SQL aggregation functions for computing summary statistics
 * over groups of rows. All numeric functions handle NULL values according
 * to SQL semantics (NULLs are ignored).
 *
 * | Function       | Description                                    | NULL Handling    |
 * |----------------|------------------------------------------------|------------------|
 * | count          | Count rows (or non-null values if column set)  | Counts non-nulls |
 * | sum            | Sum of values                                  | Ignores nulls    |
 * | avg            | Arithmetic mean                                | Ignores nulls    |
 * | min            | Minimum value                                  | Ignores nulls    |
 * | max            | Maximum value                                  | Ignores nulls    |
 * | countDistinct  | Count unique values                            | Ignores nulls    |
 * | sumDistinct    | Sum of unique values                           | Ignores nulls    |
 * | avgDistinct    | Average of unique values                       | Ignores nulls    |
 * | first          | First value in group (order-dependent)         | May return null  |
 * | last           | Last value in group (order-dependent)          | May return null  |
 * | stddev         | Sample standard deviation                      | Ignores nulls    |
 * | variance       | Sample variance                                | Ignores nulls    |
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
 * ORDER BY specification.
 *
 * Defines sorting order for query results. Multiple OrderBy specifications
 * can be combined for multi-column sorting (first column is primary sort key).
 * Sort operations are performed after filtering and aggregation.
 *
 * @example
 * ```typescript
 * // Simple descending sort
 * const byTimestamp: OrderBy = {
 *   column: 'created_at',
 *   direction: 'desc'
 * };
 *
 * // Ascending with nulls last
 * const byName: OrderBy = {
 *   column: 'name',
 *   direction: 'asc',
 *   nulls: 'last'
 * };
 *
 * // Multi-column sort (array of OrderBy)
 * const multiSort: OrderBy[] = [
 *   { column: 'priority', direction: 'desc' },
 *   { column: 'created_at', direction: 'asc', nulls: 'first' }
 * ];
 * ```
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
 * Query execution hints.
 *
 * Optional directives that influence query execution behavior without
 * changing query semantics. Use hints to tune performance, enforce
 * resource limits, or disable optimizations for debugging/benchmarking.
 *
 * @example
 * ```typescript
 * // Performance-tuned hints
 * const performanceHints: QueryHints = {
 *   preferCache: true,
 *   maxParallelism: 8,
 *   timeoutMs: 30000
 * };
 *
 * // Benchmarking hints (disable all optimizations)
 * const benchmarkHints: QueryHints = {
 *   forceScan: true,
 *   skipZoneMapPruning: true,
 *   skipBloomFilters: true,
 *   preferCache: false
 * };
 *
 * // Resource-constrained hints
 * const constrainedHints: QueryHints = {
 *   maxParallelism: 2,
 *   memoryLimitBytes: 64 * 1024 * 1024, // 64MB
 *   timeoutMs: 5000
 * };
 * ```
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
 * Query execution plan.
 *
 * Represents the optimized execution strategy for a query. The plan is
 * generated by the query planner and contains a tree of operators that
 * define how data flows through the system. Plans include cost estimates,
 * partition selection results, and optimization metadata.
 *
 * @example
 * ```typescript
 * // Analyze a query plan
 * const plan = await engine.plan(query);
 *
 * console.log(`Plan ID: ${plan.planId}`);
 * console.log(`Estimated rows to scan: ${plan.estimatedCost.rowsToScan}`);
 * console.log(`Partitions selected: ${plan.selectedPartitions.length}`);
 * console.log(`Partitions pruned: ${plan.prunedPartitions.length}`);
 * console.log(`Uses zone maps: ${plan.usesZoneMaps}`);
 *
 * // Calculate pruning effectiveness
 * const totalPartitions = plan.selectedPartitions.length + plan.prunedPartitions.length;
 * const pruneRate = plan.prunedPartitions.length / totalPartitions;
 * console.log(`Partition prune rate: ${(pruneRate * 100).toFixed(1)}%`);
 * ```
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
 * Plan operator types (execution tree nodes).
 *
 * Represents all possible operator types in a query execution plan.
 * The plan forms a tree structure where operators pull data from their
 * child operators (volcano-style iterator model).
 *
 * @example
 * ```typescript
 * // Type guard for operator types
 * function isScanOperator(op: PlanOperator): op is ScanOperator {
 *   return op.type === 'scan';
 * }
 *
 * // Recursive plan traversal
 * function countScans(op: PlanOperator): number {
 *   if (op.type === 'scan') return 1;
 *   if (op.type === 'merge') return op.inputs.reduce((sum, i) => sum + countScans(i), 0);
 *   if ('input' in op) return countScans(op.input);
 *   return 0;
 * }
 * ```
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
 * Base operator properties shared by all plan operators.
 * Contains cost estimation metadata used by the query optimizer.
 */
interface BaseOperator {
  /** Estimated output row count */
  estimatedRows: number;

  /** Estimated cost */
  estimatedCost: number;
}

/**
 * Scan operator - reads data from R2 partitions.
 *
 * The leaf operator in the execution tree that performs actual I/O.
 * Reads columnar data from R2 storage with optional column projection
 * pushed down to minimize data transfer.
 */
export interface ScanOperator extends BaseOperator {
  type: 'scan';

  /** Partitions to scan */
  partitions: PartitionInfo[];

  /** Column projection at scan level */
  columns: string[];
}

/**
 * Filter operator - applies predicates to filter rows.
 *
 * Evaluates predicates against each input row and only passes
 * through rows that match all predicates (AND semantics).
 */
export interface FilterOperator extends BaseOperator {
  type: 'filter';

  /** Child operator */
  input: PlanOperator;

  /** Predicates to apply */
  predicates: Predicate[];
}

/**
 * Project operator - column projection and selection.
 *
 * Selects a subset of columns from input rows, potentially
 * reducing memory usage for downstream operators.
 */
export interface ProjectOperator extends BaseOperator {
  type: 'project';

  /** Child operator */
  input: PlanOperator;

  /** Columns to output */
  columns: string[];
}

/**
 * Aggregate operator - computes aggregations over groups.
 *
 * Groups input rows by the specified columns and computes
 * aggregation functions over each group.
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
 * Sort operator - sorts results by specified columns.
 *
 * Performs an in-memory sort of all input rows. For large datasets,
 * this may be a memory-intensive operation.
 */
export interface SortOperator extends BaseOperator {
  type: 'sort';

  /** Child operator */
  input: PlanOperator;

  /** Sort specification */
  orderBy: OrderBy[];
}

/**
 * Limit operator - limits and offsets result rows.
 *
 * Returns at most `limit` rows after skipping `offset` rows.
 * Used for pagination and top-N queries.
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
 * Merge operator - merges results from multiple child operators.
 *
 * Used to combine results from parallel partition scans.
 * Optionally performs a sort-merge if results need to maintain order.
 */
export interface MergeOperator extends BaseOperator {
  type: 'merge';

  /** Child operators (one per partition) */
  inputs: PlanOperator[];

  /** Sort-merge key (if ordered) */
  mergeKey?: string[];
}

/**
 * Partition information for query planning and execution.
 *
 * Contains metadata about a data partition including location,
 * statistics for pruning, and caching status.
 *
 * @example
 * ```typescript
 * const partition: PartitionInfo = {
 *   path: 'data/events/year=2024/month=01/part-00001.parquet',
 *   partitionValues: { year: 2024, month: 1 },
 *   sizeBytes: 52428800,
 *   rowCount: 100000,
 *   zoneMap: {
 *     columns: {
 *       timestamp: { min: 1704067200000, max: 1706745600000, nullCount: 0, allNull: false }
 *     }
 *   },
 *   isCached: true,
 *   cacheKey: 'events-2024-01-00001'
 * };
 * ```
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
 * Zone map (min/max statistics per column).
 *
 * Zone maps enable partition pruning by tracking the min/max values
 * for each column within a partition. If a predicate's value falls
 * outside the min/max range, the partition can be skipped entirely.
 *
 * @example
 * ```typescript
 * const zoneMap: ZoneMap = {
 *   columns: {
 *     timestamp: { min: 1704067200000, max: 1706745600000, nullCount: 0, allNull: false },
 *     category: { min: 'A', max: 'Z', nullCount: 100, allNull: false }
 *   }
 * };
 * ```
 */
export interface ZoneMap {
  /** Column statistics */
  columns: Record<string, ZoneMapColumn>;
}

/**
 * Zone map column statistics.
 *
 * Per-column statistics used for predicate evaluation during
 * partition pruning. These statistics are collected during
 * data ingestion and stored in partition metadata.
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
 * Bloom filter information for a column.
 *
 * Bloom filters provide probabilistic membership testing for equality
 * predicates. A negative test definitively proves a value is not present;
 * a positive test may have false positives at the configured rate.
 *
 * @example
 * ```typescript
 * const bloomFilter: BloomFilterInfo = {
 *   column: 'user_id',
 *   sizeBits: 1048576,
 *   numHashFunctions: 7,
 *   falsePositiveRate: 0.01
 * };
 * ```
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
 * Information about a pruned partition.
 *
 * Records why a partition was excluded from the query plan,
 * useful for debugging and analyzing query optimization.
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
 * Reason for partition pruning.
 *
 * | Reason             | Description                                      |
 * |--------------------|--------------------------------------------------|
 * | zone_map_min_max   | Value outside column's min/max range             |
 * | zone_map_null      | Predicate requires non-null but column all null  |
 * | bloom_filter       | Bloom filter indicates value not present         |
 * | partition_filter   | Partition column value doesn't match predicate   |
 */
export type PruneReason =
  | 'zone_map_min_max'
  | 'zone_map_null'
  | 'bloom_filter'
  | 'partition_filter';

/**
 * Query cost estimation.
 *
 * Contains estimated metrics for a query plan used by the optimizer
 * to choose between alternative execution strategies and for capacity
 * planning.
 *
 * @example
 * ```typescript
 * const cost: QueryCost = {
 *   rowsToScan: 1000000,
 *   bytesToRead: 104857600,
 *   outputRows: 5000,
 *   memoryBytes: 52428800,
 *   cpuCost: 1000,
 *   ioCost: 500,
 *   totalCost: 1500
 * };
 * ```
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
 * Query result container.
 *
 * Contains the result rows from query execution along with metadata
 * about the total result set and execution statistics.
 *
 * @typeParam T - Row type, defaults to Record<string, unknown>
 *
 * @example
 * ```typescript
 * interface SalesRow {
 *   region: string;
 *   total_sales: number;
 *   order_count: number;
 * }
 *
 * const result: QueryResult<SalesRow> = await engine.execute(query);
 *
 * console.log(`Returned ${result.rows.length} of ${result.totalRowCount} rows`);
 * console.log(`Execution time: ${result.stats.executionTimeMs}ms`);
 *
 * for (const row of result.rows) {
 *   console.log(`${row.region}: $${row.total_sales} (${row.order_count} orders)`);
 * }
 *
 * // Pagination
 * if (result.hasMore && result.continuationToken) {
 *   const nextPage = await engine.execute(query, {
 *     continuationToken: result.continuationToken
 *   });
 * }
 * ```
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
 * Query execution statistics.
 *
 * Detailed metrics about query execution for monitoring,
 * debugging, and performance optimization.
 *
 * @example
 * ```typescript
 * const stats: QueryStats = result.stats;
 *
 * // Execution timing
 * console.log(`Total: ${stats.executionTimeMs}ms`);
 * console.log(`Planning: ${stats.planningTimeMs}ms`);
 * console.log(`I/O: ${stats.ioTimeMs}ms`);
 *
 * // Data processed
 * console.log(`Scanned: ${stats.rowsScanned} rows, ${stats.bytesRead} bytes`);
 * console.log(`Matched: ${stats.rowsMatched} rows`);
 *
 * // Optimization effectiveness
 * console.log(`Partitions: ${stats.partitionsScanned} scanned, ${stats.partitionsPruned} pruned`);
 * console.log(`Zone map effectiveness: ${(stats.zoneMapEffectiveness * 100).toFixed(1)}%`);
 * console.log(`Cache hit ratio: ${(stats.cacheHitRatio * 100).toFixed(1)}%`);
 * ```
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
 * Streaming query result for large result sets.
 *
 * Provides an async iterator interface for processing results
 * incrementally without loading all rows into memory.
 *
 * @typeParam T - Row type, defaults to Record<string, unknown>
 *
 * @example
 * ```typescript
 * const stream: StreamingQueryResult<EventRow> = await engine.stream(query);
 *
 * try {
 *   for await (const row of stream.rows) {
 *     await processEvent(row);
 *
 *     // Check if we should abort
 *     if (shouldStop) {
 *       await stream.cancel();
 *       break;
 *     }
 *   }
 * } finally {
 *   // Stats available after iteration completes
 *   const stats = await stream.getStats();
 *   console.log(`Processed ${stats.rowsMatched} rows`);
 * }
 * ```
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
 * Cache statistics for monitoring cache performance.
 *
 * @example
 * ```typescript
 * const cacheStats: CacheStats = await engine.getCacheStats();
 *
 * console.log(`Hits: ${cacheStats.hits}, Misses: ${cacheStats.misses}`);
 * console.log(`Hit ratio: ${(cacheStats.hitRatio * 100).toFixed(1)}%`);
 * ```
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
 * Cache entry metadata.
 *
 * Represents a single cached partition with access tracking
 * for LRU eviction decisions.
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
 * Query engine configuration.
 *
 * Configures the query engine instance with storage, caching,
 * and execution parameters.
 *
 * @example
 * ```typescript
 * const config: QueryEngineConfig = {
 *   bucket: env.DATA_BUCKET,
 *   cache: {
 *     enabled: true,
 *     ttlSeconds: 3600,
 *     maxSizeBytes: 256 * 1024 * 1024, // 256MB
 *     keyPrefix: 'query-cache'
 *   },
 *   defaultHints: {
 *     preferCache: true,
 *     maxParallelism: 4,
 *     timeoutMs: 30000
 *   },
 *   maxParallelism: 8,
 *   defaultTimeoutMs: 60000,
 *   memoryLimitBytes: 512 * 1024 * 1024, // 512MB
 *   enableStats: true,
 *   enablePlanCache: true
 * };
 *
 * const engine = new QueryEngine(config);
 * ```
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

  /**
   * Optional data source for reading table data.
   * If not provided, the engine will use a default R2-based source.
   *
   * For testing, use MockDataSource which provides in-memory test data.
   * For production, use R2DataSource or integrate with @evodb/reader.
   */
  dataSource?: TableDataSource;
}

/**
 * Cache configuration.
 *
 * Controls how partition data is cached to reduce R2 reads
 * for frequently accessed data.
 *
 * @example
 * ```typescript
 * const cacheConfig: CacheConfig = {
 *   enabled: true,
 *   ttlSeconds: 3600,          // 1 hour
 *   maxSizeBytes: 268435456,   // 256MB
 *   keyPrefix: 'evodb-cache'
 * };
 * ```
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
// Data Source Interface
// =============================================================================

/**
 * Data source interface for providing table data to the query engine.
 *
 * This abstraction allows the query engine to work with different data backends:
 * - R2DataSource: Reads from R2 bucket via manifest (production)
 * - MockDataSource: Provides in-memory test data (testing)
 * - Custom implementations for other backends
 *
 * @example
 * ```typescript
 * const customSource: TableDataSource = {
 *   async getTableMetadata(tableName) {
 *     const metadata = await fetchMetadataFromCatalog(tableName);
 *     return {
 *       tableName,
 *       partitions: metadata.partitions,
 *       schema: metadata.schema,
 *       rowCount: metadata.rowCount
 *     };
 *   },
 *
 *   async readPartition(partition, columns) {
 *     const data = await fetchPartitionData(partition.path);
 *     return columns ? projectColumns(data, columns) : data;
 *   },
 *
 *   async *streamPartition(partition, columns) {
 *     for await (const batch of fetchPartitionStream(partition.path)) {
 *       for (const row of batch) {
 *         yield columns ? projectRow(row, columns) : row;
 *       }
 *     }
 *   }
 * };
 * ```
 */
export interface TableDataSource {
  /** Get table metadata including partitions and schema */
  getTableMetadata(tableName: string): Promise<TableDataSourceMetadata | null>;

  /** Read all rows from a partition */
  readPartition(partition: PartitionInfo, columns?: string[]): Promise<Record<string, unknown>[]>;

  /** Stream rows from a partition (for large partitions) */
  streamPartition(partition: PartitionInfo, columns?: string[]): AsyncIterableIterator<Record<string, unknown>>;
}

/**
 * Table metadata returned by a data source.
 *
 * Contains schema information and partition list needed for query planning.
 *
 * @example
 * ```typescript
 * const metadata: TableDataSourceMetadata = {
 *   tableName: 'events',
 *   partitions: [partition1, partition2, partition3],
 *   schema: {
 *     id: 'string',
 *     timestamp: 'timestamp',
 *     user_id: 'int64',
 *     event_type: 'string',
 *     payload: 'json'
 *   },
 *   rowCount: 5000000
 * };
 * ```
 */
export interface TableDataSourceMetadata {
  /** Table name/path */
  tableName: string;

  /** Available partitions with zone maps */
  partitions: PartitionInfo[];

  /** Column schema (column name -> type) */
  schema: Record<string, string>;

  /** Total row count across all partitions (if known) */
  rowCount?: number;
}

/**
 * Factory function type for creating data sources.
 *
 * Used for dependency injection of data source implementations.
 */
export type DataSourceFactory = (config: QueryEngineConfig) => TableDataSource;

// =============================================================================
// R2 Types (from Cloudflare Workers)
// =============================================================================

/**
 * R2 Bucket interface (subset needed for query engine).
 *
 * Minimal interface for R2 bucket operations required by the query engine.
 * Compatible with Cloudflare Workers R2 API.
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
