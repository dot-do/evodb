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
  QueryResult,
  QueryStats,
  BlockScanRequest,
  BlockScanResult,
  TableMetadata,
  ColumnSchema,
  ColumnType,
  R2Bucket,
  R2Object,
  ReaderConfig,
  ReaderEnv,
} from './types.js';

import type {
  CacheStats,
  QueryRequest,
  QueryResult,
  QueryStats,
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
  type BlockData,
  type BlockDataValidationResult,
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
};
export type { BlockData, BlockDataValidationResult };

/**
 * Manifest structure
 */
interface Manifest {
  version: number;
  tables: Record<string, TableMetadata>;
}

/**
 * Query engine for reading data from R2 with Cache API tier
 */
export class QueryEngine {
  private readonly config: ReaderConfig;
  private readonly cache: CacheTier;
  private manifest: Manifest | null = null;
  private readonly maxConcurrentReads: number;

  constructor(config: ReaderConfig) {
    this.config = config;
    this.cache = new CacheTier(config.cache);
    this.maxConcurrentReads = config.maxConcurrentReads ?? 4;
  }

  /**
   * Load manifest from R2
   */
  private async loadManifest(): Promise<Manifest> {
    if (this.manifest) {
      return this.manifest;
    }

    const object = await this.config.bucket.get('manifest.json');
    if (!object) {
      throw new Error('Manifest not found');
    }

    this.manifest = await object.json<Manifest>();
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
    const { data: buffer, fromCache } = await this.cache.get(
      this.config.bucket,
      request.blockPath
    );

    // Parse and validate block data
    const { data: blockData, rowCount: totalRows } = parseAndValidateBlockData(
      buffer,
      request.blockPath
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
  async query(request: QueryRequest): Promise<QueryResult> {
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

          // Parse and validate block data
          const { data: blockData, rowCount } = parseAndValidateBlockData(
            buffer,
            blockPath
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

    const stats: QueryStats = {
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
