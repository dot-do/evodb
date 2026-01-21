/**
 * @evodb/reader - Worker-based query engine
 * Reads from R2 via manifest, uses Cache API (FREE) for hot data
 *
 * Uses shared query operations from @evodb/core for filter evaluation,
 * sorting, and aggregation to ensure consistency with @evodb/query.
 */

// Re-export types
export type {
  CacheTierConfig,
  CacheStats,
  FilterOperator,
  FilterPredicate,
  SortDirection,
  SortSpec,
  AggregateFunction,
  AggregateSpec,
  QueryRequest,
  // Reader-specific result types (internal format)
  ReaderQueryResult,
  ReaderQueryStats,
  // Backward compatibility aliases (deprecated)
  QueryResult,
  QueryStats,
  BlockScanRequest,
  BlockScanResult,
  TableMetadata,
  ColumnSchema,
  ColumnType,
  R2Bucket,
  R2Object,
  R2ListOptions,
  R2Objects,
  ReaderConfig,
  ReaderEnv,
} from './types.js';

import type {
  CacheStats,
  QueryRequest,
  ReaderQueryResult,
  ReaderQueryStats,
  BlockScanRequest,
  BlockScanResult,
  TableMetadata,
  ReaderConfig,
  FilterPredicate,
  SortSpec,
  AggregateSpec,
} from './types.js';

// Import shared query operations from @evodb/core
import {
  evaluateFilter as coreEvaluateFilter,
  sortRows as coreSortRows,
  computeAggregations as coreComputeAggregations,
  validateColumnName,
  type FilterPredicate as CoreFilterPredicate,
  type SortSpec as CoreSortSpec,
  type AggregateSpec as CoreAggregateSpec,
} from '@evodb/core';

import {
  CacheTier,
  createCacheTierFromEnv,
  type CacheErrorType,
  type CacheGetResult,
  type CachePutResult,
  type CacheInvalidateResult,
  type CacheErrorContext,
  type CacheErrorCallback,
  type ExtendedCacheTierConfig,
  type CacheErrorStats,
} from './cache.js';
import {
  parseAndValidateBlockData,
  validateBlockData,
  isValidBlockData,
  BlockDataValidationError,
  BlockDataValidationErrorCode,
  validateManifest,
  validateTableMetadata,
  ManifestValidationError,
  ManifestValidationErrorCode,
  isValidManifest,
  validateBlockSize,
  BlockSizeValidationError,
  BlockSizeValidationErrorCode,
  isBlockSizeValidationError,
  DEFAULT_MAX_BLOCK_SIZE,
  type BlockData,
  type BlockDataValidationResult,
  type ValidatedManifest,
  type ValidatedTableMetadata,
  type BlockSizeValidationOptions,
  type BlockSizeValidationErrorDetails,
} from './validation.js';

// Re-export cache utilities and types
export { CacheTier, createCacheTierFromEnv };
export type {
  CacheErrorType,
  CacheGetResult,
  CachePutResult,
  CacheInvalidateResult,
  CacheErrorContext,
  CacheErrorCallback,
  ExtendedCacheTierConfig,
  CacheErrorStats,
};

// Re-export validation utilities
export {
  BlockDataValidationError,
  BlockDataValidationErrorCode,
  parseAndValidateBlockData,
  validateBlockData,
  isValidBlockData,
  ManifestValidationError,
  ManifestValidationErrorCode,
  validateManifest,
  validateTableMetadata,
  isValidManifest,
  // Block size validation (DoS protection)
  validateBlockSize,
  BlockSizeValidationError,
  BlockSizeValidationErrorCode,
  isBlockSizeValidationError,
  DEFAULT_MAX_BLOCK_SIZE,
};
export type {
  BlockData,
  BlockDataValidationResult,
  ValidatedManifest,
  ValidatedTableMetadata,
  BlockSizeValidationOptions,
  BlockSizeValidationErrorDetails,
};

/**
 * Manifest structure - uses ValidatedManifest from validation module
 */
type Manifest = ValidatedManifest;

/**
 * Query engine for reading data from R2 with Cache API tier
 */
export class QueryEngine {
  private readonly config: ReaderConfig;
  private readonly cache: CacheTier;
  private manifest: Manifest | null = null;
  private readonly maxConcurrentReads: number;
  private readonly maxBlockSize: number;

  constructor(config: ReaderConfig) {
    this.config = config;
    this.cache = new CacheTier(config.cache);
    this.maxConcurrentReads = config.maxConcurrentReads ?? 4;
    this.maxBlockSize = config.maxBlockSize ?? DEFAULT_MAX_BLOCK_SIZE;
  }

  /**
   * Load manifest from R2 with runtime validation
   */
  private async loadManifest(): Promise<Manifest> {
    if (this.manifest) {
      return this.manifest;
    }

    const object = await this.config.bucket.get('manifest.json');
    if (!object) {
      throw new Error('Manifest not found');
    }

    // Parse JSON and validate the manifest structure
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
  async getTableMetadata(tableName: string): Promise<TableMetadata> {
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
  async scanBlock(request: BlockScanRequest): Promise<BlockScanResult> {
    // Validate filter column names to prevent injection attacks
    if (request.filters) {
      for (const filter of request.filters) {
        validateColumnName(filter.column);
      }
    }

    const { data: buffer, fromCache } = await this.cache.get(
      this.config.bucket,
      request.blockPath
    );

    // Parse and validate block data (with DoS protection via maxBlockSize)
    const { data: blockData, rowCount: totalRows } = parseAndValidateBlockData(
      buffer,
      request.blockPath,
      { maxBlockSize: this.maxBlockSize }
    );

    // Determine which rows to include based on filters
    const includedRows: number[] = [];
    for (let i = 0; i < totalRows; i++) {
      if (this.rowPassesFilters(blockData, i, request.filters)) {
        includedRows.push(i);
      }
    }

    // Build result data with only requested columns
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
   * Execute a query against the data
   */
  async query(request: QueryRequest): Promise<ReaderQueryResult> {
    const startTime = Date.now();

    // Handle timeout
    if (request.timeoutMs !== undefined && request.timeoutMs <= 0) {
      throw new Error('Query timeout');
    }

    // Load manifest and get table metadata
    const manifest = await this.loadManifest();
    const table = manifest.tables[request.table];
    if (!table) {
      throw new Error(`Table not found: ${request.table}`);
    }

    // Validate columns
    const tableColumnNames = table.schema.map((s) => s.name);
    const requestedColumns = request.columns || tableColumnNames;

    for (const col of requestedColumns) {
      if (!tableColumnNames.includes(col)) {
        throw new Error(`Column not found: ${col}`);
      }
    }

    // Validate filter operators and column names
    if (request.filters) {
      const validOperators = [
        'eq', 'ne', 'lt', 'le', 'gt', 'ge', 'in', 'notIn',
        'isNull', 'isNotNull', 'like', 'between'
      ];
      for (const filter of request.filters) {
        if (!validOperators.includes(filter.operator)) {
          throw new Error(`Invalid filter operator: ${filter.operator}`);
        }
        // Validate column name to prevent injection attacks
        validateColumnName(filter.column);
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

    // Determine columns to read (we need all columns that are referenced)
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

    // Read blocks in parallel (with concurrency limit)
    const blockPaths = table.blockPaths;
    let blocksScanned = 0;
    let rowsScanned = 0;
    let bytesFromR2 = 0;
    let bytesFromCache = 0;

    // Collect all rows from all blocks
    const allRows: Record<string, unknown>[] = [];

    // Read blocks (up to maxConcurrentReads at a time)
    for (let i = 0; i < blockPaths.length; i += this.maxConcurrentReads) {
      const batch = blockPaths.slice(i, i + this.maxConcurrentReads);
      const results = await Promise.all(
        batch.map(async (blockPath) => {
          const { data: buffer, fromCache } = await this.cache.get(
            this.config.bucket,
            blockPath
          );

          // Parse and validate block data (with DoS protection via maxBlockSize)
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

        // Convert columnar data to row format, applying filters
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
      // No aggregations - use requested columns
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

    const stats: ReaderQueryStats = {
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
    filters?: FilterPredicate[]
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
  private evaluateFilter(value: unknown, filter: FilterPredicate): boolean {
    // Convert to core FilterPredicate format
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
   * Sort rows by multiple columns using shared implementation from @evodb/core
   */
  private sortRows(rows: Record<string, unknown>[], orderBy: SortSpec[]): void {
    // Convert to core SortSpec format and use shared implementation
    const coreOrderBy: CoreSortSpec[] = orderBy.map(spec => ({
      column: spec.column,
      direction: spec.direction,
      nullsFirst: spec.nullsFirst,
    }));

    // Sort in place by replacing array contents
    const sorted = coreSortRows(rows, coreOrderBy);
    rows.length = 0;
    rows.push(...sorted);
  }

  /**
   * Compute aggregations on rows using shared implementation from @evodb/core
   */
  private computeAggregations(
    rows: Record<string, unknown>[],
    aggregates: AggregateSpec[],
    groupBy?: string[]
  ): { columns: string[]; rows: unknown[][] } {
    // Convert to core AggregateSpec format
    const coreAggregates: CoreAggregateSpec[] = aggregates.map(agg => ({
      function: agg.function,
      column: agg.column,
      alias: agg.alias,
    }));

    // Use shared implementation from @evodb/core
    return coreComputeAggregations(rows, coreAggregates, groupBy);
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): CacheStats {
    return this.cache.getStats();
  }

  /**
   * Reset cache statistics
   */
  resetCacheStats(): void {
    this.cache.resetStats();
  }
}

/**
 * Create a new query engine instance
 */
export function createQueryEngine(config: ReaderConfig): QueryEngine {
  return new QueryEngine(config);
}

// =============================================================================
// QueryExecutor Interface Implementation
// =============================================================================

// Re-export QueryExecutor interface types from @evodb/core
export type {
  QueryExecutor,
  CacheableQueryExecutor,
  ExecutorQuery,
  ExecutorResult,
  ExecutorStats,
  ExecutorPlan,
  ExecutorCost,
  ExecutorCacheStats,
} from '@evodb/core';

import type {
  CacheableQueryExecutor,
  ExecutorQuery,
  ExecutorResult,
  ExecutorStats,
  ExecutorPlan,
  ExecutorCost,
  ExecutorCacheStats,
} from '@evodb/core';
import { toReaderQueryRequest } from '@evodb/core';

/**
 * QueryExecutorAdapter wraps a QueryEngine to provide the unified QueryExecutor interface.
 *
 * This adapter allows @evodb/reader's QueryEngine to be used interchangeably with
 * @evodb/query's QueryEngine when only basic query execution is needed.
 *
 * @example
 * ```typescript
 * import { createQueryEngine, QueryExecutorAdapter } from '@evodb/reader';
 *
 * const reader = createQueryEngine({ bucket: env.R2_BUCKET });
 * const executor: QueryExecutor = new QueryExecutorAdapter(reader);
 *
 * // Use unified interface
 * const result = await executor.execute({
 *   table: 'users',
 *   predicates: [{ column: 'status', operator: 'eq', value: 'active' }],
 *   columns: ['id', 'name'],
 *   limit: 100,
 * });
 * ```
 */
export class QueryExecutorAdapter implements CacheableQueryExecutor {
  private readonly engine: QueryEngine;

  constructor(engine: QueryEngine) {
    this.engine = engine;
  }

  /**
   * Execute a query using the unified QueryExecutor interface.
   */
  async execute<T = Record<string, unknown>>(
    executorQuery: ExecutorQuery
  ): Promise<ExecutorResult<T>> {
    // Convert ExecutorQuery to internal QueryRequest format
    const converted = toReaderQueryRequest(executorQuery);
    const request: QueryRequest = {
      table: converted.table,
      columns: converted.columns,
      filters: converted.filters?.map(f => ({
        column: f.column,
        operator: f.operator as FilterPredicate['operator'],
        value: f.value,
        values: f.values,
        lowerBound: f.lowerBound,
        upperBound: f.upperBound,
      })),
      groupBy: converted.groupBy,
      aggregates: converted.aggregates?.map(a => ({
        function: a.function as AggregateSpec['function'],
        column: a.column,
        alias: a.alias,
      })),
      orderBy: converted.orderBy?.map(o => ({
        column: o.column,
        direction: o.direction,
        nullsFirst: o.nullsFirst,
      })),
      limit: converted.limit,
      offset: converted.offset,
      timeoutMs: converted.timeoutMs,
    };

    // Execute query using internal method
    const result = await this.engine.query(request);

    // Convert internal QueryResult to ExecutorResult format
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
    const table = await this.engine.getTableMetadata(executorQuery.table);
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
      planId: `reader-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
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
   * Get cache statistics in the unified ExecutorCacheStats format.
   */
  getCacheStats(): ExecutorCacheStats {
    const stats = this.engine.getCacheStats();
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
   * Clear the query cache.
   */
  async clearCache(): Promise<void> {
    this.engine.resetCacheStats();
  }

  /**
   * Invalidate specific cache entries.
   */
  async invalidateCache(paths: string[]): Promise<void> {
    if (paths.length > 0) {
      this.engine.resetCacheStats();
    }
  }
}

/**
 * Create a QueryExecutor adapter from a ReaderConfig.
 *
 * This is a convenience function that creates both the QueryEngine
 * and wraps it in a QueryExecutorAdapter.
 *
 * @example
 * ```typescript
 * import { createQueryExecutor, type QueryExecutor } from '@evodb/reader';
 *
 * const executor: QueryExecutor = createQueryExecutor({ bucket: env.R2_BUCKET });
 * const result = await executor.execute({ table: 'users', limit: 10 });
 * ```
 */
export function createQueryExecutor(config: ReaderConfig): QueryExecutorAdapter {
  const engine = new QueryEngine(config);
  return new QueryExecutorAdapter(engine);
}
