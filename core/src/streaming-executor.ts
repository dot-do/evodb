/**
 * @evodb/core - Streaming Query Executor Implementation
 *
 * Implements the StreamingQueryExecutor interface to provide true streaming
 * capabilities for large query result sets. This bridges the gap between
 * the streaming infrastructure and the QueryExecutor interface.
 *
 * Issue: evodb-lh2l - TDD: Implement true streaming for large result sets
 *
 * @example
 * ```typescript
 * import { createStreamingQueryExecutor, isStreamingExecutor } from '@evodb/core';
 *
 * const executor = createStreamingQueryExecutor({
 *   dataReader: async (offset, limit) => fetchFromStorage(offset, limit),
 *   batchSize: 1000,
 *   bufferLimit: 5000,
 * });
 *
 * // Stream large results
 * const result = await executor.executeStream({ table: 'large_table' });
 * for await (const row of result.rows) {
 *   await processRow(row);
 * }
 *
 * // Get stats after completion
 * const stats = await result.getStats();
 * console.log(`Processed ${stats.rowsReturned} rows`);
 * ```
 */

import {
  type StreamingQueryExecutor,
  type StreamingExecutorResult,
  type ExecutorQuery,
  type ExecutorResult,
  type ExecutorPlan,
  type ExecutorStats,
  type ExecutorPredicate,
} from './query-executor.js';
import {
  createStreamingQuery,
  StreamingCancelledError,
  type StreamingQuery,
  type StreamingStats,
} from './streaming.js';
import { captureStackTrace } from './stack-trace.js';

// =============================================================================
// Types and Interfaces
// =============================================================================

/**
 * Configuration options for the streaming query executor
 */
export interface StreamingQueryExecutorConfig<T = Record<string, unknown>> {
  /**
   * Async function that reads data from the underlying storage.
   * Should return null or empty array when no more data is available.
   * @param offset - Starting offset for the chunk
   * @param limit - Maximum number of items to fetch
   */
  dataReader: (offset: number, limit: number) => Promise<T[] | null>;

  /**
   * Number of rows to fetch per batch (default: 1000)
   */
  batchSize?: number;

  /**
   * Maximum number of rows to buffer before applying backpressure (default: 5000)
   */
  bufferLimit?: number;

  /**
   * High water mark for backpressure (default: 80% of bufferLimit)
   */
  highWaterMark?: number;

  /**
   * Low water mark for resuming after backpressure (default: 20% of bufferLimit)
   */
  lowWaterMark?: number;

  /**
   * Optional schema information for type validation
   */
  schema?: {
    columns: string[];
    types?: Record<string, string>;
  };

  /**
   * Called when a chunk is fetched (for monitoring)
   */
  onChunkFetched?: (chunkSize: number, totalFetched: number) => void;

  /**
   * Called when an error occurs (before throwing)
   */
  onError?: (error: Error) => void;
}

// =============================================================================
// Default Constants
// =============================================================================

const DEFAULT_BATCH_SIZE = 1000;
const DEFAULT_BUFFER_LIMIT = 5000;
const DEFAULT_HIGH_WATER_RATIO = 0.8;
const DEFAULT_LOW_WATER_RATIO = 0.2;

// =============================================================================
// Predicate Evaluation
// =============================================================================

/**
 * Evaluate a single predicate against a row
 */
function evaluatePredicate(row: Record<string, unknown>, predicate: ExecutorPredicate): boolean {
  const { column, operator, value, values, lowerBound, upperBound, not = false } = predicate;

  // Get the value from the row (supports nested paths with dot notation)
  const rowValue = getNestedValue(row, column);

  let result: boolean;

  switch (operator) {
    case 'eq':
      result = rowValue === value;
      break;
    case 'ne':
      result = rowValue !== value;
      break;
    case 'gt':
      result = rowValue !== null && rowValue !== undefined && (rowValue as number) > (value as number);
      break;
    case 'gte':
    case 'ge':
      result = rowValue !== null && rowValue !== undefined && (rowValue as number) >= (value as number);
      break;
    case 'lt':
      result = rowValue !== null && rowValue !== undefined && (rowValue as number) < (value as number);
      break;
    case 'lte':
    case 'le':
      result = rowValue !== null && rowValue !== undefined && (rowValue as number) <= (value as number);
      break;
    case 'in':
      result = values ? values.includes(rowValue) : false;
      break;
    case 'notIn':
      result = values ? !values.includes(rowValue) : true;
      break;
    case 'between':
      result = rowValue !== null && rowValue !== undefined &&
               (rowValue as number) >= (lowerBound as number) &&
               (rowValue as number) <= (upperBound as number);
      break;
    case 'like':
      if (typeof rowValue !== 'string' || typeof value !== 'string') {
        result = false;
      } else {
        // Simple LIKE pattern matching (% as wildcard)
        const pattern = value.replace(/%/g, '.*').replace(/_/g, '.');
        const regex = new RegExp(`^${pattern}$`, 'i');
        result = regex.test(rowValue);
      }
      break;
    case 'isNull':
      result = rowValue === null || rowValue === undefined;
      break;
    case 'isNotNull':
      result = rowValue !== null && rowValue !== undefined;
      break;
    default:
      result = true;
  }

  return not ? !result : result;
}

/**
 * Get a nested value from an object using dot notation
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Apply all predicates to filter a row
 */
function applyPredicates(row: Record<string, unknown>, predicates: ExecutorPredicate[]): boolean {
  return predicates.every(p => evaluatePredicate(row, p));
}

/**
 * Apply column projection to a row
 */
function projectColumns<T extends Record<string, unknown>>(
  row: T,
  columns: string[]
): Partial<T> {
  const result: Partial<T> = {};
  for (const col of columns) {
    if (col in row) {
      (result as Record<string, unknown>)[col] = row[col];
    }
  }
  return result;
}

// =============================================================================
// Streaming Executor Result Implementation
// =============================================================================

/**
 * Implementation of StreamingExecutorResult
 */
class StreamingExecutorResultImpl<T> implements StreamingExecutorResult<T> {
  private query: StreamingQuery<T>;
  private _isRunning = true;
  private startTime: number;
  private rowsReturned = 0;
  private statsPromiseResolvers: Array<(stats: ExecutorStats) => void> = [];
  private finalStats: ExecutorStats | null = null;

  constructor(query: StreamingQuery<T>) {
    this.query = query;
    this.startTime = performance.now();
  }

  get rows(): AsyncIterableIterator<T> {
    return this.createRowIterator();
  }

  private async *createRowIterator(): AsyncIterableIterator<T> {
    try {
      for await (const row of this.query) {
        this.rowsReturned++;
        yield row;
      }
    } finally {
      this._isRunning = false;
      this.completeFinalStats();
    }
  }

  async getStats(): Promise<ExecutorStats> {
    if (this.finalStats) {
      return this.finalStats;
    }

    if (!this._isRunning) {
      this.completeFinalStats();
      return this.finalStats!;
    }

    return new Promise(resolve => {
      this.statsPromiseResolvers.push(resolve);
    });
  }

  async cancel(): Promise<void> {
    this.query.cancel();
    this._isRunning = false;
    this.completeFinalStats();
  }

  isRunning(): boolean {
    return this._isRunning;
  }

  private completeFinalStats(): void {
    if (this.finalStats) return;

    const streamStats = this.query.getStats();

    this.finalStats = {
      executionTimeMs: performance.now() - this.startTime,
      rowsScanned: streamStats.totalFetched,
      rowsReturned: this.rowsReturned,
    };

    for (const resolver of this.statsPromiseResolvers) {
      resolver(this.finalStats);
    }
    this.statsPromiseResolvers = [];
  }
}

// =============================================================================
// Streaming Query Executor Implementation
// =============================================================================

/**
 * Create a streaming query executor
 */
export function createStreamingQueryExecutor<T extends Record<string, unknown> = Record<string, unknown>>(
  config: StreamingQueryExecutorConfig<T>
): StreamingQueryExecutor {
  const {
    dataReader,
    batchSize = DEFAULT_BATCH_SIZE,
    bufferLimit = DEFAULT_BUFFER_LIMIT,
    highWaterMark = Math.floor(bufferLimit * DEFAULT_HIGH_WATER_RATIO),
    lowWaterMark = Math.floor(bufferLimit * DEFAULT_LOW_WATER_RATIO),
    schema,
    onChunkFetched,
    onError,
  } = config;

  /**
   * Create a filtered/projected data source based on query
   */
  function createQuerySource(query: ExecutorQuery): (offset: number, limit: number) => Promise<T[] | null> {
    const { predicates, columns, offset: queryOffset = 0, limit: queryLimit } = query;
    let totalSkipped = 0;
    let totalReturned = 0;
    let sourceOffset = 0;

    return async (batchOffset: number, batchLimit: number): Promise<T[] | null> => {
      // If we've already returned the limit, we're done
      if (queryLimit !== undefined && totalReturned >= queryLimit) {
        return null;
      }

      // Read from underlying source
      const rawData = await dataReader(sourceOffset, batchLimit);
      sourceOffset += batchLimit;

      if (!rawData || rawData.length === 0) {
        return null;
      }

      let results: T[] = rawData;

      // Apply predicates (filter)
      if (predicates && predicates.length > 0) {
        results = results.filter(row => applyPredicates(row, predicates));
      }

      // Apply offset (skip)
      if (queryOffset > 0 && totalSkipped < queryOffset) {
        const toSkip = Math.min(results.length, queryOffset - totalSkipped);
        totalSkipped += toSkip;
        results = results.slice(toSkip);
      }

      // Apply limit
      if (queryLimit !== undefined) {
        const remaining = queryLimit - totalReturned;
        if (results.length > remaining) {
          results = results.slice(0, remaining);
        }
      }

      totalReturned += results.length;

      // Apply column projection
      if (columns && columns.length > 0) {
        results = results.map(row => projectColumns(row, columns) as T);
      }

      return results.length > 0 ? results : null;
    };
  }

  /**
   * Execute a streaming query
   */
  async function executeStream<R = T>(query: ExecutorQuery): Promise<StreamingExecutorResult<R>> {
    const source = createQuerySource(query);

    const streamingQuery = createStreamingQuery<T>({
      source,
      batchSize,
      bufferLimit,
      highWaterMark,
      lowWaterMark,
      onChunkFetched,
      onError,
    });

    return new StreamingExecutorResultImpl(streamingQuery) as unknown as StreamingExecutorResult<R>;
  }

  /**
   * Execute a query and return all results (non-streaming)
   */
  async function execute<R = T>(query: ExecutorQuery): Promise<ExecutorResult<R>> {
    const startTime = performance.now();

    const result = await executeStream<R>(query);

    const rows: R[] = [];
    for await (const row of result.rows) {
      rows.push(row);
    }

    const stats = await result.getStats();

    return {
      rows,
      columns: query.columns,
      stats: {
        ...stats,
        executionTimeMs: performance.now() - startTime,
      },
    };
  }

  /**
   * Explain the query execution plan
   */
  async function explain(query: ExecutorQuery): Promise<ExecutorPlan> {
    const predicateCount = query.predicates?.length ?? 0;
    const hasProjection = query.columns && query.columns.length > 0;
    const hasLimit = query.limit !== undefined;
    const hasOffset = query.offset !== undefined;

    // Simple cost estimation
    const baseCost = 1000; // Assume base row count
    let estimatedRows = baseCost;

    // Predicates reduce estimated rows
    if (predicateCount > 0) {
      estimatedRows = Math.floor(estimatedRows * Math.pow(0.5, predicateCount));
    }

    // Limit caps estimated output
    if (hasLimit && query.limit! < estimatedRows) {
      estimatedRows = query.limit!;
    }

    const bytesPerRow = 200; // Estimated average row size

    return {
      planId: `plan-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      query,
      estimatedCost: {
        rowsToScan: baseCost,
        bytesToRead: baseCost * bytesPerRow,
        outputRows: estimatedRows,
        totalCost: baseCost + (predicateCount * 10) + (hasProjection ? 5 : 0),
      },
      createdAt: Date.now(),
      description: [
        `Streaming scan of ${query.table}`,
        predicateCount > 0 ? `with ${predicateCount} predicate(s)` : '',
        hasProjection ? `projecting ${query.columns!.length} column(s)` : '',
        hasLimit ? `limit ${query.limit}` : '',
        hasOffset ? `offset ${query.offset}` : '',
      ].filter(Boolean).join(' '),
    };
  }

  return {
    execute,
    explain,
    executeStream,
  };
}

// =============================================================================
// Re-exports for convenience
// =============================================================================

export {
  type StreamingQueryExecutor,
  type StreamingExecutorResult,
  type ExecutorQuery,
  type ExecutorResult,
  type ExecutorStats,
  isStreamingExecutor,
} from './query-executor.js';
