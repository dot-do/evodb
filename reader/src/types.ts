/**
 * @evodb/reader - Type definitions
 * Worker-based query engine for R2 + Cache API
 */

// ============================================================================
// Cache Types
// ============================================================================

/**
 * Cache tier configuration
 */
export interface CacheTierConfig {
  /** Enable Cache API tier (FREE) */
  enableCacheApi: boolean;
  /** Cache TTL in seconds (default: 3600) */
  cacheTtlSeconds: number;
  /** Maximum cached item size in bytes */
  maxCachedItemSize: number;
  /** Cache key prefix */
  cacheKeyPrefix: string;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  hits: number;
  misses: number;
  bytesServedFromCache: number;
  bytesReadFromR2: number;
}

// ============================================================================
// Query Types
// ============================================================================

/**
 * Supported filter operators
 */
export type FilterOperator =
  | 'eq'
  | 'ne'
  | 'lt'
  | 'le'
  | 'gt'
  | 'ge'
  | 'in'
  | 'notIn'
  | 'isNull'
  | 'isNotNull'
  | 'like'
  | 'between';

/**
 * Filter predicate
 */
export interface FilterPredicate {
  column: string;
  operator: FilterOperator;
  value?: unknown;
  values?: unknown[];
  lowerBound?: unknown;
  upperBound?: unknown;
}

/**
 * Sort direction
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Sort specification
 */
export interface SortSpec {
  column: string;
  direction: SortDirection;
  nullsFirst?: boolean;
}

/**
 * Aggregation function
 */
export type AggregateFunction =
  | 'count'
  | 'sum'
  | 'avg'
  | 'min'
  | 'max'
  | 'countDistinct';

/**
 * Aggregation specification
 */
export interface AggregateSpec {
  function: AggregateFunction;
  column?: string; // undefined for count(*)
  alias: string;
}

/**
 * Query request
 */
export interface QueryRequest {
  /** Table name to query */
  table: string;
  /** Columns to select (undefined = all) */
  columns?: string[];
  /** Filter predicates (AND) */
  filters?: FilterPredicate[];
  /** Group by columns */
  groupBy?: string[];
  /** Aggregations */
  aggregates?: AggregateSpec[];
  /** Sort specifications */
  orderBy?: SortSpec[];
  /** Maximum rows to return */
  limit?: number;
  /** Rows to skip */
  offset?: number;
  /** Query timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Query result (reader-specific format).
 *
 * Note: For cross-package compatibility, use `ExecutorResult` from `@evodb/core`
 * which provides a unified interface. This type is internal to `@evodb/reader`.
 */
export interface ReaderQueryResult {
  /** Column names in order */
  columns: string[];
  /** Rows as arrays of values */
  rows: unknown[][];
  /** Total rows matched (before limit) */
  totalRows?: number;
  /** Execution statistics */
  stats: ReaderQueryStats;
}

/**
 * @deprecated Use `ReaderQueryResult` instead. Kept for backward compatibility.
 */
export type QueryResult = ReaderQueryResult;

/**
 * Query execution statistics (reader-specific format).
 *
 * Note: For cross-package compatibility, use `ExecutorStats` from `@evodb/core`
 * which provides a unified interface. This type is internal to `@evodb/reader`.
 */
export interface ReaderQueryStats {
  /** Total execution time in milliseconds */
  executionTimeMs: number;
  /** Blocks scanned */
  blocksScanned: number;
  /** Blocks skipped via pruning */
  blocksSkipped: number;
  /** Rows scanned */
  rowsScanned: number;
  /** Rows returned */
  rowsReturned: number;
  /** Bytes read from R2 */
  bytesFromR2: number;
  /** Bytes served from cache */
  bytesFromCache: number;
  /** Cache hit ratio */
  cacheHitRatio: number;
}

/**
 * @deprecated Use `ReaderQueryStats` instead. Kept for backward compatibility.
 */
export type QueryStats = ReaderQueryStats;

// ============================================================================
// Scan Types
// ============================================================================

/**
 * Block scan request
 */
export interface BlockScanRequest {
  /** Block path in R2 */
  blockPath: string;
  /** Columns to read */
  columns: string[];
  /** Row range to read */
  rowRange?: { start: number; end: number };
  /** Filter predicates for pushdown */
  filters?: FilterPredicate[];
}

/**
 * Block scan result
 */
export interface BlockScanResult {
  /** Columnar data: column name -> values */
  data: Map<string, unknown[]>;
  /** Number of rows in result */
  rowCount: number;
  /** Bytes read */
  bytesRead: number;
  /** Whether data came from cache */
  fromCache: boolean;
}

// ============================================================================
// Manifest Types (subset for reader)
// ============================================================================

/**
 * Table metadata for reading
 */
export interface TableMetadata {
  name: string;
  schema: ColumnSchema[];
  blockPaths: string[];
  rowCount: number;
  lastUpdated: number;
}

/**
 * Column schema
 */
export interface ColumnSchema {
  name: string;
  type: ColumnType;
  nullable: boolean;
  metadata?: Record<string, string>;
}

/**
 * Column types
 */
export type ColumnType =
  | 'null'
  | 'boolean'
  | 'int32'
  | 'int64'
  | 'float64'
  | 'string'
  | 'binary'
  | 'timestamp'
  | 'date'
  | 'list'
  | 'object';

// ============================================================================
// R2 Types (inline to avoid dependency)
// ============================================================================

/**
 * R2 bucket interface (subset)
 */
export interface R2Bucket {
  get(key: string): Promise<R2Object | null>;
  head(key: string): Promise<R2Object | null>;
  list(options?: R2ListOptions): Promise<R2Objects>;
}

/**
 * R2 object interface (subset)
 */
export interface R2Object {
  readonly key: string;
  readonly size: number;
  readonly etag: string;
  readonly httpEtag: string;
  readonly uploaded: Date;
  readonly customMetadata?: Record<string, string>;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
}

/**
 * R2 list options (subset)
 */
export interface R2ListOptions {
  prefix?: string;
  limit?: number;
  cursor?: string;
}

/**
 * R2 objects list result
 */
export interface R2Objects {
  objects: R2Object[];
  truncated: boolean;
  cursor?: string;
}

// ============================================================================
// Reader Configuration
// ============================================================================

/**
 * Reader configuration
 */
export interface ReaderConfig {
  /** R2 bucket binding */
  bucket: R2Bucket;
  /** Cache configuration */
  cache?: Partial<CacheTierConfig>;
  /** Maximum concurrent block reads */
  maxConcurrentReads?: number;
  /** Enable query plan caching */
  enablePlanCache?: boolean;
}

/**
 * Reader environment bindings
 */
export interface ReaderEnv {
  R2_BUCKET: R2Bucket;
  CACHE_PREFIX?: string;
  CACHE_TTL_SECONDS?: string;
}

// ============================================================================
// Exhaustiveness Check Helper
// ============================================================================

/**
 * Assert that a value is of type `never` at compile time.
 * Used in switch statements to ensure all cases of a union type are handled.
 *
 * @example
 * ```typescript
 * switch (filter.operator) {
 *   case 'eq': return handleEq();
 *   case 'ne': return handleNe();
 *   // ... all other cases ...
 *   default:
 *     return assertNever(filter.operator, `Unhandled operator: ${filter.operator}`);
 * }
 * ```
 *
 * If a new case is added to the union type, TypeScript will error at compile time
 * because the value won't be assignable to `never`.
 */
export function assertNever(value: never, message?: string): never {
  throw new Error(message ?? `Unexpected value: ${JSON.stringify(value)}`);
}
