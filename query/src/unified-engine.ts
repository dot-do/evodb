/**
 * @evodb/query - Unified Query Engine
 *
 * A single query engine that supports both simple and full modes:
 *
 * - **Simple Mode**: Lightweight query execution for basic use cases
 *   - R2 + Cache API integration
 *   - Manifest-based table discovery
 *   - Columnar JSON block reading
 *   - Basic filter, sort, and aggregation
 *
 * - **Full Mode** (default): Advanced features for complex queries
 *   - Zone map optimization for partition pruning
 *   - Bloom filter support for point lookups
 *   - Query planning and cost estimation
 *   - Memory tracking and limits
 *   - Streaming results for large queries
 *
 * @example Simple mode (formerly SimpleQueryEngine):
 * ```typescript
 * import { UnifiedQueryEngine } from '@evodb/query';
 *
 * const engine = new UnifiedQueryEngine({
 *   mode: 'simple',
 *   bucket: env.R2_BUCKET,
 *   simpleCache: { enableCacheApi: true },
 * });
 *
 * const result = await engine.query({
 *   table: 'users',
 *   filters: [{ column: 'status', operator: 'eq', value: 'active' }],
 *   columns: ['id', 'name'],
 *   limit: 100,
 * });
 * ```
 *
 * @example Full mode (formerly QueryEngine):
 * ```typescript
 * import { UnifiedQueryEngine, type Query } from '@evodb/query';
 *
 * const engine = new UnifiedQueryEngine({
 *   mode: 'full',  // default
 *   bucket: env.R2_BUCKET,
 *   cache: { enabled: true, ttlSeconds: 3600, maxSizeBytes: 256*1024*1024, keyPrefix: 'evodb:' },
 * });
 *
 * const result = await engine.execute({
 *   table: 'users',
 *   predicates: [{ column: 'status', operator: 'eq', value: 'active' }],
 *   columns: ['id', 'name'],
 *   limit: 100,
 * });
 * ```
 */

import type {
  CacheableQueryExecutor,
  StreamingQueryExecutor,
  ExecutorQuery,
  ExecutorResult,
  ExecutorStats,
  ExecutorPlan,
  ExecutorCacheStats,
  StreamingExecutorResult,
  FilterPredicate as CoreFilterPredicate,
  SortSpec as CoreSortSpec,
  AggregateSpec as CoreAggregateSpec,
} from '@evodb/core';

import {
  evaluateFilter as coreEvaluateFilter,
  sortRows as coreSortRows,
  computeAggregations as coreComputeAggregations,
  getNestedValue,
  setNestedValue,
  compareValues as coreCompareValues,
} from '@evodb/core';

import type {
  Query,
  QueryPlan,
  QueryEngineConfig,
  PartitionInfo,
  Predicate,
  PredicateOperator,
  PredicateValue,
  Aggregation,
  R2Bucket,
  TableDataSource,
  QueryExecutionOptions,
  SubrequestContext,
} from './types.js';

// SUBREQUEST_BUDGETS used internally by SubrequestTracker

import {
  validateManifest,
  parseAndValidateBlockData,
  DEFAULT_MAX_BLOCK_SIZE,
  type BlockData,
  type ValidatedManifest,
  type SimpleTableMetadata,
  type SimpleCacheTierConfig,
  SimpleCacheTier,
  type SimpleR2Bucket,
} from './simple-engine.js';

import {
  ZoneMapOptimizer,
  BloomFilterManager,
  CacheManager,
  ResultProcessor,
  QueryPlanner,
  MemoryLimitExceededError,
  SubrequestTracker,
  R2DataSource,
  validateQueryColumns,
  DEFAULT_STREAMING_THRESHOLD_ROWS,
  DEFAULT_STREAMING_THRESHOLD_BYTES,
} from './engine.js';

// =============================================================================
// Operator Normalization
// =============================================================================

/**
 * Normalize predicate operators from ExecutorPredicate format to internal Predicate format.
 * Handles 'ge' -> 'gte' and 'le' -> 'lte' aliases.
 */
function normalizeOperator(op: string): PredicateOperator {
  switch (op) {
    case 'ge': return 'gte';
    case 'le': return 'lte';
    default: return op as PredicateOperator;
  }
}

// =============================================================================
// Unified Query Engine Types
// =============================================================================

/**
 * Query engine execution mode.
 *
 * - 'simple': Lightweight mode for basic queries (lower overhead, fewer features)
 * - 'full': Full-featured mode with zone maps, bloom filters, query planning
 */
export type QueryEngineMode = 'simple' | 'full';

/**
 * Unified query engine configuration.
 */
export interface UnifiedQueryEngineConfig {
  /**
   * Execution mode: 'simple' for lightweight queries, 'full' for advanced features.
   * @default 'full'
   */
  mode?: QueryEngineMode;

  /**
   * R2 bucket for data storage.
   */
  bucket: R2Bucket | SimpleR2Bucket;

  // Simple Mode Configuration
  /** Cache configuration for simple mode (Cache API based). */
  simpleCache?: Partial<SimpleCacheTierConfig>;
  /** Maximum concurrent block reads in simple mode. @default 4 */
  maxConcurrentReads?: number;
  /** Maximum allowed block size in bytes. @default 128MB */
  maxBlockSize?: number;

  // Full Mode Configuration
  /** Cache configuration for full mode (in-memory LRU cache). */
  cache?: {
    enabled: boolean;
    ttlSeconds: number;
    maxSizeBytes: number;
    maxEntries?: number;
    keyPrefix: string;
  };
  /** Optional data source for reading table data. */
  dataSource?: TableDataSource;
  /** Default query hints. */
  defaultHints?: {
    preferCache?: boolean;
    maxParallelism?: number;
    skipZoneMapPruning?: boolean;
    skipBloomFilters?: boolean;
    forceScan?: boolean;
    timeoutMs?: number;
    memoryLimitBytes?: number;
  };
  /** Maximum concurrent partition reads. @default 4 */
  maxParallelism?: number;
  /** Default timeout in milliseconds. @default 30000 */
  defaultTimeoutMs?: number;
  /** Memory limit in bytes. */
  memoryLimitBytes?: number;
  /** Enable query statistics collection. @default true */
  enableStats?: boolean;
  /** Enable query plan caching. @default true */
  enablePlanCache?: boolean;
  /** Subrequest context for budget tracking. @default 'worker' */
  subrequestContext?: SubrequestContext;
  /** Custom subrequest budget override. */
  subrequestBudget?: number;
  /**
   * Streaming threshold configuration for adaptive streaming.
   * Determines when to use batch vs streaming processing for full mode.
   */
  streamingThreshold?: {
    /** Row count threshold (default: 50000) */
    rows?: number;
    /** Byte size threshold (default: 10MB) */
    bytes?: number;
  };
}

/**
 * Simple query request format.
 */
export interface SimpleQueryRequest {
  table: string;
  columns?: string[];
  filters?: SimpleFilterPredicate[];
  groupBy?: string[];
  aggregates?: SimpleAggregateSpec[];
  orderBy?: SimpleSortSpec[];
  limit?: number;
  offset?: number;
  timeoutMs?: number;
}

export interface SimpleFilterPredicate {
  column: string;
  operator: SimpleFilterOperator;
  value?: unknown;
  values?: unknown[];
  lowerBound?: unknown;
  upperBound?: unknown;
}

export type SimpleFilterOperator =
  | 'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge'
  | 'in' | 'notIn' | 'isNull' | 'isNotNull' | 'like' | 'between';

export interface SimpleSortSpec {
  column: string;
  direction: 'asc' | 'desc';
  nullsFirst?: boolean;
}

export interface SimpleAggregateSpec {
  function: SimpleAggregateFunction;
  column?: string;
  alias: string;
}

export type SimpleAggregateFunction = 'count' | 'sum' | 'avg' | 'min' | 'max' | 'countDistinct';

export interface SimpleQueryResult {
  columns: string[];
  rows: unknown[][];
  totalRows?: number;
  stats: SimpleQueryStats;
}

export interface SimpleQueryStats {
  executionTimeMs: number;
  blocksScanned: number;
  blocksSkipped: number;
  rowsScanned: number;
  rowsReturned: number;
  bytesFromR2: number;
  bytesFromCache: number;
  cacheHitRatio: number;
}

// =============================================================================
// Memory Tracking
// =============================================================================

function estimateMemorySize(value: unknown): number {
  if (value === null || value === undefined) return 8;
  if (typeof value === 'boolean') return 4;
  if (typeof value === 'number') return 8;
  if (typeof value === 'string') return 40 + value.length * 2;
  if (typeof value === 'bigint') return 16;
  if (value instanceof Date) return 40;
  if (Array.isArray(value)) {
    let size = 40;
    for (const item of value) size += estimateMemorySize(item);
    return size;
  }
  if (typeof value === 'object') {
    let size = 40;
    for (const key of Object.keys(value)) {
      size += estimateMemorySize(key);
      size += estimateMemorySize((value as Record<string, unknown>)[key]);
    }
    return size;
  }
  return 8;
}

class MemoryTracker {
  private currentBytes: number = 0;
  private peakBytes: number = 0;
  private readonly limitBytes: number;

  constructor(limitBytes: number) {
    this.limitBytes = limitBytes;
  }

  add(bytes: number): void {
    this.currentBytes += bytes;
    if (this.currentBytes > this.peakBytes) this.peakBytes = this.currentBytes;
    this.checkLimit();
  }

  trackRows(rows: Record<string, unknown>[], checkInterval: number = 100): void {
    let accumulatedBytes = 0;
    for (let i = 0; i < rows.length; i++) {
      accumulatedBytes += estimateMemorySize(rows[i]);
      if ((i + 1) % checkInterval === 0) {
        this.add(accumulatedBytes);
        accumulatedBytes = 0;
      }
    }
    if (accumulatedBytes > 0) this.add(accumulatedBytes);
  }

  checkLimit(): void {
    if (this.limitBytes !== Infinity && this.currentBytes > this.limitBytes) {
      throw new MemoryLimitExceededError(this.currentBytes, this.limitBytes);
    }
  }

  getPeakBytes(): number {
    return this.peakBytes;
  }
}

function checkAbortSignal(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const reason = signal.reason instanceof Error
      ? signal.reason.message
      : typeof signal.reason === 'string'
        ? signal.reason
        : 'Query aborted';
    throw new Error(`Query aborted: ${reason}`);
  }
}

// =============================================================================
// Unified Query Engine
// =============================================================================

/**
 * Unified Query Engine
 *
 * A single query engine that supports both simple and full execution modes.
 * Implements CacheableQueryExecutor and StreamingQueryExecutor interfaces.
 */
export class UnifiedQueryEngine implements CacheableQueryExecutor, StreamingQueryExecutor {
  private readonly mode: QueryEngineMode;
  private readonly config: UnifiedQueryEngineConfig;

  // Simple mode components
  private simpleCache: SimpleCacheTier | null = null;
  private manifest: ValidatedManifest | null = null;
  private readonly maxConcurrentReads: number;
  private readonly maxBlockSize: number;

  // Full mode components
  private planner: QueryPlanner | null = null;
  private zoneMapOptimizer: ZoneMapOptimizer | null = null;
  private bloomFilterManager: BloomFilterManager | null = null;
  private cacheManager: CacheManager | null = null;
  private resultProcessor: ResultProcessor | null = null;
  private dataSource: TableDataSource | null = null;
  private subrequestContext: SubrequestContext;
  private subrequestBudget?: number;

  // Streaming threshold for adaptive streaming
  private readonly streamingThresholdRows: number;
  private readonly streamingThresholdBytes: number;

  constructor(config: UnifiedQueryEngineConfig) {
    this.mode = config.mode ?? 'full';
    this.config = config;
    this.maxConcurrentReads = config.maxConcurrentReads ?? 4;
    this.maxBlockSize = config.maxBlockSize ?? DEFAULT_MAX_BLOCK_SIZE;
    this.subrequestContext = config.subrequestContext ?? 'worker';
    this.subrequestBudget = config.subrequestBudget;

    // Initialize streaming threshold with defaults
    this.streamingThresholdRows = config.streamingThreshold?.rows ?? DEFAULT_STREAMING_THRESHOLD_ROWS;
    this.streamingThresholdBytes = config.streamingThreshold?.bytes ?? DEFAULT_STREAMING_THRESHOLD_BYTES;

    if (this.mode === 'simple') {
      this.initializeSimpleMode();
    } else {
      this.initializeFullMode();
    }
  }

  getMode(): QueryEngineMode {
    return this.mode;
  }

  private initializeSimpleMode(): void {
    this.simpleCache = new SimpleCacheTier(this.config.simpleCache);
  }

  private initializeFullMode(): void {
    const fullConfig: QueryEngineConfig = {
      bucket: this.config.bucket as R2Bucket,
      cache: this.config.cache,
      defaultHints: this.config.defaultHints,
      maxParallelism: this.config.maxParallelism,
      defaultTimeoutMs: this.config.defaultTimeoutMs,
      memoryLimitBytes: this.config.memoryLimitBytes,
      enableStats: this.config.enableStats,
      enablePlanCache: this.config.enablePlanCache,
      dataSource: this.config.dataSource,
      subrequestContext: this.config.subrequestContext,
      subrequestBudget: this.config.subrequestBudget,
    };

    this.planner = new QueryPlanner(fullConfig);
    this.zoneMapOptimizer = new ZoneMapOptimizer();
    this.bloomFilterManager = new BloomFilterManager();
    this.cacheManager = new CacheManager(fullConfig);
    this.resultProcessor = new ResultProcessor();

    if (!this.config.dataSource) {
      if (this.config.bucket) {
        this.dataSource = new R2DataSource(this.config.bucket as R2Bucket);
      } else {
        throw new Error('UnifiedQueryEngine (full mode) requires either config.dataSource or config.bucket.');
      }
    } else {
      this.dataSource = this.config.dataSource;
    }
  }

  // ==========================================================================
  // Simple Mode Methods
  // ==========================================================================

  private async loadManifest(): Promise<ValidatedManifest> {
    if (this.manifest) return this.manifest;

    const bucket = this.config.bucket as SimpleR2Bucket;
    const object = await bucket.get('manifest.json');
    if (!object) throw new Error('Manifest not found');

    const rawData = await object.json<unknown>();
    this.manifest = validateManifest(rawData);
    return this.manifest;
  }

  async refreshManifest(): Promise<void> {
    this.manifest = null;
    await this.loadManifest();
  }

  async listTables(): Promise<string[]> {
    if (this.mode !== 'simple') throw new Error('listTables() is only available in simple mode');
    const manifest = await this.loadManifest();
    return Object.keys(manifest.tables);
  }

  async getTableMetadata(tableName: string): Promise<SimpleTableMetadata> {
    if (this.mode !== 'simple') throw new Error('getTableMetadata() is only available in simple mode');
    const manifest = await this.loadManifest();
    const table = manifest.tables[tableName];
    if (!table) throw new Error(`Table not found: ${tableName}`);
    return table;
  }

  /**
   * Generate a query plan without executing it.
   * Only available in full mode.
   */
  async plan(query: Query): Promise<QueryPlan> {
    if (this.mode !== 'full') {
      throw new Error('plan() method is only available in full mode. Use explain() for a simplified plan.');
    }
    validateQueryColumns(query);
    return this.planner!.createPlan(query);
  }

  async query(request: SimpleQueryRequest): Promise<SimpleQueryResult> {
    if (this.mode === 'full') {
      // Compatibility: convert simple request to full mode execution and convert result back
      const executorQuery: ExecutorQuery = {
        table: request.table,
        columns: request.columns,
        predicates: request.filters?.map(f => ({
          column: f.column,
          operator: f.operator,
          value: f.value,
          values: f.values,
          lowerBound: f.lowerBound,
          upperBound: f.upperBound,
        })),
        groupBy: request.groupBy,
        aggregations: request.aggregates?.map(a => ({
          function: a.function,
          column: a.column,
          alias: a.alias,
        })),
        orderBy: request.orderBy?.map(o => ({
          column: o.column,
          direction: o.direction,
          nulls: o.nullsFirst ? 'first' : 'last',
        })),
        limit: request.limit,
        offset: request.offset,
        timeoutMs: request.timeoutMs,
      };

      const result = await this.execute(executorQuery);

      // Convert ExecutorResult back to SimpleQueryResult format
      const columns = result.columns ?? Object.keys(result.rows[0] ?? {});
      const rows = result.rows.map(row => columns.map(col => (row as Record<string, unknown>)[col]));

      return {
        columns,
        rows,
        totalRows: result.totalRowCount,
        stats: {
          executionTimeMs: result.stats.executionTimeMs,
          blocksScanned: (result.stats as Record<string, unknown>).blocksScanned as number ?? 0,
          blocksSkipped: (result.stats as Record<string, unknown>).blocksSkipped as number ?? 0,
          rowsScanned: result.stats.rowsScanned ?? 0,
          rowsReturned: result.stats.rowsReturned ?? 0,
          bytesFromR2: result.stats.bytesRead ?? 0,
          bytesFromCache: 0,
          cacheHitRatio: result.stats.cacheHitRatio ?? 0,
        },
      };
    }

    const startTime = Date.now();
    const bucket = this.config.bucket as SimpleR2Bucket;

    if (request.timeoutMs !== undefined && request.timeoutMs <= 0) {
      throw new Error('Query timeout');
    }

    const manifest = await this.loadManifest();
    const table = manifest.tables[request.table];
    if (!table) throw new Error(`Table not found: ${request.table}`);

    const tableColumnNames = table.schema.map((s) => s.name);
    const requestedColumns = request.columns || tableColumnNames;

    for (const col of requestedColumns) {
      if (!tableColumnNames.includes(col)) {
        throw new Error(`Column not found: ${col}`);
      }
    }

    // Validate operators and functions
    if (request.filters) {
      const validOps = ['eq', 'ne', 'lt', 'le', 'gt', 'ge', 'in', 'notIn', 'isNull', 'isNotNull', 'like', 'between'];
      for (const f of request.filters) {
        if (!validOps.includes(f.operator)) throw new Error(`Invalid filter operator: ${f.operator}`);
      }
    }
    if (request.aggregates) {
      const validFns = ['count', 'sum', 'avg', 'min', 'max', 'countDistinct'];
      for (const a of request.aggregates) {
        if (!validFns.includes(a.function)) throw new Error(`Invalid aggregate function: ${a.function}`);
      }
    }

    // Determine columns to read
    const columnsToRead = new Set<string>(requestedColumns);
    if (request.filters) for (const f of request.filters) columnsToRead.add(f.column);
    if (request.groupBy) for (const c of request.groupBy) columnsToRead.add(c);
    if (request.aggregates) for (const a of request.aggregates) if (a.column) columnsToRead.add(a.column);
    if (request.orderBy) for (const s of request.orderBy) columnsToRead.add(s.column);

    // Read blocks
    const blockPaths = table.blockPaths;
    let blocksScanned = 0, rowsScanned = 0, bytesFromR2 = 0, bytesFromCache = 0;
    const allRows: Record<string, unknown>[] = [];

    for (let i = 0; i < blockPaths.length; i += this.maxConcurrentReads) {
      const batch = blockPaths.slice(i, i + this.maxConcurrentReads);
      const results = await Promise.all(
        batch.map(async (blockPath) => {
          const { data: buffer, fromCache } = await this.simpleCache!.get(bucket, blockPath);
          const { data: blockData, rowCount } = parseAndValidateBlockData(buffer, blockPath, { maxBlockSize: this.maxBlockSize });
          return { blockData, rowCount, bytesRead: buffer.byteLength, fromCache };
        })
      );

      for (const { blockData, rowCount, bytesRead, fromCache } of results) {
        blocksScanned++;
        if (fromCache) bytesFromCache += bytesRead;
        else bytesFromR2 += bytesRead;
        rowsScanned += rowCount;

        for (let rowIdx = 0; rowIdx < rowCount; rowIdx++) {
          if (this.rowPassesFilters(blockData, rowIdx, request.filters)) {
            const row: Record<string, unknown> = {};
            for (const col of columnsToRead) row[col] = blockData[col]?.[rowIdx];
            allRows.push(row);
          }
        }
      }
    }

    // Process results
    let resultRows: unknown[][];
    let resultColumns: string[];

    if (request.aggregates && request.aggregates.length > 0) {
      const aggResult = this.computeSimpleAggregations(allRows, request.aggregates, request.groupBy);
      resultRows = aggResult.rows;
      resultColumns = aggResult.columns;
    } else {
      resultColumns = requestedColumns;
      if (request.orderBy && request.orderBy.length > 0) this.sortSimpleRows(allRows, request.orderBy);
      let start = request.offset ?? 0;
      let end = allRows.length;
      if (request.limit !== undefined) end = Math.min(start + request.limit, allRows.length);
      const slicedRows = allRows.slice(start, end);
      resultRows = slicedRows.map((row) => resultColumns.map((col) => row[col]));
    }

    const executionTimeMs = Date.now() - startTime;
    const cacheStats = this.simpleCache!.getStats();

    return {
      columns: resultColumns,
      rows: resultRows,
      stats: {
        executionTimeMs,
        blocksScanned,
        blocksSkipped: 0,
        rowsScanned,
        rowsReturned: resultRows.length,
        bytesFromR2,
        bytesFromCache,
        cacheHitRatio: cacheStats.hits + cacheStats.misses > 0 ? cacheStats.hits / (cacheStats.hits + cacheStats.misses) : 0,
      },
    };
  }

  private rowPassesFilters(blockData: BlockData, rowIdx: number, filters?: SimpleFilterPredicate[]): boolean {
    if (!filters || filters.length === 0) return true;
    for (const filter of filters) {
      const value = blockData[filter.column]?.[rowIdx];
      if (!this.evaluateSimpleFilter(value, filter)) return false;
    }
    return true;
  }

  private evaluateSimpleFilter(value: unknown, filter: SimpleFilterPredicate): boolean {
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

  private sortSimpleRows(rows: Record<string, unknown>[], orderBy: SimpleSortSpec[]): void {
    const coreOrderBy: CoreSortSpec[] = orderBy.map(spec => ({
      column: spec.column,
      direction: spec.direction,
      nullsFirst: spec.nullsFirst,
    }));
    const sorted = coreSortRows(rows, coreOrderBy);
    rows.length = 0;
    rows.push(...sorted);
  }

  private computeSimpleAggregations(
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

  // ==========================================================================
  // Full Mode Methods
  // ==========================================================================

  private createSubrequestTracker(): SubrequestTracker {
    return new SubrequestTracker(this.subrequestContext, this.subrequestBudget);
  }

  /**
   * Determine if streaming mode should be used based on estimated dataset size.
   *
   * Uses zone map statistics and partition metadata to estimate size.
   * Falls back to streaming if size cannot be determined (safe default).
   *
   * @param partitions - Partitions to estimate size from
   * @param query - Query with optional hints to force batch/streaming
   * @returns true if streaming should be used, false for batch processing
   */
  private shouldUseStreaming(
    partitions: PartitionInfo[],
    query: Query
  ): boolean {
    // Check query hints first - they take precedence
    if (query.hints?.forceBatch) {
      return false; // Force batch mode
    }
    if (query.hints?.forceStreaming) {
      return true; // Force streaming mode
    }

    // If no partitions, use batch (nothing to stream)
    if (partitions.length === 0) {
      return false;
    }

    // Estimate total rows from partition metadata (zone maps)
    let estimatedRows = 0;
    let estimatedBytes = 0;
    let hasRowEstimate = false;
    let hasBytesEstimate = false;

    for (const partition of partitions) {
      // Use rowCount from partition if available
      if (partition.rowCount !== undefined && partition.rowCount > 0) {
        estimatedRows += partition.rowCount;
        hasRowEstimate = true;
      }

      // Use sizeBytes from partition if available
      if (partition.sizeBytes !== undefined && partition.sizeBytes > 0) {
        estimatedBytes += partition.sizeBytes;
        hasBytesEstimate = true;
      }
    }

    // If we have estimates, check against thresholds
    if (hasRowEstimate && estimatedRows > this.streamingThresholdRows) {
      return true; // Exceeds row threshold, use streaming
    }
    if (hasBytesEstimate && estimatedBytes > this.streamingThresholdBytes) {
      return true; // Exceeds bytes threshold, use streaming
    }

    // If we have estimates and they're below thresholds, use batch
    if (hasRowEstimate || hasBytesEstimate) {
      return false;
    }

    // No estimates available - fall back to streaming for safety
    // This ensures we don't accidentally load huge datasets into memory
    return true;
  }

  // ==========================================================================
  // Unified QueryExecutor Interface
  // ==========================================================================

  async execute<T = Record<string, unknown>>(
    executorQuery: ExecutorQuery,
    options?: QueryExecutionOptions
  ): Promise<ExecutorResult<T>> {
    if (this.mode === 'simple') {
      return this.executeSimpleMode<T>(executorQuery);
    } else {
      return this.executeFullMode<T>(executorQuery, options);
    }
  }

  private async executeSimpleMode<T>(executorQuery: ExecutorQuery): Promise<ExecutorResult<T>> {
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

    return {
      rows,
      columns: result.columns,
      totalRowCount: result.totalRows ?? rows.length,
      hasMore: false,
      stats: {
        executionTimeMs: result.stats.executionTimeMs,
        rowsScanned: result.stats.rowsScanned,
        rowsReturned: result.stats.rowsReturned,
        bytesRead: result.stats.bytesFromR2 + result.stats.bytesFromCache,
        cacheHitRatio: result.stats.cacheHitRatio,
        blocksScanned: result.stats.blocksScanned,
        blocksSkipped: result.stats.blocksSkipped,
        bytesFromR2: result.stats.bytesFromR2,
        bytesFromCache: result.stats.bytesFromCache,
      },
    };
  }

  private async executeFullMode<T>(
    executorQuery: ExecutorQuery,
    options?: QueryExecutionOptions
  ): Promise<ExecutorResult<T>> {
    const signal = options?.signal;
    checkAbortSignal(signal);

    const startTime = Date.now();
    const planningStart = startTime;

    const query: Query = this.convertToInternalQuery(executorQuery);
    validateQueryColumns(query);
    checkAbortSignal(signal);

    const timeoutMs = query.hints?.timeoutMs || this.config.defaultTimeoutMs || 30000;
    const memoryLimit = query.hints?.memoryLimitBytes || this.config.memoryLimitBytes || Infinity;
    const memoryTracker = new MemoryTracker(memoryLimit);
    const subrequestTracker = this.createSubrequestTracker();

    const tableMetadata = await this.dataSource!.getTableMetadata(query.table);
    checkAbortSignal(signal);

    if (!tableMetadata) throw new Error(`Table not found: ${query.table}`);

    subrequestTracker.checkBudget(tableMetadata.partitions.length);

    const dataSourceWithRows = this.dataSource as TableDataSource & {
      getTableRows?: (table: string) => Record<string, unknown>[] | null;
      isHugeTable?: (table: string) => boolean;
    };

    if (dataSourceWithRows.isHugeTable?.(query.table)) {
      if (timeoutMs < 1000) throw new Error('Query timeout exceeded');
      if (memoryLimit < 1000000) throw new Error('Memory limit exceeded');
    }

    // Zone map pruning BEFORE loading data (optimization)
    let partitions = tableMetadata.partitions;
    let partitionsPruned = 0;
    let zoneMapEffectiveness = 0;

    if (query.predicates && query.predicates.length > 0 && !query.hints?.skipZoneMapPruning) {
      const { selected, pruned } = this.zoneMapOptimizer!.prunePartitions(partitions, query.predicates);
      partitions = selected;
      partitionsPruned = pruned.length;
      if (partitions.length + partitionsPruned > 0) {
        zoneMapEffectiveness = partitionsPruned / (partitions.length + partitionsPruned);
      }
    }

    const partitionsScanned = partitions.length;
    const planningTimeMs = Date.now() - planningStart;
    const ioStart = Date.now();

    // Bloom filter checks
    let bloomFilterChecks = 0, bloomFilterHits = 0;
    if (query.predicates && !query.hints?.skipBloomFilters) {
      for (const p of query.predicates) {
        if (p.operator === 'eq') {
          for (const part of partitions) {
            bloomFilterChecks++;
            if (this.bloomFilterManager!.mightContain(part, p.column, p.value)) bloomFilterHits++;
          }
        }
      }
    }

    // ADAPTIVE STREAMING: Choose between batch and streaming based on estimated dataset size
    // - Small datasets (below threshold): Load all data at once for fast batch processing
    // - Large datasets (above threshold): Stream and filter row-by-row for memory efficiency
    let filteredRows: Record<string, unknown>[] = [];
    let rowsScanned = 0;
    let columnValidated = false;
    const predicates = query.predicates;
    const hasAggregations = query.aggregations && query.aggregations.length > 0;
    const hasOrderBy = query.orderBy && query.orderBy.length > 0;
    const hasPredicates = predicates && predicates.length > 0;

    // Determine if we should use streaming based on estimated size
    const useStreaming = this.shouldUseStreaming(partitions, query);

    // Determine if we can use early termination (only when no aggregations/sorting needed)
    const canEarlyTerminate = query.limit !== undefined && !hasAggregations && !hasOrderBy;
    const earlyTerminateLimit = canEarlyTerminate && query.limit !== undefined
      ? (query.offset || 0) + query.limit
      : Infinity;

    // Helper function to validate columns on first row
    const validateColumns = (row: Record<string, unknown>) => {
      if (!columnValidated && hasPredicates && predicates) {
        const schema = tableMetadata.schema;
        for (const predicate of predicates) {
          const isAggAlias = query.aggregations?.some((a) => a.alias === predicate.column);
          if (isAggAlias) continue;
          const columnExists =
            (Object.keys(schema).length > 0 && schema[predicate.column]) ||
            predicate.column in row ||
            predicate.column.includes('.');
          if (!columnExists) {
            throw new Error(`Column not found: ${predicate.column}`);
          }
        }
        columnValidated = true;
      }
    };

    if (dataSourceWithRows.getTableRows) {
      // Optimized path: direct row access (e.g., MockDataSource)
      const allRows = dataSourceWithRows.getTableRows(query.table) ?? [];
      rowsScanned = allRows.length;
      subrequestTracker.increment(tableMetadata.partitions.length);

      if (!useStreaming && !canEarlyTerminate) {
        // BATCH MODE: For small datasets, use efficient batch filtering
        // Validate columns on first row
        if (allRows.length > 0) {
          validateColumns(allRows[0]);
        }

        // Batch filter all rows at once (more efficient for small datasets)
        if (hasPredicates && predicates) {
          filteredRows = allRows.filter(row => this.matchesAllPredicates(row, predicates));
        } else {
          filteredRows = [...allRows];
        }
      } else {
        // STREAMING MODE: For large datasets or early termination, filter row-by-row
        for (const row of allRows) {
          validateColumns(row);

          // Apply filter immediately
          if (!hasPredicates || this.matchesAllPredicates(row, predicates!)) {
            filteredRows.push(row);
            // Early termination when we have enough rows
            if (filteredRows.length >= earlyTerminateLimit) break;
          }
        }
      }
      memoryTracker.trackRows(filteredRows, 100);
    } else if (!useStreaming) {
      // BATCH MODE: Load all partition data at once, then filter
      // This is faster for small datasets (< 50k rows or < 10MB)
      const allRows: Record<string, unknown>[] = [];

      for (const partition of partitions) {
        checkAbortSignal(signal);
        subrequestTracker.increment();

        const partitionRows = await this.dataSource!.readPartition(partition);
        rowsScanned += partitionRows.length;
        allRows.push(...partitionRows);
      }

      // Validate columns on first row
      if (allRows.length > 0) {
        validateColumns(allRows[0]);
      }

      // Batch filter all rows at once
      if (hasPredicates && predicates) {
        filteredRows = allRows.filter(row => this.matchesAllPredicates(row, predicates));
      } else {
        filteredRows = allRows;
      }

      memoryTracker.trackRows(filteredRows, 100);
    } else {
      // STREAMING MODE: Read from partitions with streaming filter
      // This is the memory-efficient path for 100MB+ datasets
      for (const partition of partitions) {
        checkAbortSignal(signal);
        subrequestTracker.increment();

        const partitionRows = await this.dataSource!.readPartition(partition);
        rowsScanned += partitionRows.length;

        // Stream through partition rows, filtering as we go
        for (const row of partitionRows) {
          validateColumns(row);

          // Apply filter immediately - only keep matching rows in memory
          if (!hasPredicates || this.matchesAllPredicates(row, predicates!)) {
            filteredRows.push(row);
            memoryTracker.add(estimateMemorySize(row));
          }
        }

        // Early termination when we have enough rows (only for simple queries)
        if (filteredRows.length >= earlyTerminateLimit) break;
      }
    }

    checkAbortSignal(signal);

    // rowsScanned was tracked during partition loading above
    const ioTimeMs = Date.now() - ioStart;

    // Aggregations
    if (query.aggregations && query.aggregations.length > 0) {
      checkAbortSignal(signal);
      filteredRows = await this.applyAggregations(filteredRows, query.aggregations, query.groupBy, query.predicates);
      checkAbortSignal(signal);
    }

    // Projection
    if (query.projection) {
      const projection = query.projection;
      filteredRows = filteredRows.map(row => {
        const projected: Record<string, unknown> = {};
        for (const col of projection.columns) {
          setNestedValue(projected, col, getNestedValue(row, col));
        }
        if (projection.includeMetadata) {
          projected._id = row._id;
          projected._version = row._version;
        }
        return projected;
      });
    }

    // Sorting
    if (query.orderBy && query.orderBy.length > 0) {
      filteredRows = this.resultProcessor!.sort(filteredRows, query.orderBy);
    }

    const totalRowCount = filteredRows.length;
    const hasMore = query.limit !== undefined && filteredRows.length > query.limit;

    // Limit/offset
    if (query.limit !== undefined || query.offset !== undefined) {
      const offset = query.offset || 0;
      const limit = query.limit || filteredRows.length;
      filteredRows = filteredRows.slice(offset, offset + limit);
    }

    const executionTimeMs = Date.now() - startTime;
    const bytesRead = partitions.reduce((sum: number, p: PartitionInfo) => sum + p.sizeBytes, 0);
    const totalBlocks = tableMetadata.partitions.length;
    const blocksScanned = partitionsScanned;
    const blocksPruned = partitionsPruned;
    const blockPruneRatio = totalBlocks > 0 ? blocksPruned / totalBlocks : 0;

    return {
      rows: filteredRows as T[],
      columns: query.projection?.columns,
      totalRowCount,
      hasMore,
      stats: {
        executionTimeMs,
        rowsScanned,
        rowsReturned: filteredRows.length,
        bytesRead,
        cacheHitRatio: this.cacheManager!.getStats().hitRatio,
        planningTimeMs,
        ioTimeMs,
        partitionsScanned,
        partitionsPruned,
        zoneMapEffectiveness,
        bloomFilterChecks,
        bloomFilterHits,
        peakMemoryBytes: memoryTracker.getPeakBytes(),
        totalBlocks,
        blocksScanned,
        blocksPruned,
        blockPruneRatio,
        subrequestCount: subrequestTracker.getCount(),
      },
    };
  }

  private convertToInternalQuery(executorQuery: ExecutorQuery): Query {
    return {
      table: executorQuery.table,
      projection: executorQuery.columns ? { columns: executorQuery.columns } : undefined,
      predicates: executorQuery.predicates?.map(p => ({
        column: p.column,
        operator: normalizeOperator(p.operator),
        value: p.value as PredicateValue,
        not: p.not,
      })),
      groupBy: executorQuery.groupBy,
      aggregations: executorQuery.aggregations?.map(a => ({
        function: a.function as Aggregation['function'],
        column: a.column ?? null,
        alias: a.alias,
      })),
      orderBy: executorQuery.orderBy,
      limit: executorQuery.limit,
      offset: executorQuery.offset,
      hints: executorQuery.hints,
    };
  }

  private matchesAllPredicates(row: Record<string, unknown>, predicates: Predicate[]): boolean {
    for (const p of predicates) {
      if (!this.matchesPredicate(row, p)) return false;
    }
    return true;
  }

  private matchesPredicate(row: Record<string, unknown>, predicate: Predicate): boolean {
    const value = getNestedValue(row, predicate.column);
    const filter: CoreFilterPredicate = {
      column: predicate.column,
      operator: predicate.operator,
      value: predicate.value,
      values: Array.isArray(predicate.value) ? predicate.value : undefined,
      not: predicate.not,
    };
    return coreEvaluateFilter(value, filter);
  }

  private async applyAggregations(
    rows: Record<string, unknown>[],
    aggregations: Aggregation[],
    groupBy?: string[],
    predicates?: Predicate[]
  ): Promise<Record<string, unknown>[]> {
    if (groupBy && groupBy.length > 0) {
      const groups = new Map<string, Record<string, unknown>[]>();
      for (const row of rows) {
        const key = groupBy.map(col => String(getNestedValue(row, col))).join('|');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(row);
      }

      const results: Record<string, unknown>[] = [];
      for (const [, groupRows] of groups) {
        const result: Record<string, unknown> = {};
        for (const col of groupBy) result[col] = groupRows[0][col];
        for (const agg of aggregations) result[agg.alias] = this.computeAggregation(groupRows, agg);
        results.push(result);
      }

      if (predicates) {
        const havingPredicates = predicates.filter(p => aggregations.some(a => a.alias === p.column));
        if (havingPredicates.length > 0) {
          return results.filter(row => this.matchesAllPredicates(row, havingPredicates));
        }
      }
      return results;
    } else {
      const result: Record<string, unknown> = {};
      for (const agg of aggregations) result[agg.alias] = this.computeAggregation(rows, agg);
      return [result];
    }
  }

  private computeAggregation(rows: Record<string, unknown>[], agg: Aggregation): unknown {
    switch (agg.function) {
      case 'count':
        if (agg.column === null) return rows.length;
        return rows.filter(r => getNestedValue(r, agg.column!) !== null).length;
      case 'countDistinct':
        if (agg.column === null) return rows.length;
        return new Set(rows.map(r => getNestedValue(r, agg.column!))).size;
      case 'sum':
        if (!agg.column) return 0;
        return rows.reduce((sum, r) => {
          const val = getNestedValue(r, agg.column!) as number;
          return sum + (typeof val === 'number' ? val : 0);
        }, 0);
      case 'avg':
        if (!agg.column) return 0;
        const avgVals = rows.map(r => getNestedValue(r, agg.column!) as number).filter(v => typeof v === 'number');
        return avgVals.length > 0 ? avgVals.reduce((a, b) => a + b, 0) / avgVals.length : 0;
      case 'min':
        if (!agg.column) return null;
        let minVal: unknown = undefined;
        for (const r of rows) {
          const val = getNestedValue(r, agg.column);
          if (val !== null && val !== undefined && (minVal === undefined || coreCompareValues(val, minVal) < 0)) {
            minVal = val;
          }
        }
        return minVal;
      case 'max':
        if (!agg.column) return null;
        let maxVal: unknown = undefined;
        for (const r of rows) {
          const val = getNestedValue(r, agg.column);
          if (val !== null && val !== undefined && (maxVal === undefined || coreCompareValues(val, maxVal) > 0)) {
            maxVal = val;
          }
        }
        return maxVal;
      default:
        return null;
    }
  }

  async explain(executorQuery: ExecutorQuery): Promise<ExecutorPlan> {
    if (this.mode === 'simple') {
      const table = await this.getTableMetadata(executorQuery.table);
      const rowCount = table.rowCount;
      const blockCount = table.blockPaths.length;
      const estimatedBytes = blockCount * 100 * 1024;

      let outputRows = rowCount;
      if (executorQuery.predicates && executorQuery.predicates.length > 0) {
        outputRows = Math.floor(rowCount * Math.pow(0.5, executorQuery.predicates.length));
      }
      if (executorQuery.limit) outputRows = Math.min(outputRows, executorQuery.limit);

      return {
        planId: `unified-simple-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        query: executorQuery,
        estimatedCost: {
          rowsToScan: rowCount,
          bytesToRead: estimatedBytes,
          outputRows,
          totalCost: rowCount * 0.001 + estimatedBytes * 0.0001,
        },
        createdAt: Date.now(),
        description: `Simple scan ${blockCount} blocks from table "${executorQuery.table}" (${rowCount} rows)`,
        partitionsSelected: blockCount,
        partitionsPruned: 0,
        usesZoneMaps: false,
        usesBloomFilters: false,
      };
    } else {
      const query = this.convertToInternalQuery(executorQuery);
      const plan: QueryPlan = await this.planner!.createPlan(query);

      return {
        planId: plan.planId,
        query: executorQuery,
        estimatedCost: {
          rowsToScan: plan.estimatedCost.rowsToScan,
          bytesToRead: plan.estimatedCost.bytesToRead,
          outputRows: plan.estimatedCost.outputRows,
          totalCost: plan.estimatedCost.totalCost,
        },
        createdAt: plan.createdAt,
        description: `Full query plan for "${executorQuery.table}" using ${plan.usesZoneMaps ? 'zone maps' : 'full scan'}`,
        planTree: plan.rootOperator,
        partitionsSelected: plan.selectedPartitions.length,
        partitionsPruned: plan.prunedPartitions.length,
        usesZoneMaps: plan.usesZoneMaps,
        usesBloomFilters: plan.usesBloomFilters,
      };
    }
  }

  async executeStream<T = Record<string, unknown>>(
    executorQuery: ExecutorQuery,
    options?: QueryExecutionOptions
  ): Promise<StreamingExecutorResult<T>> {
    if (this.mode === 'simple') {
      throw new Error('executeStream() is only available in full mode');
    }

    const signal = options?.signal;
    checkAbortSignal(signal);

    const query = this.convertToInternalQuery(executorQuery);
    validateQueryColumns(query);

    const subrequestTracker = this.createSubrequestTracker();
    const tableMetadata = await this.dataSource!.getTableMetadata(query.table);
    checkAbortSignal(signal);

    if (!tableMetadata) throw new Error(`Table not found: ${query.table}`);

    subrequestTracker.checkBudget(tableMetadata.partitions.length);

    const dataSourceWithRows = this.dataSource as TableDataSource & {
      getTableRows?: (table: string) => Record<string, unknown>[] | null;
    };

    let rows: Record<string, unknown>[];
    if (dataSourceWithRows.getTableRows) {
      rows = dataSourceWithRows.getTableRows(query.table) ?? [];
      subrequestTracker.increment(tableMetadata.partitions.length);
    } else {
      rows = [];
      for (const partition of tableMetadata.partitions) {
        checkAbortSignal(signal);
        subrequestTracker.increment();
        const partitionRows = await this.dataSource!.readPartition(partition);
        rows.push(...partitionRows);
      }
    }

    checkAbortSignal(signal);

    if (query.predicates && query.predicates.length > 0) {
      const predicates = query.predicates;
      rows = rows.filter(row => this.matchesAllPredicates(row, predicates));
    }

    if (query.orderBy && query.orderBy.length > 0) {
      rows = this.resultProcessor!.sort(rows, query.orderBy);
    }

    if (query.limit !== undefined) rows = rows.slice(0, query.limit);

    let running = true;
    let rowCount = 0;
    const startTime = Date.now();
    let currentIndex = 0;

    const abortHandler = () => { running = false; };
    signal?.addEventListener('abort', abortHandler, { once: true });

    const rowIterator: AsyncIterableIterator<T> = {
      [Symbol.asyncIterator]() { return this; },
      async next(): Promise<IteratorResult<T>> {
        if (signal?.aborted) { running = false; return { done: true, value: undefined }; }
        if (!running || currentIndex >= rows.length) {
          running = false;
          signal?.removeEventListener('abort', abortHandler);
          return { done: true, value: undefined };
        }
        rowCount++;
        return { done: false, value: rows[currentIndex++] as T };
      },
    };

    const partitionsForStats = tableMetadata.partitions;
    const subrequestCountForStats = subrequestTracker.getCount();

    return {
      rows: rowIterator,
      async getStats(): Promise<ExecutorStats> {
        return {
          executionTimeMs: Date.now() - startTime,
          rowsScanned: rowCount,
          rowsReturned: rowCount,
          bytesRead: partitionsForStats.reduce((sum: number, p: PartitionInfo) => sum + p.sizeBytes, 0),
          cacheHitRatio: 0,
          totalBlocks: partitionsForStats.length,
          blocksScanned: partitionsForStats.length,
          blocksPruned: 0,
          blockPruneRatio: 0,
          subrequestCount: subrequestCountForStats,
        };
      },
      cancel: async () => { running = false; signal?.removeEventListener('abort', abortHandler); },
      isRunning: () => running,
    };
  }

  getCacheStats(): ExecutorCacheStats {
    if (this.mode === 'simple') {
      const stats = this.simpleCache!.getStats();
      return {
        hits: stats.hits,
        misses: stats.misses,
        bytesFromCache: stats.bytesServedFromCache,
        bytesFromStorage: stats.bytesReadFromR2,
        hitRatio: stats.hits + stats.misses > 0 ? stats.hits / (stats.hits + stats.misses) : 0,
      };
    } else {
      const stats = this.cacheManager!.getStats();
      return {
        hits: stats.hits,
        misses: stats.misses,
        bytesFromCache: stats.bytesFromCache,
        bytesFromStorage: stats.bytesFromR2,
        hitRatio: stats.hitRatio,
      };
    }
  }

  async clearCache(): Promise<void> {
    if (this.mode === 'simple') this.simpleCache!.resetStats();
    else await this.cacheManager!.clear();
  }

  async invalidateCache(paths: string[]): Promise<void> {
    if (this.mode === 'simple') this.simpleCache!.resetStats();
    else await this.cacheManager!.invalidate(paths);
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

export function createSimpleUnifiedEngine(config: Omit<UnifiedQueryEngineConfig, 'mode'>): UnifiedQueryEngine {
  return new UnifiedQueryEngine({ ...config, mode: 'simple' });
}

export function createFullUnifiedEngine(config: Omit<UnifiedQueryEngineConfig, 'mode'>): UnifiedQueryEngine {
  return new UnifiedQueryEngine({ ...config, mode: 'full' });
}

export function createUnifiedQueryEngine(config: UnifiedQueryEngineConfig): UnifiedQueryEngine {
  return new UnifiedQueryEngine(config);
}
