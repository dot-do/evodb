/**
 * Storage utilities tests - TDD for BigInt parsing safety
 * Issue: pocs-pr9d - BigInt parsing crashes on malformed WAL IDs
 *
 * Also tests ObjectStorageAdapter pattern for R2 testability
 * Issue: pocs-eval - Storage adapter pattern for R2 - improve testability
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  makeWalId,
  parseWalId,
  makeBlockId,
  parseBlockId,
  // ObjectStorageAdapter pattern
  MemoryObjectStorageAdapter,
  R2ObjectStorageAdapter,
  createR2ObjectAdapter,
  createMemoryObjectAdapter,
  wrapStorageBackend,
  type ObjectStorageAdapter,
  type R2BucketLike,
} from '../storage.js';

describe('WAL ID utilities', () => {
  describe('makeWalId', () => {
    it('should create valid WAL ID from bigint', () => {
      const id = makeWalId(0n);
      expect(id).toBe('wal:000000000000');
    });

    it('should create WAL ID with proper base-36 encoding', () => {
      const id = makeWalId(35n); // 35 in base-36 is 'z'
      expect(id).toBe('wal:00000000000z');
    });

    it('should handle large LSN values', () => {
      const id = makeWalId(BigInt('9007199254740991')); // Number.MAX_SAFE_INTEGER
      expect(id.startsWith('wal:')).toBe(true);
      expect(id.length).toBe(16); // 'wal:' + 12 chars
    });

    it('should handle very large BigInt values near limit', () => {
      const largeValue = BigInt('999999999999999999999');
      const id = makeWalId(largeValue);
      expect(id.startsWith('wal:')).toBe(true);
    });
  });

  describe('parseWalId', () => {
    it('should parse valid WAL ID', () => {
      const lsn = parseWalId('wal:000000000000');
      expect(lsn).toBe(0n);
    });

    it('should roundtrip makeWalId -> parseWalId', () => {
      const original = 12345n;
      const id = makeWalId(original);
      const parsed = parseWalId(id);
      expect(parsed).toBe(original);
    });

    it('should roundtrip large values', () => {
      const original = BigInt('9007199254740991');
      const id = makeWalId(original);
      const parsed = parseWalId(id);
      expect(parsed).toBe(original);
    });

    it('should return null for invalid prefix (not wal:)', () => {
      expect(parseWalId('block:000000000000')).toBeNull();
      expect(parseWalId('xxx:000000000000')).toBeNull();
      expect(parseWalId('wa:000000000000')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(parseWalId('')).toBeNull();
    });

    // BUG: These tests expose the crash - BigInt(NaN) throws
    it('should return null for invalid base-36 characters (not crash)', () => {
      // Characters like '!' or '$' are not valid base-36
      expect(parseWalId('wal:!@#$%^&*()')).toBeNull();
      expect(parseWalId('wal:invalid!!!')).toBeNull();
    });

    it('should return null for empty string after prefix', () => {
      expect(parseWalId('wal:')).toBeNull();
    });

    it('should return null for whitespace after prefix', () => {
      expect(parseWalId('wal:   ')).toBeNull();
      expect(parseWalId('wal:\t\n')).toBeNull();
    });

    it('should return null for mixed valid/invalid characters', () => {
      expect(parseWalId('wal:abc123$$$')).toBeNull();
      expect(parseWalId('wal:12.34')).toBeNull();
      expect(parseWalId('wal:-123')).toBeNull();
    });

    it('should handle mixed case (base-36 is case-insensitive)', () => {
      // Base-36 uses 0-9 and a-z, should work with uppercase too
      const lower = parseWalId('wal:00000000000z');
      const upper = parseWalId('wal:00000000000Z');
      expect(lower).toBe(upper);
    });

    it('should handle leading zeros correctly', () => {
      const id = parseWalId('wal:000000000001');
      expect(id).toBe(1n);
    });
  });
});

describe('Block ID utilities', () => {
  describe('makeBlockId', () => {
    it('should create valid block ID', () => {
      const id = makeBlockId('data', 0, 0);
      expect(id).toBe('data:0000000000:0000');
    });

    it('should encode timestamp in base-36', () => {
      const id = makeBlockId('data', 36, 0);
      expect(id).toBe('data:0000000010:0000');
    });

    it('should encode sequence in base-36', () => {
      const id = makeBlockId('data', 0, 36);
      expect(id).toBe('data:0000000000:0010');
    });

    it('should handle default seq=0', () => {
      const id = makeBlockId('data', 1000);
      expect(id).toContain(':0000');
    });
  });

  describe('parseBlockId', () => {
    it('should parse valid block ID', () => {
      const result = parseBlockId('data:0000000000:0000');
      expect(result).toEqual({ prefix: 'data', timestamp: 0, seq: 0 });
    });

    it('should roundtrip makeBlockId -> parseBlockId', () => {
      const id = makeBlockId('test', 12345, 67);
      const result = parseBlockId(id);
      expect(result).toEqual({ prefix: 'test', timestamp: 12345, seq: 67 });
    });

    it('should return null for wrong number of parts', () => {
      expect(parseBlockId('data:only')).toBeNull();
      expect(parseBlockId('data:one:two:three')).toBeNull();
      expect(parseBlockId('noparts')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(parseBlockId('')).toBeNull();
    });

    // BUG: These tests expose parseInt returning NaN without validation
    it('should return null for invalid base-36 timestamp (not NaN)', () => {
      const result = parseBlockId('data:!@#$:0000');
      // Currently returns { prefix: 'data', timestamp: NaN, seq: 0 }
      // Should return null
      expect(result).toBeNull();
    });

    it('should return null for invalid base-36 sequence (not NaN)', () => {
      const result = parseBlockId('data:0000000000:!@#$');
      // Currently returns { prefix: 'data', timestamp: 0, seq: NaN }
      // Should return null
      expect(result).toBeNull();
    });

    it('should return null when both timestamp and seq are invalid', () => {
      expect(parseBlockId('data:***:???')).toBeNull();
    });

    it('should return null for empty timestamp or seq parts', () => {
      expect(parseBlockId('data::0000')).toBeNull();
      expect(parseBlockId('data:0000:')).toBeNull();
      expect(parseBlockId('data::')).toBeNull();
    });

    it('should handle large timestamp values', () => {
      const largeTs = Date.now();
      const id = makeBlockId('data', largeTs, 0);
      const result = parseBlockId(id);
      expect(result?.timestamp).toBe(largeTs);
    });
  });
});

// =============================================================================
// ObjectStorageAdapter Tests
// Issue: pocs-eval - Storage adapter pattern for R2 - improve testability
// =============================================================================

describe('MemoryObjectStorageAdapter', () => {
  let storage: MemoryObjectStorageAdapter;

  beforeEach(() => {
    storage = new MemoryObjectStorageAdapter();
  });

  describe('put and get', () => {
    it('should store and retrieve binary data', async () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      await storage.put('test/file.bin', data);

      const result = await storage.get('test/file.bin');
      expect(result).toEqual(data);
    });

    it('should store and retrieve ArrayBuffer', async () => {
      const buffer = new ArrayBuffer(4);
      new Uint8Array(buffer).set([10, 20, 30, 40]);
      await storage.put('test/buffer.bin', buffer);

      const result = await storage.get('test/buffer.bin');
      expect(result).toEqual(new Uint8Array([10, 20, 30, 40]));
    });

    it('should return null for non-existent key', async () => {
      const result = await storage.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should not mutate stored data when original is changed', async () => {
      const data = new Uint8Array([1, 2, 3]);
      await storage.put('test.bin', data);

      // Mutate original
      data[0] = 99;

      const result = await storage.get('test.bin');
      expect(result![0]).toBe(1); // Should be original value
    });

    it('should not allow mutation of retrieved data to affect storage', async () => {
      const data = new Uint8Array([1, 2, 3]);
      await storage.put('test.bin', data);

      const result = await storage.get('test.bin');
      result![0] = 99;

      const result2 = await storage.get('test.bin');
      expect(result2![0]).toBe(1); // Should still be original
    });
  });

  describe('delete', () => {
    it('should delete an existing key', async () => {
      await storage.put('to-delete.bin', new Uint8Array([1]));
      expect(await storage.exists('to-delete.bin')).toBe(true);

      await storage.delete('to-delete.bin');
      expect(await storage.exists('to-delete.bin')).toBe(false);
    });

    it('should not throw when deleting non-existent key', async () => {
      await expect(storage.delete('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('list', () => {
    it('should list keys with prefix', async () => {
      await storage.put('data/file1.bin', new Uint8Array([1]));
      await storage.put('data/file2.bin', new Uint8Array([2]));
      await storage.put('other/file3.bin', new Uint8Array([3]));

      const dataFiles = await storage.list('data/');
      expect(dataFiles).toHaveLength(2);
      expect(dataFiles).toContain('data/file1.bin');
      expect(dataFiles).toContain('data/file2.bin');
    });

    it('should return sorted keys', async () => {
      await storage.put('c.bin', new Uint8Array([3]));
      await storage.put('a.bin', new Uint8Array([1]));
      await storage.put('b.bin', new Uint8Array([2]));

      const keys = await storage.list('');
      expect(keys).toEqual(['a.bin', 'b.bin', 'c.bin']);
    });

    it('should return empty array for no matches', async () => {
      await storage.put('data/file.bin', new Uint8Array([1]));

      const results = await storage.list('other/');
      expect(results).toEqual([]);
    });
  });

  describe('head', () => {
    it('should return metadata for existing key', async () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      await storage.put('test.bin', data);

      const meta = await storage.head('test.bin');
      expect(meta).not.toBeNull();
      expect(meta!.size).toBe(5);
      expect(meta!.etag).toBeDefined();
      expect(meta!.lastModified).toBeInstanceOf(Date);
    });

    it('should return null for non-existent key', async () => {
      const meta = await storage.head('nonexistent');
      expect(meta).toBeNull();
    });
  });

  describe('exists', () => {
    it('should return true for existing key', async () => {
      await storage.put('exists.bin', new Uint8Array([1]));
      expect(await storage.exists('exists.bin')).toBe(true);
    });

    it('should return false for non-existent key', async () => {
      expect(await storage.exists('nonexistent')).toBe(false);
    });
  });

  describe('getRange', () => {
    it('should read a byte range from stored data', async () => {
      const data = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      await storage.put('range-test.bin', data);

      const range = await storage.getRange('range-test.bin', 3, 4);
      expect(range).toEqual(new Uint8Array([3, 4, 5, 6]));
    });

    it('should handle negative offset (from end)', async () => {
      const data = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      await storage.put('range-test.bin', data);

      const range = await storage.getRange('range-test.bin', -3, 2);
      expect(range).toEqual(new Uint8Array([7, 8]));
    });

    it('should throw for non-existent key', async () => {
      await expect(storage.getRange('nonexistent', 0, 10)).rejects.toThrow('Object not found');
    });
  });

  describe('utility methods', () => {
    it('should clear all data', async () => {
      await storage.put('a.bin', new Uint8Array([1]));
      await storage.put('b.bin', new Uint8Array([2]));
      expect(storage.size).toBe(2);

      storage.clear();
      expect(storage.size).toBe(0);
    });

    it('should return keys for debugging', async () => {
      await storage.put('key1', new Uint8Array([1]));
      await storage.put('key2', new Uint8Array([2]));

      const keys = storage.keys();
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
    });
  });
});

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

describe('ObjectStorageAdapter usage patterns', () => {
  it('should support typical lakehouse operations with MemoryObjectStorageAdapter', async () => {
    // This demonstrates how to use the adapter pattern for testing lakehouse code
    const storage = new MemoryObjectStorageAdapter();

    // Simulate writing a manifest
    const manifest = { tableId: 'test-123', location: 'test/table' };
    const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
    await storage.put('test/table/_manifest.json', manifestBytes);

    // Simulate writing a data file
    const dataBlock = new Uint8Array([0x43, 0x4a, 0x4c, 0x42]); // "CJLB" magic
    await storage.put('test/table/data/block-001.bin', dataBlock);

    // Read back manifest
    const manifestData = await storage.get('test/table/_manifest.json');
    const parsedManifest = JSON.parse(new TextDecoder().decode(manifestData!));
    expect(parsedManifest.tableId).toBe('test-123');

    // List data files
    const dataFiles = await storage.list('test/table/data/');
    expect(dataFiles).toHaveLength(1);
    expect(dataFiles[0]).toBe('test/table/data/block-001.bin');

    // Check existence
    expect(await storage.exists('test/table/_manifest.json')).toBe(true);
    expect(await storage.exists('test/table/nonexistent.json')).toBe(false);

    // Get metadata
    const meta = await storage.head('test/table/data/block-001.bin');
    expect(meta?.size).toBe(4);
  });

  it('should allow swapping implementations for testing vs production', async () => {
    // Factory function that accepts any ObjectStorageAdapter
    async function writeData(storage: ObjectStorageAdapter, path: string, data: Uint8Array): Promise<void> {
      await storage.put(path, data);
    }

    async function readData(storage: ObjectStorageAdapter, path: string): Promise<Uint8Array | null> {
      return storage.get(path);
    }

    // In tests: use memory adapter
    const testStorage = new MemoryObjectStorageAdapter();
    await writeData(testStorage, 'test.bin', new Uint8Array([1, 2, 3]));
    const result = await readData(testStorage, 'test.bin');
    expect(result).toEqual(new Uint8Array([1, 2, 3]));

    // In production: would use R2ObjectStorageAdapter
    // const prodStorage = new R2ObjectStorageAdapter(env.MY_BUCKET);
    // Same API, different backend
  });
});
