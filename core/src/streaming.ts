/**
 * @evodb/core - Streaming Module
 *
 * True streaming for large result sets with:
 * - AsyncIterator-based result streaming
 * - Backpressure handling
 * - Chunk-based processing
 * - Memory-efficient result transformation
 *
 * Issue: evodb-lh2l - Implement true streaming for large result sets
 *
 * @example
 * ```typescript
 * import { StreamingQuery, createStreamingQuery } from '@evodb/core';
 *
 * const query = createStreamingQuery({
 *   source: fetchDataChunks,
 *   batchSize: 1000,
 *   bufferLimit: 5000,
 * });
 *
 * for await (const row of query) {
 *   await processRow(row);
 * }
 * ```
 */

import { captureStackTrace } from './stack-trace.js';
import { EvoDBError, ErrorCode } from './errors.js';

// =============================================================================
// Types and Interfaces
// =============================================================================

/**
 * Configuration options for streaming queries
 */
export interface StreamingQueryOptions<T> {
  /**
   * Async function that fetches data chunks.
   * Should return null or empty array when no more data is available.
   * @param offset - Starting offset for the chunk
   * @param limit - Maximum number of items to fetch
   */
  source: (offset: number, limit: number) => Promise<T[] | null>;

  /**
   * Number of items to fetch per batch (default: 1000)
   */
  batchSize?: number;

  /**
   * Maximum number of items to buffer before applying backpressure (default: 5000)
   */
  bufferLimit?: number;

  /**
   * Optional AbortSignal for cancellation support
   */
  signal?: AbortSignal;

  /**
   * Optional transform function applied to each item
   */
  transform?: (item: T) => T | Promise<T>;

  /**
   * Optional filter predicate applied to each item
   */
  filter?: (item: T) => boolean | Promise<boolean>;

  /**
   * Called when a chunk is fetched (for monitoring)
   */
  onChunkFetched?: (chunkSize: number, totalFetched: number) => void;

  /**
   * Called when an error occurs (before throwing)
   */
  onError?: (error: Error) => void;

  /**
   * High water mark for backpressure (default: bufferLimit * 0.8)
   */
  highWaterMark?: number;

  /**
   * Low water mark for resuming after backpressure (default: bufferLimit * 0.2)
   */
  lowWaterMark?: number;
}

/**
 * Statistics for a streaming query execution
 */
export interface StreamingStats {
  /** Total number of items fetched from source */
  totalFetched: number;
  /** Number of items yielded to consumer */
  totalYielded: number;
  /** Number of items filtered out */
  totalFiltered: number;
  /** Number of chunks fetched */
  chunksProcessed: number;
  /** Number of times backpressure was applied */
  backpressureEvents: number;
  /** Total execution time in milliseconds */
  executionTimeMs: number;
  /** Average time per chunk fetch in milliseconds */
  avgChunkFetchMs: number;
  /** Whether the query completed successfully */
  completed: boolean;
  /** Whether the query was cancelled */
  cancelled: boolean;
}

/**
 * Streaming query interface with async iteration and lifecycle management
 */
export interface StreamingQuery<T> extends AsyncIterableIterator<T> {
  /**
   * Cancel the streaming query.
   * Any pending operations will be aborted.
   */
  cancel(): void;

  /**
   * Check if the query is still running
   */
  isRunning(): boolean;

  /**
   * Check if the query was cancelled
   */
  isCancelled(): boolean;

  /**
   * Get current statistics (available during and after iteration)
   */
  getStats(): StreamingStats;

  /**
   * Wait for the query to complete and get final statistics
   */
  waitForCompletion(): Promise<StreamingStats>;

  /**
   * Pause fetching (backpressure)
   */
  pause(): void;

  /**
   * Resume fetching after pause
   */
  resume(): void;

  /**
   * Check if fetching is paused
   */
  isPaused(): boolean;
}

/**
 * Error thrown when a streaming query is cancelled.
 * Extends EvoDBError for consistent error hierarchy.
 *
 * @example
 * ```typescript
 * import { EvoDBError, ErrorCode } from '@evodb/core';
 *
 * try {
 *   for await (const row of streamingQuery) {
 *     // process row
 *   }
 * } catch (e) {
 *   if (e instanceof StreamingCancelledError) {
 *     console.log('Query was cancelled');
 *   }
 *   // Or catch all EvoDB errors
 *   if (e instanceof EvoDBError && e.code === ErrorCode.STREAMING_CANCELLED) {
 *     // Handle cancellation
 *   }
 * }
 * ```
 */
export class StreamingCancelledError extends EvoDBError {
  readonly isStreamingCancelledError = true;

  constructor(message: string = 'Streaming query was cancelled') {
    super(message, ErrorCode.STREAMING_CANCELLED, undefined, 'The query was cancelled by the user or due to an error.');
    this.name = 'StreamingCancelledError';
    captureStackTrace(this, StreamingCancelledError);
  }
}

/**
 * Error thrown when backpressure threshold is exceeded and timeout occurs.
 * Extends EvoDBError for consistent error hierarchy.
 *
 * @example
 * ```typescript
 * import { EvoDBError, ErrorCode } from '@evodb/core';
 *
 * try {
 *   for await (const row of streamingQuery) {
 *     // slow processing
 *   }
 * } catch (e) {
 *   if (e instanceof BackpressureTimeoutError) {
 *     console.log(`Buffer overflowed: ${e.bufferSize} > ${e.bufferLimit}`);
 *   }
 *   // Or catch all EvoDB errors
 *   if (e instanceof EvoDBError && e.code === ErrorCode.BACKPRESSURE_TIMEOUT) {
 *     // Handle backpressure timeout
 *   }
 * }
 * ```
 */
export class BackpressureTimeoutError extends EvoDBError {
  readonly isBackpressureTimeoutError = true;
  readonly bufferSize: number;
  readonly bufferLimit: number;

  constructor(bufferSize: number, bufferLimit: number) {
    super(
      `Backpressure timeout: buffer size (${bufferSize}) exceeds limit (${bufferLimit})`,
      ErrorCode.BACKPRESSURE_TIMEOUT,
      { bufferSize, bufferLimit },
      'Process data faster or increase buffer limits.'
    );
    this.name = 'BackpressureTimeoutError';
    this.bufferSize = bufferSize;
    this.bufferLimit = bufferLimit;
    captureStackTrace(this, BackpressureTimeoutError);
  }
}

// =============================================================================
// Default Constants
// =============================================================================

const DEFAULT_BATCH_SIZE = 1000;
const DEFAULT_BUFFER_LIMIT = 5000;
const DEFAULT_HIGH_WATER_RATIO = 0.8;
const DEFAULT_LOW_WATER_RATIO = 0.2;

// =============================================================================
// StreamingQuery Implementation
// =============================================================================

/**
 * Internal state for streaming query
 */
interface StreamingState<T> {
  buffer: T[];
  offset: number;
  exhausted: boolean;
  running: boolean;
  cancelled: boolean;
  paused: boolean;
  fetchPromise: Promise<void> | null;
  pauseResolver: (() => void) | null;
  stats: {
    totalFetched: number;
    totalYielded: number;
    totalFiltered: number;
    chunksProcessed: number;
    backpressureEvents: number;
    startTime: number;
    chunkFetchTimes: number[];
  };
  completionResolvers: Array<(stats: StreamingStats) => void>;
}

/**
 * Create a streaming query with the given options
 */
export function createStreamingQuery<T>(
  options: StreamingQueryOptions<T>
): StreamingQuery<T> {
  const {
    source,
    batchSize = DEFAULT_BATCH_SIZE,
    bufferLimit = DEFAULT_BUFFER_LIMIT,
    signal,
    transform,
    filter,
    onChunkFetched,
    onError,
    highWaterMark = Math.floor(bufferLimit * DEFAULT_HIGH_WATER_RATIO),
    lowWaterMark = Math.floor(bufferLimit * DEFAULT_LOW_WATER_RATIO),
  } = options;

  // Internal state
  const state: StreamingState<T> = {
    buffer: [],
    offset: 0,
    exhausted: false,
    running: true,
    cancelled: false,
    paused: false,
    fetchPromise: null,
    pauseResolver: null,
    stats: {
      totalFetched: 0,
      totalYielded: 0,
      totalFiltered: 0,
      chunksProcessed: 0,
      backpressureEvents: 0,
      startTime: performance.now(),
      chunkFetchTimes: [],
    },
    completionResolvers: [],
  };

  // Internal AbortController for cancellation
  const internalController = new AbortController();

  // Link to external signal if provided
  if (signal) {
    if (signal.aborted) {
      state.cancelled = true;
      state.running = false;
    } else {
      signal.addEventListener('abort', () => {
        cancel();
      });
    }
  }

  /**
   * Fetch the next chunk from source
   */
  async function fetchNextChunk(): Promise<void> {
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

    const fetchStart = performance.now();

    try {
      const chunk = await source(state.offset, batchSize);

      if (state.cancelled) {
        return;
      }

      const fetchTime = performance.now() - fetchStart;
      state.stats.chunkFetchTimes.push(fetchTime);
      state.stats.chunksProcessed++;

      if (!chunk || chunk.length === 0) {
        state.exhausted = true;
        return;
      }

      state.offset += chunk.length;
      state.stats.totalFetched += chunk.length;

      // Apply transform and filter to each item
      for (const item of chunk) {
        if (state.cancelled) {
          return;
        }

        let processedItem = item;

        // Apply transform
        if (transform) {
          processedItem = await transform(item);
        }

        // Apply filter
        if (filter) {
          const passes = await filter(processedItem);
          if (!passes) {
            state.stats.totalFiltered++;
            continue;
          }
        }

        state.buffer.push(processedItem);
      }

      // Notify callback
      if (onChunkFetched) {
        onChunkFetched(chunk.length, state.stats.totalFetched);
      }

    } catch (error) {
      if (state.cancelled) {
        return;
      }
      if (onError) {
        onError(error as Error);
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
      state.stats.backpressureEvents++;
      return;
    }

    state.fetchPromise = fetchNextChunk().finally(() => {
      state.fetchPromise = null;
      // Continue prefetching if buffer is below low water mark
      if (state.buffer.length < lowWaterMark && !state.exhausted && !state.cancelled && state.running) {
        startPrefetch();
      }
    });
  }

  /**
   * Build the final stats object
   */
  function buildStats(): StreamingStats {
    const executionTimeMs = performance.now() - state.stats.startTime;
    const avgChunkFetchMs = state.stats.chunkFetchTimes.length > 0
      ? state.stats.chunkFetchTimes.reduce((a, b) => a + b, 0) / state.stats.chunkFetchTimes.length
      : 0;

    return {
      totalFetched: state.stats.totalFetched,
      totalYielded: state.stats.totalYielded,
      totalFiltered: state.stats.totalFiltered,
      chunksProcessed: state.stats.chunksProcessed,
      backpressureEvents: state.stats.backpressureEvents,
      executionTimeMs,
      avgChunkFetchMs,
      completed: state.exhausted && state.buffer.length === 0,
      cancelled: state.cancelled,
    };
  }

  /**
   * Complete the query and notify waiters
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
   * Cancel the streaming query
   */
  function cancel(): void {
    if (state.cancelled) {
      return;
    }
    state.cancelled = true;
    state.running = false;
    internalController.abort();

    // Resume if paused
    if (state.pauseResolver) {
      state.pauseResolver();
    }

    // Clear buffer to free memory
    state.buffer = [];

    complete();
  }

  /**
   * Check if the query is still running
   */
  function isRunning(): boolean {
    return state.running;
  }

  /**
   * Check if the query was cancelled
   */
  function isCancelled(): boolean {
    return state.cancelled;
  }

  /**
   * Get current statistics
   */
  function getStats(): StreamingStats {
    return buildStats();
  }

  /**
   * Wait for the query to complete
   */
  function waitForCompletion(): Promise<StreamingStats> {
    if (!state.running) {
      return Promise.resolve(buildStats());
    }

    return new Promise(resolve => {
      state.completionResolvers.push(resolve);
    });
  }

  /**
   * Pause fetching
   */
  function pause(): void {
    state.paused = true;
  }

  /**
   * Resume fetching
   */
  function resume(): void {
    state.paused = false;
    if (state.pauseResolver) {
      state.pauseResolver();
    }
    // Restart prefetching if needed
    startPrefetch();
  }

  /**
   * Check if paused
   */
  function isPaused(): boolean {
    return state.paused;
  }

  /**
   * Async iterator implementation
   */
  async function next(): Promise<IteratorResult<T>> {
    // Check for cancellation
    if (state.cancelled) {
      throw new StreamingCancelledError();
    }

    // If buffer is empty and not exhausted, fetch more
    while (state.buffer.length === 0 && !state.exhausted && !state.cancelled) {
      if (state.fetchPromise) {
        await state.fetchPromise;
      } else {
        await fetchNextChunk();
      }
    }

    // Check for cancellation again after fetch
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
    state.stats.totalYielded++;

    // Start prefetching if buffer is getting low
    if (state.buffer.length < lowWaterMark) {
      startPrefetch();
    }

    return { done: false, value };
  }

  /**
   * Return the iterator (required for AsyncIterableIterator)
   */
  function returnMethod(): Promise<IteratorResult<T>> {
    cancel();
    return Promise.resolve({ done: true, value: undefined });
  }

  /**
   * Throw method for iterator (required for AsyncIterableIterator)
   */
  function throwMethod(error?: unknown): Promise<IteratorResult<T>> {
    cancel();
    return Promise.reject(error);
  }

  // Start initial prefetch
  startPrefetch();

  // Build and return the streaming query object
  const query: StreamingQuery<T> = {
    next,
    return: returnMethod,
    throw: throwMethod,
    [Symbol.asyncIterator]() {
      return this;
    },
    cancel,
    isRunning,
    isCancelled,
    getStats,
    waitForCompletion,
    pause,
    resume,
    isPaused,
  };

  return query;
}

// =============================================================================
// ChunkProcessor - For processing data in chunks with backpressure
// =============================================================================

/**
 * Options for chunk-based processing
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface ChunkProcessorOptions<TInput, _TOutput = TInput> {
  /**
   * Size of each chunk to process
   */
  chunkSize: number;

  /**
   * Maximum number of concurrent chunk processing operations
   */
  concurrency?: number;

  /**
   * Optional AbortSignal for cancellation
   */
  signal?: AbortSignal;

  /**
   * Called when a chunk is processed
   */
  onChunkProcessed?: (chunkIndex: number, outputCount: number) => void;
}

/**
 * Process an array of items in chunks with backpressure and memory efficiency
 */
export async function* processInChunks<TInput, TOutput>(
  items: TInput[] | AsyncIterable<TInput>,
  processor: (chunk: TInput[]) => Promise<TOutput[]>,
  options: ChunkProcessorOptions<TInput, TOutput>
): AsyncGenerator<TOutput> {
  const {
    chunkSize,
    concurrency: _concurrency = 1, // Reserved for future parallel chunk processing
    signal,
    onChunkProcessed,
  } = options;
  void _concurrency; // Acknowledge reserved parameter

  // Check for cancellation
  function checkCancellation(): void {
    if (signal?.aborted) {
      throw new StreamingCancelledError('Chunk processing was cancelled');
    }
  }

  let chunkIndex = 0;

  // Handle array input
  if (Array.isArray(items)) {
    for (let i = 0; i < items.length; i += chunkSize) {
      checkCancellation();

      const chunk = items.slice(i, i + chunkSize);
      const outputs = await processor(chunk);

      if (onChunkProcessed) {
        onChunkProcessed(chunkIndex++, outputs.length);
      }

      for (const output of outputs) {
        checkCancellation();
        yield output;
      }
    }
    return;
  }

  // Handle AsyncIterable input
  let currentChunk: TInput[] = [];

  for await (const item of items) {
    checkCancellation();

    currentChunk.push(item);

    if (currentChunk.length >= chunkSize) {
      const outputs = await processor(currentChunk);

      if (onChunkProcessed) {
        onChunkProcessed(chunkIndex++, outputs.length);
      }

      for (const output of outputs) {
        checkCancellation();
        yield output;
      }

      currentChunk = [];
    }
  }

  // Process remaining items
  if (currentChunk.length > 0) {
    checkCancellation();

    const outputs = await processor(currentChunk);

    if (onChunkProcessed) {
      onChunkProcessed(chunkIndex++, outputs.length);
    }

    for (const output of outputs) {
      checkCancellation();
      yield output;
    }
  }
}

// =============================================================================
// BufferedAsyncIterator - Memory-efficient buffered iteration
// =============================================================================

/**
 * Options for buffered async iterator
 */
export interface BufferedIteratorOptions {
  /**
   * Maximum buffer size
   */
  bufferSize: number;

  /**
   * High water mark (default: 80% of bufferSize)
   */
  highWaterMark?: number;

  /**
   * Low water mark (default: 20% of bufferSize)
   */
  lowWaterMark?: number;

  /**
   * Optional AbortSignal for cancellation
   */
  signal?: AbortSignal;
}

/**
 * Create a buffered async iterator from a source with backpressure control
 */
export function createBufferedIterator<T>(
  source: AsyncIterable<T>,
  options: BufferedIteratorOptions
): StreamingQuery<T> {
  const {
    bufferSize,
    highWaterMark = Math.floor(bufferSize * DEFAULT_HIGH_WATER_RATIO),
    lowWaterMark = Math.floor(bufferSize * DEFAULT_LOW_WATER_RATIO),
    signal,
  } = options;

  const buffer: T[] = [];
  let sourceExhausted = false;
  let running = true;
  let cancelled = false;
  let paused = false;
  let pauseResolver: (() => void) | null = null;
  let bufferDrainResolver: (() => void) | null = null;
  const completionResolvers: Array<(stats: StreamingStats) => void> = [];

  // Stats tracking
  const stats = {
    totalFetched: 0,
    totalYielded: 0,
    startTime: performance.now(),
    backpressureEvents: 0,
  };

  // Link to external signal
  if (signal) {
    if (signal.aborted) {
      cancelled = true;
      running = false;
    } else {
      signal.addEventListener('abort', () => {
        cancel();
      });
    }
  }

  // Background fetching
  let fetchingPromise: Promise<void> | null = null;

  async function startFetching(): Promise<void> {
    if (fetchingPromise) return;

    fetchingPromise = (async () => {
      try {
        const iterator = source[Symbol.asyncIterator]();

        while (!sourceExhausted && !cancelled && running) {
          // Wait if paused
          while (paused && running && !cancelled) {
            await new Promise<void>(resolve => {
              pauseResolver = resolve;
            });
            pauseResolver = null;
          }

          if (cancelled || !running) break;

          // Apply backpressure if buffer is full
          while (buffer.length >= highWaterMark && running && !cancelled) {
            stats.backpressureEvents++;
            await new Promise<void>(resolve => {
              bufferDrainResolver = resolve;
            });
            bufferDrainResolver = null;
          }

          if (cancelled || !running) break;

          const { done, value } = await iterator.next();

          if (done) {
            sourceExhausted = true;
            break;
          }

          buffer.push(value);
          stats.totalFetched++;
        }
      } catch (error) {
        if (!cancelled) {
          throw error;
        }
      } finally {
        fetchingPromise = null;
      }
    })();
  }

  function buildStats(): StreamingStats {
    const executionTimeMs = performance.now() - stats.startTime;
    return {
      totalFetched: stats.totalFetched,
      totalYielded: stats.totalYielded,
      totalFiltered: 0,
      chunksProcessed: 0,
      backpressureEvents: stats.backpressureEvents,
      executionTimeMs,
      avgChunkFetchMs: 0,
      completed: sourceExhausted && buffer.length === 0,
      cancelled,
    };
  }

  function complete(): void {
    running = false;
    const finalStats = buildStats();
    for (const resolver of completionResolvers) {
      resolver(finalStats);
    }
  }

  function cancel(): void {
    if (cancelled) return;
    cancelled = true;
    running = false;

    if (pauseResolver) pauseResolver();
    if (bufferDrainResolver) bufferDrainResolver();

    buffer.length = 0;
    complete();
  }

  async function next(): Promise<IteratorResult<T>> {
    if (cancelled) {
      throw new StreamingCancelledError();
    }

    // Start fetching if not already
    startFetching();

    // Wait for data
    while (buffer.length === 0 && !sourceExhausted && !cancelled) {
      await new Promise(resolve => setTimeout(resolve, 1));
    }

    if (cancelled) {
      throw new StreamingCancelledError();
    }

    if (buffer.length === 0 && sourceExhausted) {
      complete();
      return { done: true, value: undefined };
    }

    const value = buffer.shift()!;
    stats.totalYielded++;

    // Signal that buffer has drained
    if (buffer.length < lowWaterMark && bufferDrainResolver) {
      bufferDrainResolver();
    }

    return { done: false, value };
  }

  function returnMethod(): Promise<IteratorResult<T>> {
    cancel();
    return Promise.resolve({ done: true, value: undefined });
  }

  function throwMethod(error?: unknown): Promise<IteratorResult<T>> {
    cancel();
    return Promise.reject(error);
  }

  return {
    next,
    return: returnMethod,
    throw: throwMethod,
    [Symbol.asyncIterator]() {
      return this;
    },
    cancel,
    isRunning: () => running,
    isCancelled: () => cancelled,
    getStats: buildStats,
    waitForCompletion(): Promise<StreamingStats> {
      if (!running) {
        return Promise.resolve(buildStats());
      }
      return new Promise(resolve => {
        completionResolvers.push(resolve);
      });
    },
    pause: () => {
      paused = true;
    },
    resume: () => {
      paused = false;
      if (pauseResolver) pauseResolver();
    },
    isPaused: () => paused,
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Collect all items from a streaming query into an array.
 * Use with caution for large datasets - defeats the purpose of streaming.
 */
export async function collectStream<T>(query: StreamingQuery<T>): Promise<T[]> {
  const results: T[] = [];
  for await (const item of query) {
    results.push(item);
  }
  return results;
}

/**
 * Take the first N items from a streaming query
 */
export async function* takeFromStream<T>(
  query: StreamingQuery<T>,
  count: number
): AsyncGenerator<T> {
  let taken = 0;
  for await (const item of query) {
    if (taken >= count) {
      query.cancel();
      break;
    }
    yield item;
    taken++;
  }
}

/**
 * Skip the first N items from a streaming query
 */
export async function* skipFromStream<T>(
  query: StreamingQuery<T>,
  count: number
): AsyncGenerator<T> {
  let skipped = 0;
  for await (const item of query) {
    if (skipped < count) {
      skipped++;
      continue;
    }
    yield item;
  }
}

/**
 * Map a streaming query with a transform function
 */
export async function* mapStream<T, U>(
  query: StreamingQuery<T>,
  transform: (item: T) => U | Promise<U>
): AsyncGenerator<U> {
  for await (const item of query) {
    yield await transform(item);
  }
}

/**
 * Filter a streaming query with a predicate
 */
export async function* filterStream<T>(
  query: StreamingQuery<T>,
  predicate: (item: T) => boolean | Promise<boolean>
): AsyncGenerator<T> {
  for await (const item of query) {
    if (await predicate(item)) {
      yield item;
    }
  }
}

/**
 * Batch items from a streaming query into arrays
 */
export async function* batchStream<T>(
  query: StreamingQuery<T>,
  batchSize: number
): AsyncGenerator<T[]> {
  let batch: T[] = [];

  for await (const item of query) {
    batch.push(item);
    if (batch.length >= batchSize) {
      yield batch;
      batch = [];
    }
  }

  if (batch.length > 0) {
    yield batch;
  }
}

/**
 * Merge multiple streaming queries into a single stream
 */
export async function* mergeStreams<T>(
  ...queries: StreamingQuery<T>[]
): AsyncGenerator<T> {
  // Create an array of promises, one for each query
  interface PendingResult<T> {
    index: number;
    result: IteratorResult<T>;
  }

  const pending = new Map<number, Promise<PendingResult<T>>>();
  const done = new Set<number>();

  // Initialize pending promises
  for (let i = 0; i < queries.length; i++) {
    pending.set(i, queries[i].next().then(result => ({ index: i, result })));
  }

  while (pending.size > 0) {
    // Wait for any query to produce a result
    const { index, result } = await Promise.race(pending.values());

    if (result.done) {
      done.add(index);
      pending.delete(index);
    } else {
      yield result.value;
      // Queue next item from this query
      pending.set(index, queries[index].next().then(r => ({ index, result: r })));
    }
  }

  // Cancel any remaining queries
  for (let i = 0; i < queries.length; i++) {
    if (!done.has(i)) {
      queries[i].cancel();
    }
  }
}

// =============================================================================
// ResultStream - Chainable async iterator with transformations
// =============================================================================

/**
 * Configuration for ResultStream
 */
export interface ResultStreamConfig {
  /**
   * Maximum number of items to buffer
   */
  bufferSize?: number;

  /**
   * High water mark for backpressure (default: 80% of bufferSize)
   */
  highWaterMark?: number;

  /**
   * Low water mark for resuming (default: 20% of bufferSize)
   */
  lowWaterMark?: number;

  /**
   * Number of rows in each chunk for chunked delivery
   */
  chunkSize?: number;

  /**
   * Timeout in ms to emit partial chunk
   */
  chunkTimeoutMs?: number;

  /**
   * Total row count if known (for progress reporting)
   */
  totalCount?: number;

  /**
   * Progress callback
   */
  onProgress?: (progress: ProgressInfo) => void;

  /**
   * Interval for progress reporting (default: every 100 rows)
   */
  progressInterval?: number;

  /**
   * AbortSignal for cancellation
   */
  signal?: AbortSignal;

  /**
   * Timeout for the entire stream in milliseconds
   */
  timeoutMs?: number;

  /**
   * Cleanup callback called when stream ends
   */
  onCleanup?: () => void;

  /**
   * Whether to retry on transient errors
   */
  retryOnError?: boolean;

  /**
   * Maximum retry attempts
   */
  maxRetries?: number;

  /**
   * Callback for fetch operations (for monitoring)
   */
  onFetch?: (count: number) => void;

  /**
   * Callback for buffer status changes
   */
  onBufferStatus?: (size: number) => void;
}

/**
 * Progress information for streaming
 */
export interface ProgressInfo {
  /**
   * Number of rows processed
   */
  processed: number;

  /**
   * Total rows if known
   */
  total?: number;

  /**
   * Percentage complete if total is known
   */
  percent?: number;

  /**
   * Elapsed time in milliseconds
   */
  elapsedMs: number;

  /**
   * Rows processed per second
   */
  rowsPerSecond: number;
}

/**
 * Event types for ResultStream
 */
export type ResultStreamEvent = 'pause' | 'resume' | 'cancel' | 'cleanup' | 'bufferStatus';

/**
 * Event handler type
 */
export type ResultStreamEventHandler = (...args: unknown[]) => void;

/**
 * Abort error for stream cancellation
 */
export class AbortError extends Error {
  readonly isAbortError = true;

  constructor(message: string = 'Stream aborted') {
    super(message);
    this.name = 'AbortError';
    captureStackTrace(this, AbortError);
  }
}

/**
 * ResultStream - A chainable async iterator with transformation support
 *
 * Provides memory-efficient streaming of large result sets with:
 * - Lazy transformation chains (map, filter, take, skip)
 * - Backpressure handling
 * - Progress callbacks
 * - Cancellation support
 * - Chunked delivery
 *
 * @example
 * ```typescript
 * const stream = createResultStream(dataArray);
 *
 * // Chain transformations
 * const processed = stream
 *   .map(row => ({ ...row, processed: true }))
 *   .filter(row => row.active)
 *   .take(100);
 *
 * // Consume with for-await-of
 * for await (const row of processed) {
 *   console.log(row);
 * }
 * ```
 */
export class ResultStream<T> implements AsyncIterable<T> {
  private source: AsyncIterator<T>;
  private done = false;
  private _cancelled = false;
  private _cancelReason?: string;
  private processedCount = 0;
  private startTime: number;
  private eventHandlers: Map<ResultStreamEvent, ResultStreamEventHandler[]> = new Map();
  private timeoutId?: ReturnType<typeof setTimeout>;

  constructor(
    source: AsyncIterable<T> | AsyncIterator<T> | (() => AsyncIterable<T>) | T[],
    private config: ResultStreamConfig = {}
  ) {
    this.startTime = performance.now();

    // Handle different source types
    if (Array.isArray(source)) {
      this.source = this.arrayToIterator(source);
    } else if (typeof source === 'function') {
      const iterable = source();
      this.source = iterable[Symbol.asyncIterator]();
    } else if (Symbol.asyncIterator in source) {
      this.source = (source as AsyncIterable<T>)[Symbol.asyncIterator]();
    } else {
      this.source = source as AsyncIterator<T>;
    }

    this.setupAbortHandling();
    this.setupTimeout();
  }

  /**
   * Convert array to async iterator
   */
  private async *arrayToIterator(arr: T[]): AsyncGenerator<T> {
    for (const item of arr) {
      yield item;
    }
  }

  /**
   * Whether the stream has been cancelled
   */
  get cancelled(): boolean {
    return this._cancelled;
  }

  /**
   * Reason for cancellation if cancelled
   */
  get cancelReason(): string | undefined {
    return this._cancelReason;
  }

  /**
   * Set up abort signal handling
   */
  private setupAbortHandling(): void {
    if (this.config.signal) {
      if (this.config.signal.aborted) {
        this._cancelled = true;
        this._cancelReason = 'Aborted via signal';
      } else {
        this.config.signal.addEventListener('abort', () => {
          this.cancel('Aborted via signal');
        });
      }
    }
  }

  /**
   * Set up timeout handling
   */
  private setupTimeout(): void {
    if (this.config.timeoutMs && this.config.timeoutMs > 0) {
      this.timeoutId = setTimeout(() => {
        if (!this.done && !this._cancelled) {
          this.cancel('Stream timeout');
        }
      }, this.config.timeoutMs);
    }
  }

  /**
   * Clear timeout if set
   */
  private clearTimeout(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }
  }

  /**
   * Cancel the stream
   */
  cancel(reason: string = 'Cancelled'): void {
    if (this._cancelled) return;

    this._cancelled = true;
    this._cancelReason = reason;
    this.emit('cancel', reason);
    this.clearTimeout();
  }

  /**
   * Register event handler
   */
  on(event: ResultStreamEvent, handler: ResultStreamEventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  /**
   * Emit event
   */
  private emit(event: ResultStreamEvent, ...args: unknown[]): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(...args);
        } catch {
          // Ignore handler errors
        }
      }
    }
  }

  /**
   * Report progress
   */
  private reportProgress(): void {
    if (!this.config.onProgress) return;

    const interval = this.config.progressInterval || 100;
    const shouldReport = this.processedCount % interval === 0 || this.done;
    if (!shouldReport && this.processedCount !== 1) return;

    const elapsed = performance.now() - this.startTime;
    const progress: ProgressInfo = {
      processed: this.processedCount,
      elapsedMs: elapsed,
      rowsPerSecond: elapsed > 0 ? (this.processedCount / (elapsed / 1000)) : 0,
    };

    if (this.config.totalCount !== undefined && this.config.totalCount > 0) {
      progress.total = this.config.totalCount;
      progress.percent = Math.round((this.processedCount / this.config.totalCount) * 100);
    }

    this.config.onProgress(progress);
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    this.clearTimeout();
    this.config.onCleanup?.();
    this.emit('cleanup');
  }

  /**
   * Async iterator implementation
   */
  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    try {
      while (!this.done && !this._cancelled) {
        const result = await this.source.next();

        if (result.done) {
          this.done = true;
          // Report final progress
          if (this.config.onProgress) {
            this.reportProgress();
          }
          break;
        }

        if (this._cancelled) {
          throw new AbortError(this._cancelReason || 'Stream cancelled');
        }

        this.processedCount++;
        this.reportProgress();

        yield result.value;
      }

      if (this._cancelled) {
        throw new AbortError(this._cancelReason || 'Stream cancelled');
      }
    } finally {
      this.cleanup();
    }
  }

  /**
   * Iterate over chunks of rows
   */
  async *chunks(): AsyncIterable<T[]> {
    const chunkSize = this.config.chunkSize || 100;
    const timeoutMs = this.config.chunkTimeoutMs;
    let currentChunk: T[] = [];
    let chunkStartTime = performance.now();

    for await (const item of this) {
      currentChunk.push(item);

      const chunkFull = currentChunk.length >= chunkSize;
      const timedOut = timeoutMs !== undefined &&
                       (performance.now() - chunkStartTime) >= timeoutMs;

      if (chunkFull || timedOut) {
        yield currentChunk;
        currentChunk = [];
        chunkStartTime = performance.now();
      }
    }

    // Yield remaining items as final chunk
    if (currentChunk.length > 0) {
      yield currentChunk;
    }
  }

  /**
   * Transform each item with a mapping function
   */
  map<U>(fn: (item: T) => U | Promise<U>): ResultStream<U> {
    const self = this;
    const newConfig = { ...this.config };

    return new ResultStream<U>(async function*() {
      for await (const item of self) {
        yield await fn(item);
      }
    }, newConfig);
  }

  /**
   * Filter items with a predicate
   */
  filter(predicate: (item: T) => boolean | Promise<boolean>): ResultStream<T> {
    const self = this;
    const newConfig = { ...this.config };

    return new ResultStream<T>(async function*() {
      for await (const item of self) {
        if (await predicate(item)) {
          yield item;
        }
      }
    }, newConfig);
  }

  /**
   * Take only the first N items
   */
  take(count: number): ResultStream<T> {
    const self = this;
    const newConfig = { ...this.config };

    return new ResultStream<T>(async function*() {
      let taken = 0;
      for await (const item of self) {
        if (taken >= count) break;
        yield item;
        taken++;
      }
    }, newConfig);
  }

  /**
   * Skip the first N items
   */
  skip(count: number): ResultStream<T> {
    const self = this;
    const newConfig = { ...this.config };

    return new ResultStream<T>(async function*() {
      let skipped = 0;
      for await (const item of self) {
        if (skipped < count) {
          skipped++;
          continue;
        }
        yield item;
      }
    }, newConfig);
  }

  /**
   * Collect all items into an array.
   * Use with caution for large datasets.
   */
  async collect(): Promise<T[]> {
    const results: T[] = [];
    for await (const item of this) {
      results.push(item);
    }
    return results;
  }

  /**
   * Reduce all items to a single value
   */
  async reduce<U>(
    reducer: (accumulator: U, item: T) => U | Promise<U>,
    initialValue: U
  ): Promise<U> {
    let accumulator = initialValue;
    for await (const item of this) {
      accumulator = await reducer(accumulator, item);
    }
    return accumulator;
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
   * Count all items
   */
  async count(): Promise<number> {
    let count = 0;
    for await (const _ of this) {
      count++;
    }
    return count;
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
   * Find the first item matching the predicate
   */
  async find(predicate: (item: T) => boolean | Promise<boolean>): Promise<T | undefined> {
    for await (const item of this) {
      if (await predicate(item)) {
        return item;
      }
    }
    return undefined;
  }

  /**
   * Execute a side effect for each item without transforming
   */
  tap(fn: (item: T) => void | Promise<void>): ResultStream<T> {
    const self = this;
    const newConfig = { ...this.config };

    return new ResultStream<T>(async function*() {
      for await (const item of self) {
        await fn(item);
        yield item;
      }
    }, newConfig);
  }

  /**
   * Flatten nested iterables
   */
  flatMap<U>(fn: (item: T) => Iterable<U> | AsyncIterable<U> | Promise<Iterable<U> | AsyncIterable<U>>): ResultStream<U> {
    const self = this;
    const newConfig = { ...this.config };

    return new ResultStream<U>(async function*() {
      for await (const item of self) {
        const nested = await fn(item);
        if (Symbol.asyncIterator in nested) {
          for await (const nestedItem of nested as AsyncIterable<U>) {
            yield nestedItem;
          }
        } else {
          // Use Array.from for sync iterables to avoid downlevelIteration issues
          const items = Array.from(nested as Iterable<U>);
          for (const nestedItem of items) {
            yield nestedItem;
          }
        }
      }
    }, newConfig);
  }

  /**
   * Take items while predicate returns true
   */
  takeWhile(predicate: (item: T) => boolean | Promise<boolean>): ResultStream<T> {
    const self = this;
    const newConfig = { ...this.config };

    return new ResultStream<T>(async function*() {
      for await (const item of self) {
        if (!(await predicate(item))) break;
        yield item;
      }
    }, newConfig);
  }

  /**
   * Skip items while predicate returns true
   */
  skipWhile(predicate: (item: T) => boolean | Promise<boolean>): ResultStream<T> {
    const self = this;
    const newConfig = { ...this.config };

    return new ResultStream<T>(async function*() {
      let skipping = true;
      for await (const item of self) {
        if (skipping && await predicate(item)) {
          continue;
        }
        skipping = false;
        yield item;
      }
    }, newConfig);
  }

  /**
   * Concatenate another iterable to this stream
   */
  concat(other: AsyncIterable<T> | Iterable<T>): ResultStream<T> {
    const self = this;
    const newConfig = { ...this.config };

    return new ResultStream<T>(async function*() {
      for await (const item of self) {
        yield item;
      }
      if (Symbol.asyncIterator in other) {
        for await (const item of other as AsyncIterable<T>) {
          yield item;
        }
      } else {
        // Use Array.from for sync iterables to avoid downlevelIteration issues
        const items = Array.from(other as Iterable<T>);
        for (const item of items) {
          yield item;
        }
      }
    }, newConfig);
  }

  /**
   * Create distinct stream (removes duplicates)
   */
  distinct(keyFn?: (item: T) => unknown): ResultStream<T> {
    const self = this;
    const newConfig = { ...this.config };
    const seen = new Set<unknown>();

    return new ResultStream<T>(async function*() {
      for await (const item of self) {
        const key = keyFn ? keyFn(item) : item;
        if (!seen.has(key)) {
          seen.add(key);
          yield item;
        }
      }
    }, newConfig);
  }

  /**
   * Buffer items into groups
   */
  buffer(size: number): ResultStream<T[]> {
    const self = this;
    const newConfig = { ...this.config };

    return new ResultStream<T[]>(async function*() {
      let buffer: T[] = [];
      for await (const item of self) {
        buffer.push(item);
        if (buffer.length >= size) {
          yield buffer;
          buffer = [];
        }
      }
      if (buffer.length > 0) {
        yield buffer;
      }
    }, newConfig);
  }
}

/**
 * Create a ResultStream from various source types
 *
 * @param source - Array, async iterable, iterator, or generator function
 * @param config - Stream configuration options
 * @returns A ResultStream instance
 *
 * @example
 * ```typescript
 * // From array
 * const stream1 = createResultStream([1, 2, 3, 4, 5]);
 *
 * // From async generator
 * const stream2 = createResultStream(async function*() {
 *   for (let i = 0; i < 100; i++) {
 *     yield { id: i };
 *   }
 * });
 *
 * // With configuration
 * const stream3 = createResultStream(data, {
 *   totalCount: data.length,
 *   onProgress: (p) => console.log(`${p.percent}% complete`),
 *   signal: controller.signal,
 * });
 * ```
 */
export function createResultStream<T>(
  source: T[] | AsyncIterable<T> | AsyncIterator<T> | (() => AsyncIterable<T>),
  config?: ResultStreamConfig
): ResultStream<T> {
  return new ResultStream(source, config);
}

// =============================================================================
// Helper Functions for Testing
// =============================================================================

/**
 * Generate rows for testing
 */
export function generateRows(count: number): Array<{ id: number }> {
  return Array.from({ length: count }, (_, i) => ({ id: i }));
}

/**
 * Generate slow rows for testing (async with delays)
 */
export async function* generateSlowRows(
  count: number,
  delayMs: number = 50
): AsyncGenerator<{ id: number }> {
  for (let i = 0; i < count; i++) {
    await new Promise(resolve => setTimeout(resolve, delayMs));
    yield { id: i };
  }
}

/**
 * Sleep utility for tests
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
