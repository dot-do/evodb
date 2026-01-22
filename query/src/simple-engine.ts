/**
 * @evodb/query - Simple Query Engine (Reader Mode)
 *
 * A lightweight query engine for basic filtering, projection, and aggregation.
 * This is the "simple mode" of the unified query package, providing:
 * - R2 + Cache API integration
 * - Manifest-based table discovery
 * - Columnar JSON block reading
 * - Basic filter, sort, and aggregation
 *
 * For advanced features (zone maps, bloom filters, query planning), use the full QueryEngine.
 *
 * @example
 * ```typescript
 * import { SimpleQueryEngine, type SimpleQueryConfig } from '@evodb/query';
 *
 * const engine = new SimpleQueryEngine({
 *   bucket: env.R2_BUCKET,
 *   cache: { enableCacheApi: true },
 * });
 *
 * const result = await engine.query({
 *   table: 'users',
 *   filters: [{ column: 'status', operator: 'eq', value: 'active' }],
 *   columns: ['id', 'name'],
 *   limit: 100,
 * });
 * ```
 */

// Cloudflare Workers Cache API type declarations
// These are available in the Workers runtime but not in Node.js type definitions
interface CacheStorageInterface {
  open(cacheName: string): Promise<CacheInterface>;
}

interface CacheInterface {
  match(request: Request | string): Promise<Response | undefined>;
  put(request: Request | string, response: Response): Promise<void>;
  delete(request: Request | string): Promise<boolean>;
}

declare const caches: CacheStorageInterface;

import type {
  CacheableQueryExecutor,
  ExecutorQuery,
  ExecutorResult,
  ExecutorStats,
  ExecutorPlan,
  ExecutorCost,
  ExecutorCacheStats,
  FilterPredicate as CoreFilterPredicate,
  SortSpec as CoreSortSpec,
  AggregateSpec as CoreAggregateSpec,
} from '@evodb/core';

import {
  evaluateFilter as coreEvaluateFilter,
  sortRows as coreSortRows,
  computeAggregations as coreComputeAggregations,
  DEFAULT_CACHE_TTL_SECONDS,
  CACHE_API_MAX_ITEM_SIZE,
  ErrorCode,
  ValidationError,
  captureStackTrace,
} from '@evodb/core';

// =============================================================================
// Simple Query Types (Reader-style)
// =============================================================================

/**
 * Supported filter operators
 */
export type SimpleFilterOperator =
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
export interface SimpleFilterPredicate {
  column: string;
  operator: SimpleFilterOperator;
  value?: unknown;
  values?: unknown[];
  lowerBound?: unknown;
  upperBound?: unknown;
}

/**
 * Sort direction
 */
export type SimpleSortDirection = 'asc' | 'desc';

/**
 * Sort specification
 */
export interface SimpleSortSpec {
  column: string;
  direction: SimpleSortDirection;
  nullsFirst?: boolean;
}

/**
 * Aggregation function
 */
export type SimpleAggregateFunction =
  | 'count'
  | 'sum'
  | 'avg'
  | 'min'
  | 'max'
  | 'countDistinct';

/**
 * Aggregation specification
 */
export interface SimpleAggregateSpec {
  function: SimpleAggregateFunction;
  column?: string;
  alias: string;
}

/**
 * Simple query request
 */
export interface SimpleQueryRequest {
  /** Table name to query */
  table: string;
  /** Columns to select (undefined = all) */
  columns?: string[];
  /** Filter predicates (AND) */
  filters?: SimpleFilterPredicate[];
  /** Group by columns */
  groupBy?: string[];
  /** Aggregations */
  aggregates?: SimpleAggregateSpec[];
  /** Sort specifications */
  orderBy?: SimpleSortSpec[];
  /** Maximum rows to return */
  limit?: number;
  /** Rows to skip */
  offset?: number;
  /** Query timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Simple query result
 */
export interface SimpleQueryResult {
  /** Column names in order */
  columns: string[];
  /** Rows as arrays of values */
  rows: unknown[][];
  /** Total rows matched (before limit) */
  totalRows?: number;
  /** Execution statistics */
  stats: SimpleQueryStats;
}

/**
 * Simple query execution statistics
 */
export interface SimpleQueryStats {
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
 * Block scan request
 */
export interface SimpleBlockScanRequest {
  /** Block path in R2 */
  blockPath: string;
  /** Columns to read */
  columns: string[];
  /** Row range to read */
  rowRange?: { start: number; end: number };
  /** Filter predicates for pushdown */
  filters?: SimpleFilterPredicate[];
}

/**
 * Block scan result
 */
export interface SimpleBlockScanResult {
  /** Columnar data: column name -> values */
  data: Map<string, unknown[]>;
  /** Number of rows in result */
  rowCount: number;
  /** Bytes read */
  bytesRead: number;
  /** Whether data came from cache */
  fromCache: boolean;
}

/**
 * Table metadata
 */
export interface SimpleTableMetadata {
  name: string;
  schema: SimpleColumnSchema[];
  blockPaths: string[];
  rowCount: number;
  lastUpdated: number;
}

/**
 * Column schema
 */
export interface SimpleColumnSchema {
  name: string;
  type: SimpleColumnType;
  nullable: boolean;
  metadata?: Record<string, string>;
}

/**
 * Column types
 */
export type SimpleColumnType =
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

// =============================================================================
// R2 Types (re-exported from @evodb/core - Issue evodb-sdgz)
// =============================================================================

// Re-export for consumers
export type {
  SimpleR2Bucket,
  SimpleR2Object,
  SimpleR2ListOptions,
  SimpleR2Objects,
} from '@evodb/core';

// Import for local use (only import what's used)
import type { SimpleR2Bucket } from '@evodb/core';

// =============================================================================
// Cache Types
// =============================================================================

/**
 * Cache tier configuration
 */
export interface SimpleCacheTierConfig {
  /** Enable Cache API tier (FREE) */
  enableCacheApi: boolean;
  /** Cache TTL in seconds (default: 3600) */
  cacheTtlSeconds?: number;
  /** Maximum cached item size in bytes */
  maxCachedItemSize?: number;
  /** Cache key prefix */
  cacheKeyPrefix?: string;
}

/**
 * Cache statistics
 */
export interface SimpleCacheStats {
  hits: number;
  misses: number;
  bytesServedFromCache: number;
  bytesReadFromR2: number;
}

// =============================================================================
// Configuration
// =============================================================================

/**
 * Simple query engine configuration
 */
export interface SimpleQueryConfig {
  /** R2 bucket binding */
  bucket: SimpleR2Bucket;
  /** Cache configuration */
  cache?: Partial<SimpleCacheTierConfig>;
  /** Maximum concurrent block reads */
  maxConcurrentReads?: number;
  /** Enable query plan caching */
  enablePlanCache?: boolean;
  /**
   * Maximum allowed block size in bytes.
   * Blocks exceeding this limit will be rejected to prevent memory exhaustion.
   * Defaults to 128MB (134,217,728 bytes).
   */
  maxBlockSize?: number;
}

// =============================================================================
// Validation
// =============================================================================

/** Default maximum block size in bytes (128MB) */
export const DEFAULT_MAX_BLOCK_SIZE = 128 * 1024 * 1024;

/**
 * Error codes for block size validation failures.
 */
export enum BlockSizeValidationErrorCode {
  BLOCK_TOO_LARGE = 'BLOCK_TOO_LARGE',
  NEGATIVE_SIZE = 'NEGATIVE_SIZE',
  EMPTY_BLOCK = 'EMPTY_BLOCK',
}

/**
 * Error thrown when block size validation fails.
 * Extends ValidationError for consistent error hierarchy.
 */
export class BlockSizeValidationError extends ValidationError {
  public readonly validationCode: BlockSizeValidationErrorCode;
  public readonly blockPath: string;

  constructor(
    message: string,
    blockPath: string,
    validationCode: BlockSizeValidationErrorCode,
    details?: { actualSize?: number; maxSize?: number }
  ) {
    super(
      message,
      ErrorCode.BLOCK_SIZE_VALIDATION,
      { blockPath, validationCode, ...details },
      'Check block size limits and ensure data is not corrupted.'
    );
    this.name = 'BlockSizeValidationError';
    this.validationCode = validationCode;
    this.blockPath = blockPath;
    captureStackTrace(this, BlockSizeValidationError);
  }
}

/**
 * Error codes for block data validation failures
 */
export enum BlockDataValidationErrorCode {
  JSON_PARSE_ERROR = 'JSON_PARSE_ERROR',
  NULL_DATA = 'NULL_DATA',
  PRIMITIVE_DATA = 'PRIMITIVE_DATA',
  ARRAY_DATA = 'ARRAY_DATA',
  COLUMN_NOT_ARRAY = 'COLUMN_NOT_ARRAY',
  COLUMN_LENGTH_MISMATCH = 'COLUMN_LENGTH_MISMATCH',
}

/**
 * Error thrown when block data validation fails.
 * Extends ValidationError for consistent error hierarchy.
 */
export class BlockDataValidationError extends ValidationError {
  public readonly validationCode: BlockDataValidationErrorCode;
  public readonly blockPath: string;

  constructor(
    message: string,
    blockPath: string,
    validationCode: BlockDataValidationErrorCode,
    details?: Record<string, unknown>
  ) {
    super(
      message,
      ErrorCode.BLOCK_DATA_VALIDATION,
      { blockPath, validationCode, ...details },
      'Ensure block data is valid columnar JSON format.'
    );
    this.name = 'BlockDataValidationError';
    this.validationCode = validationCode;
    this.blockPath = blockPath;
    captureStackTrace(this, BlockDataValidationError);
  }
}

/** Columnar block data type */
export type BlockData = Record<string, unknown[]>;

/** Result of successful block data validation */
export interface BlockDataValidationResult {
  valid: true;
  data: BlockData;
  rowCount: number;
}

// Reuse TextDecoder for performance
const sharedDecoder = new TextDecoder();

function formatBytes(bytes: number): string {
  if (bytes < 0) return `${bytes} bytes`;
  if (bytes === 0) return '0 bytes';
  const units = ['bytes', 'KB', 'MB', 'GB', 'TB'];
  const base = 1024;
  let unitIndex = 0;
  let value = bytes;
  while (value >= base && unitIndex < units.length - 1) {
    value /= base;
    unitIndex++;
  }
  if (unitIndex === 0) return `${value} ${units[unitIndex]}`;
  return `${value.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Validates that a block size is within acceptable limits.
 */
export function validateBlockSize(
  size: number,
  blockPath: string,
  options?: { maxBlockSize?: number; rejectEmpty?: boolean }
): void {
  const maxSize = options?.maxBlockSize ?? DEFAULT_MAX_BLOCK_SIZE;
  const rejectEmpty = options?.rejectEmpty ?? false;

  if (size < 0) {
    throw new BlockSizeValidationError(
      `Invalid block size in '${blockPath}': size cannot be negative (${size} bytes)`,
      blockPath,
      BlockSizeValidationErrorCode.NEGATIVE_SIZE,
      { actualSize: size, maxSize }
    );
  }

  if (size === 0 && rejectEmpty) {
    throw new BlockSizeValidationError(
      `Empty block '${blockPath}': block has 0 bytes`,
      blockPath,
      BlockSizeValidationErrorCode.EMPTY_BLOCK,
      { actualSize: 0, maxSize }
    );
  }

  if (size > maxSize) {
    throw new BlockSizeValidationError(
      `Block size exceeds limit in '${blockPath}': ${formatBytes(size)} exceeds maximum of ${formatBytes(maxSize)}`,
      blockPath,
      BlockSizeValidationErrorCode.BLOCK_TOO_LARGE,
      { actualSize: size, maxSize }
    );
  }
}

/**
 * Validates that a value is a valid BlockData structure.
 */
export function validateBlockData(data: unknown, blockPath: string): BlockDataValidationResult {
  if (data === null) {
    throw new BlockDataValidationError(
      `Invalid block data in '${blockPath}': expected object but got null`,
      blockPath,
      BlockDataValidationErrorCode.NULL_DATA,
      { receivedType: 'null' }
    );
  }

  if (typeof data !== 'object') {
    throw new BlockDataValidationError(
      `Invalid block data in '${blockPath}': expected object but got ${typeof data}`,
      blockPath,
      BlockDataValidationErrorCode.PRIMITIVE_DATA,
      { receivedType: typeof data }
    );
  }

  if (Array.isArray(data)) {
    throw new BlockDataValidationError(
      `Invalid block data in '${blockPath}': expected object with column arrays but got array`,
      blockPath,
      BlockDataValidationErrorCode.ARRAY_DATA,
      { receivedType: 'array' }
    );
  }

  const blockData = data as Record<string, unknown>;
  const columns = Object.keys(blockData);

  if (columns.length === 0) {
    return { valid: true, data: blockData as BlockData, rowCount: 0 };
  }

  let expectedRowCount: number | null = null;
  const firstColumnName = columns[0];

  for (const columnName of columns) {
    const columnValue = blockData[columnName];

    if (!Array.isArray(columnValue)) {
      const valueType = columnValue === null ? 'null' : typeof columnValue;
      throw new BlockDataValidationError(
        `Invalid column '${columnName}' in block '${blockPath}': expected array but got ${valueType}`,
        blockPath,
        BlockDataValidationErrorCode.COLUMN_NOT_ARRAY,
        { column: columnName, receivedType: valueType }
      );
    }

    const rowCount = columnValue.length;
    if (expectedRowCount === null) {
      expectedRowCount = rowCount;
    } else if (rowCount !== expectedRowCount) {
      throw new BlockDataValidationError(
        `Column length mismatch in block '${blockPath}': column '${columnName}' has ${rowCount} rows but '${firstColumnName}' has ${expectedRowCount} rows`,
        blockPath,
        BlockDataValidationErrorCode.COLUMN_LENGTH_MISMATCH,
        { column: columnName, expectedLength: expectedRowCount, actualLength: rowCount }
      );
    }
  }

  return {
    valid: true,
    data: blockData as BlockData,
    rowCount: expectedRowCount ?? 0,
  };
}

/**
 * Parses JSON from a buffer and validates as BlockData in a single operation.
 */
export function parseAndValidateBlockData(
  buffer: ArrayBuffer,
  blockPath: string,
  options?: { maxBlockSize?: number }
): BlockDataValidationResult {
  if (options?.maxBlockSize !== undefined) {
    validateBlockSize(buffer.byteLength, blockPath, options);
  }

  const text = sharedDecoder.decode(buffer);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const jsonError = error as SyntaxError;
    throw new BlockDataValidationError(
      `Invalid JSON in block '${blockPath}': ${jsonError.message}`,
      blockPath,
      BlockDataValidationErrorCode.JSON_PARSE_ERROR,
      { parseError: jsonError.message }
    );
  }

  return validateBlockData(parsed, blockPath);
}

// =============================================================================
// Manifest Validation
// =============================================================================

/**
 * Error codes for manifest validation failures
 */
export enum ManifestValidationErrorCode {
  JSON_PARSE_ERROR = 'JSON_PARSE_ERROR',
  NULL_MANIFEST = 'NULL_MANIFEST',
  PRIMITIVE_MANIFEST = 'PRIMITIVE_MANIFEST',
  ARRAY_MANIFEST = 'ARRAY_MANIFEST',
  MISSING_FIELD = 'MISSING_FIELD',
  WRONG_TYPE = 'WRONG_TYPE',
  INVALID_COLUMN_TYPE = 'INVALID_COLUMN_TYPE',
}

const VALID_COLUMN_TYPES = new Set([
  'null', 'boolean', 'int32', 'int64', 'float64', 'string',
  'binary', 'timestamp', 'date', 'list', 'object',
]);

/**
 * Error thrown when manifest validation fails.
 * Extends ValidationError for consistent error hierarchy.
 */
export class ManifestValidationError extends ValidationError {
  public readonly validationCode: ManifestValidationErrorCode;

  constructor(
    message: string,
    validationCode: ManifestValidationErrorCode,
    details?: Record<string, unknown>
  ) {
    super(
      message,
      ErrorCode.MANIFEST_VALIDATION,
      { validationCode, ...details },
      'Ensure manifest file is valid JSON and contains required fields.'
    );
    this.name = 'ManifestValidationError';
    this.validationCode = validationCode;
    captureStackTrace(this, ManifestValidationError);
  }
}

/** Validated manifest type */
export interface ValidatedManifest {
  version: number;
  tables: Record<string, SimpleTableMetadata>;
}

/**
 * Validates that a value is a valid Manifest structure.
 */
export function validateManifest(data: unknown): ValidatedManifest {
  if (data === null) {
    throw new ManifestValidationError(
      'Invalid manifest: expected object but got null',
      ManifestValidationErrorCode.NULL_MANIFEST,
      { receivedType: 'null' }
    );
  }

  if (typeof data !== 'object') {
    throw new ManifestValidationError(
      `Invalid manifest: expected object but got ${typeof data}`,
      ManifestValidationErrorCode.PRIMITIVE_MANIFEST,
      { receivedType: typeof data }
    );
  }

  if (Array.isArray(data)) {
    throw new ManifestValidationError(
      'Invalid manifest: expected object but got array',
      ManifestValidationErrorCode.ARRAY_MANIFEST,
      { receivedType: 'array' }
    );
  }

  const manifest = data as Record<string, unknown>;

  if (!('version' in manifest)) {
    throw new ManifestValidationError(
      'Invalid manifest: missing required field "version"',
      ManifestValidationErrorCode.MISSING_FIELD,
      { field: 'version' }
    );
  }

  if (typeof manifest.version !== 'number') {
    throw new ManifestValidationError(
      `Invalid manifest: "version" must be a number but got ${typeof manifest.version}`,
      ManifestValidationErrorCode.WRONG_TYPE,
      { field: 'version', expectedType: 'number', receivedType: typeof manifest.version }
    );
  }

  if (!('tables' in manifest)) {
    throw new ManifestValidationError(
      'Invalid manifest: missing required field "tables"',
      ManifestValidationErrorCode.MISSING_FIELD,
      { field: 'tables' }
    );
  }

  if (manifest.tables === null || typeof manifest.tables !== 'object' || Array.isArray(manifest.tables)) {
    const actualType = manifest.tables === null ? 'null' : Array.isArray(manifest.tables) ? 'array' : typeof manifest.tables;
    throw new ManifestValidationError(
      `Invalid manifest: "tables" must be an object but got ${actualType}`,
      ManifestValidationErrorCode.WRONG_TYPE,
      { field: 'tables', expectedType: 'object', receivedType: actualType }
    );
  }

  const tables = manifest.tables as Record<string, unknown>;
  const validatedTables: Record<string, SimpleTableMetadata> = {};

  for (const [tableName, tableData] of Object.entries(tables)) {
    validatedTables[tableName] = validateTableMetadata(tableData, tableName);
  }

  return {
    version: manifest.version as number,
    tables: validatedTables,
  };
}

/**
 * Validates that a value is a valid TableMetadata structure.
 */
export function validateTableMetadata(data: unknown, tableName: string): SimpleTableMetadata {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    const actualType = data === null ? 'null' : Array.isArray(data) ? 'array' : typeof data;
    throw new ManifestValidationError(
      `Invalid table "${tableName}": expected object but got ${actualType}`,
      ManifestValidationErrorCode.WRONG_TYPE,
      { table: tableName, receivedType: actualType }
    );
  }

  const table = data as Record<string, unknown>;

  // Validate required fields
  for (const field of ['name', 'schema', 'blockPaths', 'rowCount']) {
    if (!(field in table)) {
      throw new ManifestValidationError(
        `Invalid table "${tableName}": missing required field "${field}"`,
        ManifestValidationErrorCode.MISSING_FIELD,
        { table: tableName, field }
      );
    }
  }

  if (typeof table.name !== 'string') {
    throw new ManifestValidationError(
      `Invalid table "${tableName}": "name" must be a string but got ${typeof table.name}`,
      ManifestValidationErrorCode.WRONG_TYPE,
      { table: tableName, field: 'name' }
    );
  }

  if (!Array.isArray(table.schema)) {
    throw new ManifestValidationError(
      `Invalid table "${tableName}": "schema" must be an array`,
      ManifestValidationErrorCode.WRONG_TYPE,
      { table: tableName, field: 'schema' }
    );
  }

  if (!Array.isArray(table.blockPaths)) {
    throw new ManifestValidationError(
      `Invalid table "${tableName}": "blockPaths" must be an array`,
      ManifestValidationErrorCode.WRONG_TYPE,
      { table: tableName, field: 'blockPaths' }
    );
  }

  if (typeof table.rowCount !== 'number') {
    throw new ManifestValidationError(
      `Invalid table "${tableName}": "rowCount" must be a number`,
      ManifestValidationErrorCode.WRONG_TYPE,
      { table: tableName, field: 'rowCount' }
    );
  }

  const validatedSchema: SimpleColumnSchema[] = [];
  for (let i = 0; i < table.schema.length; i++) {
    validatedSchema.push(validateColumnSchema(table.schema[i], tableName, i));
  }

  return {
    name: table.name as string,
    schema: validatedSchema,
    blockPaths: table.blockPaths as string[],
    rowCount: table.rowCount as number,
    lastUpdated: typeof table.lastUpdated === 'number' ? table.lastUpdated : 0,
  };
}

function validateColumnSchema(data: unknown, tableName: string, index: number): SimpleColumnSchema {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new ManifestValidationError(
      `Invalid column at index ${index} in table "${tableName}"`,
      ManifestValidationErrorCode.WRONG_TYPE,
      { table: tableName, columnIndex: index }
    );
  }

  const column = data as Record<string, unknown>;

  if (typeof column.name !== 'string') {
    throw new ManifestValidationError(
      `Invalid column at index ${index} in table "${tableName}": "name" must be a string`,
      ManifestValidationErrorCode.WRONG_TYPE,
      { table: tableName, columnIndex: index, field: 'name' }
    );
  }

  if (typeof column.type !== 'string') {
    throw new ManifestValidationError(
      `Invalid column "${column.name}" in table "${tableName}": "type" must be a string`,
      ManifestValidationErrorCode.WRONG_TYPE,
      { table: tableName, column: column.name, field: 'type' }
    );
  }

  if (!VALID_COLUMN_TYPES.has(column.type)) {
    throw new ManifestValidationError(
      `Invalid column "${column.name}" in table "${tableName}": unknown type "${column.type}"`,
      ManifestValidationErrorCode.INVALID_COLUMN_TYPE,
      { table: tableName, column: column.name, invalidType: column.type }
    );
  }

  return {
    name: column.name as string,
    type: column.type as SimpleColumnType,
    nullable: 'nullable' in column ? Boolean(column.nullable) : false,
    metadata: column.metadata as Record<string, string> | undefined,
  };
}

// =============================================================================
// Simple Cache Tier
// =============================================================================

const DEFAULT_CACHE_CONFIG: SimpleCacheTierConfig = {
  enableCacheApi: true,
  cacheTtlSeconds: DEFAULT_CACHE_TTL_SECONDS,
  maxCachedItemSize: CACHE_API_MAX_ITEM_SIZE,
  cacheKeyPrefix: 'evodb:',
};

/**
 * Simple Cache tier manager for R2 data.
 * Uses Cloudflare Cache API (FREE) for hot data.
 */
export class SimpleCacheTier {
  private readonly config: SimpleCacheTierConfig;
  private readonly stats: SimpleCacheStats & { errors: number } = {
    hits: 0,
    misses: 0,
    bytesServedFromCache: 0,
    bytesReadFromR2: 0,
    errors: 0,
  };

  constructor(config?: Partial<SimpleCacheTierConfig>) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
  }

  /**
   * Get data from cache or R2
   */
  async get(
    bucket: SimpleR2Bucket,
    key: string,
    options?: { skipCache?: boolean }
  ): Promise<{ data: ArrayBuffer; fromCache: boolean }> {
    // Try cache first (if enabled and not skipped)
    if (this.config.enableCacheApi && !options?.skipCache) {
      try {
        const cache = await caches.open('evodb');
        const cacheKey = this.buildCacheUrl(key);
        const response = await cache.match(cacheKey);

        if (response) {
          const data = await response.arrayBuffer();
          this.stats.hits++;
          this.stats.bytesServedFromCache += data.byteLength;
          return { data, fromCache: true };
        }
      } catch {
        this.stats.errors++;
        // Fall through to R2
      }
    }

    // Cache miss or error - read from R2
    this.stats.misses++;
    const object = await bucket.get(key);
    if (!object) {
      throw new Error(`Object not found: ${key}`);
    }

    const data = await object.arrayBuffer();
    this.stats.bytesReadFromR2 += data.byteLength;

    // Cache the data (if enabled and within size limit)
    if (
      this.config.enableCacheApi &&
      data.byteLength <= (this.config.maxCachedItemSize ?? CACHE_API_MAX_ITEM_SIZE)
    ) {
      try {
        const cache = await caches.open('evodb');
        const cacheKey = this.buildCacheUrl(key);
        const response = new Response(data, {
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': data.byteLength.toString(),
            'Cache-Control': `public, max-age=${this.config.cacheTtlSeconds ?? DEFAULT_CACHE_TTL_SECONDS}`,
            'ETag': object.etag,
            'X-EvoDB-Cached': Date.now().toString(),
          },
        });
        await cache.put(cacheKey, response);
      } catch {
        this.stats.errors++;
        // Ignore cache put errors
      }
    }

    return { data, fromCache: false };
  }

  private buildCacheUrl(key: string): string {
    return `https://evodb.cache/${this.config.cacheKeyPrefix}${encodeURIComponent(key)}`;
  }

  /**
   * Get cache statistics
   */
  getStats(): SimpleCacheStats & { errors: number } {
    return { ...this.stats };
  }

  /**
   * Reset cache statistics
   */
  resetStats(): void {
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.stats.bytesServedFromCache = 0;
    this.stats.bytesReadFromR2 = 0;
    this.stats.errors = 0;
  }
}

// =============================================================================
// Simple Query Engine
// =============================================================================

/**
 * Simple Query Engine - Lightweight query execution for basic use cases.
 *
 * This engine provides:
 * - R2 + Cache API integration
 * - Manifest-based table discovery
 * - Columnar JSON block reading
 * - Basic filter, sort, and aggregation using @evodb/core shared operations
 *
 * Implements the CacheableQueryExecutor interface for cross-package compatibility.
 *
 * @deprecated Since v0.2.0 - Use UnifiedQueryEngine with mode: 'simple' instead.
 * SimpleQueryEngine will be removed in v0.3.0.
 *
 * Migration example:
 * ```typescript
 * // Before:
 * import { SimpleQueryEngine } from '@evodb/query';
 * const engine = new SimpleQueryEngine({ bucket, cache: { enableCacheApi: true } });
 *
 * // After:
 * import { UnifiedQueryEngine } from '@evodb/query';
 * const engine = new UnifiedQueryEngine({
 *   mode: 'simple',
 *   bucket,
 *   simpleCache: { enableCacheApi: true },
 * });
 * ```
 */
export class SimpleQueryEngine implements CacheableQueryExecutor {
  private readonly config: SimpleQueryConfig;
  private readonly cache: SimpleCacheTier;
  private manifest: ValidatedManifest | null = null;
  private readonly maxConcurrentReads: number;
  private readonly maxBlockSize: number;

  constructor(config: SimpleQueryConfig) {
    this.config = config;
    this.cache = new SimpleCacheTier(config.cache);
    this.maxConcurrentReads = config.maxConcurrentReads ?? 4;
    this.maxBlockSize = config.maxBlockSize ?? DEFAULT_MAX_BLOCK_SIZE;
  }

  /**
   * Load manifest from R2 with runtime validation
   */
  private async loadManifest(): Promise<ValidatedManifest> {
    if (this.manifest) {
      return this.manifest;
    }

    const object = await this.config.bucket.get('manifest.json');
    if (!object) {
      throw new Error('Manifest not found');
    }

    const rawData = await object.json<unknown>();
    this.manifest = validateManifest(rawData);
    return this.manifest;
  }

  /**
   * Refresh the manifest from R2
   */
  async refreshManifest(): Promise<void> {
    this.manifest = null;
    await this.loadManifest();
  }

  /**
   * List all available tables
   */
  async listTables(): Promise<string[]> {
    const manifest = await this.loadManifest();
    return Object.keys(manifest.tables);
  }

  /**
   * Get metadata for a specific table
   */
  async getTableMetadata(tableName: string): Promise<SimpleTableMetadata> {
    const manifest = await this.loadManifest();
    const table = manifest.tables[tableName];
    if (!table) {
      throw new Error(`Table not found: ${tableName}`);
    }
    return table;
  }

  /**
   * Scan a single data block
   */
  async scanBlock(request: SimpleBlockScanRequest): Promise<SimpleBlockScanResult> {
    const { data: buffer, fromCache } = await this.cache.get(
      this.config.bucket,
      request.blockPath
    );

    const { data: blockData, rowCount: totalRows } = parseAndValidateBlockData(
      buffer,
      request.blockPath,
      { maxBlockSize: this.maxBlockSize }
    );

    const includedRows: number[] = [];
    for (let i = 0; i < totalRows; i++) {
      if (this.rowPassesFilters(blockData, i, request.filters)) {
        includedRows.push(i);
      }
    }

    const resultData = new Map<string, unknown[]>();
    for (const col of request.columns) {
      if (blockData[col] !== undefined) {
        const values = includedRows.map((rowIdx) => blockData[col][rowIdx]);
        resultData.set(col, values);
      }
    }

    return {
      data: resultData,
      rowCount: includedRows.length,
      bytesRead: buffer.byteLength,
      fromCache,
    };
  }

  /**
   * Execute a query against the data (simple mode)
   */
  async query(request: SimpleQueryRequest): Promise<SimpleQueryResult> {
    const startTime = Date.now();

    if (request.timeoutMs !== undefined && request.timeoutMs <= 0) {
      throw new Error('Query timeout');
    }

    const manifest = await this.loadManifest();
    const table = manifest.tables[request.table];
    if (!table) {
      throw new Error(`Table not found: ${request.table}`);
    }

    const tableColumnNames = table.schema.map((s) => s.name);
    const requestedColumns = request.columns || tableColumnNames;

    for (const col of requestedColumns) {
      if (!tableColumnNames.includes(col)) {
        throw new Error(`Column not found: ${col}`);
      }
    }

    // Validate filter operators
    if (request.filters) {
      const validOperators = [
        'eq', 'ne', 'lt', 'le', 'gt', 'ge', 'in', 'notIn',
        'isNull', 'isNotNull', 'like', 'between'
      ];
      for (const filter of request.filters) {
        if (!validOperators.includes(filter.operator)) {
          throw new Error(`Invalid filter operator: ${filter.operator}`);
        }
      }
    }

    // Validate aggregate functions
    if (request.aggregates) {
      const validFunctions = ['count', 'sum', 'avg', 'min', 'max', 'countDistinct'];
      for (const agg of request.aggregates) {
        if (!validFunctions.includes(agg.function)) {
          throw new Error(`Invalid aggregate function: ${agg.function}`);
        }
      }
    }

    // Determine columns to read
    const columnsToRead = new Set<string>(requestedColumns);
    if (request.filters) {
      for (const filter of request.filters) {
        columnsToRead.add(filter.column);
      }
    }
    if (request.groupBy) {
      for (const col of request.groupBy) {
        columnsToRead.add(col);
      }
    }
    if (request.aggregates) {
      for (const agg of request.aggregates) {
        if (agg.column) {
          columnsToRead.add(agg.column);
        }
      }
    }
    if (request.orderBy) {
      for (const sort of request.orderBy) {
        columnsToRead.add(sort.column);
      }
    }

    // Read blocks in parallel
    const blockPaths = table.blockPaths;
    let blocksScanned = 0;
    let rowsScanned = 0;
    let bytesFromR2 = 0;
    let bytesFromCache = 0;

    const allRows: Record<string, unknown>[] = [];

    for (let i = 0; i < blockPaths.length; i += this.maxConcurrentReads) {
      const batch = blockPaths.slice(i, i + this.maxConcurrentReads);
      const results = await Promise.all(
        batch.map(async (blockPath) => {
          const { data: buffer, fromCache } = await this.cache.get(
            this.config.bucket,
            blockPath
          );

          const { data: blockData, rowCount } = parseAndValidateBlockData(
            buffer,
            blockPath,
            { maxBlockSize: this.maxBlockSize }
          );

          return { blockData, rowCount, bytesRead: buffer.byteLength, fromCache };
        })
      );

      for (const { blockData, rowCount, bytesRead, fromCache } of results) {
        blocksScanned++;
        if (fromCache) {
          bytesFromCache += bytesRead;
        } else {
          bytesFromR2 += bytesRead;
        }

        rowsScanned += rowCount;

        for (let rowIdx = 0; rowIdx < rowCount; rowIdx++) {
          if (this.rowPassesFilters(blockData, rowIdx, request.filters)) {
            const row: Record<string, unknown> = {};
            for (const col of columnsToRead) {
              row[col] = blockData[col]?.[rowIdx];
            }
            allRows.push(row);
          }
        }
      }
    }

    // Handle aggregations
    let resultRows: unknown[][];
    let resultColumns: string[];

    if (request.aggregates && request.aggregates.length > 0) {
      const aggResult = this.computeAggregations(
        allRows,
        request.aggregates,
        request.groupBy
      );
      resultRows = aggResult.rows;
      resultColumns = aggResult.columns;
    } else {
      resultColumns = requestedColumns;

      // Sort if needed
      if (request.orderBy && request.orderBy.length > 0) {
        this.sortRows(allRows, request.orderBy);
      }

      // Apply offset and limit
      let start = request.offset ?? 0;
      let end = allRows.length;
      if (request.limit !== undefined) {
        end = Math.min(start + request.limit, allRows.length);
      }
      const slicedRows = allRows.slice(start, end);

      // Convert to row arrays
      resultRows = slicedRows.map((row) =>
        resultColumns.map((col) => row[col])
      );
    }

    const executionTimeMs = Date.now() - startTime;
    const cacheStats = this.cache.getStats();

    const stats: SimpleQueryStats = {
      executionTimeMs,
      blocksScanned,
      blocksSkipped: 0,
      rowsScanned,
      rowsReturned: resultRows.length,
      bytesFromR2,
      bytesFromCache,
      cacheHitRatio: cacheStats.hits + cacheStats.misses > 0
        ? cacheStats.hits / (cacheStats.hits + cacheStats.misses)
        : 0,
    };

    return {
      columns: resultColumns,
      rows: resultRows,
      stats,
    };
  }

  /**
   * Check if a row passes all filters
   */
  private rowPassesFilters(
    blockData: BlockData,
    rowIdx: number,
    filters?: SimpleFilterPredicate[]
  ): boolean {
    if (!filters || filters.length === 0) {
      return true;
    }

    for (const filter of filters) {
      const value = blockData[filter.column]?.[rowIdx];
      if (!this.evaluateFilter(value, filter)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluate a single filter predicate using shared implementation from @evodb/core
   */
  private evaluateFilter(value: unknown, filter: SimpleFilterPredicate): boolean {
    const coreFilter: CoreFilterPredicate = {
      column: filter.column,
      operator: filter.operator,
      value: filter.value,
      values: filter.values,
      lowerBound: filter.lowerBound,
      upperBound: filter.upperBound,
    };
    return coreEvaluateFilter(value, coreFilter);
  }

  /**
   * Sort rows using shared implementation from @evodb/core
   */
  private sortRows(rows: Record<string, unknown>[], orderBy: SimpleSortSpec[]): void {
    const coreOrderBy: CoreSortSpec[] = orderBy.map(spec => ({
      column: spec.column,
      direction: spec.direction,
      nullsFirst: spec.nullsFirst,
    }));

    const sorted = coreSortRows(rows, coreOrderBy);
    rows.length = 0;
    rows.push(...sorted);
  }

  /**
   * Compute aggregations using shared implementation from @evodb/core
   */
  private computeAggregations(
    rows: Record<string, unknown>[],
    aggregates: SimpleAggregateSpec[],
    groupBy?: string[]
  ): { columns: string[]; rows: unknown[][] } {
    const coreAggregates: CoreAggregateSpec[] = aggregates.map(agg => ({
      function: agg.function,
      column: agg.column,
      alias: agg.alias,
    }));

    return coreComputeAggregations(rows, coreAggregates, groupBy);
  }

  // =============================================================================
  // CacheableQueryExecutor Interface Implementation
  // =============================================================================

  /**
   * Execute a query using the unified QueryExecutor interface.
   */
  async execute<T = Record<string, unknown>>(
    executorQuery: ExecutorQuery
  ): Promise<ExecutorResult<T>> {
    const request: SimpleQueryRequest = {
      table: executorQuery.table,
      columns: executorQuery.columns,
      filters: executorQuery.predicates?.map(p => ({
        column: p.column,
        operator: p.operator as SimpleFilterOperator,
        value: p.value,
        values: p.values,
        lowerBound: p.lowerBound,
        upperBound: p.upperBound,
      })),
      groupBy: executorQuery.groupBy,
      aggregates: executorQuery.aggregations?.map(a => ({
        function: a.function as SimpleAggregateFunction,
        column: a.column ?? undefined,
        alias: a.alias,
      })),
      orderBy: executorQuery.orderBy?.map(o => ({
        column: o.column,
        direction: o.direction,
        nullsFirst: o.nulls === 'first',
      })),
      limit: executorQuery.limit,
      offset: executorQuery.offset,
      timeoutMs: executorQuery.timeoutMs,
    };

    const result = await this.query(request);

    const rows: T[] = result.rows.map(row => {
      const obj: Record<string, unknown> = {};
      for (let i = 0; i < result.columns.length; i++) {
        obj[result.columns[i]] = row[i];
      }
      return obj as T;
    });

    const executorStats: ExecutorStats = {
      executionTimeMs: result.stats.executionTimeMs,
      rowsScanned: result.stats.rowsScanned,
      rowsReturned: result.stats.rowsReturned,
      bytesRead: result.stats.bytesFromR2 + result.stats.bytesFromCache,
      cacheHitRatio: result.stats.cacheHitRatio,
      blocksScanned: result.stats.blocksScanned,
      blocksSkipped: result.stats.blocksSkipped,
      bytesFromR2: result.stats.bytesFromR2,
      bytesFromCache: result.stats.bytesFromCache,
    };

    return {
      rows,
      columns: result.columns,
      totalRowCount: result.totalRows ?? rows.length,
      hasMore: false,
      stats: executorStats,
    };
  }

  /**
   * Explain the execution plan for a query without executing it.
   */
  async explain(executorQuery: ExecutorQuery): Promise<ExecutorPlan> {
    const table = await this.getTableMetadata(executorQuery.table);
    const rowCount = table.rowCount;
    const blockCount = table.blockPaths.length;
    const estimatedBytes = blockCount * 100 * 1024;

    let outputRows = rowCount;
    if (executorQuery.predicates && executorQuery.predicates.length > 0) {
      outputRows = Math.floor(rowCount * Math.pow(0.5, executorQuery.predicates.length));
    }
    if (executorQuery.limit) {
      outputRows = Math.min(outputRows, executorQuery.limit);
    }

    const estimatedCost: ExecutorCost = {
      rowsToScan: rowCount,
      bytesToRead: estimatedBytes,
      outputRows,
      totalCost: rowCount * 0.001 + estimatedBytes * 0.0001,
    };

    return {
      planId: `simple-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      query: executorQuery,
      estimatedCost,
      createdAt: Date.now(),
      description: `Scan ${blockCount} blocks from table "${executorQuery.table}" (${rowCount} rows)`,
      partitionsSelected: blockCount,
      partitionsPruned: 0,
      usesZoneMaps: false,
      usesBloomFilters: false,
    };
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): ExecutorCacheStats {
    const stats = this.cache.getStats();
    return {
      hits: stats.hits,
      misses: stats.misses,
      bytesFromCache: stats.bytesServedFromCache,
      bytesFromStorage: stats.bytesReadFromR2,
      hitRatio: stats.hits + stats.misses > 0
        ? stats.hits / (stats.hits + stats.misses)
        : 0,
    };
  }

  /**
   * Clear the query cache (resets stats)
   */
  async clearCache(): Promise<void> {
    this.cache.resetStats();
  }

  /**
   * Invalidate specific cache entries (resets stats as Cache API doesn't support selective invalidation easily)
   */
  async invalidateCache(_paths: string[]): Promise<void> {
    this.cache.resetStats();
  }
}

// Track if deprecation warning has been shown
let _simpleQueryEngineDeprecationWarned = false;

/**
 * Create a new simple query engine instance.
 *
 * @deprecated Since v0.2.0 - Use createSimpleUnifiedEngine() or
 * new UnifiedQueryEngine({ mode: 'simple', ... }) instead.
 * This function will be removed in v0.3.0.
 */
export function createSimpleQueryEngine(config: SimpleQueryConfig): SimpleQueryEngine {
  // Show deprecation warning once, only in non-production environments
  if (!_simpleQueryEngineDeprecationWarned) {
    _simpleQueryEngineDeprecationWarned = true;
    if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
      if (typeof console !== 'undefined' && console.warn) {
        // eslint-disable-next-line no-console
        console.warn(
          '[DEPRECATED] createSimpleQueryEngine() is deprecated. ' +
          'Use createSimpleUnifiedEngine() or new UnifiedQueryEngine({ mode: "simple" }) instead. ' +
          'This function will be removed in v0.3.0.'
        );
      }
    }
  }
  return new SimpleQueryEngine(config);
}
