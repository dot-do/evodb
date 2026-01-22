/**
 * Streaming Module Tests
 *
 * Tests for true streaming with AsyncIterator-based result streaming,
 * backpressure handling, chunk-based processing, and memory efficiency.
 *
 * Issue: evodb-lh2l - Implement true streaming for large result sets
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
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
} from '../streaming.js';

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Create a mock data source that returns paginated data
 */
function createMockSource<T>(
  data: T[],
  options: { delay?: number; failAtOffset?: number; errorMessage?: string } = {}
): (offset: number, limit: number) => Promise<T[] | null> {
  const { delay = 0, failAtOffset, errorMessage = 'Mock error' } = options;

  return async (offset: number, limit: number): Promise<T[] | null> => {
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    if (failAtOffset !== undefined && offset >= failAtOffset) {
      throw new Error(errorMessage);
    }

    if (offset >= data.length) {
      return null;
    }

    return data.slice(offset, offset + limit);
  };
}

/**
 * Create a mock async iterable from an array
 */
async function* createAsyncIterable<T>(
  data: T[],
  delay = 0
): AsyncGenerator<T> {
  for (const item of data) {
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    yield item;
  }
}

/**
 * Wait for a condition to be true
 */
async function waitFor(
  condition: () => boolean,
  timeout = 1000,
  interval = 10
): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error('waitFor timeout');
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}

// =============================================================================
// StreamingQuery Tests
// =============================================================================

describe('StreamingQuery', () => {
  describe('Basic iteration', () => {
    it('should iterate over all items', async () => {
      const data = [1, 2, 3, 4, 5];
      const source = createMockSource(data);

      const query = createStreamingQuery({
        source,
        batchSize: 2,
      });

      const results: number[] = [];
      for await (const item of query) {
        results.push(item);
      }

      expect(results).toEqual(data);
    });

    it('should handle empty data source', async () => {
      const source = createMockSource<number>([]);

      const query = createStreamingQuery({
        source,
        batchSize: 10,
      });

      const results: number[] = [];
      for await (const item of query) {
        results.push(item);
      }

      expect(results).toEqual([]);
    });

    it('should handle single item', async () => {
      const data = [42];
      const source = createMockSource(data);

      const query = createStreamingQuery({
        source,
        batchSize: 10,
      });

      const results: number[] = [];
      for await (const item of query) {
        results.push(item);
      }

      expect(results).toEqual([42]);
    });

    it('should respect batch size', async () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const fetchedChunks: number[][] = [];

      const source = async (offset: number, limit: number): Promise<number[] | null> => {
        if (offset >= data.length) return null;
        const chunk = data.slice(offset, offset + limit);
        fetchedChunks.push(chunk);
        return chunk;
      };

      const query = createStreamingQuery({
        source,
        batchSize: 3,
      });

      await collectStream(query);

      // Expect chunks of size 3 (except possibly the last one)
      expect(fetchedChunks[0]).toEqual([1, 2, 3]);
      expect(fetchedChunks[1]).toEqual([4, 5, 6]);
      expect(fetchedChunks[2]).toEqual([7, 8, 9]);
      expect(fetchedChunks[3]).toEqual([10]);
    });

    it('should work with async for...of loop', async () => {
      const data = ['a', 'b', 'c'];
      const source = createMockSource(data);

      const query = createStreamingQuery({
        source,
        batchSize: 1,
      });

      const results: string[] = [];
      for await (const item of query) {
        results.push(item);
      }

      expect(results).toEqual(['a', 'b', 'c']);
    });
  });

  describe('Transformation and filtering', () => {
    it('should apply transform function', async () => {
      const data = [1, 2, 3, 4, 5];
      const source = createMockSource(data);

      const query = createStreamingQuery({
        source,
        batchSize: 2,
        transform: (x) => x * 2,
      });

      const results = await collectStream(query);
      expect(results).toEqual([2, 4, 6, 8, 10]);
    });

    it('should apply async transform function', async () => {
      const data = [1, 2, 3];
      const source = createMockSource(data);

      const query = createStreamingQuery({
        source,
        batchSize: 2,
        transform: async (x) => {
          await new Promise(resolve => setTimeout(resolve, 1));
          return x * 10;
        },
      });

      const results = await collectStream(query);
      expect(results).toEqual([10, 20, 30]);
    });

    it('should apply filter predicate', async () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const source = createMockSource(data);

      const query = createStreamingQuery({
        source,
        batchSize: 3,
        filter: (x) => x % 2 === 0,
      });

      const results = await collectStream(query);
      expect(results).toEqual([2, 4, 6, 8, 10]);
    });

    it('should apply async filter predicate', async () => {
      const data = [1, 2, 3, 4, 5];
      const source = createMockSource(data);

      const query = createStreamingQuery({
        source,
        batchSize: 2,
        filter: async (x) => {
          await new Promise(resolve => setTimeout(resolve, 1));
          return x > 3;
        },
      });

      const results = await collectStream(query);
      expect(results).toEqual([4, 5]);
    });

    it('should apply both transform and filter', async () => {
      const data = [1, 2, 3, 4, 5];
      const source = createMockSource(data);

      const query = createStreamingQuery({
        source,
        batchSize: 2,
        transform: (x) => x * 2,
        filter: (x) => x > 4,
      });

      const results = await collectStream(query);
      expect(results).toEqual([6, 8, 10]);
    });

    it('should track filtered count in stats', async () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const source = createMockSource(data);

      const query = createStreamingQuery({
        source,
        batchSize: 5,
        filter: (x) => x % 2 === 0,
      });

      await collectStream(query);
      const stats = query.getStats();

      expect(stats.totalFetched).toBe(10);
      expect(stats.totalFiltered).toBe(5);
      expect(stats.totalYielded).toBe(5);
    });
  });

  describe('Cancellation', () => {
    it('should cancel with cancel()', async () => {
      const data = Array.from({ length: 100 }, (_, i) => i);
      const source = createMockSource(data, { delay: 10 });

      const query = createStreamingQuery({
        source,
        batchSize: 5,
      });

      const results: number[] = [];
      let cancelled = false;

      try {
        for await (const item of query) {
          results.push(item);
          if (results.length >= 10) {
            query.cancel();
          }
        }
      } catch (error) {
        if (error instanceof StreamingCancelledError) {
          cancelled = true;
        }
      }

      expect(cancelled).toBe(true);
      expect(query.isCancelled()).toBe(true);
      expect(query.isRunning()).toBe(false);
    });

    it('should cancel with AbortSignal', async () => {
      const data = Array.from({ length: 100 }, (_, i) => i);
      const source = createMockSource(data, { delay: 10 });
      const controller = new AbortController();

      const query = createStreamingQuery({
        source,
        batchSize: 5,
        signal: controller.signal,
      });

      const results: number[] = [];

      setTimeout(() => controller.abort(), 50);

      try {
        for await (const item of query) {
          results.push(item);
        }
      } catch (error) {
        expect(error).toBeInstanceOf(StreamingCancelledError);
      }

      expect(query.isCancelled()).toBe(true);
    });

    it('should handle pre-aborted signal', async () => {
      const data = [1, 2, 3];
      const source = createMockSource(data);
      const controller = new AbortController();
      controller.abort();

      const query = createStreamingQuery({
        source,
        batchSize: 2,
        signal: controller.signal,
      });

      expect(query.isCancelled()).toBe(true);
      expect(query.isRunning()).toBe(false);
    });

    it('should clear buffer on cancel', async () => {
      const data = Array.from({ length: 1000 }, (_, i) => i);
      const source = createMockSource(data);

      const query = createStreamingQuery({
        source,
        batchSize: 100,
        bufferLimit: 500,
      });

      // Consume a few items to fill buffer
      let count = 0;
      for await (const _ of query) {
        count++;
        if (count >= 10) break;
      }

      query.cancel();

      // Stats should show cancelled
      const stats = query.getStats();
      expect(stats.cancelled).toBe(true);
    });
  });

  describe('Pause and resume', () => {
    it('should pause and resume fetching', async () => {
      const data = Array.from({ length: 50 }, (_, i) => i);
      const fetchCounts: number[] = [];

      const source = async (offset: number, limit: number): Promise<number[] | null> => {
        fetchCounts.push(offset);
        if (offset >= data.length) return null;
        return data.slice(offset, offset + limit);
      };

      const query = createStreamingQuery({
        source,
        batchSize: 10,
        bufferLimit: 30,
      });

      // Get first item to start fetching
      const iterator = query[Symbol.asyncIterator]();
      await iterator.next();

      // Pause
      query.pause();
      expect(query.isPaused()).toBe(true);

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 50));
      const pausedFetchCount = fetchCounts.length;

      // Resume
      query.resume();
      expect(query.isPaused()).toBe(false);

      // Consume rest
      await collectStream(query);

      // More fetches should have happened after resume
      expect(fetchCounts.length).toBeGreaterThan(pausedFetchCount);
    });
  });

  describe('Statistics', () => {
    it('should track statistics during iteration', async () => {
      const data = Array.from({ length: 25 }, (_, i) => i);
      const source = createMockSource(data);

      const query = createStreamingQuery({
        source,
        batchSize: 10,
      });

      await collectStream(query);
      const stats = query.getStats();

      expect(stats.totalFetched).toBe(25);
      expect(stats.totalYielded).toBe(25);
      expect(stats.chunksProcessed).toBeGreaterThanOrEqual(3); // At least 3 chunks: 10 + 10 + 5
      expect(stats.completed).toBe(true);
      expect(stats.cancelled).toBe(false);
      expect(stats.executionTimeMs).toBeGreaterThan(0);
    });

    it('should calculate average chunk fetch time', async () => {
      const data = Array.from({ length: 30 }, (_, i) => i);
      const source = createMockSource(data, { delay: 5 });

      const query = createStreamingQuery({
        source,
        batchSize: 10,
      });

      await collectStream(query);
      const stats = query.getStats();

      expect(stats.avgChunkFetchMs).toBeGreaterThanOrEqual(5);
    });

    it('should wait for completion', async () => {
      const data = [1, 2, 3, 4, 5];
      const source = createMockSource(data, { delay: 10 });

      const query = createStreamingQuery({
        source,
        batchSize: 2,
      });

      // Start consuming in background
      const collectPromise = collectStream(query);

      // Wait for completion
      const stats = await query.waitForCompletion();

      await collectPromise;

      expect(stats.completed).toBe(true);
      expect(stats.totalYielded).toBe(5);
    });
  });

  describe('Callbacks', () => {
    it('should call onChunkFetched callback', async () => {
      const data = Array.from({ length: 25 }, (_, i) => i);
      const source = createMockSource(data);
      const chunkCallbacks: Array<{ chunkSize: number; totalFetched: number }> = [];

      const query = createStreamingQuery({
        source,
        batchSize: 10,
        onChunkFetched: (chunkSize, totalFetched) => {
          chunkCallbacks.push({ chunkSize, totalFetched });
        },
      });

      await collectStream(query);

      expect(chunkCallbacks).toEqual([
        { chunkSize: 10, totalFetched: 10 },
        { chunkSize: 10, totalFetched: 20 },
        { chunkSize: 5, totalFetched: 25 },
      ]);
    });

    it('should call onError callback', async () => {
      const data = [1, 2, 3, 4, 5];
      const source = createMockSource(data, { failAtOffset: 3, errorMessage: 'Test error' });
      let capturedError: Error | null = null;

      const query = createStreamingQuery({
        source,
        batchSize: 2,
        onError: (error) => {
          capturedError = error;
        },
      });

      try {
        await collectStream(query);
      } catch {
        // Expected
      }

      expect(capturedError).not.toBeNull();
      expect(capturedError!.message).toBe('Test error');
    });
  });

  describe('Error handling', () => {
    it('should propagate source errors', async () => {
      const data = [1, 2, 3, 4, 5];
      const source = createMockSource(data, { failAtOffset: 3, errorMessage: 'Source failed' });

      const query = createStreamingQuery({
        source,
        batchSize: 2,
      });

      await expect(collectStream(query)).rejects.toThrow('Source failed');
    });

    it('should propagate transform errors', async () => {
      const data = [1, 2, 3];
      const source = createMockSource(data);

      const query = createStreamingQuery({
        source,
        batchSize: 2,
        transform: (x) => {
          if (x === 2) throw new Error('Transform failed');
          return x;
        },
      });

      await expect(collectStream(query)).rejects.toThrow('Transform failed');
    });

    it('should propagate filter errors', async () => {
      const data = [1, 2, 3];
      const source = createMockSource(data);

      const query = createStreamingQuery({
        source,
        batchSize: 2,
        filter: (x) => {
          if (x === 3) throw new Error('Filter failed');
          return true;
        },
      });

      await expect(collectStream(query)).rejects.toThrow('Filter failed');
    });
  });

  describe('Backpressure', () => {
    it('should apply backpressure when buffer exceeds high water mark', async () => {
      const data = Array.from({ length: 100 }, (_, i) => i);
      const source = createMockSource(data);

      const query = createStreamingQuery({
        source,
        batchSize: 10,
        bufferLimit: 30,
        highWaterMark: 20,
        lowWaterMark: 5,
      });

      // Slowly consume to trigger backpressure
      const results: number[] = [];
      for await (const item of query) {
        results.push(item);
        await new Promise(resolve => setTimeout(resolve, 1));
      }

      const stats = query.getStats();
      expect(stats.backpressureEvents).toBeGreaterThan(0);
      expect(results.length).toBe(100);
    });
  });
});

// =============================================================================
// BufferedIterator Tests
// =============================================================================

describe('BufferedIterator', () => {
  it('should buffer items from async iterable', async () => {
    const data = [1, 2, 3, 4, 5];
    const source = createAsyncIterable(data);

    const iterator = createBufferedIterator(source, {
      bufferSize: 10,
    });

    const results = await collectStream(iterator);
    expect(results).toEqual(data);
  });

  it('should apply backpressure when buffer is full', async () => {
    const data = Array.from({ length: 50 }, (_, i) => i);
    const source = createAsyncIterable(data, 1);

    const iterator = createBufferedIterator(source, {
      bufferSize: 10,
      highWaterMark: 8,
      lowWaterMark: 2,
    });

    const results: number[] = [];
    for await (const item of iterator) {
      results.push(item);
      await new Promise(resolve => setTimeout(resolve, 5));
    }

    const stats = iterator.getStats();
    expect(stats.backpressureEvents).toBeGreaterThan(0);
    expect(results).toEqual(data);
  });

  it('should cancel buffered iterator', async () => {
    const data = Array.from({ length: 100 }, (_, i) => i);
    const source = createAsyncIterable(data, 10);

    const iterator = createBufferedIterator(source, {
      bufferSize: 20,
    });

    const results: number[] = [];
    for await (const item of iterator) {
      results.push(item);
      if (results.length >= 5) {
        iterator.cancel();
        break;
      }
    }

    expect(iterator.isCancelled()).toBe(true);
    expect(results.length).toBe(5);
  });

  it('should pause and resume buffered iterator', async () => {
    const data = Array.from({ length: 20 }, (_, i) => i);
    const source = createAsyncIterable(data, 5);

    const iterator = createBufferedIterator(source, {
      bufferSize: 10,
    });

    const results: number[] = [];
    let pausedAt = -1;

    for await (const item of iterator) {
      results.push(item);

      if (results.length === 5 && pausedAt === -1) {
        iterator.pause();
        pausedAt = results.length;
        await new Promise(resolve => setTimeout(resolve, 30));
        iterator.resume();
      }
    }

    expect(results).toEqual(data);
    expect(pausedAt).toBe(5);
  });
});

// =============================================================================
// Chunk Processing Tests
// =============================================================================

describe('processInChunks', () => {
  it('should process array in chunks', async () => {
    const data = Array.from({ length: 25 }, (_, i) => i);
    const processedChunks: number[][] = [];

    const results: number[] = [];
    for await (const item of processInChunks(
      data,
      async (chunk) => {
        processedChunks.push([...chunk]);
        return chunk.map(x => x * 2);
      },
      { chunkSize: 10 }
    )) {
      results.push(item);
    }

    expect(processedChunks).toEqual([
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      [10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
      [20, 21, 22, 23, 24],
    ]);
    expect(results).toEqual(data.map(x => x * 2));
  });

  it('should process async iterable in chunks', async () => {
    const data = Array.from({ length: 15 }, (_, i) => i);
    const source = createAsyncIterable(data);
    const chunkSizes: number[] = [];

    const results: number[] = [];
    for await (const item of processInChunks(
      source,
      async (chunk) => {
        chunkSizes.push(chunk.length);
        return chunk;
      },
      { chunkSize: 4 }
    )) {
      results.push(item);
    }

    expect(chunkSizes).toEqual([4, 4, 4, 3]);
    expect(results).toEqual(data);
  });

  it('should call onChunkProcessed callback', async () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const callbacks: Array<{ chunkIndex: number; outputCount: number }> = [];

    const results: number[] = [];
    for await (const item of processInChunks(
      data,
      async (chunk) => chunk.filter(x => x % 2 === 0),
      {
        chunkSize: 3,
        onChunkProcessed: (chunkIndex, outputCount) => {
          callbacks.push({ chunkIndex, outputCount });
        },
      }
    )) {
      results.push(item);
    }

    expect(callbacks).toEqual([
      { chunkIndex: 0, outputCount: 1 }, // [1,2,3] -> [2] (1 even)
      { chunkIndex: 1, outputCount: 2 }, // [4,5,6] -> [4,6] (2 evens)
      { chunkIndex: 2, outputCount: 1 }, // [7,8,9] -> [8] (1 even)
    ]);
    expect(results).toEqual([2, 4, 6, 8]);
  });

  it('should cancel chunk processing with signal', async () => {
    const data = Array.from({ length: 100 }, (_, i) => i);
    const controller = new AbortController();
    let processedCount = 0;

    setTimeout(() => controller.abort(), 30);

    try {
      for await (const item of processInChunks(
        data,
        async (chunk) => {
          await new Promise(resolve => setTimeout(resolve, 10));
          processedCount += chunk.length;
          return chunk;
        },
        { chunkSize: 5, signal: controller.signal }
      )) {
        // Consume
      }
    } catch (error) {
      expect(error).toBeInstanceOf(StreamingCancelledError);
    }

    expect(processedCount).toBeLessThan(100);
  });
});

// =============================================================================
// Utility Function Tests
// =============================================================================

describe('Streaming utilities', () => {
  describe('collectStream', () => {
    it('should collect all items into array', async () => {
      const data = [1, 2, 3, 4, 5];
      const source = createMockSource(data);
      const query = createStreamingQuery({ source, batchSize: 2 });

      const results = await collectStream(query);
      expect(results).toEqual(data);
    });
  });

  describe('takeFromStream', () => {
    it('should take first N items', async () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const source = createMockSource(data);
      const query = createStreamingQuery({ source, batchSize: 3 });

      const results: number[] = [];
      for await (const item of takeFromStream(query, 5)) {
        results.push(item);
      }

      expect(results).toEqual([1, 2, 3, 4, 5]);
    });

    it('should handle taking more than available', async () => {
      const data = [1, 2, 3];
      const source = createMockSource(data);
      const query = createStreamingQuery({ source, batchSize: 2 });

      const results: number[] = [];
      for await (const item of takeFromStream(query, 10)) {
        results.push(item);
      }

      expect(results).toEqual([1, 2, 3]);
    });
  });

  describe('skipFromStream', () => {
    it('should skip first N items', async () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const source = createMockSource(data);
      const query = createStreamingQuery({ source, batchSize: 3 });

      const results: number[] = [];
      for await (const item of skipFromStream(query, 5)) {
        results.push(item);
      }

      expect(results).toEqual([6, 7, 8, 9, 10]);
    });

    it('should handle skipping more than available', async () => {
      const data = [1, 2, 3];
      const source = createMockSource(data);
      const query = createStreamingQuery({ source, batchSize: 2 });

      const results: number[] = [];
      for await (const item of skipFromStream(query, 10)) {
        results.push(item);
      }

      expect(results).toEqual([]);
    });
  });

  describe('mapStream', () => {
    it('should map items', async () => {
      const data = [1, 2, 3, 4, 5];
      const source = createMockSource(data);
      const query = createStreamingQuery({ source, batchSize: 2 });

      const results: number[] = [];
      for await (const item of mapStream(query, x => x * 10)) {
        results.push(item);
      }

      expect(results).toEqual([10, 20, 30, 40, 50]);
    });

    it('should map with async transform', async () => {
      const data = ['a', 'b', 'c'];
      const source = createMockSource(data);
      const query = createStreamingQuery({ source, batchSize: 2 });

      const results: string[] = [];
      for await (const item of mapStream(query, async x => {
        await new Promise(resolve => setTimeout(resolve, 1));
        return x.toUpperCase();
      })) {
        results.push(item);
      }

      expect(results).toEqual(['A', 'B', 'C']);
    });
  });

  describe('filterStream', () => {
    it('should filter items', async () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const source = createMockSource(data);
      const query = createStreamingQuery({ source, batchSize: 3 });

      const results: number[] = [];
      for await (const item of filterStream(query, x => x % 2 === 0)) {
        results.push(item);
      }

      expect(results).toEqual([2, 4, 6, 8, 10]);
    });

    it('should filter with async predicate', async () => {
      const data = [1, 2, 3, 4, 5];
      const source = createMockSource(data);
      const query = createStreamingQuery({ source, batchSize: 2 });

      const results: number[] = [];
      for await (const item of filterStream(query, async x => {
        await new Promise(resolve => setTimeout(resolve, 1));
        return x > 3;
      })) {
        results.push(item);
      }

      expect(results).toEqual([4, 5]);
    });
  });

  describe('batchStream', () => {
    it('should batch items', async () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const source = createMockSource(data);
      const query = createStreamingQuery({ source, batchSize: 3 });

      const batches: number[][] = [];
      for await (const batch of batchStream(query, 4)) {
        batches.push(batch);
      }

      expect(batches).toEqual([
        [1, 2, 3, 4],
        [5, 6, 7, 8],
        [9, 10],
      ]);
    });

    it('should handle empty stream', async () => {
      const source = createMockSource<number>([]);
      const query = createStreamingQuery({ source, batchSize: 2 });

      const batches: number[][] = [];
      for await (const batch of batchStream(query, 4)) {
        batches.push(batch);
      }

      expect(batches).toEqual([]);
    });
  });

  describe('mergeStreams', () => {
    it('should merge multiple streams', async () => {
      const data1 = [1, 3, 5];
      const data2 = [2, 4, 6];
      const source1 = createMockSource(data1);
      const source2 = createMockSource(data2);

      const query1 = createStreamingQuery({ source: source1, batchSize: 1 });
      const query2 = createStreamingQuery({ source: source2, batchSize: 1 });

      const results: number[] = [];
      for await (const item of mergeStreams(query1, query2)) {
        results.push(item);
      }

      // Results should contain all items (order may vary)
      expect(results.sort()).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('should handle streams of different lengths', async () => {
      const data1 = [1, 2, 3, 4, 5];
      const data2 = [10, 20];
      const source1 = createMockSource(data1);
      const source2 = createMockSource(data2);

      const query1 = createStreamingQuery({ source: source1, batchSize: 2 });
      const query2 = createStreamingQuery({ source: source2, batchSize: 1 });

      const results: number[] = [];
      for await (const item of mergeStreams(query1, query2)) {
        results.push(item);
      }

      expect(results.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 10, 20]);
    });

    it('should handle empty stream in merge', async () => {
      const data1 = [1, 2, 3];
      const data2: number[] = [];
      const source1 = createMockSource(data1);
      const source2 = createMockSource(data2);

      const query1 = createStreamingQuery({ source: source1, batchSize: 2 });
      const query2 = createStreamingQuery({ source: source2, batchSize: 2 });

      const results: number[] = [];
      for await (const item of mergeStreams(query1, query2)) {
        results.push(item);
      }

      expect(results.sort()).toEqual([1, 2, 3]);
    });
  });
});

// =============================================================================
// Error Type Tests
// =============================================================================

describe('Error types', () => {
  describe('StreamingCancelledError', () => {
    it('should have correct properties', () => {
      const error = new StreamingCancelledError('Custom message');
      expect(error.name).toBe('StreamingCancelledError');
      expect(error.message).toBe('Custom message');
      expect(error.isStreamingCancelledError).toBe(true);
    });

    it('should have default message', () => {
      const error = new StreamingCancelledError();
      expect(error.message).toBe('Streaming query was cancelled');
    });
  });

  describe('BackpressureTimeoutError', () => {
    it('should have correct properties', () => {
      const error = new BackpressureTimeoutError(5000, 4000);
      expect(error.name).toBe('BackpressureTimeoutError');
      expect(error.isBackpressureTimeoutError).toBe(true);
      expect(error.bufferSize).toBe(5000);
      expect(error.bufferLimit).toBe(4000);
      expect(error.message).toContain('5000');
      expect(error.message).toContain('4000');
    });
  });
});

// =============================================================================
// Memory Efficiency Tests
// =============================================================================

describe('Memory efficiency', () => {
  it('should not load all data into memory at once', async () => {
    // Create a large dataset
    const totalItems = 10000;
    let maxConcurrentItems = 0;
    let currentItems = 0;

    const source = async (offset: number, limit: number): Promise<number[] | null> => {
      if (offset >= totalItems) return null;
      const chunk = Array.from(
        { length: Math.min(limit, totalItems - offset) },
        (_, i) => offset + i
      );
      currentItems += chunk.length;
      maxConcurrentItems = Math.max(maxConcurrentItems, currentItems);
      return chunk;
    };

    const query = createStreamingQuery({
      source,
      batchSize: 100,
      bufferLimit: 500,
      highWaterMark: 400,
      lowWaterMark: 100,
    });

    let consumed = 0;
    for await (const _ of query) {
      consumed++;
      currentItems--;
      // Add small delay to allow backpressure to kick in
      if (consumed % 100 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    }

    expect(consumed).toBe(totalItems);
    // Should never have had all items in memory
    expect(maxConcurrentItems).toBeLessThan(totalItems);
    // Buffer limit should be respected (with some margin for timing)
    expect(maxConcurrentItems).toBeLessThan(1000);
  });

  it('should release memory after cancel', async () => {
    const data = Array.from({ length: 1000 }, (_, i) => ({ id: i, data: 'x'.repeat(100) }));
    const source = createMockSource(data);

    const query = createStreamingQuery({
      source,
      batchSize: 100,
      bufferLimit: 500,
    });

    // Consume a few items
    let count = 0;
    for await (const _ of query) {
      count++;
      if (count >= 50) break;
    }

    // Cancel should clear buffer
    query.cancel();

    // Stats should reflect cancellation
    const stats = query.getStats();
    expect(stats.cancelled).toBe(true);
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Integration', () => {
  it('should handle complex pipeline', async () => {
    // Create source data
    const data = Array.from({ length: 100 }, (_, i) => ({
      id: i,
      name: `User ${i}`,
      score: i * 10,
      active: i % 3 !== 0,
    }));

    const source = createMockSource(data);

    // Create streaming query with transform and filter
    const query = createStreamingQuery({
      source,
      batchSize: 10,
      bufferLimit: 30,
      transform: (user) => ({
        ...user,
        grade: user.score >= 500 ? 'A' : user.score >= 300 ? 'B' : 'C',
      }),
      filter: (user) => user.active,
    });

    // Apply additional transformations
    const mapped = mapStream(query, user => ({
      id: user.id,
      grade: user.grade,
    }));

    // Collect results
    const results: Array<{ id: number; grade: string }> = [];
    for await (const item of mapped) {
      results.push(item);
    }

    // Verify results
    expect(results.length).toBeLessThan(100); // Some filtered out
    expect(results.every(r => r.grade !== undefined)).toBe(true);
  });

  it('should handle concurrent streams', async () => {
    const data1 = Array.from({ length: 50 }, (_, i) => `stream1-${i}`);
    const data2 = Array.from({ length: 50 }, (_, i) => `stream2-${i}`);
    const data3 = Array.from({ length: 50 }, (_, i) => `stream3-${i}`);

    const source1 = createMockSource(data1, { delay: 5 });
    const source2 = createMockSource(data2, { delay: 3 });
    const source3 = createMockSource(data3, { delay: 7 });

    const query1 = createStreamingQuery({ source: source1, batchSize: 10 });
    const query2 = createStreamingQuery({ source: source2, batchSize: 10 });
    const query3 = createStreamingQuery({ source: source3, batchSize: 10 });

    // Consume all three concurrently
    const [results1, results2, results3] = await Promise.all([
      collectStream(query1),
      collectStream(query2),
      collectStream(query3),
    ]);

    expect(results1).toEqual(data1);
    expect(results2).toEqual(data2);
    expect(results3).toEqual(data3);
  });
});

// =============================================================================
// ResultStream Tests - TDD Implementation for evodb-lh2l
// =============================================================================

import {
  ResultStream,
  createResultStream,
  generateRows,
  generateSlowRows,
  sleep,
  AbortError,
  type ProgressInfo,
} from '../streaming.js';

describe('ResultStream', () => {
  describe('Async Iterator Pattern', () => {
    it('should return async iterable for queries', async () => {
      const stream = createResultStream([1, 2, 3]);

      expect(Symbol.asyncIterator in stream).toBe(true);
    });

    it('should yield rows one at a time', async () => {
      const mockRows = Array.from({ length: 100 }, (_, i) => ({ id: i }));
      const stream = createResultStream(mockRows);

      const received: typeof mockRows = [];
      for await (const row of stream) {
        received.push(row);
      }

      expect(received).toEqual(mockRows);
    });

    it('should support for-await-of syntax', async () => {
      const data = Array.from({ length: 10 }, (_, i) => ({ id: i, name: `item${i}` }));
      const stream = createResultStream(data);

      let count = 0;
      for await (const row of stream) {
        expect(row).toHaveProperty('id');
        expect(row).toHaveProperty('name');
        count++;
      }

      expect(count).toBe(10);
    });

    it('should work with collect() method', async () => {
      const stream = createResultStream([{ a: 1 }, { a: 2 }, { a: 3 }]);

      const rows = await stream.collect();

      expect(rows).toHaveLength(3);
      expect(rows).toEqual([{ a: 1 }, { a: 2 }, { a: 3 }]);
    });

    it('should work with async generator function', async () => {
      const stream = createResultStream(async function*() {
        yield { id: 1 };
        yield { id: 2 };
        yield { id: 3 };
      });

      const results = await stream.collect();
      expect(results).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    });
  });

  describe('Chunked Delivery', () => {
    it('should support chunked batch delivery', async () => {
      const stream = createResultStream(generateRows(100), {
        chunkSize: 10,
      });

      const chunks: Array<{ id: number }[]> = [];
      for await (const chunk of stream.chunks()) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(10);
      expect(chunks[0]).toHaveLength(10);
      expect(chunks.flat()).toHaveLength(100);
    });

    it('should handle partial final chunk', async () => {
      const stream = createResultStream(generateRows(25), {
        chunkSize: 10,
      });

      const chunks: Array<{ id: number }[]> = [];
      for await (const chunk of stream.chunks()) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(3);
      expect(chunks[0]).toHaveLength(10);
      expect(chunks[1]).toHaveLength(10);
      expect(chunks[2]).toHaveLength(5); // Partial chunk
    });

    it('should support configurable chunk timeout', async () => {
      // Create a slow stream
      const stream = createResultStream(generateSlowRows(5, 30), {
        chunkSize: 10,
        chunkTimeoutMs: 50, // Emit chunk after 50ms even if not full
      });

      const chunks: Array<{ id: number }[]> = [];

      for await (const chunk of stream.chunks()) {
        chunks.push(chunk);
      }

      // Should have received chunks (possibly partial due to timeout)
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.flat()).toHaveLength(5);
    });

    it('should handle empty stream for chunks', async () => {
      const stream = createResultStream<{ id: number }>([]);

      const chunks: Array<{ id: number }[]> = [];
      for await (const chunk of stream.chunks()) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(0);
    });
  });

  describe('Progress Callbacks', () => {
    it('should report progress during streaming', async () => {
      const progressUpdates: ProgressInfo[] = [];

      const stream = createResultStream(generateRows(100), {
        totalCount: 100,
        onProgress: (progress) => progressUpdates.push({ ...progress }),
        progressInterval: 10,
      });

      for await (const _ of stream) {
        // consume
      }

      expect(progressUpdates.length).toBeGreaterThan(0);
      const lastProgress = progressUpdates[progressUpdates.length - 1];
      expect(lastProgress.processed).toBe(100);
      expect(lastProgress.total).toBe(100);
      expect(lastProgress.percent).toBe(100);
    });

    it('should report progress without total count', async () => {
      const progressUpdates: ProgressInfo[] = [];

      const stream = createResultStream(generateRows(50), {
        onProgress: (progress) => progressUpdates.push({ ...progress }),
        progressInterval: 10, // Report every 10 rows
      });

      for await (const _ of stream) {
        // consume
      }

      expect(progressUpdates.some(p => p.processed === 10)).toBe(true);
      expect(progressUpdates.some(p => p.processed === 50)).toBe(true);
      expect(progressUpdates[0].percent).toBeUndefined(); // No total means no percent
    });

    it('should include timing information in progress', async () => {
      const progressUpdates: ProgressInfo[] = [];

      const stream = createResultStream(generateSlowRows(20, 10), {
        onProgress: (progress) => progressUpdates.push({ ...progress }),
        progressInterval: 5,
      });

      for await (const _ of stream) {
        // consume
      }

      const lastProgress = progressUpdates[progressUpdates.length - 1];
      expect(lastProgress.elapsedMs).toBeGreaterThan(0);
      expect(lastProgress.rowsPerSecond).toBeDefined();
      expect(lastProgress.rowsPerSecond).toBeGreaterThan(0);
    });
  });

  describe('Cancellation', () => {
    it('should support cancellation via AbortSignal', async () => {
      const controller = new AbortController();
      const stream = createResultStream(generateRows(1000), {
        signal: controller.signal,
      });

      let count = 0;
      let caughtError: Error | null = null;

      try {
        for await (const _ of stream) {
          count++;
          if (count === 50) {
            controller.abort();
          }
        }
      } catch (error) {
        caughtError = error as Error;
      }

      expect(caughtError).toBeInstanceOf(AbortError);
      expect(count).toBeLessThan(100);
    });

    it('should clean up resources on cancellation', async () => {
      let cleanupCalled = false;
      const controller = new AbortController();

      const stream = createResultStream(generateRows(100), {
        signal: controller.signal,
        onCleanup: () => { cleanupCalled = true; },
      });

      let count = 0;
      try {
        for await (const _ of stream) {
          count++;
          if (count === 10) controller.abort();
        }
      } catch {
        // Expected
      }

      expect(cleanupCalled).toBe(true);
    });

    it('should support manual cancellation method', async () => {
      const stream = createResultStream(generateRows(100));

      let count = 0;
      try {
        for await (const _ of stream) {
          count++;
          if (count === 25) {
            stream.cancel('Manual cancellation');
          }
        }
      } catch (error) {
        expect(error).toBeInstanceOf(AbortError);
      }

      expect(count).toBeLessThanOrEqual(30); // Some items may still process
      expect(stream.cancelled).toBe(true);
      expect(stream.cancelReason).toBe('Manual cancellation');
    });

    it('should handle timeout cancellation', async () => {
      const stream = createResultStream(generateSlowRows(100, 50), {
        timeoutMs: 200,
      });

      const startTime = Date.now();

      await expect(async () => {
        for await (const _ of stream) {
          // consume slowly
        }
      }).rejects.toThrow(/timeout|aborted/i);

      expect(Date.now() - startTime).toBeLessThan(1000);
    });

    it('should handle pre-aborted signal', async () => {
      const controller = new AbortController();
      controller.abort();

      const stream = createResultStream(generateRows(100), {
        signal: controller.signal,
      });

      expect(stream.cancelled).toBe(true);
    });
  });

  describe('Transformations', () => {
    it('should support map transformation', async () => {
      const stream = createResultStream([{ x: 1 }, { x: 2 }, { x: 3 }]);

      const doubled = stream.map(row => ({ x: row.x * 2 }));

      const results = await doubled.collect();
      expect(results).toEqual([{ x: 2 }, { x: 4 }, { x: 6 }]);
    });

    it('should support async map transformation', async () => {
      const stream = createResultStream([{ x: 1 }, { x: 2 }, { x: 3 }]);

      const doubled = stream.map(async row => {
        await sleep(1);
        return { x: row.x * 2 };
      });

      const results = await doubled.collect();
      expect(results).toEqual([{ x: 2 }, { x: 4 }, { x: 6 }]);
    });

    it('should support filter transformation', async () => {
      const stream = createResultStream([{ x: 1 }, { x: 2 }, { x: 3 }, { x: 4 }]);

      const evens = stream.filter(row => row.x % 2 === 0);

      const results = await evens.collect();
      expect(results).toEqual([{ x: 2 }, { x: 4 }]);
    });

    it('should support async filter transformation', async () => {
      const stream = createResultStream([{ x: 1 }, { x: 2 }, { x: 3 }, { x: 4 }]);

      const evens = stream.filter(async row => {
        await sleep(1);
        return row.x % 2 === 0;
      });

      const results = await evens.collect();
      expect(results).toEqual([{ x: 2 }, { x: 4 }]);
    });

    it('should support take operation', async () => {
      const stream = createResultStream(generateRows(100));

      const subset = stream.take(5);

      const results = await subset.collect();
      expect(results).toHaveLength(5);
      expect(results[0].id).toBe(0);
      expect(results[4].id).toBe(4);
    });

    it('should support skip operation', async () => {
      const stream = createResultStream(generateRows(100));

      const subset = stream.skip(95);

      const results = await subset.collect();
      expect(results).toHaveLength(5);
      expect(results[0].id).toBe(95);
    });

    it('should support take/skip combination', async () => {
      const stream = createResultStream(generateRows(100));

      const subset = stream.skip(10).take(5);

      const results = await subset.collect();
      expect(results).toHaveLength(5);
      expect(results[0].id).toBe(10);
      expect(results[4].id).toBe(14);
    });

    it('should chain transformations lazily', async () => {
      let mapCalls = 0;
      let filterCalls = 0;

      const stream = createResultStream(generateRows(100))
        .map(row => { mapCalls++; return row; })
        .filter(row => { filterCalls++; return row.id < 5; })
        .take(5);

      // Nothing executed yet (lazy evaluation)
      // Note: mapCalls and filterCalls are still 0 before we start iterating
      expect(mapCalls).toBe(0);
      expect(filterCalls).toBe(0);

      const results = await stream.collect();

      expect(results).toHaveLength(5);
      // Since filter passes for id < 5, and take(5) gets exactly 5 items,
      // we process rows until we get 5 matching items (ids 0-4)
      // This means all transformations run on those rows
      expect(mapCalls).toBeGreaterThanOrEqual(5);
      expect(filterCalls).toBeGreaterThanOrEqual(5);
    });

    it('should support reduce operation', async () => {
      const stream = createResultStream([{ x: 1 }, { x: 2 }, { x: 3 }]);

      const sum = await stream.reduce((acc, row) => acc + row.x, 0);

      expect(sum).toBe(6);
    });

    it('should support first operation', async () => {
      const stream = createResultStream([{ x: 1 }, { x: 2 }, { x: 3 }]);

      const first = await stream.first();

      expect(first).toEqual({ x: 1 });
    });

    it('should return undefined for first on empty stream', async () => {
      const stream = createResultStream<{ x: number }>([]);

      const first = await stream.first();

      expect(first).toBeUndefined();
    });

    it('should support count operation', async () => {
      const stream = createResultStream(generateRows(50));

      const count = await stream.count();

      expect(count).toBe(50);
    });

    it('should support some operation', async () => {
      const stream = createResultStream([{ x: 1 }, { x: 2 }, { x: 3 }]);

      const hasEven = await stream.some(row => row.x % 2 === 0);

      expect(hasEven).toBe(true);
    });

    it('should support every operation', async () => {
      const stream = createResultStream([{ x: 2 }, { x: 4 }, { x: 6 }]);

      const allEven = await stream.every(row => row.x % 2 === 0);

      expect(allEven).toBe(true);
    });

    it('should support find operation', async () => {
      const stream = createResultStream([{ x: 1 }, { x: 2 }, { x: 3 }]);

      const found = await stream.find(row => row.x === 2);

      expect(found).toEqual({ x: 2 });
    });

    it('should support tap for side effects', async () => {
      const sideEffects: number[] = [];
      const stream = createResultStream([{ x: 1 }, { x: 2 }, { x: 3 }]);

      const tapped = stream.tap(row => sideEffects.push(row.x));

      const results = await tapped.collect();

      expect(results).toEqual([{ x: 1 }, { x: 2 }, { x: 3 }]);
      expect(sideEffects).toEqual([1, 2, 3]);
    });

    it('should support flatMap operation', async () => {
      const stream = createResultStream([{ items: [1, 2] }, { items: [3, 4] }]);

      const flattened = stream.flatMap(row => row.items);

      const results = await flattened.collect();
      expect(results).toEqual([1, 2, 3, 4]);
    });

    it('should support takeWhile operation', async () => {
      const stream = createResultStream(generateRows(100));

      const subset = stream.takeWhile(row => row.id < 5);

      const results = await subset.collect();
      expect(results).toHaveLength(5);
      expect(results[4].id).toBe(4);
    });

    it('should support skipWhile operation', async () => {
      const stream = createResultStream(generateRows(10));

      const subset = stream.skipWhile(row => row.id < 5);

      const results = await subset.collect();
      expect(results).toHaveLength(5);
      expect(results[0].id).toBe(5);
    });

    it('should support concat operation', async () => {
      const stream1 = createResultStream([{ x: 1 }, { x: 2 }]);
      const other = [{ x: 3 }, { x: 4 }];

      const combined = stream1.concat(other);

      const results = await combined.collect();
      expect(results).toEqual([{ x: 1 }, { x: 2 }, { x: 3 }, { x: 4 }]);
    });

    it('should support distinct operation', async () => {
      const stream = createResultStream([
        { id: 1, name: 'a' },
        { id: 2, name: 'b' },
        { id: 1, name: 'a' },
        { id: 3, name: 'c' },
      ]);

      const unique = stream.distinct(row => row.id);

      const results = await unique.collect();
      expect(results).toHaveLength(3);
      expect(results.map(r => r.id)).toEqual([1, 2, 3]);
    });

    it('should support buffer operation', async () => {
      const stream = createResultStream(generateRows(10));

      const buffered = stream.buffer(3);

      const results = await buffered.collect();
      expect(results).toHaveLength(4); // 3 + 3 + 3 + 1
      expect(results[0]).toHaveLength(3);
      expect(results[3]).toHaveLength(1);
    });
  });

  describe('Error Handling', () => {
    it('should propagate errors from source', async () => {
      const stream = createResultStream(async function*() {
        yield { id: 1 };
        yield { id: 2 };
        throw new Error('Source error');
      });

      const received: { id: number }[] = [];

      await expect(async () => {
        for await (const row of stream) {
          received.push(row);
        }
      }).rejects.toThrow('Source error');

      expect(received).toHaveLength(2);
    });

    it('should clean up on error', async () => {
      let cleanupCalled = false;

      const stream = createResultStream(async function*() {
        yield { id: 1 };
        throw new Error('fail');
      }, {
        onCleanup: () => { cleanupCalled = true; },
      });

      try {
        for await (const _ of stream) {}
      } catch {
        // Expected
      }

      expect(cleanupCalled).toBe(true);
    });

    it('should propagate transform errors', async () => {
      const stream = createResultStream([{ x: 1 }, { x: 2 }, { x: 3 }]);

      const failing = stream.map(row => {
        if (row.x === 2) throw new Error('Transform error');
        return row;
      });

      await expect(failing.collect()).rejects.toThrow('Transform error');
    });

    it('should propagate filter errors', async () => {
      const stream = createResultStream([{ x: 1 }, { x: 2 }, { x: 3 }]);

      const failing = stream.filter(row => {
        if (row.x === 2) throw new Error('Filter error');
        return true;
      });

      await expect(failing.collect()).rejects.toThrow('Filter error');
    });
  });

  describe('Event Handlers', () => {
    it('should emit cancel event', async () => {
      const events: string[] = [];
      const stream = createResultStream(generateRows(100));

      stream.on('cancel', (reason) => events.push(`cancel:${reason}`));

      stream.cancel('test reason');

      expect(events).toContain('cancel:test reason');
    });

    it('should emit cleanup event', async () => {
      const events: string[] = [];
      const stream = createResultStream([1, 2, 3]);

      stream.on('cleanup', () => events.push('cleanup'));

      await stream.collect();

      expect(events).toContain('cleanup');
    });
  });
});

// =============================================================================
// AbortError Tests
// =============================================================================

describe('AbortError', () => {
  it('should have correct properties', () => {
    const error = new AbortError('Custom message');
    expect(error.name).toBe('AbortError');
    expect(error.message).toBe('Custom message');
    expect(error.isAbortError).toBe(true);
  });

  it('should have default message', () => {
    const error = new AbortError();
    expect(error.message).toBe('Stream aborted');
  });
});
