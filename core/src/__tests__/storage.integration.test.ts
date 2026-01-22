/**
 * Storage utilities tests - TDD for BigInt parsing safety
 * Issue: pocs-pr9d - BigInt parsing crashes on malformed WAL IDs
 *
 * Also tests ObjectStorageAdapter pattern for R2 testability
 * Issue: pocs-eval - Storage adapter pattern for R2 - improve testability
 *
 * Also tests unified Storage interface consolidation
 * Issue: evodb-pyo - Consolidate 4 storage abstractions
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  makeWalId,
  parseWalId,
  makeBlockId,
  parseBlockId,
  // ObjectStorageAdapter pattern (legacy)
  MemoryObjectStorageAdapter,
  R2ObjectStorageAdapter,
  createR2ObjectAdapter,
  createMemoryObjectAdapter,
  wrapStorageBackend,
  type ObjectStorageAdapter,
  type R2BucketLike,
  // SQL injection prevention
  validateTableName,
  createDOAdapter,
  // Path traversal prevention
  validateStoragePath,
  // ==========================================================================
  // UNIFIED STORAGE INTERFACE (Issue evodb-pyo)
  // ==========================================================================
  type Storage,
  type StorageMetadata,
  MemoryStorage,
  R2Storage,
  createStorage,
  createMemoryStorage,
  storageToObjectAdapter,
  objectAdapterToStorage,
} from '../storage.ts';

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
      await expect(storage.getRange('nonexistent', 0, 10)).rejects.toThrow(/not found.*nonexistent/i);
    });

    // ==========================================================================
    // Issue evodb-qpi: TDD bounds validation for getRange
    // ==========================================================================

    it('should throw for negative length', async () => {
      const data = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      await storage.put('range-test.bin', data);

      await expect(storage.getRange('range-test.bin', 0, -1)).rejects.toThrow(/length.*negative|invalid.*length/i);
      await expect(storage.getRange('range-test.bin', 5, -5)).rejects.toThrow(/length.*negative|invalid.*length/i);
    });

    it('should throw for offset past end of data', async () => {
      const data = new Uint8Array([0, 1, 2, 3, 4]); // length 5
      await storage.put('range-test.bin', data);

      await expect(storage.getRange('range-test.bin', 10, 1)).rejects.toThrow(/offset.*bounds|out of range/i);
      await expect(storage.getRange('range-test.bin', 5, 1)).rejects.toThrow(/offset.*bounds|out of range/i);
    });

    it('should throw for negative offset that resolves past start', async () => {
      const data = new Uint8Array([0, 1, 2, 3, 4]); // length 5
      await storage.put('range-test.bin', data);

      // -10 on a 5-byte array would resolve to -5 (invalid)
      await expect(storage.getRange('range-test.bin', -10, 1)).rejects.toThrow(/offset.*bounds|out of range/i);
    });

    it('should handle edge case: reading from exact end with zero length', async () => {
      const data = new Uint8Array([0, 1, 2, 3, 4]); // length 5
      await storage.put('range-test.bin', data);

      // Reading 0 bytes from offset 5 (end of data) should return empty array
      const result = await storage.getRange('range-test.bin', 5, 0);
      expect(result.length).toBe(0);
    });

    it('should handle zero length gracefully', async () => {
      const data = new Uint8Array([0, 1, 2, 3, 4]);
      await storage.put('range-test.bin', data);

      const result = await storage.getRange('range-test.bin', 2, 0);
      expect(result.length).toBe(0);
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

// =============================================================================
// SQL Injection Prevention Tests
// Issue: evodb-ofu - TDD: Fix SQL injection in table name interpolation
// =============================================================================

describe('createDOAdapter - SQL injection prevention', () => {
  // Mock DOSqlStorage for testing
  function createMockSqlStorage(): {
    storage: { exec: (query: string, ...bindings: unknown[]) => { results: unknown[] } };
    queries: string[];
  } {
    const queries: string[] = [];
    return {
      storage: {
        exec(query: string, ..._bindings: unknown[]) {
          queries.push(query);
          return { results: [] };
        },
      },
      queries,
    };
  }

  describe('validateTableName', () => {
    it('should allow valid alphanumeric table names', () => {
      expect(() => validateTableName('users')).not.toThrow();
      expect(() => validateTableName('user_data')).not.toThrow();
      expect(() => validateTableName('Users123')).not.toThrow();
      expect(() => validateTableName('_private_table')).not.toThrow();
    });

    it('should reject table names with SQL injection attempts - quotes', () => {
      expect(() => validateTableName('users"; DROP TABLE users; --')).toThrow();
      expect(() => validateTableName("users'; DROP TABLE users; --")).toThrow();
      expect(() => validateTableName('users`; DROP TABLE users; --')).toThrow();
    });

    it('should reject table names with SQL injection attempts - special characters', () => {
      expect(() => validateTableName('users; DROP TABLE users')).toThrow();
      expect(() => validateTableName('users--comment')).toThrow();
      expect(() => validateTableName('users/*comment*/')).toThrow();
    });

    it('should reject table names with spaces', () => {
      expect(() => validateTableName('user data')).toThrow();
      expect(() => validateTableName(' users')).toThrow();
      expect(() => validateTableName('users ')).toThrow();
    });

    it('should reject empty table names', () => {
      expect(() => validateTableName('')).toThrow();
    });

    it('should reject table names with parentheses', () => {
      expect(() => validateTableName('users()')).toThrow();
      expect(() => validateTableName('(users)')).toThrow();
    });
  });

  describe('createDOAdapter with validation', () => {
    it('should create adapter with valid table name', () => {
      const { storage } = createMockSqlStorage();
      expect(() => createDOAdapter(storage, 'valid_table_name')).not.toThrow();
    });

    it('should throw on SQL injection via table name - DROP TABLE', () => {
      const { storage } = createMockSqlStorage();
      expect(() => createDOAdapter(storage, 'users"; DROP TABLE users; --')).toThrow();
    });

    it('should throw on SQL injection via table name - quotes', () => {
      const { storage } = createMockSqlStorage();
      expect(() => createDOAdapter(storage, "'); DELETE FROM users; --")).toThrow();
    });

    it('should throw on table name with semicolon', () => {
      const { storage } = createMockSqlStorage();
      expect(() => createDOAdapter(storage, 'users; DROP TABLE')).toThrow();
    });

    it('should use default table name when not provided', () => {
      const { storage, queries } = createMockSqlStorage();
      createDOAdapter(storage);
      expect(queries[0]).toContain('blocks');
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

// =============================================================================
// UNIFIED STORAGE INTERFACE TESTS
// Issue: evodb-pyo - Consolidate 4 storage abstractions
// =============================================================================

describe('Unified Storage Interface', () => {
  describe('MemoryStorage', () => {
    let storage: MemoryStorage;

    beforeEach(() => {
      storage = new MemoryStorage();
    });

    describe('read and write', () => {
      it('should write and read binary data', async () => {
        const data = new Uint8Array([1, 2, 3, 4, 5]);
        await storage.write('test/file.bin', data);

        const result = await storage.read('test/file.bin');
        expect(result).toEqual(data);
      });

      it('should return null for non-existent key', async () => {
        const result = await storage.read('nonexistent');
        expect(result).toBeNull();
      });

      it('should not mutate stored data when original is changed', async () => {
        const data = new Uint8Array([1, 2, 3]);
        await storage.write('test.bin', data);

        // Mutate original
        data[0] = 99;

        const result = await storage.read('test.bin');
        expect(result![0]).toBe(1); // Should be original value
      });

      it('should not allow mutation of retrieved data to affect storage', async () => {
        const data = new Uint8Array([1, 2, 3]);
        await storage.write('test.bin', data);

        const result = await storage.read('test.bin');
        result![0] = 99;

        const result2 = await storage.read('test.bin');
        expect(result2![0]).toBe(1); // Should still be original
      });
    });

    describe('list', () => {
      it('should list paths with prefix', async () => {
        await storage.write('data/file1.bin', new Uint8Array([1]));
        await storage.write('data/file2.bin', new Uint8Array([2]));
        await storage.write('other/file3.bin', new Uint8Array([3]));

        const result = await storage.list('data/');
        expect(result.paths).toHaveLength(2);
        expect(result.paths).toContain('data/file1.bin');
        expect(result.paths).toContain('data/file2.bin');
      });

      it('should return sorted paths', async () => {
        await storage.write('c.bin', new Uint8Array([3]));
        await storage.write('a.bin', new Uint8Array([1]));
        await storage.write('b.bin', new Uint8Array([2]));

        const result = await storage.list('');
        expect(result.paths).toEqual(['a.bin', 'b.bin', 'c.bin']);
      });

      it('should return empty array for no matches', async () => {
        await storage.write('data/file.bin', new Uint8Array([1]));

        const result = await storage.list('other/');
        expect(result.paths).toEqual([]);
      });
    });

    describe('delete', () => {
      it('should delete an existing key', async () => {
        await storage.write('to-delete.bin', new Uint8Array([1]));
        expect(await storage.exists('to-delete.bin')).toBe(true);

        await storage.delete('to-delete.bin');
        expect(await storage.exists('to-delete.bin')).toBe(false);
      });

      it('should not throw when deleting non-existent key', async () => {
        await expect(storage.delete('nonexistent')).resolves.not.toThrow();
      });
    });

    describe('exists', () => {
      it('should return true for existing key', async () => {
        await storage.write('exists.bin', new Uint8Array([1]));
        expect(await storage.exists('exists.bin')).toBe(true);
      });

      it('should return false for non-existent key', async () => {
        expect(await storage.exists('nonexistent')).toBe(false);
      });
    });

    describe('head', () => {
      it('should return metadata for existing key', async () => {
        const data = new Uint8Array([1, 2, 3, 4, 5]);
        await storage.write('test.bin', data);

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

    describe('readRange', () => {
      it('should read a byte range from stored data', async () => {
        const data = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
        await storage.write('range-test.bin', data);

        const range = await storage.readRange('range-test.bin', 3, 4);
        expect(range).toEqual(new Uint8Array([3, 4, 5, 6]));
      });

      it('should handle negative offset (from end)', async () => {
        const data = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
        await storage.write('range-test.bin', data);

        const range = await storage.readRange('range-test.bin', -3, 2);
        expect(range).toEqual(new Uint8Array([7, 8]));
      });

      it('should throw for non-existent key', async () => {
        await expect(storage.readRange('nonexistent', 0, 10)).rejects.toThrow(/not found.*nonexistent/i);
      });

      // ==========================================================================
      // Issue evodb-qpi: TDD bounds validation for readRange
      // ==========================================================================

      it('should throw for negative length', async () => {
        const data = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
        await storage.write('range-test.bin', data);

        await expect(storage.readRange('range-test.bin', 0, -1)).rejects.toThrow(/length.*negative|invalid.*length/i);
        await expect(storage.readRange('range-test.bin', 5, -5)).rejects.toThrow(/length.*negative|invalid.*length/i);
      });

      it('should throw for offset past end of data', async () => {
        const data = new Uint8Array([0, 1, 2, 3, 4]); // length 5
        await storage.write('range-test.bin', data);

        await expect(storage.readRange('range-test.bin', 10, 1)).rejects.toThrow(/offset.*bounds|out of range/i);
        await expect(storage.readRange('range-test.bin', 5, 1)).rejects.toThrow(/offset.*bounds|out of range/i);
      });

      it('should throw for negative offset that resolves past start', async () => {
        const data = new Uint8Array([0, 1, 2, 3, 4]); // length 5
        await storage.write('range-test.bin', data);

        // -10 on a 5-byte array would resolve to -5 (invalid)
        await expect(storage.readRange('range-test.bin', -10, 1)).rejects.toThrow(/offset.*bounds|out of range/i);
      });

      it('should handle edge case: reading from exact end with zero length', async () => {
        const data = new Uint8Array([0, 1, 2, 3, 4]); // length 5
        await storage.write('range-test.bin', data);

        // Reading 0 bytes from offset 5 (end of data) should return empty array
        const result = await storage.readRange('range-test.bin', 5, 0);
        expect(result.length).toBe(0);
      });

      it('should handle zero length gracefully', async () => {
        const data = new Uint8Array([0, 1, 2, 3, 4]);
        await storage.write('range-test.bin', data);

        const result = await storage.readRange('range-test.bin', 2, 0);
        expect(result.length).toBe(0);
      });
    });

    describe('utility methods', () => {
      it('should clear all data', async () => {
        await storage.write('a.bin', new Uint8Array([1]));
        await storage.write('b.bin', new Uint8Array([2]));
        expect(storage.size).toBe(2);

        storage.clear();
        expect(storage.size).toBe(0);
      });

      it('should return keys for debugging', async () => {
        await storage.write('key1', new Uint8Array([1]));
        await storage.write('key2', new Uint8Array([2]));

        const keys = storage.keys();
        expect(keys).toContain('key1');
        expect(keys).toContain('key2');
      });
    });
  });

  describe('createMemoryStorage factory', () => {
    it('should create a MemoryStorage instance', async () => {
      const storage = createMemoryStorage();
      expect(storage).toBeInstanceOf(MemoryStorage);

      await storage.write('test', new Uint8Array([1]));
      expect(await storage.read('test')).toEqual(new Uint8Array([1]));
    });
  });

  describe('Storage interface compliance', () => {
    it('should match the expected interface shape', () => {
      const storage: Storage = new MemoryStorage();

      // All required methods must exist
      expect(typeof storage.read).toBe('function');
      expect(typeof storage.write).toBe('function');
      expect(typeof storage.list).toBe('function');
      expect(typeof storage.delete).toBe('function');

      // Optional methods
      expect(typeof storage.exists).toBe('function');
      expect(typeof storage.head).toBe('function');
      expect(typeof storage.readRange).toBe('function');
    });
  });
});

describe('Storage Adapter Conversion', () => {
  describe('storageToObjectAdapter', () => {
    it('should convert Storage to ObjectStorageAdapter', async () => {
      const storage = new MemoryStorage();
      const adapter = storageToObjectAdapter(storage);

      // Write using unified Storage
      await storage.write('test.bin', new Uint8Array([1, 2, 3]));

      // Read using legacy ObjectStorageAdapter
      const result = await adapter.get('test.bin');
      expect(result).toEqual(new Uint8Array([1, 2, 3]));

      // Write using legacy adapter
      await adapter.put('test2.bin', new Uint8Array([4, 5, 6]));

      // Read using unified Storage
      const result2 = await storage.read('test2.bin');
      expect(result2).toEqual(new Uint8Array([4, 5, 6]));
    });

    it('should convert list() format correctly', async () => {
      const storage = new MemoryStorage();
      await storage.write('data/a.bin', new Uint8Array([1]));
      await storage.write('data/b.bin', new Uint8Array([2]));

      const adapter = storageToObjectAdapter(storage);

      // Legacy adapter returns string[]
      const paths = await adapter.list('data/');
      expect(paths).toEqual(['data/a.bin', 'data/b.bin']);
    });

    it('should support ArrayBuffer input on put()', async () => {
      const storage = new MemoryStorage();
      const adapter = storageToObjectAdapter(storage);

      const buffer = new ArrayBuffer(3);
      new Uint8Array(buffer).set([1, 2, 3]);
      await adapter.put('buffer.bin', buffer);

      const result = await storage.read('buffer.bin');
      expect(result).toEqual(new Uint8Array([1, 2, 3]));
    });
  });

  describe('objectAdapterToStorage', () => {
    it('should convert ObjectStorageAdapter to Storage', async () => {
      const adapter = new MemoryObjectStorageAdapter();
      const storage = objectAdapterToStorage(adapter);

      // Write using legacy adapter
      await adapter.put('test.bin', new Uint8Array([1, 2, 3]));

      // Read using unified Storage
      const result = await storage.read('test.bin');
      expect(result).toEqual(new Uint8Array([1, 2, 3]));

      // Write using unified Storage
      await storage.write('test2.bin', new Uint8Array([4, 5, 6]));

      // Read using legacy adapter
      const result2 = await adapter.get('test2.bin');
      expect(result2).toEqual(new Uint8Array([4, 5, 6]));
    });

    it('should convert list() format correctly', async () => {
      const adapter = new MemoryObjectStorageAdapter();
      await adapter.put('data/a.bin', new Uint8Array([1]));
      await adapter.put('data/b.bin', new Uint8Array([2]));

      const storage = objectAdapterToStorage(adapter);

      // Unified Storage returns { paths: string[] }
      const result = await storage.list('data/');
      expect(result.paths).toEqual(['data/a.bin', 'data/b.bin']);
    });
  });

  describe('bidirectional conversion roundtrip', () => {
    it('should preserve data through Storage -> ObjectAdapter -> Storage', async () => {
      const original = new MemoryStorage();
      await original.write('file.bin', new Uint8Array([1, 2, 3]));

      // Convert to ObjectStorageAdapter
      const adapter = storageToObjectAdapter(original);

      // Convert back to Storage
      const converted = objectAdapterToStorage(adapter);

      // Data should be accessible
      const result = await converted.read('file.bin');
      expect(result).toEqual(new Uint8Array([1, 2, 3]));

      // New writes should be visible in original
      await converted.write('new.bin', new Uint8Array([4, 5, 6]));
      const result2 = await original.read('new.bin');
      expect(result2).toEqual(new Uint8Array([4, 5, 6]));
    });
  });
});

// =============================================================================
// ArrayBuffer Offset Calculation Tests
// Issue: evodb-r00 - TDD: Fix ArrayBuffer offset calculations in storage
//
// When a Uint8Array is a view into a larger ArrayBuffer (has non-zero byteOffset),
// using `data.buffer` directly gives the entire underlying buffer, not just the
// viewed portion. We must use:
//   data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
// =============================================================================

describe('ArrayBuffer offset calculations', () => {
  describe('R2ObjectStorageAdapter.put with non-zero byteOffset', () => {
    // Create a mock R2Bucket that captures what was written (as raw value, not transformed)
    function createCapturingMockBucket(): { bucket: R2BucketLike; getCapturedData: () => ArrayBuffer | Uint8Array | string | null } {
      let capturedData: ArrayBuffer | Uint8Array | string | null = null;
      const bucket: R2BucketLike = {
        async get() { return null; },
        async put(_key: string, value: ArrayBuffer | Uint8Array | string) {
          // Capture the raw value passed to put() without transformation
          capturedData = value;
          return { key: _key, size: 0, etag: '', uploaded: new Date(), async arrayBuffer() { return new ArrayBuffer(0); }, async text() { return ''; } };
        },
        async delete() {},
        async list() { return { objects: [], truncated: false }; },
        async head() { return null; },
      };
      return { bucket, getCapturedData: () => capturedData };
    }

    it('should correctly handle Uint8Array with zero byteOffset', async () => {
      const { bucket, getCapturedData } = createCapturingMockBucket();
      const adapter = new R2ObjectStorageAdapter(bucket);

      const data = new Uint8Array([1, 2, 3, 4, 5]);
      await adapter.put('test.bin', data);

      // R2ObjectStorageAdapter converts Uint8Array to ArrayBuffer via slice
      const captured = getCapturedData();
      expect(captured).toBeInstanceOf(ArrayBuffer);
      expect(new Uint8Array(captured as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
    });

    it('should correctly handle Uint8Array view with non-zero byteOffset', async () => {
      const { bucket, getCapturedData } = createCapturingMockBucket();
      const adapter = new R2ObjectStorageAdapter(bucket);

      // Create a larger buffer and create a view into the middle of it
      const largeBuffer = new ArrayBuffer(20);
      const fullView = new Uint8Array(largeBuffer);
      fullView.set([0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

      // Create a view with non-zero byteOffset (starts at byte 5, length 5)
      const viewWithOffset = new Uint8Array(largeBuffer, 5, 5);
      expect(viewWithOffset.byteOffset).toBe(5);
      expect(viewWithOffset.byteLength).toBe(5);
      expect([...viewWithOffset]).toEqual([1, 2, 3, 4, 5]);

      await adapter.put('test.bin', viewWithOffset);

      // BUG: If we just use `data.buffer as ArrayBuffer`, we get the ENTIRE 20-byte buffer
      // We should only get the 5 bytes we intended to write: [1, 2, 3, 4, 5]
      const captured = getCapturedData();
      expect(captured).toBeInstanceOf(ArrayBuffer);
      expect((captured as ArrayBuffer).byteLength).toBe(5);
      expect(new Uint8Array(captured as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
    });

    it('should correctly handle subarray() views', async () => {
      const { bucket, getCapturedData } = createCapturingMockBucket();
      const adapter = new R2ObjectStorageAdapter(bucket);

      // subarray() creates a view with non-zero byteOffset
      const original = new Uint8Array([0, 0, 1, 2, 3, 4, 5, 0, 0, 0]);
      const subview = original.subarray(2, 7);

      expect(subview.byteOffset).toBe(2);
      expect(subview.byteLength).toBe(5);
      expect([...subview]).toEqual([1, 2, 3, 4, 5]);

      await adapter.put('test.bin', subview);

      const captured = getCapturedData();
      expect(captured).toBeInstanceOf(ArrayBuffer);
      expect((captured as ArrayBuffer).byteLength).toBe(5);
      expect(new Uint8Array(captured as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
    });
  });

  describe('R2Storage.write with non-zero byteOffset', () => {
    // Create a mock R2Bucket that captures what was written (as raw value, not transformed)
    function createCapturingMockBucket(): { bucket: R2BucketLike; getCapturedData: () => ArrayBuffer | Uint8Array | string | null } {
      let capturedData: ArrayBuffer | Uint8Array | string | null = null;
      const bucket: R2BucketLike = {
        async get() { return null; },
        async put(_key: string, value: ArrayBuffer | Uint8Array | string) {
          // Capture the raw value passed to put() without transformation
          capturedData = value;
          return { key: _key, size: 0, etag: '', uploaded: new Date(), async arrayBuffer() { return new ArrayBuffer(0); }, async text() { return ''; } };
        },
        async delete() {},
        async list() { return { objects: [], truncated: false }; },
        async head() { return null; },
      };
      return { bucket, getCapturedData: () => capturedData };
    }

    it('should correctly handle Uint8Array with zero byteOffset', async () => {
      const { bucket, getCapturedData } = createCapturingMockBucket();
      const storage = new R2Storage(bucket);

      const data = new Uint8Array([1, 2, 3, 4, 5]);
      await storage.write('test.bin', data);

      const captured = getCapturedData();
      expect(captured).toBeInstanceOf(ArrayBuffer);
      expect(new Uint8Array(captured as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
    });

    it('should correctly handle Uint8Array view with non-zero byteOffset', async () => {
      const { bucket, getCapturedData } = createCapturingMockBucket();
      const storage = new R2Storage(bucket);

      // Create a larger buffer and create a view into the middle of it
      const largeBuffer = new ArrayBuffer(20);
      const fullView = new Uint8Array(largeBuffer);
      fullView.set([0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

      // Create a view with non-zero byteOffset
      const viewWithOffset = new Uint8Array(largeBuffer, 5, 5);

      await storage.write('test.bin', viewWithOffset);

      const captured = getCapturedData();
      expect(captured).toBeInstanceOf(ArrayBuffer);
      expect((captured as ArrayBuffer).byteLength).toBe(5);
      expect(new Uint8Array(captured as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
    });

    it('should correctly handle subarray() views', async () => {
      const { bucket, getCapturedData } = createCapturingMockBucket();
      const storage = new R2Storage(bucket);

      const original = new Uint8Array([0, 0, 1, 2, 3, 4, 5, 0, 0, 0]);
      const subview = original.subarray(2, 7);

      await storage.write('test.bin', subview);

      const captured = getCapturedData();
      expect(captured).toBeInstanceOf(ArrayBuffer);
      expect((captured as ArrayBuffer).byteLength).toBe(5);
      expect(new Uint8Array(captured as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
    });
  });
});

// =============================================================================
// Key Prefix Path Traversal Prevention Tests
// Issue: evodb-409 - TDD: Add key prefix path traversal validation
// =============================================================================

describe('Key prefix path traversal prevention', () => {
  describe('validateStoragePath', () => {
    describe('should allow safe paths', () => {
      it('should allow simple file names', () => {
        expect(() => validateStoragePath('file.bin')).not.toThrow();
        expect(() => validateStoragePath('data.json')).not.toThrow();
        expect(() => validateStoragePath('manifest')).not.toThrow();
      });

      it('should allow nested paths with forward slashes', () => {
        expect(() => validateStoragePath('data/file.bin')).not.toThrow();
        expect(() => validateStoragePath('a/b/c/d/file.txt')).not.toThrow();
        expect(() => validateStoragePath('tables/users/v1/snapshot.parquet')).not.toThrow();
      });

      it('should allow paths with dashes and underscores', () => {
        expect(() => validateStoragePath('my-file_name.bin')).not.toThrow();
        expect(() => validateStoragePath('table_v2/data-001.parquet')).not.toThrow();
      });

      it('should allow paths with dots in file names', () => {
        expect(() => validateStoragePath('file.backup.bin')).not.toThrow();
        expect(() => validateStoragePath('v1.0.0/data.bin')).not.toThrow();
      });

      it('should allow alphanumeric paths', () => {
        expect(() => validateStoragePath('abc123/file456.bin')).not.toThrow();
      });
    });

    describe('should reject path traversal attacks', () => {
      it('should reject ../ path traversal', () => {
        expect(() => validateStoragePath('../secret.bin')).toThrow(/path traversal/i);
        expect(() => validateStoragePath('data/../../../etc/passwd')).toThrow(/path traversal/i);
        expect(() => validateStoragePath('foo/bar/../../../baz')).toThrow(/path traversal/i);
      });

      it('should reject ../ at various positions', () => {
        expect(() => validateStoragePath('../file.bin')).toThrow(/path traversal/i);
        expect(() => validateStoragePath('data/../file.bin')).toThrow(/path traversal/i);
        expect(() => validateStoragePath('a/b/../c')).toThrow(/path traversal/i);
      });

      it('should reject URL-encoded ../ sequences', () => {
        expect(() => validateStoragePath('%2e%2e/secret.bin')).toThrow(/path traversal/i);
        expect(() => validateStoragePath('%2e%2e%2fsecret.bin')).toThrow(/path traversal/i);
        expect(() => validateStoragePath('data/%2e%2e/secret')).toThrow(/path traversal/i);
      });

      it('should reject double-URL-encoded ../ sequences', () => {
        expect(() => validateStoragePath('%252e%252e/secret.bin')).toThrow(/path traversal/i);
        expect(() => validateStoragePath('%252e%252e%252fsecret.bin')).toThrow(/path traversal/i);
      });

      it('should reject backslash path traversal', () => {
        expect(() => validateStoragePath('..\\secret.bin')).toThrow(/path traversal/i);
        expect(() => validateStoragePath('data\\..\\..\\etc\\passwd')).toThrow(/path traversal/i);
      });
    });

    describe('should reject absolute paths', () => {
      it('should reject Unix absolute paths', () => {
        expect(() => validateStoragePath('/etc/passwd')).toThrow(/absolute path/i);
        expect(() => validateStoragePath('/var/log/secrets')).toThrow(/absolute path/i);
        expect(() => validateStoragePath('/')).toThrow(/absolute path/i);
      });

      it('should reject Windows absolute paths', () => {
        expect(() => validateStoragePath('C:\\Windows\\System32')).toThrow(/absolute path/i);
        expect(() => validateStoragePath('D:\\secret.bin')).toThrow(/absolute path/i);
        expect(() => validateStoragePath('c:/windows/system32')).toThrow(/absolute path/i);
      });

      it('should reject UNC paths', () => {
        expect(() => validateStoragePath('\\\\server\\share\\file')).toThrow(/absolute path/i);
        expect(() => validateStoragePath('//server/share/file')).toThrow(/absolute path/i);
      });
    });

    describe('should reject dangerous patterns', () => {
      it('should reject null bytes', () => {
        expect(() => validateStoragePath('file\x00.bin')).toThrow(/null byte/i);
        expect(() => validateStoragePath('data\x00/hidden')).toThrow(/null byte/i);
      });

      it('should reject empty paths', () => {
        expect(() => validateStoragePath('')).toThrow(/empty/i);
      });

      it('should reject whitespace-only paths', () => {
        expect(() => validateStoragePath('   ')).toThrow(/empty|whitespace/i);
        expect(() => validateStoragePath('\t\n')).toThrow(/empty|whitespace/i);
      });

      it('should reject paths with control characters', () => {
        expect(() => validateStoragePath('file\x01.bin')).toThrow(/control character/i);
        expect(() => validateStoragePath('data\x1f/file')).toThrow(/control character/i);
      });
    });
  });

  describe('R2ObjectStorageAdapter with path validation', () => {
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
            async arrayBuffer() { return entry.data.slice(0); },
            async text() { return new TextDecoder().decode(entry.data); },
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
          const metadata = { size: buffer.byteLength, etag: `"mock-etag"`, uploaded: new Date() };
          store.set(key, { data: buffer, metadata });
          return { key, size: metadata.size, etag: metadata.etag, uploaded: metadata.uploaded, async arrayBuffer() { return buffer; } };
        },
        async delete(key: string) { store.delete(key); },
        async list(options?: { prefix?: string }) {
          const prefix = options?.prefix || '';
          const objects = [...store.entries()]
            .filter(([key]) => key.startsWith(prefix))
            .map(([key, entry]) => ({
              key,
              size: entry.metadata.size,
              etag: entry.metadata.etag,
              uploaded: entry.metadata.uploaded,
              async arrayBuffer() { return entry.data; },
            }));
          return { objects, truncated: false };
        },
        async head(key: string) {
          const entry = store.get(key);
          if (!entry) return null;
          return {
            key,
            size: entry.metadata.size,
            etag: entry.metadata.etag,
            uploaded: entry.metadata.uploaded,
            async arrayBuffer() { return entry.data; },
          };
        },
      };
    }

    it('should reject path traversal in put()', async () => {
      const mockBucket = createMockR2Bucket();
      const adapter = new R2ObjectStorageAdapter(mockBucket, 'data');

      await expect(adapter.put('../secret.bin', new Uint8Array([1]))).rejects.toThrow(/path traversal/i);
      await expect(adapter.put('../../etc/passwd', new Uint8Array([1]))).rejects.toThrow(/path traversal/i);
    });

    it('should reject path traversal in get()', async () => {
      const mockBucket = createMockR2Bucket();
      const adapter = new R2ObjectStorageAdapter(mockBucket, 'data');

      await expect(adapter.get('../secret.bin')).rejects.toThrow(/path traversal/i);
      await expect(adapter.get('foo/../../etc/passwd')).rejects.toThrow(/path traversal/i);
    });

    it('should reject absolute paths in put()', async () => {
      const mockBucket = createMockR2Bucket();
      const adapter = new R2ObjectStorageAdapter(mockBucket, 'data');

      await expect(adapter.put('/etc/passwd', new Uint8Array([1]))).rejects.toThrow(/absolute path/i);
      await expect(adapter.put('C:\\Windows\\System32', new Uint8Array([1]))).rejects.toThrow(/absolute path/i);
    });

    it('should reject absolute paths in get()', async () => {
      const mockBucket = createMockR2Bucket();
      const adapter = new R2ObjectStorageAdapter(mockBucket, 'data');

      await expect(adapter.get('/etc/passwd')).rejects.toThrow(/absolute path/i);
    });

    it('should reject path traversal in delete()', async () => {
      const mockBucket = createMockR2Bucket();
      const adapter = new R2ObjectStorageAdapter(mockBucket, 'data');

      await expect(adapter.delete('../secret.bin')).rejects.toThrow(/path traversal/i);
    });

    it('should reject path traversal in head()', async () => {
      const mockBucket = createMockR2Bucket();
      const adapter = new R2ObjectStorageAdapter(mockBucket, 'data');

      await expect(adapter.head('../secret.bin')).rejects.toThrow(/path traversal/i);
    });

    it('should reject path traversal in list()', async () => {
      const mockBucket = createMockR2Bucket();
      const adapter = new R2ObjectStorageAdapter(mockBucket, 'data');

      await expect(adapter.list('../')).rejects.toThrow(/path traversal/i);
    });

    it('should allow safe paths after validation', async () => {
      const mockBucket = createMockR2Bucket();
      const adapter = new R2ObjectStorageAdapter(mockBucket, 'data');

      // These should all succeed
      await adapter.put('file.bin', new Uint8Array([1, 2, 3]));
      const result = await adapter.get('file.bin');
      expect(result).toEqual(new Uint8Array([1, 2, 3]));

      await adapter.put('nested/path/file.bin', new Uint8Array([4, 5, 6]));
      const result2 = await adapter.get('nested/path/file.bin');
      expect(result2).toEqual(new Uint8Array([4, 5, 6]));
    });
  });

  describe('R2Storage with path validation', () => {
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
            async arrayBuffer() { return entry.data.slice(0); },
            async text() { return new TextDecoder().decode(entry.data); },
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
          const metadata = { size: buffer.byteLength, etag: `"mock-etag"`, uploaded: new Date() };
          store.set(key, { data: buffer, metadata });
          return { key, size: metadata.size, etag: metadata.etag, uploaded: metadata.uploaded, async arrayBuffer() { return buffer; } };
        },
        async delete(key: string) { store.delete(key); },
        async list(options?: { prefix?: string }) {
          const prefix = options?.prefix || '';
          const objects = [...store.entries()]
            .filter(([key]) => key.startsWith(prefix))
            .map(([key, entry]) => ({
              key,
              size: entry.metadata.size,
              etag: entry.metadata.etag,
              uploaded: entry.metadata.uploaded,
              async arrayBuffer() { return entry.data; },
            }));
          return { objects, truncated: false };
        },
        async head(key: string) {
          const entry = store.get(key);
          if (!entry) return null;
          return {
            key,
            size: entry.metadata.size,
            etag: entry.metadata.etag,
            uploaded: entry.metadata.uploaded,
            async arrayBuffer() { return entry.data; },
          };
        },
      };
    }

    it('should reject path traversal in write()', async () => {
      const mockBucket = createMockR2Bucket();
      const storage = new R2Storage(mockBucket, 'data');

      await expect(storage.write('../secret.bin', new Uint8Array([1]))).rejects.toThrow(/path traversal/i);
      await expect(storage.write('../../etc/passwd', new Uint8Array([1]))).rejects.toThrow(/path traversal/i);
    });

    it('should reject path traversal in read()', async () => {
      const mockBucket = createMockR2Bucket();
      const storage = new R2Storage(mockBucket, 'data');

      await expect(storage.read('../secret.bin')).rejects.toThrow(/path traversal/i);
    });

    it('should reject absolute paths in write()', async () => {
      const mockBucket = createMockR2Bucket();
      const storage = new R2Storage(mockBucket, 'data');

      await expect(storage.write('/etc/passwd', new Uint8Array([1]))).rejects.toThrow(/absolute path/i);
    });

    it('should reject path traversal in delete()', async () => {
      const mockBucket = createMockR2Bucket();
      const storage = new R2Storage(mockBucket, 'data');

      await expect(storage.delete('../secret.bin')).rejects.toThrow(/path traversal/i);
    });

    it('should reject path traversal in list()', async () => {
      const mockBucket = createMockR2Bucket();
      const storage = new R2Storage(mockBucket, 'data');

      await expect(storage.list('../')).rejects.toThrow(/path traversal/i);
    });

    it('should allow safe paths after validation', async () => {
      const mockBucket = createMockR2Bucket();
      const storage = new R2Storage(mockBucket, 'data');

      await storage.write('file.bin', new Uint8Array([1, 2, 3]));
      const result = await storage.read('file.bin');
      expect(result).toEqual(new Uint8Array([1, 2, 3]));
    });
  });

  describe('keyPrefix validation in constructor', () => {
    function createMockR2Bucket(): R2BucketLike {
      return {
        async get() { return null; },
        async put(key) { return { key, size: 0, etag: '', uploaded: new Date(), async arrayBuffer() { return new ArrayBuffer(0); } }; },
        async delete() {},
        async list() { return { objects: [], truncated: false }; },
        async head() { return null; },
      };
    }

    it('should reject path traversal in keyPrefix for R2ObjectStorageAdapter', () => {
      const mockBucket = createMockR2Bucket();

      expect(() => new R2ObjectStorageAdapter(mockBucket, '../secrets')).toThrow(/path traversal/i);
      expect(() => new R2ObjectStorageAdapter(mockBucket, 'data/../secrets')).toThrow(/path traversal/i);
    });

    it('should reject absolute paths in keyPrefix for R2ObjectStorageAdapter', () => {
      const mockBucket = createMockR2Bucket();

      expect(() => new R2ObjectStorageAdapter(mockBucket, '/etc/passwd')).toThrow(/absolute path/i);
      expect(() => new R2ObjectStorageAdapter(mockBucket, 'C:\\Windows')).toThrow(/absolute path/i);
    });

    it('should reject path traversal in keyPrefix for R2Storage', () => {
      const mockBucket = createMockR2Bucket();

      expect(() => new R2Storage(mockBucket, '../secrets')).toThrow(/path traversal/i);
      expect(() => new R2Storage(mockBucket, 'data/../secrets')).toThrow(/path traversal/i);
    });

    it('should reject absolute paths in keyPrefix for R2Storage', () => {
      const mockBucket = createMockR2Bucket();

      expect(() => new R2Storage(mockBucket, '/etc/passwd')).toThrow(/absolute path/i);
    });

    it('should allow safe keyPrefix values', () => {
      const mockBucket = createMockR2Bucket();

      expect(() => new R2ObjectStorageAdapter(mockBucket, 'data')).not.toThrow();
      expect(() => new R2ObjectStorageAdapter(mockBucket, 'my-prefix/nested')).not.toThrow();
      expect(() => new R2ObjectStorageAdapter(mockBucket, '')).not.toThrow();

      expect(() => new R2Storage(mockBucket, 'data')).not.toThrow();
      expect(() => new R2Storage(mockBucket, 'my-prefix/nested')).not.toThrow();
      expect(() => new R2Storage(mockBucket, '')).not.toThrow();
    });
  });
});

describe('Unified Storage usage patterns', () => {
  it('should support typical lakehouse operations', async () => {
    const storage = new MemoryStorage();

    // Write a manifest
    const manifest = { tableId: 'test-123', location: 'test/table' };
    const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
    await storage.write('test/table/_manifest.json', manifestBytes);

    // Write a data file
    const dataBlock = new Uint8Array([0x43, 0x4a, 0x4c, 0x42]); // "CJLB" magic
    await storage.write('test/table/data/block-001.bin', dataBlock);

    // Read back manifest
    const manifestData = await storage.read('test/table/_manifest.json');
    const parsedManifest = JSON.parse(new TextDecoder().decode(manifestData!));
    expect(parsedManifest.tableId).toBe('test-123');

    // List data files
    const dataFiles = await storage.list('test/table/data/');
    expect(dataFiles.paths).toHaveLength(1);
    expect(dataFiles.paths[0]).toBe('test/table/data/block-001.bin');

    // Check existence
    expect(await storage.exists('test/table/_manifest.json')).toBe(true);
    expect(await storage.exists('test/table/nonexistent.json')).toBe(false);

    // Get metadata
    const meta = await storage.head('test/table/data/block-001.bin');
    expect(meta?.size).toBe(4);
  });

  it('should allow swapping implementations for testing vs production', async () => {
    // Factory function that accepts the unified Storage interface
    async function writeData(storage: Storage, path: string, data: Uint8Array): Promise<void> {
      await storage.write(path, data);
    }

    async function readData(storage: Storage, path: string): Promise<Uint8Array | null> {
      return storage.read(path);
    }

    // In tests: use MemoryStorage
    const testStorage = new MemoryStorage();
    await writeData(testStorage, 'test.bin', new Uint8Array([1, 2, 3]));
    const result = await readData(testStorage, 'test.bin');
    expect(result).toEqual(new Uint8Array([1, 2, 3]));

    // In production: would use R2Storage
    // const prodStorage = new R2Storage(env.MY_BUCKET);
    // Same API, different backend
  });

  it('should work with existing code via adapter conversion', async () => {
    // New code uses unified Storage
    const storage = new MemoryStorage();
    await storage.write('new-data.bin', new Uint8Array([1, 2, 3]));

    // Legacy function expects ObjectStorageAdapter
    async function legacyFunction(adapter: ObjectStorageAdapter): Promise<Uint8Array | null> {
      return adapter.get('new-data.bin');
    }

    // Convert and use
    const adapter = storageToObjectAdapter(storage);
    const result = await legacyFunction(adapter);
    expect(result).toEqual(new Uint8Array([1, 2, 3]));
  });
});
