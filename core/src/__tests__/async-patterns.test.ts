/**
 * Async/Await Test Patterns for EvoDB
 *
 * Tests for R2 operations, query execution with async data sources,
 * and CDC pipeline async operations with proper error handling.
 *
 * Issue: evodb-azl - TDD: Add async/await test patterns
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  MemoryObjectStorageAdapter,
  R2ObjectStorageAdapter,
  createMemoryObjectAdapter,
  createR2ObjectAdapter,
  createMemoryAdapter,
  type ObjectStorageAdapter,
  type R2BucketLike,
  type R2ObjectLike,
  type ObjectMetadata,
} from '../storage.js';
import { writeBlock, readBlock } from '../block.js';
import { shred, unshred, type Column } from '../shred.js';
import { encode, decode } from '../encode.js';

// =============================================================================
// 1. R2 Read/Write Operations with Mocks
// =============================================================================

describe('R2 Async Operations', () => {
  describe('MemoryObjectStorageAdapter', () => {
    let adapter: MemoryObjectStorageAdapter;

    beforeEach(() => {
      adapter = createMemoryObjectAdapter();
    });

    describe('put/get operations', () => {
      it('should write and read data asynchronously', async () => {
        const data = new TextEncoder().encode('Hello, World!');

        await adapter.put('test/file.txt', data);
        const result = await adapter.get('test/file.txt');

        expect(result).not.toBeNull();
        expect(new TextDecoder().decode(result!)).toBe('Hello, World!');
      });

      it('should handle concurrent writes to different keys', async () => {
        const writes = Array.from({ length: 10 }, (_, i) => {
          const data = new TextEncoder().encode(`Data ${i}`);
          return adapter.put(`concurrent/file-${i}.txt`, data);
        });

        await Promise.all(writes);

        // Verify all writes succeeded
        for (let i = 0; i < 10; i++) {
          const result = await adapter.get(`concurrent/file-${i}.txt`);
          expect(result).not.toBeNull();
          expect(new TextDecoder().decode(result!)).toBe(`Data ${i}`);
        }
      });

      it('should handle concurrent reads', async () => {
        // Setup data
        await adapter.put('read-test/data.txt', new TextEncoder().encode('test data'));

        // Concurrent reads
        const reads = Array.from({ length: 5 }, () =>
          adapter.get('read-test/data.txt')
        );

        const results = await Promise.all(reads);

        // All reads should return the same data
        for (const result of results) {
          expect(result).not.toBeNull();
          expect(new TextDecoder().decode(result!)).toBe('test data');
        }
      });

      it('should return null for non-existent keys', async () => {
        const result = await adapter.get('non-existent/path.txt');
        expect(result).toBeNull();
      });

      it('should handle large binary data', async () => {
        // Create 1MB of random data
        const largeData = new Uint8Array(1024 * 1024);
        for (let i = 0; i < largeData.length; i++) {
          largeData[i] = Math.floor(Math.random() * 256);
        }

        await adapter.put('large/data.bin', largeData);
        const result = await adapter.get('large/data.bin');

        expect(result).not.toBeNull();
        expect(result!.length).toBe(largeData.length);
        // Verify data integrity
        for (let i = 0; i < 1000; i++) {
          const idx = Math.floor(Math.random() * largeData.length);
          expect(result![idx]).toBe(largeData[idx]);
        }
      });
    });

    describe('delete operations', () => {
      it('should delete existing objects', async () => {
        await adapter.put('delete-test/file.txt', new TextEncoder().encode('delete me'));
        expect(await adapter.exists('delete-test/file.txt')).toBe(true);

        await adapter.delete('delete-test/file.txt');
        expect(await adapter.exists('delete-test/file.txt')).toBe(false);
      });

      it('should handle deleting non-existent objects gracefully', async () => {
        // Should not throw
        await expect(adapter.delete('non-existent.txt')).resolves.toBeUndefined();
      });
    });

    describe('list operations', () => {
      beforeEach(async () => {
        await adapter.put('list-test/a/1.txt', new Uint8Array([1]));
        await adapter.put('list-test/a/2.txt', new Uint8Array([2]));
        await adapter.put('list-test/b/1.txt', new Uint8Array([3]));
        await adapter.put('other/file.txt', new Uint8Array([4]));
      });

      it('should list objects with prefix', async () => {
        const files = await adapter.list('list-test/a/');
        expect(files).toHaveLength(2);
        expect(files).toContain('list-test/a/1.txt');
        expect(files).toContain('list-test/a/2.txt');
      });

      it('should return empty array for non-matching prefix', async () => {
        const files = await adapter.list('nonexistent/');
        expect(files).toHaveLength(0);
      });

      it('should list all objects with empty prefix', async () => {
        const files = await adapter.list('');
        expect(files.length).toBeGreaterThanOrEqual(4);
      });
    });

    describe('head operations', () => {
      it('should return metadata for existing objects', async () => {
        const data = new TextEncoder().encode('metadata test');
        await adapter.put('meta/file.txt', data);

        const meta = await adapter.head('meta/file.txt');

        expect(meta).not.toBeNull();
        expect(meta!.size).toBe(data.length);
        expect(meta!.etag).toBeDefined();
        expect(meta!.lastModified).toBeInstanceOf(Date);
      });

      it('should return null for non-existent objects', async () => {
        const meta = await adapter.head('non-existent.txt');
        expect(meta).toBeNull();
      });
    });

    describe('getRange operations', () => {
      it('should read partial data from beginning', async () => {
        const data = new TextEncoder().encode('Hello, World!');
        await adapter.put('range/file.txt', data);

        const result = await adapter.getRange('range/file.txt', 0, 5);
        expect(new TextDecoder().decode(result)).toBe('Hello');
      });

      it('should read partial data from middle', async () => {
        const data = new TextEncoder().encode('Hello, World!');
        await adapter.put('range/file.txt', data);

        const result = await adapter.getRange('range/file.txt', 7, 5);
        expect(new TextDecoder().decode(result)).toBe('World');
      });

      it('should support negative offset (from end)', async () => {
        const data = new TextEncoder().encode('Hello, World!');
        await adapter.put('range/file.txt', data);

        const result = await adapter.getRange('range/file.txt', -6, 5);
        expect(new TextDecoder().decode(result)).toBe('World');
      });

      it('should throw for non-existent objects', async () => {
        await expect(
          adapter.getRange('non-existent.txt', 0, 10)
        ).rejects.toThrow('Object not found');
      });
    });
  });

  describe('R2ObjectStorageAdapter with Mock R2Bucket', () => {
    function createMockR2Bucket(): R2BucketLike & { _storage: Map<string, Uint8Array> } {
      const storage = new Map<string, Uint8Array>();

      return {
        _storage: storage,

        async get(key: string): Promise<R2ObjectLike | null> {
          const data = storage.get(key);
          if (!data) return null;
          return {
            key,
            size: data.length,
            etag: `"${key.length}"`,
            uploaded: new Date(),
            async arrayBuffer() {
              return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
            },
          };
        },

        async put(key: string, value: ArrayBuffer | Uint8Array | string): Promise<R2ObjectLike> {
          let data: Uint8Array;
          if (typeof value === 'string') {
            data = new TextEncoder().encode(value);
          } else if (value instanceof ArrayBuffer) {
            data = new Uint8Array(value);
          } else {
            data = value;
          }
          storage.set(key, data.slice());
          return {
            key,
            size: data.length,
            etag: `"${key.length}"`,
            uploaded: new Date(),
            async arrayBuffer() {
              return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
            },
          };
        },

        async delete(key: string): Promise<void> {
          storage.delete(key);
        },

        async list(options?: { prefix?: string; cursor?: string; limit?: number }) {
          const prefix = options?.prefix ?? '';
          const objects: R2ObjectLike[] = [];
          for (const [key, data] of storage) {
            if (key.startsWith(prefix)) {
              objects.push({
                key,
                size: data.length,
                etag: `"${key.length}"`,
                uploaded: new Date(),
                async arrayBuffer() {
                  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
                },
              });
            }
          }
          return { objects, truncated: false };
        },

        async head(key: string): Promise<R2ObjectLike | null> {
          const data = storage.get(key);
          if (!data) return null;
          return {
            key,
            size: data.length,
            etag: `"${key.length}"`,
            uploaded: new Date(),
            async arrayBuffer() {
              return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
            },
          };
        },
      };
    }

    it('should wrap R2Bucket and provide ObjectStorageAdapter interface', async () => {
      const mockBucket = createMockR2Bucket();
      const adapter = createR2ObjectAdapter(mockBucket);

      await adapter.put('test.txt', new TextEncoder().encode('R2 test'));
      const result = await adapter.get('test.txt');

      expect(result).not.toBeNull();
      expect(new TextDecoder().decode(result!)).toBe('R2 test');
    });

    it('should handle key prefix correctly', async () => {
      const mockBucket = createMockR2Bucket();
      const adapter = createR2ObjectAdapter(mockBucket, 'my-prefix');

      await adapter.put('file.txt', new TextEncoder().encode('prefixed'));

      // The actual key in the bucket should have the prefix
      expect(mockBucket._storage.has('my-prefix/file.txt')).toBe(true);

      // Reading back should work with the original key
      const result = await adapter.get('file.txt');
      expect(new TextDecoder().decode(result!)).toBe('prefixed');
    });

    it('should handle R2 errors gracefully', async () => {
      const errorBucket: R2BucketLike = {
        async get() {
          throw new Error('R2 service unavailable');
        },
        async put() {
          throw new Error('R2 service unavailable');
        },
        async delete() {
          throw new Error('R2 service unavailable');
        },
        async list() {
          throw new Error('R2 service unavailable');
        },
        async head() {
          throw new Error('R2 service unavailable');
        },
      };

      const adapter = createR2ObjectAdapter(errorBucket);

      await expect(adapter.get('test.txt')).rejects.toThrow('R2 service unavailable');
      await expect(adapter.put('test.txt', new Uint8Array())).rejects.toThrow('R2 service unavailable');
    });
  });
});

// =============================================================================
// 2. Query Execution with Async Data Sources
// =============================================================================

describe('Query Execution with Async Data Sources', () => {
  describe('Block operations', () => {
    let storage: MemoryObjectStorageAdapter;

    beforeEach(() => {
      storage = createMemoryObjectAdapter();
    });

    it('should write and read blocks asynchronously', async () => {
      const docs = [
        { id: 1, name: 'Alice', age: 30 },
        { id: 2, name: 'Bob', age: 25 },
        { id: 3, name: 'Charlie', age: 35 },
      ];

      const shredResult = shred(docs);
      const encoded = encode(shredResult);
      const block = writeBlock(encoded, { rowCount: docs.length });

      // Write to storage
      await storage.put('blocks/test-block.bin', block);

      // Read back
      const readData = await storage.get('blocks/test-block.bin');
      expect(readData).not.toBeNull();

      // Parse and decode
      const parsed = readBlock(readData!);
      expect(parsed.header.rowCount).toBe(3);

      // Decode and verify data - unshred returns the original documents
      const decoded = unshred(parsed.columns, parsed.header.rowCount);
      expect(decoded.length).toBe(3); // 3 documents
      expect(decoded[0]).toEqual({ id: 1, name: 'Alice', age: 30 });
    });

    it('should handle parallel block reads', async () => {
      // Create multiple blocks
      const blockIds = ['block-1', 'block-2', 'block-3'];

      for (let i = 0; i < blockIds.length; i++) {
        const docs = Array.from({ length: 100 }, (_, j) => ({
          id: i * 100 + j,
          value: `Block ${i} Row ${j}`,
        }));
        const shredResult = shred(docs);
        const encoded = encode(shredResult);
        const block = writeBlock(encoded, { rowCount: docs.length });
        await storage.put(`blocks/${blockIds[i]}.bin`, block);
      }

      // Read all blocks in parallel
      const reads = blockIds.map(async id => {
        const data = await storage.get(`blocks/${id}.bin`);
        if (!data) throw new Error(`Block ${id} not found`);
        return readBlock(data);
      });

      const blocks = await Promise.all(reads);

      expect(blocks).toHaveLength(3);
      for (const block of blocks) {
        expect(block.header.rowCount).toBe(100);
      }
    });
  });

  describe('Async data source patterns', () => {
    it('should support async iterator for streaming results', async () => {
      const storage = createMemoryObjectAdapter();

      // Create test data in storage
      for (let i = 0; i < 5; i++) {
        const docs = [{ batch: i, value: i * 10 }];
        const shredResult = shred(docs);
        const encoded = encode(shredResult);
        await storage.put(`stream/batch-${i}.bin`, writeBlock(encoded, { rowCount: docs.length }));
      }

      // Async generator for streaming
      async function* streamBlocks(): AsyncGenerator<number> {
        const files = await storage.list('stream/');
        for (const file of files.sort()) {
          const data = await storage.get(file);
          if (data) {
            const block = readBlock(data);
            yield block.header.rowCount;
          }
        }
      }

      // Consume stream
      const rowCounts: number[] = [];
      for await (const count of streamBlocks()) {
        rowCounts.push(count);
      }

      expect(rowCounts).toEqual([1, 1, 1, 1, 1]);
    });

    it('should handle async data transformations', async () => {
      const docs = [
        { name: 'alice', score: 85 },
        { name: 'bob', score: 92 },
        { name: 'charlie', score: 78 },
      ];

      // Async transformation pipeline
      async function processData<T, U>(
        data: T[],
        transform: (item: T) => Promise<U>
      ): Promise<U[]> {
        return Promise.all(data.map(transform));
      }

      const results = await processData(docs, async doc => {
        // Simulate async lookup
        await new Promise(resolve => setTimeout(resolve, 1));
        return {
          ...doc,
          name: doc.name.toUpperCase(),
          grade: doc.score >= 90 ? 'A' : doc.score >= 80 ? 'B' : 'C',
        };
      });

      expect(results[0]).toEqual({ name: 'ALICE', score: 85, grade: 'B' });
      expect(results[1]).toEqual({ name: 'BOB', score: 92, grade: 'A' });
      expect(results[2]).toEqual({ name: 'CHARLIE', score: 78, grade: 'C' });
    });
  });
});

// =============================================================================
// 3. CDC Pipeline Async Operations
// =============================================================================

describe('CDC Pipeline Async Operations', () => {
  // Mock WAL entry type
  interface WalEntry {
    lsn: bigint;
    operation: 'insert' | 'update' | 'delete';
    table: string;
    data: Record<string, unknown>;
    timestamp: number;
  }

  // Mock CDC event type
  interface CDCEvent {
    lsn: bigint;
    type: 'insert' | 'update' | 'delete';
    table: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  }

  describe('WAL processing', () => {
    it('should process WAL entries asynchronously', async () => {
      const walEntries: WalEntry[] = [
        { lsn: 1n, operation: 'insert', table: 'users', data: { id: 1, name: 'Alice' }, timestamp: Date.now() },
        { lsn: 2n, operation: 'update', table: 'users', data: { id: 1, name: 'Alice Updated' }, timestamp: Date.now() },
        { lsn: 3n, operation: 'delete', table: 'users', data: { id: 1 }, timestamp: Date.now() },
      ];

      async function processWal(entries: WalEntry[]): Promise<CDCEvent[]> {
        return entries.map(entry => ({
          lsn: entry.lsn,
          type: entry.operation,
          table: entry.table,
          after: entry.operation !== 'delete' ? entry.data : undefined,
        }));
      }

      const events = await processWal(walEntries);

      expect(events).toHaveLength(3);
      expect(events[0].type).toBe('insert');
      expect(events[1].type).toBe('update');
      expect(events[2].type).toBe('delete');
    });

    it('should handle async checkpointing', async () => {
      const storage = createMemoryAdapter();
      let checkpoint = 0n;

      async function saveCheckpoint(lsn: bigint): Promise<void> {
        await storage.writeBlock('checkpoint', new TextEncoder().encode(lsn.toString()));
        checkpoint = lsn;
      }

      async function loadCheckpoint(): Promise<bigint> {
        const data = await storage.readBlock('checkpoint');
        if (!data) return 0n;
        return BigInt(new TextDecoder().decode(data));
      }

      // Save checkpoint
      await saveCheckpoint(100n);
      expect(checkpoint).toBe(100n);

      // Load checkpoint
      const loaded = await loadCheckpoint();
      expect(loaded).toBe(100n);

      // Update checkpoint
      await saveCheckpoint(200n);
      const updated = await loadCheckpoint();
      expect(updated).toBe(200n);
    });

    it('should batch WAL entries efficiently', async () => {
      const batchSize = 100;
      const totalEntries = 500;
      const processedBatches: number[] = [];

      // Generate mock WAL entries
      const entries: WalEntry[] = Array.from({ length: totalEntries }, (_, i) => ({
        lsn: BigInt(i + 1),
        operation: 'insert' as const,
        table: 'events',
        data: { id: i + 1, value: `Event ${i + 1}` },
        timestamp: Date.now(),
      }));

      // Batch processor
      async function processBatches(
        allEntries: WalEntry[],
        size: number,
        processor: (batch: WalEntry[]) => Promise<void>
      ): Promise<void> {
        for (let i = 0; i < allEntries.length; i += size) {
          const batch = allEntries.slice(i, i + size);
          await processor(batch);
        }
      }

      // Process batches
      await processBatches(entries, batchSize, async batch => {
        // Simulate async processing
        await new Promise(resolve => setTimeout(resolve, 1));
        processedBatches.push(batch.length);
      });

      expect(processedBatches).toEqual([100, 100, 100, 100, 100]);
    });
  });

  describe('Async error handling in CDC pipeline', () => {
    it('should handle transient errors with retry', async () => {
      let attempts = 0;
      const maxRetries = 3;

      async function unreliableOperation(): Promise<string> {
        attempts++;
        if (attempts < 3) {
          throw new Error('Transient error');
        }
        return 'success';
      }

      async function withRetry<T>(
        fn: () => Promise<T>,
        retries: number = maxRetries
      ): Promise<T> {
        let lastError: Error | undefined;
        for (let i = 0; i < retries; i++) {
          try {
            return await fn();
          } catch (err) {
            lastError = err as Error;
            // Exponential backoff simulation
            await new Promise(resolve => setTimeout(resolve, 1));
          }
        }
        throw lastError;
      }

      const result = await withRetry(unreliableOperation);
      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('should handle permanent errors gracefully', async () => {
      async function permanentFailure(): Promise<void> {
        throw new Error('Permanent failure');
      }

      async function withRetry<T>(
        fn: () => Promise<T>,
        retries: number = 3
      ): Promise<T> {
        let lastError: Error | undefined;
        for (let i = 0; i < retries; i++) {
          try {
            return await fn();
          } catch (err) {
            lastError = err as Error;
          }
        }
        throw lastError;
      }

      await expect(withRetry(permanentFailure)).rejects.toThrow('Permanent failure');
    });

    it('should support dead letter queue pattern', async () => {
      interface FailedEvent {
        event: CDCEvent;
        error: string;
        timestamp: number;
      }

      const deadLetterQueue: FailedEvent[] = [];

      async function processEvent(event: CDCEvent): Promise<void> {
        if (event.table === 'forbidden') {
          throw new Error('Table access denied');
        }
        // Process normally
      }

      async function processWithDLQ(events: CDCEvent[]): Promise<void> {
        for (const event of events) {
          try {
            await processEvent(event);
          } catch (err) {
            deadLetterQueue.push({
              event,
              error: (err as Error).message,
              timestamp: Date.now(),
            });
          }
        }
      }

      const events: CDCEvent[] = [
        { lsn: 1n, type: 'insert', table: 'users', after: { id: 1 } },
        { lsn: 2n, type: 'insert', table: 'forbidden', after: { id: 2 } },
        { lsn: 3n, type: 'insert', table: 'users', after: { id: 3 } },
      ];

      await processWithDLQ(events);

      expect(deadLetterQueue).toHaveLength(1);
      expect(deadLetterQueue[0].event.table).toBe('forbidden');
      expect(deadLetterQueue[0].error).toBe('Table access denied');
    });
  });

  describe('Async event ordering and consistency', () => {
    it('should maintain LSN ordering during async processing', async () => {
      const processedLSNs: bigint[] = [];

      async function processInOrder(entries: WalEntry[]): Promise<void> {
        // Sort by LSN before processing
        const sorted = [...entries].sort((a, b) =>
          a.lsn < b.lsn ? -1 : a.lsn > b.lsn ? 1 : 0
        );

        for (const entry of sorted) {
          // Simulate async processing
          await new Promise(resolve => setTimeout(resolve, 1));
          processedLSNs.push(entry.lsn);
        }
      }

      // Entries provided out of order
      const entries: WalEntry[] = [
        { lsn: 5n, operation: 'insert', table: 'users', data: { id: 5 }, timestamp: Date.now() },
        { lsn: 2n, operation: 'insert', table: 'users', data: { id: 2 }, timestamp: Date.now() },
        { lsn: 8n, operation: 'insert', table: 'users', data: { id: 8 }, timestamp: Date.now() },
        { lsn: 1n, operation: 'insert', table: 'users', data: { id: 1 }, timestamp: Date.now() },
      ];

      await processInOrder(entries);

      // Verify ordering
      expect(processedLSNs).toEqual([1n, 2n, 5n, 8n]);
    });

    it('should handle concurrent updates to same key', async () => {
      const storage = createMemoryAdapter();
      const key = 'concurrent-key';

      // Simulate concurrent updates
      async function writeWithVersion(version: number): Promise<void> {
        const data = new TextEncoder().encode(JSON.stringify({ version, updated: Date.now() }));
        await storage.writeBlock(key, data);
      }

      // Run concurrent writes
      await Promise.all([
        writeWithVersion(1),
        writeWithVersion(2),
        writeWithVersion(3),
      ]);

      // Read final state
      const data = await storage.readBlock(key);
      expect(data).not.toBeNull();

      const parsed = JSON.parse(new TextDecoder().decode(data!));
      // One of the versions should have won
      expect([1, 2, 3]).toContain(parsed.version);
    });
  });
});

// =============================================================================
// 4. Async Timeout and Cancellation Patterns
// =============================================================================

describe('Async Timeout and Cancellation Patterns', () => {
  it('should timeout long-running operations', async () => {
    async function slowOperation(): Promise<string> {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return 'completed';
    }

    async function withTimeout<T>(
      promise: Promise<T>,
      ms: number
    ): Promise<T> {
      let timeoutId: NodeJS.Timeout;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Operation timed out')), ms);
      });

      try {
        const result = await Promise.race([promise, timeoutPromise]);
        clearTimeout(timeoutId!);
        return result;
      } catch (err) {
        clearTimeout(timeoutId!);
        throw err;
      }
    }

    await expect(withTimeout(slowOperation(), 50)).rejects.toThrow('Operation timed out');
  });

  it('should support AbortController pattern', async () => {
    async function abortableOperation(signal: AbortSignal): Promise<string> {
      for (let i = 0; i < 10; i++) {
        if (signal.aborted) {
          throw new Error('Operation aborted');
        }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      return 'completed';
    }

    const controller = new AbortController();

    // Abort after 30ms
    setTimeout(() => controller.abort(), 30);

    await expect(abortableOperation(controller.signal)).rejects.toThrow('Operation aborted');
  });

  it('should clean up resources on cancellation', async () => {
    const cleanupCalls: string[] = [];

    async function operationWithCleanup(signal: AbortSignal): Promise<string> {
      try {
        for (let i = 0; i < 5; i++) {
          if (signal.aborted) {
            throw new Error('Aborted');
          }
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        return 'completed';
      } finally {
        cleanupCalls.push('cleanup called');
      }
    }

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 25);

    await expect(operationWithCleanup(controller.signal)).rejects.toThrow('Aborted');
    expect(cleanupCalls).toContain('cleanup called');
  });
});

// =============================================================================
// 5. Async Promise Utilities
// =============================================================================

describe('Async Promise Utilities', () => {
  it('should handle Promise.allSettled for partial failures', async () => {
    const operations = [
      Promise.resolve('success-1'),
      Promise.reject(new Error('failure-1')),
      Promise.resolve('success-2'),
      Promise.reject(new Error('failure-2')),
    ];

    const results = await Promise.allSettled(operations);

    const successes = results.filter(r => r.status === 'fulfilled');
    const failures = results.filter(r => r.status === 'rejected');

    expect(successes).toHaveLength(2);
    expect(failures).toHaveLength(2);
  });

  it('should implement async semaphore for concurrency control', async () => {
    const concurrencyLog: number[] = [];
    let currentConcurrency = 0;

    async function withSemaphore<T>(
      maxConcurrency: number,
      tasks: (() => Promise<T>)[]
    ): Promise<T[]> {
      const results: T[] = [];
      let currentIndex = 0;

      async function runNext(): Promise<void> {
        while (currentIndex < tasks.length) {
          const index = currentIndex++;
          currentConcurrency++;
          concurrencyLog.push(currentConcurrency);
          try {
            results[index] = await tasks[index]();
          } finally {
            currentConcurrency--;
          }
        }
      }

      const runners = Array.from({ length: Math.min(maxConcurrency, tasks.length) }, runNext);
      await Promise.all(runners);
      return results;
    }

    const tasks = Array.from({ length: 10 }, (_, i) => async () => {
      await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
      return i;
    });

    const results = await withSemaphore(3, tasks);

    expect(results).toHaveLength(10);
    // Verify max concurrency was never exceeded
    expect(Math.max(...concurrencyLog)).toBeLessThanOrEqual(3);
  });

  it('should implement async queue for ordered processing', async () => {
    const processed: number[] = [];

    class AsyncQueue<T> {
      private queue: T[] = [];
      private processing = false;
      private processor: (item: T) => Promise<void>;

      constructor(processor: (item: T) => Promise<void>) {
        this.processor = processor;
      }

      async enqueue(item: T): Promise<void> {
        this.queue.push(item);
        if (!this.processing) {
          await this.process();
        }
      }

      private async process(): Promise<void> {
        this.processing = true;
        while (this.queue.length > 0) {
          const item = this.queue.shift()!;
          await this.processor(item);
        }
        this.processing = false;
      }
    }

    const queue = new AsyncQueue<number>(async item => {
      await new Promise(resolve => setTimeout(resolve, 1));
      processed.push(item);
    });

    // Enqueue items
    await Promise.all([
      queue.enqueue(1),
      queue.enqueue(2),
      queue.enqueue(3),
    ]);

    // Wait for processing to complete
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(processed).toContain(1);
    expect(processed).toContain(2);
    expect(processed).toContain(3);
  });
});
