/**
 * @evodb/core - StorageProvider Interface Tests
 *
 * TDD tests for the unified StorageProvider interface.
 * Issue: evodb-v3l - Consolidate storage interface fragmentation
 *
 * This test file verifies:
 * - Unified StorageProvider interface with get/put/delete/list methods
 * - R2StorageProvider implements StorageProvider
 * - InMemoryStorageProvider implements StorageProvider
 * - All providers have consistent error handling
 * - All providers return consistent types
 */

import { describe, it, expect, beforeEach } from 'vitest';

// These imports will fail initially (RED phase) until implementation exists
import {
  type StorageProvider,
  R2StorageProvider,
  InMemoryStorageProvider,
  StorageProviderError,
  NotFoundError,
  createStorageProvider,
  createInMemoryProvider,
} from '../storage-provider.js';

describe('StorageProvider Interface', () => {
  describe('Interface contract', () => {
    it('should define get/put/delete/list/exists methods', () => {
      // Verify the interface shape through type checking
      const provider: StorageProvider = new InMemoryStorageProvider();

      expect(typeof provider.get).toBe('function');
      expect(typeof provider.put).toBe('function');
      expect(typeof provider.delete).toBe('function');
      expect(typeof provider.list).toBe('function');
      expect(typeof provider.exists).toBe('function');
    });

    it('should return Promise<Uint8Array | null> from get()', async () => {
      const provider: StorageProvider = new InMemoryStorageProvider();
      const result = await provider.get('nonexistent');

      expect(result).toBeNull();
    });

    it('should return Promise<void> from put()', async () => {
      const provider: StorageProvider = new InMemoryStorageProvider();
      const result = await provider.put('test.bin', new Uint8Array([1, 2, 3]));

      expect(result).toBeUndefined();
    });

    it('should return Promise<void> from delete()', async () => {
      const provider: StorageProvider = new InMemoryStorageProvider();
      const result = await provider.delete('nonexistent');

      expect(result).toBeUndefined();
    });

    it('should return Promise<string[]> from list()', async () => {
      const provider: StorageProvider = new InMemoryStorageProvider();
      const result = await provider.list('prefix/');

      expect(Array.isArray(result)).toBe(true);
    });

    it('should return Promise<boolean> from exists()', async () => {
      const provider: StorageProvider = new InMemoryStorageProvider();
      const result = await provider.exists('nonexistent');

      expect(typeof result).toBe('boolean');
      expect(result).toBe(false);
    });
  });
});

describe('InMemoryStorageProvider', () => {
  let provider: InMemoryStorageProvider;

  beforeEach(() => {
    provider = new InMemoryStorageProvider();
  });

  describe('get and put operations', () => {
    it('should store and retrieve data', async () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      await provider.put('test/file.bin', data);

      const result = await provider.get('test/file.bin');
      expect(result).toEqual(data);
    });

    it('should return null for non-existent keys', async () => {
      const result = await provider.get('nonexistent/path.bin');
      expect(result).toBeNull();
    });

    it('should not mutate stored data when original is modified', async () => {
      const data = new Uint8Array([1, 2, 3]);
      await provider.put('immutable.bin', data);

      // Mutate original
      data[0] = 99;

      const result = await provider.get('immutable.bin');
      expect(result![0]).toBe(1); // Should be original value
    });

    it('should not allow mutation of retrieved data to affect storage', async () => {
      const data = new Uint8Array([1, 2, 3]);
      await provider.put('immutable.bin', data);

      const result = await provider.get('immutable.bin');
      result![0] = 99;

      const result2 = await provider.get('immutable.bin');
      expect(result2![0]).toBe(1); // Should still be original
    });

    it('should overwrite existing data', async () => {
      await provider.put('overwrite.bin', new Uint8Array([1, 2, 3]));
      await provider.put('overwrite.bin', new Uint8Array([4, 5, 6]));

      const result = await provider.get('overwrite.bin');
      expect(result).toEqual(new Uint8Array([4, 5, 6]));
    });
  });

  describe('delete operation', () => {
    it('should delete existing keys', async () => {
      await provider.put('to-delete.bin', new Uint8Array([1]));
      expect(await provider.exists('to-delete.bin')).toBe(true);

      await provider.delete('to-delete.bin');
      expect(await provider.exists('to-delete.bin')).toBe(false);
    });

    it('should not throw when deleting non-existent keys', async () => {
      await expect(provider.delete('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('list operation', () => {
    it('should list keys with matching prefix', async () => {
      await provider.put('data/file1.bin', new Uint8Array([1]));
      await provider.put('data/file2.bin', new Uint8Array([2]));
      await provider.put('other/file3.bin', new Uint8Array([3]));

      const result = await provider.list('data/');
      expect(result).toHaveLength(2);
      expect(result).toContain('data/file1.bin');
      expect(result).toContain('data/file2.bin');
    });

    it('should return sorted keys', async () => {
      await provider.put('c.bin', new Uint8Array([3]));
      await provider.put('a.bin', new Uint8Array([1]));
      await provider.put('b.bin', new Uint8Array([2]));

      const result = await provider.list('');
      expect(result).toEqual(['a.bin', 'b.bin', 'c.bin']);
    });

    it('should return empty array when no keys match', async () => {
      await provider.put('data/file.bin', new Uint8Array([1]));

      const result = await provider.list('other/');
      expect(result).toEqual([]);
    });
  });

  describe('exists operation', () => {
    it('should return true for existing keys', async () => {
      await provider.put('exists.bin', new Uint8Array([1]));
      expect(await provider.exists('exists.bin')).toBe(true);
    });

    it('should return false for non-existent keys', async () => {
      expect(await provider.exists('nonexistent')).toBe(false);
    });
  });

  describe('utility methods', () => {
    it('should provide clear() method for testing', async () => {
      await provider.put('a.bin', new Uint8Array([1]));
      await provider.put('b.bin', new Uint8Array([2]));

      provider.clear();

      expect(await provider.exists('a.bin')).toBe(false);
      expect(await provider.exists('b.bin')).toBe(false);
    });

    it('should provide size property', async () => {
      expect(provider.size).toBe(0);

      await provider.put('a.bin', new Uint8Array([1]));
      expect(provider.size).toBe(1);

      await provider.put('b.bin', new Uint8Array([2]));
      expect(provider.size).toBe(2);
    });
  });
});

describe('R2StorageProvider', () => {
  // Mock R2Bucket for testing
  interface MockR2Bucket {
    get(key: string): Promise<MockR2Object | null>;
    put(key: string, value: ArrayBuffer | Uint8Array): Promise<MockR2Object>;
    delete(key: string): Promise<void>;
    list(options?: { prefix?: string; cursor?: string }): Promise<MockR2Objects>;
    head(key: string): Promise<MockR2Object | null>;
  }

  interface MockR2Object {
    key: string;
    size: number;
    arrayBuffer(): Promise<ArrayBuffer>;
  }

  interface MockR2Objects {
    objects: MockR2Object[];
    truncated: boolean;
    cursor?: string;
  }

  function createMockBucket(): MockR2Bucket {
    const store = new Map<string, Uint8Array>();

    return {
      async get(key: string): Promise<MockR2Object | null> {
        const data = store.get(key);
        if (!data) return null;
        return {
          key,
          size: data.length,
          arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
        };
      },
      async put(key: string, value: ArrayBuffer | Uint8Array): Promise<MockR2Object> {
        const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : value;
        store.set(key, bytes.slice());
        return {
          key,
          size: bytes.length,
          arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        };
      },
      async delete(key: string): Promise<void> {
        store.delete(key);
      },
      async list(options?: { prefix?: string }): Promise<MockR2Objects> {
        const prefix = options?.prefix || '';
        const keys = [...store.keys()].filter(k => k.startsWith(prefix)).sort();
        return {
          objects: keys.map(key => ({
            key,
            size: store.get(key)!.length,
            arrayBuffer: async () => {
              const data = store.get(key)!;
              return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
            },
          })),
          truncated: false,
        };
      },
      async head(key: string): Promise<MockR2Object | null> {
        const data = store.get(key);
        if (!data) return null;
        return {
          key,
          size: data.length,
          arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
        };
      },
    };
  }

  let bucket: MockR2Bucket;
  let provider: R2StorageProvider;

  beforeEach(() => {
    bucket = createMockBucket();
    // Cast to match expected R2BucketLike type
    provider = new R2StorageProvider(bucket as unknown as Parameters<typeof R2StorageProvider>[0]);
  });

  it('should implement StorageProvider interface', () => {
    const storageProvider: StorageProvider = provider;

    expect(typeof storageProvider.get).toBe('function');
    expect(typeof storageProvider.put).toBe('function');
    expect(typeof storageProvider.delete).toBe('function');
    expect(typeof storageProvider.list).toBe('function');
    expect(typeof storageProvider.exists).toBe('function');
  });

  describe('get and put operations', () => {
    it('should store and retrieve data', async () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      await provider.put('test/file.bin', data);

      const result = await provider.get('test/file.bin');
      expect(result).toEqual(data);
    });

    it('should return null for non-existent keys', async () => {
      const result = await provider.get('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('delete operation', () => {
    it('should delete existing keys', async () => {
      await provider.put('to-delete.bin', new Uint8Array([1]));
      await provider.delete('to-delete.bin');

      const result = await provider.get('to-delete.bin');
      expect(result).toBeNull();
    });
  });

  describe('list operation', () => {
    it('should list keys with prefix', async () => {
      await provider.put('data/a.bin', new Uint8Array([1]));
      await provider.put('data/b.bin', new Uint8Array([2]));
      await provider.put('other/c.bin', new Uint8Array([3]));

      const result = await provider.list('data/');
      expect(result).toHaveLength(2);
      expect(result).toContain('data/a.bin');
      expect(result).toContain('data/b.bin');
    });
  });

  describe('exists operation', () => {
    it('should return true for existing keys', async () => {
      await provider.put('exists.bin', new Uint8Array([1]));
      expect(await provider.exists('exists.bin')).toBe(true);
    });

    it('should return false for non-existent keys', async () => {
      expect(await provider.exists('nonexistent')).toBe(false);
    });
  });

  describe('with key prefix', () => {
    it('should prepend prefix to all operations', async () => {
      const prefixedProvider = new R2StorageProvider(
        bucket as unknown as Parameters<typeof R2StorageProvider>[0],
        'my-prefix'
      );

      await prefixedProvider.put('file.bin', new Uint8Array([1]));

      // Direct bucket access should show prefixed key
      const directResult = await bucket.get('my-prefix/file.bin');
      expect(directResult).not.toBeNull();

      // Provider should work with unprefixed key
      const result = await prefixedProvider.get('file.bin');
      expect(result).toEqual(new Uint8Array([1]));
    });
  });
});

describe('StorageProviderError', () => {
  it('should be an Error subclass', () => {
    const error = new StorageProviderError('Test error');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(StorageProviderError);
  });

  it('should have a name property', () => {
    const error = new StorageProviderError('Test error');
    expect(error.name).toBe('StorageProviderError');
  });

  it('should capture the message', () => {
    const error = new StorageProviderError('Something went wrong');
    expect(error.message).toBe('Something went wrong');
  });

  it('should support cause parameter', () => {
    const cause = new Error('Original error');
    const error = new StorageProviderError('Wrapped error', { cause });
    expect(error.cause).toBe(cause);
  });
});

describe('NotFoundError', () => {
  it('should be a StorageProviderError subclass', () => {
    const error = new NotFoundError('test.bin');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(StorageProviderError);
    expect(error).toBeInstanceOf(NotFoundError);
  });

  it('should have a descriptive message', () => {
    const error = new NotFoundError('path/to/file.bin');
    expect(error.message).toContain('path/to/file.bin');
    expect(error.message.toLowerCase()).toContain('not found');
  });

  it('should store the path', () => {
    const error = new NotFoundError('path/to/file.bin');
    expect(error.path).toBe('path/to/file.bin');
  });

  it('should have correct name', () => {
    const error = new NotFoundError('test.bin');
    expect(error.name).toBe('NotFoundError');
  });
});

describe('Consistent error handling across providers', () => {
  const providers = [
    { name: 'InMemoryStorageProvider', createProvider: () => new InMemoryStorageProvider() },
  ];

  providers.forEach(({ name, createProvider }) => {
    describe(name, () => {
      let provider: StorageProvider;

      beforeEach(() => {
        provider = createProvider();
      });

      it('should return null (not throw) for get() on non-existent key', async () => {
        const result = await provider.get('nonexistent');
        expect(result).toBeNull();
      });

      it('should not throw for delete() on non-existent key', async () => {
        await expect(provider.delete('nonexistent')).resolves.not.toThrow();
      });

      it('should return false (not throw) for exists() on non-existent key', async () => {
        const result = await provider.exists('nonexistent');
        expect(result).toBe(false);
      });

      it('should return empty array (not throw) for list() with no matches', async () => {
        const result = await provider.list('nonexistent/prefix/');
        expect(result).toEqual([]);
      });
    });
  });
});

describe('Consistent return types across providers', () => {
  const providers = [
    { name: 'InMemoryStorageProvider', createProvider: () => new InMemoryStorageProvider() },
  ];

  providers.forEach(({ name, createProvider }) => {
    describe(name, () => {
      let provider: StorageProvider;

      beforeEach(() => {
        provider = createProvider();
      });

      it('get() should return Uint8Array (not ArrayBuffer)', async () => {
        await provider.put('test.bin', new Uint8Array([1, 2, 3]));
        const result = await provider.get('test.bin');

        expect(result).toBeInstanceOf(Uint8Array);
        expect(result).not.toBeInstanceOf(ArrayBuffer);
      });

      it('list() should return string[] (not objects)', async () => {
        await provider.put('a.bin', new Uint8Array([1]));
        await provider.put('b.bin', new Uint8Array([2]));
        const result = await provider.list('');

        expect(Array.isArray(result)).toBe(true);
        expect(typeof result[0]).toBe('string');
      });
    });
  });
});

describe('Factory functions', () => {
  describe('createInMemoryProvider', () => {
    it('should create an InMemoryStorageProvider', () => {
      const provider = createInMemoryProvider();
      expect(provider).toBeInstanceOf(InMemoryStorageProvider);
    });

    it('should return a functional provider', async () => {
      const provider = createInMemoryProvider();
      await provider.put('test.bin', new Uint8Array([1, 2, 3]));
      const result = await provider.get('test.bin');
      expect(result).toEqual(new Uint8Array([1, 2, 3]));
    });
  });

  describe('createStorageProvider', () => {
    it('should create an R2StorageProvider from a bucket', () => {
      const mockBucket = {
        get: async () => null,
        put: async () => ({}),
        delete: async () => {},
        list: async () => ({ objects: [], truncated: false }),
        head: async () => null,
      };

      const provider = createStorageProvider(mockBucket as unknown as Parameters<typeof createStorageProvider>[0]);
      expect(provider).toBeInstanceOf(R2StorageProvider);
    });
  });
});

describe('Type consistency documentation', () => {
  it('should document the consolidated interface', () => {
    // This test serves as documentation for the consolidated interface
    // The StorageProvider interface consolidates:
    // 1. Storage (core/storage.ts) - read/write/list/delete
    // 2. ObjectStorageAdapter (core/storage.ts) - put/get/list/head/delete
    // 3. StorageAdapter (core/types.ts) - writeBlock/readBlock/listBlocks/deleteBlock
    // 4. R2StorageAdapter (lakehouse/types.ts) - readJson/writeJson/readBinary/writeBinary
    // 5. StorageAdapter (lance-reader/types.ts) - get/getRange/list/exists

    // The unified StorageProvider uses:
    // - get() instead of read()/get()/readBinary()
    // - put() instead of write()/put()/writeBinary()/writeBlock()
    // - delete() instead of delete()/deleteBlock()
    // - list() returning string[] instead of { paths: string[] }
    // - exists() as a required method

    expect(true).toBe(true); // Documentation marker
  });
});
