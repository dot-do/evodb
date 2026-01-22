/**
 * @evodb/core - Memory Object Storage Adapter Tests
 *
 * Tests for MemoryObjectStorageAdapter implementation.
 * Issue: pocs-eval - Storage adapter pattern for R2 - improve testability
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MemoryObjectStorageAdapter,
  type ObjectStorageAdapter,
} from '../storage.ts';

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
