/**
 * @evodb/core - Unified Storage Interface Tests
 *
 * Tests for the consolidated Storage interface.
 * Issue: evodb-pyo - Consolidate 4 storage abstractions
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  type Storage,
  MemoryStorage,
  createStorage,
  createMemoryStorage,
  storageToObjectAdapter,
  objectAdapterToStorage,
  MemoryObjectStorageAdapter,
  type ObjectStorageAdapter,
} from '../storage.ts';

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

    // ==========================================================================
    // Issue evodb-qpi: TDD bounds validation for objectAdapterToStorage.readRange
    // ==========================================================================

    describe('readRange bounds validation', () => {
      it('should throw for negative length', async () => {
        const adapter = new MemoryObjectStorageAdapter();
        await adapter.put('range-test.bin', new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
        const storage = objectAdapterToStorage(adapter);

        await expect(storage.readRange!('range-test.bin', 0, -1)).rejects.toThrow(/length.*negative|invalid.*length/i);
      });

      it('should throw for offset past end of data', async () => {
        const adapter = new MemoryObjectStorageAdapter();
        await adapter.put('range-test.bin', new Uint8Array([0, 1, 2, 3, 4]));
        const storage = objectAdapterToStorage(adapter);

        await expect(storage.readRange!('range-test.bin', 10, 1)).rejects.toThrow(/offset.*bounds|out of range/i);
      });

      it('should throw for negative offset that resolves past start', async () => {
        const adapter = new MemoryObjectStorageAdapter();
        await adapter.put('range-test.bin', new Uint8Array([0, 1, 2, 3, 4]));
        const storage = objectAdapterToStorage(adapter);

        await expect(storage.readRange!('range-test.bin', -10, 1)).rejects.toThrow(/offset.*bounds|out of range/i);
      });
    });
  });

  describe('storageToObjectAdapter getRange bounds validation', () => {
    // ==========================================================================
    // Issue evodb-qpi: TDD bounds validation for storageToObjectAdapter.getRange
    // ==========================================================================

    it('should throw for negative length', async () => {
      const storage = new MemoryStorage();
      await storage.write('range-test.bin', new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
      const adapter = storageToObjectAdapter(storage);

      await expect(adapter.getRange!('range-test.bin', 0, -1)).rejects.toThrow(/length.*negative|invalid.*length/i);
    });

    it('should throw for offset past end of data', async () => {
      const storage = new MemoryStorage();
      await storage.write('range-test.bin', new Uint8Array([0, 1, 2, 3, 4]));
      const adapter = storageToObjectAdapter(storage);

      await expect(adapter.getRange!('range-test.bin', 10, 1)).rejects.toThrow(/offset.*bounds|out of range/i);
    });

    it('should throw for negative offset that resolves past start', async () => {
      const storage = new MemoryStorage();
      await storage.write('range-test.bin', new Uint8Array([0, 1, 2, 3, 4]));
      const adapter = storageToObjectAdapter(storage);

      await expect(adapter.getRange!('range-test.bin', -10, 1)).rejects.toThrow(/offset.*bounds|out of range/i);
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
