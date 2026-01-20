/**
 * @evodb/core - QueryExecutor Interface
 *
 * Unified interface for query execution across EvoDB packages.
 * This interface allows both @evodb/reader and @evodb/query to be used
 * interchangeably when only basic query execution is needed.
 */

// =============================================================================
// Query Types
// =============================================================================

/**
 * Unified query specification for the QueryExecutor interface.
 * This is a simplified version that captures the common elements
 * between @evodb/reader's QueryRequest and @evodb/query's Query.
 */
export interface ExecutorQuery {
  /** Table name or path to query */
  table: string;

  /** Columns to project (undefined = all columns) */
  columns?: string[];

  /** Filter predicates */
  predicates?: ExecutorPredicate[];

  /** Group by columns for aggregations */
  groupBy?: string[];

  /** Aggregations to compute */
  aggregations?: ExecutorAggregation[];

  /** Sort specification */
  orderBy?: ExecutorOrderBy[];

  /** Maximum rows to return */
  limit?: number;

  /** Rows to skip */
  offset?: number;

  /** Query timeout in milliseconds */
  timeoutMs?: number;

  /** Additional query hints (implementation-specific) */
  hints?: Record<string, unknown>;
}

/**
 * Predicate for filtering rows
 */
export interface ExecutorPredicate {
  /** Column name/path */
  column: string;

  /** Comparison operator */
  operator:
    | 'eq'
    | 'ne'
    | 'gt'
    | 'gte'
    | 'ge'
    | 'lt'
    | 'lte'
    | 'le'
    | 'in'
    | 'notIn'
    | 'between'
    | 'like'
    | 'isNull'
    | 'isNotNull';

  /** Value to compare against */
  value?: unknown;

  /** Array of values (for in, notIn) */
  values?: unknown[];

  /** Lower bound (for between) */
  lowerBound?: unknown;

  /** Upper bound (for between) */
  upperBound?: unknown;

  /** Negate the predicate */
  not?: boolean;
}

/**
 * Aggregation specification
 */
export interface ExecutorAggregation {
  /** Aggregation function */
  function:
    | 'count'
    | 'countDistinct'
    | 'sum'
    | 'avg'
    | 'min'
    | 'max'
    | 'first'
    | 'last'
    | 'stddev'
    | 'variance';

  /** Column to aggregate (null for COUNT(*)) */
  column?: string | null;

  /** Output alias */
  alias: string;
}

/**
 * Sort specification
 */
export interface ExecutorOrderBy {
  /** Column to sort by */
  column: string;

  /** Sort direction */
  direction: 'asc' | 'desc';

  /** Null handling */
  nulls?: 'first' | 'last';
}

// =============================================================================
// Result Types
// =============================================================================

/**
 * Unified query result from the QueryExecutor
 */
export interface ExecutorResult<T = Record<string, unknown>> {
  /** Result rows */
  rows: T[];

  /** Column names (if available) */
  columns?: string[];

  /** Total row count (before LIMIT, if available) */
  totalRowCount?: number;

  /** Whether more rows are available */
  hasMore?: boolean;

  /** Execution statistics */
  stats: ExecutorStats;
}

/**
 * Query execution statistics
 */
export interface ExecutorStats {
  /** Total execution time in milliseconds */
  executionTimeMs: number;

  /** Rows scanned */
  rowsScanned?: number;

  /** Rows returned */
  rowsReturned?: number;

  /** Bytes read */
  bytesRead?: number;

  /** Cache hit ratio (0-1) */
  cacheHitRatio?: number;

  /** Additional implementation-specific stats */
  [key: string]: unknown;
}

// =============================================================================
// Query Plan Types
// =============================================================================

/**
 * Query execution plan returned by explain()
 */
export interface ExecutorPlan {
  /** Unique plan identifier */
  planId: string;

  /** Original query */
  query: ExecutorQuery;

  /** Estimated cost metrics */
  estimatedCost: ExecutorCost;

  /** Plan creation timestamp */
  createdAt: number;

  /** Human-readable plan description */
  description?: string;

  /** Detailed plan tree (implementation-specific) */
  planTree?: unknown;

  /** Partitions/blocks selected for scanning */
  partitionsSelected?: number;

  /** Partitions/blocks pruned */
  partitionsPruned?: number;

  /** Whether plan uses zone map optimization */
  usesZoneMaps?: boolean;

  /** Whether plan uses bloom filters */
  usesBloomFilters?: boolean;
}

/**
 * Query cost estimation
 */
export interface ExecutorCost {
  /** Estimated rows to scan */
  rowsToScan: number;

  /** Estimated bytes to read */
  bytesToRead: number;

  /** Estimated output rows */
  outputRows: number;

  /** Total cost (relative, for comparison) */
  totalCost: number;
}

// =============================================================================
// QueryExecutor Interface
// =============================================================================

/**
 * Unified QueryExecutor interface for query execution.
 *
 * This interface provides a common API for executing queries across
 * different EvoDB query engine implementations:
 *
 * - @evodb/reader: Worker-based reader with Cache API integration
 * - @evodb/query: Full query engine with zone maps and bloom filters
 *
 * Implementations can extend this interface with additional methods
 * specific to their use case (e.g., streaming, caching controls).
 *
 * @example
 * ```typescript
 * // Using QueryExecutor interface
 * async function runQuery(executor: QueryExecutor) {
 *   const query: ExecutorQuery = {
 *     table: 'users',
 *     predicates: [{ column: 'status', operator: 'eq', value: 'active' }],
 *     columns: ['id', 'name', 'email'],
 *     limit: 100,
 *   };
 *
 *   const result = await executor.execute(query);
 *   console.log(`Found ${result.rows.length} users`);
 *
 *   // Optionally explain the query plan
 *   const plan = await executor.explain(query);
 *   console.log(`Estimated cost: ${plan.estimatedCost.totalCost}`);
 * }
 * ```
 */
export interface QueryExecutor {
  /**
   * Execute a query and return results.
   *
   * @param query - The query specification
   * @returns Promise resolving to query results
   * @throws Error if query execution fails
   */
  execute<T = Record<string, unknown>>(query: ExecutorQuery): Promise<ExecutorResult<T>>;

  /**
   * Explain the execution plan for a query without executing it.
   *
   * This is useful for:
   * - Understanding how the query will be executed
   * - Estimating query cost before execution
   * - Debugging slow queries
   *
   * @param query - The query specification
   * @returns Promise resolving to the query plan
   */
  explain(query: ExecutorQuery): Promise<ExecutorPlan>;
}

// =============================================================================
// Optional Extended Interfaces
// =============================================================================

/**
 * Extended QueryExecutor with streaming support
 */
export interface StreamingQueryExecutor extends QueryExecutor {
  /**
   * Execute a query and stream results.
   *
   * @param query - The query specification
   * @returns Promise resolving to a streaming result
   */
  executeStream<T = Record<string, unknown>>(
    query: ExecutorQuery
  ): Promise<StreamingExecutorResult<T>>;
}

/**
 * Streaming query result with async iteration
 */
export interface StreamingExecutorResult<T = Record<string, unknown>> {
  /** Async iterator for rows */
  rows: AsyncIterableIterator<T>;

  /** Get execution stats (available after iteration completes) */
  getStats(): Promise<ExecutorStats>;

  /** Cancel the query */
  cancel(): Promise<void>;

  /** Check if query is still running */
  isRunning(): boolean;
}

/**
 * Extended QueryExecutor with cache control
 */
export interface CacheableQueryExecutor extends QueryExecutor {
  /**
   * Get cache statistics
   */
  getCacheStats(): ExecutorCacheStats;

  /**
   * Clear the query cache
   */
  clearCache(): Promise<void>;

  /**
   * Invalidate specific cache entries
   */
  invalidateCache(paths: string[]): Promise<void>;
}

/**
 * Cache statistics
 */
export interface ExecutorCacheStats {
  /** Cache hits */
  hits: number;

  /** Cache misses */
  misses: number;

  /** Bytes served from cache */
  bytesFromCache: number;

  /** Bytes read from storage */
  bytesFromStorage: number;

  /** Cache hit ratio (0-1) */
  hitRatio: number;
}

// =============================================================================
// Utility Types
// =============================================================================

/**
 * Type guard to check if an executor supports streaming
 */
export function isStreamingExecutor(
  executor: QueryExecutor
): executor is StreamingQueryExecutor {
  return 'executeStream' in executor && typeof (executor as StreamingQueryExecutor).executeStream === 'function';
}

/**
 * Type guard to check if an executor supports cache control
 */
export function isCacheableExecutor(
  executor: QueryExecutor
): executor is CacheableQueryExecutor {
  return 'getCacheStats' in executor && typeof (executor as CacheableQueryExecutor).getCacheStats === 'function';
}

// =============================================================================
// Conversion Utilities
// =============================================================================

/**
 * Convert a simplified ExecutorQuery to @evodb/reader's QueryRequest format.
 * This is a convenience function for adapting queries between interfaces.
 */
export function toReaderQueryRequest(query: ExecutorQuery): {
  table: string;
  columns?: string[];
  filters?: Array<{
    column: string;
    operator: string;
    value?: unknown;
    values?: unknown[];
    lowerBound?: unknown;
    upperBound?: unknown;
  }>;
  groupBy?: string[];
  aggregates?: Array<{
    function: string;
    column?: string;
    alias: string;
  }>;
  orderBy?: Array<{
    column: string;
    direction: 'asc' | 'desc';
    nullsFirst?: boolean;
  }>;
  limit?: number;
  offset?: number;
  timeoutMs?: number;
} {
  return {
    table: query.table,
    columns: query.columns,
    filters: query.predicates?.map(p => ({
      column: p.column,
      operator: p.operator,
      value: p.value,
      values: p.values,
      lowerBound: p.lowerBound,
      upperBound: p.upperBound,
    })),
    groupBy: query.groupBy,
    aggregates: query.aggregations?.map(a => ({
      function: a.function,
      column: a.column ?? undefined,
      alias: a.alias,
    })),
    orderBy: query.orderBy?.map(o => ({
      column: o.column,
      direction: o.direction,
      nullsFirst: o.nulls === 'first',
    })),
    limit: query.limit,
    offset: query.offset,
    timeoutMs: query.timeoutMs,
  };
}

/**
 * Convert a simplified ExecutorQuery to @evodb/query's Query format.
 * This is a convenience function for adapting queries between interfaces.
 */
export function toQueryEngineQuery(query: ExecutorQuery): {
  table: string;
  projection?: { columns: string[] };
  predicates?: Array<{
    column: string;
    operator: string;
    value?: unknown;
    not?: boolean;
  }>;
  groupBy?: string[];
  aggregations?: Array<{
    function: string;
    column: string | null;
    alias: string;
  }>;
  orderBy?: Array<{
    column: string;
    direction: 'asc' | 'desc';
    nulls?: 'first' | 'last';
  }>;
  limit?: number;
  offset?: number;
  hints?: {
    timeoutMs?: number;
    [key: string]: unknown;
  };
} {
  return {
    table: query.table,
    projection: query.columns ? { columns: query.columns } : undefined,
    predicates: query.predicates?.map(p => ({
      column: p.column,
      operator: p.operator,
      value: p.value ?? (p.values ? p.values : (p.lowerBound !== undefined ? [p.lowerBound, p.upperBound] : undefined)),
      not: p.not,
    })),
    groupBy: query.groupBy,
    aggregations: query.aggregations?.map(a => ({
      function: a.function,
      column: a.column ?? null,
      alias: a.alias,
    })),
    orderBy: query.orderBy,
    limit: query.limit,
    offset: query.offset,
    hints: query.timeoutMs || query.hints ? {
      timeoutMs: query.timeoutMs,
      ...query.hints,
    } : undefined,
  };
}
