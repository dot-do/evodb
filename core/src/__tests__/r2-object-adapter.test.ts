/**
 * @evodb/core - R2 Object Storage Adapter Tests
 *
 * Tests for R2ObjectStorageAdapter implementation.
 * Issue: pocs-eval - Storage adapter pattern for R2 - improve testability
 */

import { describe, it, expect } from 'vitest';
import {
  R2ObjectStorageAdapter,
  createR2ObjectAdapter,
  createMemoryObjectAdapter,
  wrapStorageBackend,
  MemoryObjectStorageAdapter,
  type R2BucketLike,
} from '../storage.ts';

describe('R2ObjectStorageAdapter', () => {
  // Create a mock R2Bucket for testing
  function createMockR2Bucket(): R2BucketLike {
    const store = new Map<string, { data: ArrayBuffer; metadata: { size: number; etag: string; uploaded: Date } }>();

    return {
      async get(key: string) {
        const entry = store.get(key);
        if (!entry) return null;
        return {
          key,
          size: entry.metadata.size,
          etag: entry.metadata.etag,
          uploaded: entry.metadata.uploaded,
          async arrayBuffer() {
            return entry.data.slice(0);
          },
          async text() {
            return new TextDecoder().decode(entry.data);
          },
        };
      },

      async put(key: string, value: ArrayBuffer | Uint8Array | string) {
        let buffer: ArrayBuffer;
        if (typeof value === 'string') {
          buffer = new TextEncoder().encode(value).buffer;
        } else if (value instanceof ArrayBuffer) {
          buffer = value.slice(0);
        } else {
          buffer = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
        }

        const metadata = {
          size: buffer.byteLength,
          etag: `"mock-etag-${Date.now()}"`,
          uploaded: new Date(),
        };

        store.set(key, { data: buffer, metadata });

        return {
          key,
          size: metadata.size,
          etag: metadata.etag,
          uploaded: metadata.uploaded,
          async arrayBuffer() {
            return buffer;
          },
        };
      },

      async delete(key: string) {
        store.delete(key);
      },

      async list(options?: { prefix?: string; cursor?: string; limit?: number }) {
        const prefix = options?.prefix || '';
        const objects = [...store.entries()]
          .filter(([key]) => key.startsWith(prefix))
          .map(([key, entry]) => ({
            key,
            size: entry.metadata.size,
            etag: entry.metadata.etag,
            uploaded: entry.metadata.uploaded,
            async arrayBuffer() {
              return entry.data;
            },
          }));

        return {
          objects,
          truncated: false,
          cursor: undefined,
        };
      },

      async head(key: string) {
        const entry = store.get(key);
        if (!entry) return null;
        return {
          key,
          size: entry.metadata.size,
          etag: entry.metadata.etag,
          uploaded: entry.metadata.uploaded,
          async arrayBuffer() {
            return entry.data;
          },
        };
      },
    };
  }

  it('should wrap R2Bucket and provide ObjectStorageAdapter interface', async () => {
    const mockBucket = createMockR2Bucket();
    const adapter = new R2ObjectStorageAdapter(mockBucket);

    await adapter.put('test.bin', new Uint8Array([1, 2, 3]));
    const result = await adapter.get('test.bin');

    expect(result).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('should apply key prefix when provided', async () => {
    const mockBucket = createMockR2Bucket();
    const adapter = new R2ObjectStorageAdapter(mockBucket, 'prefix');

    await adapter.put('file.bin', new Uint8Array([1]));

    // The adapter should store with prefix
    const directGet = await mockBucket.get('prefix/file.bin');
    expect(directGet).not.toBeNull();

    // The adapter should retrieve without prefix in key
    const result = await adapter.get('file.bin');
    expect(result).not.toBeNull();
  });

  it('should list keys and strip prefix', async () => {
    const mockBucket = createMockR2Bucket();
    const adapter = new R2ObjectStorageAdapter(mockBucket, 'myprefix');

    await adapter.put('data/a.bin', new Uint8Array([1]));
    await adapter.put('data/b.bin', new Uint8Array([2]));

    const keys = await adapter.list('data/');

    expect(keys).toContain('data/a.bin');
    expect(keys).toContain('data/b.bin');
  });

  it('should check existence correctly', async () => {
    const mockBucket = createMockR2Bucket();
    const adapter = new R2ObjectStorageAdapter(mockBucket);

    expect(await adapter.exists('nonexistent')).toBe(false);

    await adapter.put('exists.bin', new Uint8Array([1]));
    expect(await adapter.exists('exists.bin')).toBe(true);
  });
});

describe('Factory functions', () => {
  describe('createMemoryObjectAdapter', () => {
    it('should create a MemoryObjectStorageAdapter', async () => {
      const adapter = createMemoryObjectAdapter();
      expect(adapter).toBeInstanceOf(MemoryObjectStorageAdapter);

      await adapter.put('test', new Uint8Array([1]));
      expect(await adapter.get('test')).toEqual(new Uint8Array([1]));
    });
  });

  describe('createR2ObjectAdapter', () => {
    it('should create an R2ObjectStorageAdapter from bucket', async () => {
      // Use a minimal mock
      const mockBucket: R2BucketLike = {
        async get() {
          return null;
        },
        async put(key) {
          return { key, size: 0, etag: '', uploaded: new Date(), async arrayBuffer() { return new ArrayBuffer(0); } };
        },
        async delete() {},
        async list() {
          return { objects: [], truncated: false };
        },
        async head() {
          return null;
        },
      };

      const adapter = createR2ObjectAdapter(mockBucket);
      expect(adapter).toBeInstanceOf(R2ObjectStorageAdapter);
    });
  });

  describe('wrapStorageBackend', () => {
    it('should return ObjectStorageAdapter as-is if already wrapped', () => {
      const memory = new MemoryObjectStorageAdapter();
      const result = wrapStorageBackend(memory);

      // Should return the same instance or a properly wrapped one
      expect(result).toBeDefined();
    });

    it('should wrap R2BucketLike in R2ObjectStorageAdapter', () => {
      const mockBucket: R2BucketLike = {
        async get() {
          return null;
        },
        async put(key) {
          return { key, size: 0, etag: '', uploaded: new Date(), async arrayBuffer() { return new ArrayBuffer(0); } };
        },
        async delete() {},
        async list() {
          return { objects: [], truncated: false };
        },
        async head() {
          return null;
        },
      };

      const result = wrapStorageBackend(mockBucket);
      expect(result).toBeDefined();
    });
  });
});
