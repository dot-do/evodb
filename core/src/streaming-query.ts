/**
 * @evodb/core - Streaming Query Interface
 *
 * Advanced streaming query result interface for processing large result sets
 * without loading everything into memory. Builds on the streaming primitives
 * from streaming.ts to provide query-specific streaming capabilities.
 *
 * Key Features:
 * - Partition-level streaming with lazy loading
 * - Configurable backpressure with high/low water marks
 * - Memory-bounded processing with automatic spilling
 * - Async iterators with proper cancellation support
 * - Pipeline operators for streaming transformations
 *
 * Issue: evodb-9yyz - Implement Streaming Architecture for Large Result Sets
 *
 * @example
 * ```typescript
 * import {
 *   createPartitionStreamingQuery,
 *   StreamingQueryPipeline,
 * } from '@evodb/core';
 *
 * // Stream through partitions without loading all into memory
 * const stream = createPartitionStreamingQuery({
 *   partitions,
 *   readPartition: async (partition) => readFromR2(partition),
 *   batchSize: 1000,
 *   bufferLimit: 5000,
 *   memoryLimitBytes: 256 * 1024 * 1024,
 * });
 *
 * // Use pipeline operators for streaming transformations
 * const pipeline = new StreamingQueryPipeline(stream)
 *   .filter(row => row.status === 'active')
 *   .map(row => ({ ...row, processedAt: Date.now() }))
 *   .take(1000);
 *
 * for await (const row of pipeline) {
 *   await processRow(row);
 * }
 * ```
 */

import {
  createStreamingQuery,
  createBufferedIterator,
  StreamingCancelledError,
  type StreamingQuery,
  type StreamingQueryOptions,
  type StreamingStats,
} from './streaming.js';
import { captureStackTrace } from './stack-trace.js';

// =============================================================================
// Types and Interfaces
// =============================================================================

/**
 * Partition information for streaming queries
 */
export interface StreamingPartitionInfo {
  /** Partition identifier or path */
  path: string;
  /** Estimated row count */
  rowCount: number;
  /** Size in bytes */
  sizeBytes: number;
  /** Whether partition is cached */
  isCached?: boolean;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Options for partition-level streaming queries
 */
export interface PartitionStreamingOptions<T> {
  /**
   * List of partitions to stream through
   */
  partitions: StreamingPartitionInfo[];

  /**
   * Function to read rows from a partition.
   * Should return an async iterable of rows.
   */
  readPartition: (partition: StreamingPartitionInfo) => AsyncIterable<T> | Promise<T[]>;

  /**
   * Number of rows to buffer per partition read (default: 1000)
   */
  batchSize?: number;

  /**
   * Maximum number of rows to buffer across all partitions (default: 5000)
   */
  bufferLimit?: number;

  /**
   * Memory limit in bytes for buffered data (default: no limit)
   * When exceeded, backpressure is applied until memory is freed
   */
  memoryLimitBytes?: number;

  /**
   * High water mark ratio for backpressure (default: 0.8)
   * Backpressure is applied when buffer reaches this percentage of bufferLimit
   */
  highWaterMarkRatio?: number;

  /**
   * Low water mark ratio for resuming after backpressure (default: 0.2)
   * Fetching resumes when buffer drops to this percentage of bufferLimit
   */
  lowWaterMarkRatio?: number;

  /**
   * Optional AbortSignal for cancellation
   */
  signal?: AbortSignal;

  /**
   * Optional predicate filter applied during streaming
   * More efficient than filtering after iteration as it reduces memory usage
   */
  filter?: (row: T) => boolean | Promise<boolean>;

  /**
   * Optional transform applied to each row during streaming
   */
  transform?: (row: T) => T | Promise<T>;

  /**
   * Called when a partition fetch starts
   */
  onPartitionStart?: (partition: StreamingPartitionInfo, index: number) => void;

  /**
   * Called when a partition fetch completes
   */
  onPartitionComplete?: (partition: StreamingPartitionInfo, rowCount: number) => void;

  /**
   * Called when backpressure is applied
   */
  onBackpressure?: (bufferedRows: number, bufferLimit: number) => void;

  /**
   * Called when an error occurs
   */
  onError?: (error: Error, partition?: StreamingPartitionInfo) => void;

  /**
   * Maximum number of partitions to prefetch concurrently (default: 1)
   * Higher values can improve throughput but increase memory usage
   */
  prefetchConcurrency?: number;

  /**
   * Function to estimate memory size of a row (for memory limiting)
   * Default estimates based on JSON serialization size
   */
  estimateRowSize?: (row: T) => number;
}

/**
 * Extended streaming query with partition awareness
 */
export interface PartitionStreamingQuery<T> extends StreamingQuery<T> {
  /**
   * Get the current partition being processed
   */
  getCurrentPartition(): StreamingPartitionInfo | null;

  /**
   * Get the number of partitions processed so far
   */
  getPartitionsProcessed(): number;

  /**
   * Get the total number of partitions
   */
  getTotalPartitions(): number;

  /**
   * Get partition-level statistics
   */
  getPartitionStats(): PartitionStreamingStats;
}

/**
 * Partition-level streaming statistics
 */
export interface PartitionStreamingStats extends StreamingStats {
  /** Number of partitions processed */
  partitionsProcessed: number;
  /** Total number of partitions */
  totalPartitions: number;
  /** Rows processed per partition */
  rowsPerPartition: Map<string, number>;
  /** Time spent reading each partition */
  partitionReadTimes: Map<string, number>;
  /** Memory high water mark in bytes */
  peakMemoryBytes: number;
  /** Number of times memory limit was hit */
  memoryLimitHits: number;
}

/**
 * Error thrown when memory limit is exceeded during streaming
 */
export class StreamingMemoryLimitError extends Error {
  readonly isStreamingMemoryLimitError = true;
  readonly currentBytes: number;
  readonly limitBytes: number;
  readonly bufferedRows: number;

  constructor(currentBytes: number, limitBytes: number, bufferedRows: number) {
    super(
      `Streaming memory limit exceeded: ${(currentBytes / 1024 / 1024).toFixed(2)}MB used, ` +
      `limit is ${(limitBytes / 1024 / 1024).toFixed(2)}MB with ${bufferedRows} rows buffered`
    );
    this.name = 'StreamingMemoryLimitError';
    this.currentBytes = currentBytes;
    this.limitBytes = limitBytes;
    this.bufferedRows = bufferedRows;
    captureStackTrace(this, StreamingMemoryLimitError);
  }
}

// =============================================================================
// Default Constants
// =============================================================================

const DEFAULT_BATCH_SIZE = 1000;
const DEFAULT_BUFFER_LIMIT = 5000;
const DEFAULT_HIGH_WATER_RATIO = 0.8;
const DEFAULT_LOW_WATER_RATIO = 0.2;
const DEFAULT_PREFETCH_CONCURRENCY = 1;

// =============================================================================
// Memory Estimation Utilities
// =============================================================================

/**
 * Default row size estimator based on JSON serialization
 */
function defaultEstimateRowSize(row: unknown): number {
  if (row === null || row === undefined) return 8;
  if (typeof row === 'boolean') return 4;
  if (typeof row === 'number') return 8;
  if (typeof row === 'string') return row.length * 2 + 24; // UTF-16 + overhead
  if (typeof row === 'bigint') return 16;
  if (row instanceof Date) return 32;
  if (row instanceof Uint8Array) return row.length + 24;
  if (Array.isArray(row)) {
    return 24 + row.reduce((sum, item) => sum + defaultEstimateRowSize(item), 0);
  }
  if (typeof row === 'object') {
    const obj = row as Record<string, unknown>;
    return 24 + Object.entries(obj).reduce(
      (sum, [key, value]) => sum + key.length * 2 + 24 + defaultEstimateRowSize(value),
      0
    );
  }
  return 32; // Unknown type, conservative estimate
}

// =============================================================================
// Partition Streaming Query Implementation
// =============================================================================

/**
 * Internal state for partition streaming
 */
interface PartitionStreamingState<T> {
  buffer: T[];
  currentPartitionIndex: number;
  currentPartition: StreamingPartitionInfo | null;
  running: boolean;
  cancelled: boolean;
  paused: boolean;
  exhausted: boolean;
  fetchPromise: Promise<void> | null;
  pauseResolver: (() => void) | null;
  memoryUsedBytes: number;
  peakMemoryBytes: number;
  memoryLimitHits: number;
  stats: {
    totalFetched: number;
    totalYielded: number;
    totalFiltered: number;
    backpressureEvents: number;
    startTime: number;
    rowsPerPartition: Map<string, number>;
    partitionReadTimes: Map<string, number>;
  };
  completionResolvers: Array<(stats: PartitionStreamingStats) => void>;
}

/**
 * Create a partition-level streaming query that processes partitions lazily
 */
export function createPartitionStreamingQuery<T>(
  options: PartitionStreamingOptions<T>
): PartitionStreamingQuery<T> {
  const {
    partitions,
    readPartition,
    batchSize = DEFAULT_BATCH_SIZE,
    bufferLimit = DEFAULT_BUFFER_LIMIT,
    memoryLimitBytes,
    highWaterMarkRatio = DEFAULT_HIGH_WATER_RATIO,
    lowWaterMarkRatio = DEFAULT_LOW_WATER_RATIO,
    signal,
    filter,
    transform,
    onPartitionStart,
    onPartitionComplete,
    onBackpressure,
    onError,
    prefetchConcurrency = DEFAULT_PREFETCH_CONCURRENCY,
    estimateRowSize = defaultEstimateRowSize,
  } = options;

  const highWaterMark = Math.floor(bufferLimit * highWaterMarkRatio);
  const lowWaterMark = Math.floor(bufferLimit * lowWaterMarkRatio);

  // Internal state
  const state: PartitionStreamingState<T> = {
    buffer: [],
    currentPartitionIndex: 0,
    currentPartition: null,
    running: true,
    cancelled: false,
    paused: false,
    exhausted: false,
    fetchPromise: null,
    pauseResolver: null,
    memoryUsedBytes: 0,
    peakMemoryBytes: 0,
    memoryLimitHits: 0,
    stats: {
      totalFetched: 0,
      totalYielded: 0,
      totalFiltered: 0,
      backpressureEvents: 0,
      startTime: performance.now(),
      rowsPerPartition: new Map(),
      partitionReadTimes: new Map(),
    },
    completionResolvers: [],
  };

  // Handle external abort signal
  if (signal) {
    if (signal.aborted) {
      state.cancelled = true;
      state.running = false;
    } else {
      signal.addEventListener('abort', () => {
        cancel();
      }, { once: true });
    }
  }

  /**
   * Fetch rows from the next partition
   */
  async function fetchNextPartition(): Promise<void> {
    if (state.exhausted || state.cancelled || !state.running) {
      return;
    }

    // Wait if paused
    while (state.paused && state.running && !state.cancelled) {
      await new Promise<void>(resolve => {
        state.pauseResolver = resolve;
      });
      state.pauseResolver = null;
    }

    if (state.cancelled || !state.running) {
      return;
    }

    // Check if all partitions processed
    if (state.currentPartitionIndex >= partitions.length) {
      state.exhausted = true;
      return;
    }

    const partition = partitions[state.currentPartitionIndex];
    state.currentPartition = partition;

    // Notify partition start
    if (onPartitionStart) {
      onPartitionStart(partition, state.currentPartitionIndex);
    }

    const partitionStartTime = performance.now();
    let partitionRowCount = 0;

    try {
      // Read partition
      const partitionData = await readPartition(partition);

      if (state.cancelled) return;

      // Handle both array and async iterable results
      const rows = Symbol.asyncIterator in partitionData
        ? partitionData as AsyncIterable<T>
        : (async function* () { yield* partitionData as T[]; })();

      for await (const rawRow of rows) {
        if (state.cancelled || !state.running) break;

        // Apply backpressure if buffer is too full
        while (state.buffer.length >= highWaterMark && state.running && !state.cancelled) {
          state.stats.backpressureEvents++;
          if (onBackpressure) {
            onBackpressure(state.buffer.length, bufferLimit);
          }
          await new Promise<void>(resolve => setTimeout(resolve, 1));
        }

        if (state.cancelled || !state.running) break;

        // Check memory limit
        if (memoryLimitBytes && state.memoryUsedBytes >= memoryLimitBytes) {
          state.memoryLimitHits++;
          // Wait for memory to be freed
          while (state.memoryUsedBytes >= memoryLimitBytes * lowWaterMarkRatio && state.running && !state.cancelled) {
            await new Promise<void>(resolve => setTimeout(resolve, 1));
          }
        }

        if (state.cancelled || !state.running) break;

        let row = rawRow;

        // Apply transform
        if (transform) {
          row = await transform(row);
        }

        // Apply filter
        if (filter) {
          const passes = await filter(row);
          if (!passes) {
            state.stats.totalFiltered++;
            continue;
          }
        }

        // Add to buffer and track memory
        const rowSize = estimateRowSize(row);
        state.buffer.push(row);
        state.memoryUsedBytes += rowSize;
        state.peakMemoryBytes = Math.max(state.peakMemoryBytes, state.memoryUsedBytes);
        state.stats.totalFetched++;
        partitionRowCount++;
      }

      // Update partition stats
      const partitionReadTime = performance.now() - partitionStartTime;
      state.stats.rowsPerPartition.set(partition.path, partitionRowCount);
      state.stats.partitionReadTimes.set(partition.path, partitionReadTime);

      // Notify partition complete
      if (onPartitionComplete) {
        onPartitionComplete(partition, partitionRowCount);
      }

      // Move to next partition
      state.currentPartitionIndex++;

    } catch (error) {
      if (state.cancelled) return;
      if (onError) {
        onError(error as Error, partition);
      }
      throw error;
    }
  }

  /**
   * Start background prefetching
   */
  function startPrefetch(): void {
    if (state.fetchPromise || state.exhausted || state.cancelled || !state.running) {
      return;
    }

    // Check backpressure
    if (state.buffer.length >= highWaterMark) {
      return;
    }

    state.fetchPromise = fetchNextPartition().finally(() => {
      state.fetchPromise = null;
      // Continue prefetching if buffer is below low water mark
      if (state.buffer.length < lowWaterMark && !state.exhausted && !state.cancelled && state.running) {
        startPrefetch();
      }
    });
  }

  /**
   * Build final statistics
   */
  function buildStats(): PartitionStreamingStats {
    const executionTimeMs = performance.now() - state.stats.startTime;

    return {
      totalFetched: state.stats.totalFetched,
      totalYielded: state.stats.totalYielded,
      totalFiltered: state.stats.totalFiltered,
      chunksProcessed: state.currentPartitionIndex,
      backpressureEvents: state.stats.backpressureEvents,
      executionTimeMs,
      avgChunkFetchMs: state.stats.partitionReadTimes.size > 0
        ? Array.from(state.stats.partitionReadTimes.values()).reduce((a, b) => a + b, 0) / state.stats.partitionReadTimes.size
        : 0,
      completed: state.exhausted && state.buffer.length === 0,
      cancelled: state.cancelled,
      partitionsProcessed: state.currentPartitionIndex,
      totalPartitions: partitions.length,
      rowsPerPartition: new Map(state.stats.rowsPerPartition),
      partitionReadTimes: new Map(state.stats.partitionReadTimes),
      peakMemoryBytes: state.peakMemoryBytes,
      memoryLimitHits: state.memoryLimitHits,
    };
  }

  /**
   * Complete the query
   */
  function complete(): void {
    state.running = false;
    const stats = buildStats();
    for (const resolver of state.completionResolvers) {
      resolver(stats);
    }
    state.completionResolvers = [];
  }

  /**
   * Cancel the query
   */
  function cancel(): void {
    if (state.cancelled) return;
    state.cancelled = true;
    state.running = false;

    if (state.pauseResolver) {
      state.pauseResolver();
    }

    state.buffer = [];
    state.memoryUsedBytes = 0;
    complete();
  }

  /**
   * Async iterator implementation
   */
  async function next(): Promise<IteratorResult<T>> {
    if (state.cancelled) {
      throw new StreamingCancelledError();
    }

    // If buffer is empty and not exhausted, fetch more
    while (state.buffer.length === 0 && !state.exhausted && !state.cancelled) {
      if (state.fetchPromise) {
        await state.fetchPromise;
      } else {
        await fetchNextPartition();
      }
    }

    if (state.cancelled) {
      throw new StreamingCancelledError();
    }

    // If buffer is still empty and exhausted, we're done
    if (state.buffer.length === 0 && state.exhausted) {
      complete();
      return { done: true, value: undefined };
    }

    // Get next item from buffer
    const value = state.buffer.shift()!;
    const rowSize = estimateRowSize(value);
    state.memoryUsedBytes = Math.max(0, state.memoryUsedBytes - rowSize);
    state.stats.totalYielded++;

    // Start prefetching if buffer is getting low
    if (state.buffer.length < lowWaterMark) {
      startPrefetch();
    }

    return { done: false, value };
  }

  /**
   * Return method for iterator cleanup
   */
  function returnMethod(): Promise<IteratorResult<T>> {
    cancel();
    return Promise.resolve({ done: true, value: undefined });
  }

  /**
   * Throw method for iterator error handling
   */
  function throwMethod(error?: unknown): Promise<IteratorResult<T>> {
    cancel();
    return Promise.reject(error);
  }

  // Start initial prefetch
  startPrefetch();

  // Build and return the streaming query
  const query: PartitionStreamingQuery<T> = {
    next,
    return: returnMethod,
    throw: throwMethod,
    [Symbol.asyncIterator]() {
      return this;
    },
    cancel,
    isRunning: () => state.running,
    isCancelled: () => state.cancelled,
    getStats: buildStats,
    waitForCompletion(): Promise<StreamingStats> {
      if (!state.running) {
        return Promise.resolve(buildStats());
      }
      return new Promise(resolve => {
        state.completionResolvers.push(resolve);
      });
    },
    pause(): void {
      state.paused = true;
    },
    resume(): void {
      state.paused = false;
      if (state.pauseResolver) {
        state.pauseResolver();
      }
      startPrefetch();
    },
    isPaused: () => state.paused,
    getCurrentPartition: () => state.currentPartition,
    getPartitionsProcessed: () => state.currentPartitionIndex,
    getTotalPartitions: () => partitions.length,
    getPartitionStats: buildStats,
  };

  return query;
}

// =============================================================================
// Streaming Query Pipeline
// =============================================================================

/**
 * Fluent pipeline for streaming query transformations.
 *
 * Provides a functional interface for chaining stream operations while
 * maintaining backpressure and memory efficiency.
 *
 * @example
 * ```typescript
 * const result = await new StreamingQueryPipeline(sourceStream)
 *   .filter(row => row.status === 'active')
 *   .map(row => ({ id: row.id, name: row.name }))
 *   .take(100)
 *   .collect();
 * ```
 */
export class StreamingQueryPipeline<T> implements AsyncIterable<T> {
  private source: AsyncIterable<T>;
  private operations: Array<(source: AsyncIterable<unknown>) => AsyncIterable<unknown>> = [];
  private signal?: AbortSignal;
  private cancelled = false;

  constructor(source: AsyncIterable<T>, signal?: AbortSignal) {
    this.source = source;
    this.signal = signal;
  }

  /**
   * Filter rows based on a predicate
   */
  filter(predicate: (item: T) => boolean | Promise<boolean>): StreamingQueryPipeline<T> {
    this.operations.push((source: AsyncIterable<unknown>) => this.filterIterable(source as AsyncIterable<T>, predicate));
    return this;
  }

  /**
   * Transform each row
   */
  map<U>(transform: (item: T) => U | Promise<U>): StreamingQueryPipeline<U> {
    this.operations.push((source: AsyncIterable<unknown>) => this.mapIterable(source as AsyncIterable<T>, transform));
    return this as unknown as StreamingQueryPipeline<U>;
  }

  /**
   * Take only the first N items
   */
  take(count: number): StreamingQueryPipeline<T> {
    this.operations.push((source: AsyncIterable<unknown>) => this.takeIterable(source as AsyncIterable<T>, count));
    return this;
  }

  /**
   * Skip the first N items
   */
  skip(count: number): StreamingQueryPipeline<T> {
    this.operations.push((source: AsyncIterable<unknown>) => this.skipIterable(source as AsyncIterable<T>, count));
    return this;
  }

  /**
   * Batch items into arrays of specified size
   */
  batch(size: number): StreamingQueryPipeline<T[]> {
    this.operations.push((source: AsyncIterable<unknown>) => this.batchIterable(source as AsyncIterable<T>, size));
    return this as unknown as StreamingQueryPipeline<T[]>;
  }

  /**
   * Flatten batched items back to individual items
   */
  flatten<U>(): StreamingQueryPipeline<U> {
    this.operations.push((source: AsyncIterable<unknown>) => this.flattenIterable(source as AsyncIterable<U[]>));
    return this as unknown as StreamingQueryPipeline<U>;
  }

  /**
   * Apply a side-effect to each item without modifying the stream
   */
  tap(effect: (item: T) => void | Promise<void>): StreamingQueryPipeline<T> {
    this.operations.push((source: AsyncIterable<unknown>) => this.tapIterable(source as AsyncIterable<T>, effect));
    return this;
  }

  /**
   * Collect all items into an array (use with caution for large datasets)
   */
  async collect(): Promise<T[]> {
    const results: T[] = [];
    for await (const item of this) {
      results.push(item);
    }
    return results;
  }

  /**
   * Consume the stream, returning the count of items
   */
  async count(): Promise<number> {
    let count = 0;
    for await (const _ of this) {
      count++;
    }
    return count;
  }

  /**
   * Get the first item or undefined if empty
   */
  async first(): Promise<T | undefined> {
    for await (const item of this) {
      return item;
    }
    return undefined;
  }

  /**
   * Check if any item matches the predicate
   */
  async some(predicate: (item: T) => boolean | Promise<boolean>): Promise<boolean> {
    for await (const item of this) {
      if (await predicate(item)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if all items match the predicate
   */
  async every(predicate: (item: T) => boolean | Promise<boolean>): Promise<boolean> {
    for await (const item of this) {
      if (!(await predicate(item))) {
        return false;
      }
    }
    return true;
  }

  /**
   * Reduce the stream to a single value
   */
  async reduce<U>(
    reducer: (accumulator: U, item: T) => U | Promise<U>,
    initial: U
  ): Promise<U> {
    let accumulator = initial;
    for await (const item of this) {
      accumulator = await reducer(accumulator, item);
    }
    return accumulator;
  }

  /**
   * Execute the pipeline and iterate through results
   */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<T> {
    let current: AsyncIterable<unknown> = this.source;

    // Apply all operations in sequence
    for (const operation of this.operations) {
      current = operation(current);
    }

    // Yield results with cancellation check
    for await (const item of current) {
      if (this.cancelled || this.signal?.aborted) {
        return;
      }
      yield item as T;
    }
  }

  /**
   * Cancel the pipeline
   */
  cancel(): void {
    this.cancelled = true;
    // If source is a StreamingQuery, cancel it too
    if ('cancel' in this.source && typeof (this.source as unknown as StreamingQuery<T>).cancel === 'function') {
      (this.source as unknown as StreamingQuery<T>).cancel();
    }
  }

  // Internal helper methods

  private async *filterIterable<U>(
    source: AsyncIterable<U>,
    predicate: (item: U) => boolean | Promise<boolean>
  ): AsyncIterable<U> {
    for await (const item of source) {
      if (this.cancelled || this.signal?.aborted) return;
      if (await predicate(item)) {
        yield item;
      }
    }
  }

  private async *mapIterable<U, V>(
    source: AsyncIterable<U>,
    transform: (item: U) => V | Promise<V>
  ): AsyncIterable<V> {
    for await (const item of source) {
      if (this.cancelled || this.signal?.aborted) return;
      yield await transform(item);
    }
  }

  private async *takeIterable<U>(source: AsyncIterable<U>, count: number): AsyncIterable<U> {
    let taken = 0;
    for await (const item of source) {
      if (this.cancelled || this.signal?.aborted || taken >= count) return;
      yield item;
      taken++;
    }
  }

  private async *skipIterable<U>(source: AsyncIterable<U>, count: number): AsyncIterable<U> {
    let skipped = 0;
    for await (const item of source) {
      if (this.cancelled || this.signal?.aborted) return;
      if (skipped < count) {
        skipped++;
        continue;
      }
      yield item;
    }
  }

  private async *batchIterable<U>(source: AsyncIterable<U>, size: number): AsyncIterable<U[]> {
    let batch: U[] = [];
    for await (const item of source) {
      if (this.cancelled || this.signal?.aborted) {
        if (batch.length > 0) yield batch;
        return;
      }
      batch.push(item);
      if (batch.length >= size) {
        yield batch;
        batch = [];
      }
    }
    if (batch.length > 0) {
      yield batch;
    }
  }

  private async *flattenIterable<U>(source: AsyncIterable<U[]>): AsyncIterable<U> {
    for await (const batch of source) {
      if (this.cancelled || this.signal?.aborted) return;
      for (const item of batch) {
        yield item;
      }
    }
  }

  private async *tapIterable<U>(
    source: AsyncIterable<U>,
    effect: (item: U) => void | Promise<void>
  ): AsyncIterable<U> {
    for await (const item of source) {
      if (this.cancelled || this.signal?.aborted) return;
      await effect(item);
      yield item;
    }
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a streaming query pipeline from an async iterable source
 */
export function createStreamingPipeline<T>(
  source: AsyncIterable<T>,
  signal?: AbortSignal
): StreamingQueryPipeline<T> {
  return new StreamingQueryPipeline(source, signal);
}

/**
 * Create a streaming query from an array source (for testing)
 */
export function createArrayStreamingQuery<T>(
  data: T[],
  options?: Partial<StreamingQueryOptions<T>>
): StreamingQuery<T> {
  let offset = 0;
  const batchSize = options?.batchSize ?? DEFAULT_BATCH_SIZE;

  return createStreamingQuery({
    source: async (sourceOffset: number, limit: number): Promise<T[] | null> => {
      if (sourceOffset >= data.length) return null;
      return data.slice(sourceOffset, sourceOffset + limit);
    },
    batchSize,
    bufferLimit: options?.bufferLimit ?? DEFAULT_BUFFER_LIMIT,
    signal: options?.signal,
    transform: options?.transform,
    filter: options?.filter,
    onChunkFetched: options?.onChunkFetched,
    onError: options?.onError,
    highWaterMark: options?.highWaterMark,
    lowWaterMark: options?.lowWaterMark,
  });
}

// =============================================================================
// Re-exports from streaming.ts for convenience
// =============================================================================

export {
  createStreamingQuery,
  createBufferedIterator,
  processInChunks,
  collectStream,
  takeFromStream,
  skipFromStream,
  mapStream,
  filterStream,
  batchStream,
  mergeStreams,
  StreamingCancelledError,
  BackpressureTimeoutError,
  type StreamingQuery,
  type StreamingQueryOptions,
  type StreamingStats,
  type ChunkProcessorOptions,
  type BufferedIteratorOptions,
} from './streaming.js';
