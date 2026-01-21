/**
 * @evodb/lakehouse - R2 Storage Tests
 *
 * Comprehensive tests for R2 storage operations including:
 * - Memory adapter operations
 * - Storage adapter creation
 * - Binary data handling
 * - TableStorage operations
 * - Atomic commit protocol
 * - Storage backend normalization
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  // Storage adapters
  createMemoryAdapter,
  createR2AdapterFromObjectStorage,
  normalizeStorageBackend,

  // Low-level adapters
  MemoryObjectStorageAdapter,

  // Table storage
  TableStorage,
  createMemoryTableStorage,
  atomicCommit,

  // Manifest operations
  createTable,
  appendFiles,
  createManifestFile,
  createFileStats,
  evolveSchema,

  // Types
  type R2StorageAdapter,
} from '../index.js';

// =============================================================================
// Memory Adapter Tests
// =============================================================================

describe('createMemoryAdapter', () => {
  let adapter: R2StorageAdapter;

  beforeEach(() => {
    adapter = createMemoryAdapter();
  });

  describe('JSON operations', () => {
    it('should write and read JSON data', async () => {
      const data = { name: 'test', count: 42 };

      await adapter.writeJson('test/data.json', data);
      const result = await adapter.readJson<typeof data>('test/data.json');

      expect(result).toEqual(data);
    });

    it('should return null for non-existent JSON file', async () => {
      const result = await adapter.readJson('nonexistent.json');
      expect(result).toBeNull();
    });

    it('should overwrite existing JSON file', async () => {
      await adapter.writeJson('data.json', { version: 1 });
      await adapter.writeJson('data.json', { version: 2 });

      const result = await adapter.readJson<{ version: number }>('data.json');
      expect(result?.version).toBe(2);
    });

    it('should handle complex nested JSON', async () => {
      const data = {
        users: [
          { id: 1, name: 'Alice', tags: ['admin', 'user'] },
          { id: 2, name: 'Bob', metadata: { score: 100 } },
        ],
        config: {
          nested: {
            deeply: {
              value: true,
            },
          },
        },
      };

      await adapter.writeJson('complex.json', data);
      const result = await adapter.readJson<typeof data>('complex.json');

      expect(result).toEqual(data);
    });

    it('should handle JSON with null values', async () => {
      const data = { name: 'test', optional: null };

      await adapter.writeJson('nullable.json', data);
      const result = await adapter.readJson<typeof data>('nullable.json');

      expect(result).toEqual(data);
      expect(result?.optional).toBeNull();
    });
  });

  describe('Binary operations', () => {
    it('should write and read binary data', async () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);

      await adapter.writeBinary('test.bin', data);
      const result = await adapter.readBinary('test.bin');

      expect(result).toEqual(data);
    });

    it('should return null for non-existent binary file', async () => {
      const result = await adapter.readBinary('nonexistent.bin');
      expect(result).toBeNull();
    });

    it('should handle empty binary data', async () => {
      const data = new Uint8Array([]);

      await adapter.writeBinary('empty.bin', data);
      const result = await adapter.readBinary('empty.bin');

      expect(result).toEqual(data);
      expect(result?.length).toBe(0);
    });

    it('should handle large binary data', async () => {
      const data = new Uint8Array(10000);
      for (let i = 0; i < data.length; i++) {
        data[i] = i % 256;
      }

      await adapter.writeBinary('large.bin', data);
      const result = await adapter.readBinary('large.bin');

      expect(result).toEqual(data);
    });

    it('should copy binary data (not reference)', async () => {
      const original = new Uint8Array([1, 2, 3]);

      await adapter.writeBinary('data.bin', original);

      // Modify original
      original[0] = 99;

      const result = await adapter.readBinary('data.bin');
      expect(result?.[0]).toBe(1); // Should still be 1
    });
  });

  describe('list operations', () => {
    it('should list files with prefix', async () => {
      await adapter.writeJson('data/file1.json', {});
      await adapter.writeJson('data/file2.json', {});
      await adapter.writeJson('other/file3.json', {});

      const dataFiles = await adapter.list('data/');

      expect(dataFiles).toHaveLength(2);
      expect(dataFiles).toContain('data/file1.json');
      expect(dataFiles).toContain('data/file2.json');
    });

    it('should return empty array for non-matching prefix', async () => {
      await adapter.writeJson('data/file.json', {});

      const files = await adapter.list('nonexistent/');

      expect(files).toHaveLength(0);
    });

    it('should return all files with empty prefix', async () => {
      await adapter.writeJson('a.json', {});
      await adapter.writeJson('b.json', {});
      await adapter.writeJson('dir/c.json', {});

      const files = await adapter.list('');

      expect(files).toHaveLength(3);
    });

    it('should sort files alphabetically', async () => {
      await adapter.writeJson('z.json', {});
      await adapter.writeJson('a.json', {});
      await adapter.writeJson('m.json', {});

      const files = await adapter.list('');

      expect(files[0]).toBe('a.json');
      expect(files[1]).toBe('m.json');
      expect(files[2]).toBe('z.json');
    });
  });

  describe('exists operation', () => {
    it('should return true for existing file', async () => {
      await adapter.writeJson('exists.json', {});

      const exists = await adapter.exists('exists.json');

      expect(exists).toBe(true);
    });

    it('should return false for non-existent file', async () => {
      const exists = await adapter.exists('nonexistent.json');

      expect(exists).toBe(false);
    });
  });

  describe('delete operation', () => {
    it('should delete existing file', async () => {
      await adapter.writeJson('todelete.json', {});
      expect(await adapter.exists('todelete.json')).toBe(true);

      await adapter.delete('todelete.json');

      expect(await adapter.exists('todelete.json')).toBe(false);
    });

    it('should not throw on deleting non-existent file', async () => {
      await expect(adapter.delete('nonexistent.json')).resolves.not.toThrow();
    });
  });

  describe('head operation', () => {
    it('should return metadata for existing file', async () => {
      const data = { test: 'value' };
      await adapter.writeJson('meta.json', data);

      const meta = await adapter.head('meta.json');

      expect(meta).not.toBeNull();
      expect(meta?.size).toBe(JSON.stringify(data).length);
      expect(meta?.lastModified).toBeInstanceOf(Date);
    });

    it('should return null for non-existent file', async () => {
      const meta = await adapter.head('nonexistent.json');
      expect(meta).toBeNull();
    });

    it('should return correct size for binary files', async () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      await adapter.writeBinary('binary.bin', data);

      const meta = await adapter.head('binary.bin');

      expect(meta?.size).toBe(5);
    });
  });
});

// =============================================================================
// createR2AdapterFromObjectStorage Tests
// =============================================================================

describe('createR2AdapterFromObjectStorage', () => {
  it('should wrap MemoryObjectStorageAdapter', async () => {
    const objectStorage = new MemoryObjectStorageAdapter();
    const adapter = createR2AdapterFromObjectStorage(objectStorage);

    await adapter.writeJson('test.json', { key: 'value' });
    const result = await adapter.readJson<{ key: string }>('test.json');

    expect(result).toEqual({ key: 'value' });
  });

  it('should handle JSON encoding/decoding correctly', async () => {
    const objectStorage = new MemoryObjectStorageAdapter();
    const adapter = createR2AdapterFromObjectStorage(objectStorage);

    const data = { unicode: '\u00e9\u00e8\u00ea', emoji: '\u{1F600}' };
    await adapter.writeJson('unicode.json', data);

    const result = await adapter.readJson<typeof data>('unicode.json');
    expect(result).toEqual(data);
  });

  it('should pass through binary operations', async () => {
    const objectStorage = new MemoryObjectStorageAdapter();
    const adapter = createR2AdapterFromObjectStorage(objectStorage);

    const data = new Uint8Array([0xFF, 0x00, 0xAB, 0xCD]);
    await adapter.writeBinary('binary.bin', data);

    const result = await adapter.readBinary('binary.bin');
    expect(result).toEqual(data);
  });

  it('should use exists method if available', async () => {
    const objectStorage = new MemoryObjectStorageAdapter();
    const adapter = createR2AdapterFromObjectStorage(objectStorage);

    await adapter.writeJson('exists.json', {});

    const exists = await adapter.exists('exists.json');
    expect(exists).toBe(true);
  });

  it('should fall back to head for exists if not available', async () => {
    // Create a minimal adapter without exists method
    const minimalAdapter = {
      storage: new Map<string, Uint8Array>(),
      async get(path: string) {
        return this.storage.get(path) ?? null;
      },
      async put(path: string, data: Uint8Array) {
        this.storage.set(path, data);
      },
      async delete(path: string) {
        this.storage.delete(path);
      },
      async list(prefix: string) {
        return [...this.storage.keys()].filter(k => k.startsWith(prefix));
      },
      async head(path: string) {
        const data = this.storage.get(path);
        if (!data) return null;
        return { size: data.length, lastModified: new Date() };
      },
      // exists is intentionally not implemented
    };

    const adapter = createR2AdapterFromObjectStorage(minimalAdapter as never);

    await adapter.writeJson('test.json', {});

    const exists = await adapter.exists('test.json');
    expect(exists).toBe(true);

    const notExists = await adapter.exists('nonexistent.json');
    expect(notExists).toBe(false);
  });
});

// =============================================================================
// normalizeStorageBackend Tests
// =============================================================================

describe('normalizeStorageBackend', () => {
  it('should return same adapter if already R2StorageAdapter', () => {
    const adapter = createMemoryAdapter();

    const normalized = normalizeStorageBackend(adapter);

    // Should be functionally equivalent (may not be same reference due to implementation)
    expect(normalized.readJson).toBeDefined();
    expect(normalized.writeJson).toBeDefined();
  });

  it('should wrap MemoryObjectStorageAdapter', () => {
    const objectStorage = new MemoryObjectStorageAdapter();

    const adapter = normalizeStorageBackend(objectStorage);

    expect(adapter.readJson).toBeDefined();
    expect(adapter.writeJson).toBeDefined();
    expect(adapter.readBinary).toBeDefined();
  });
});

// =============================================================================
// TableStorage Tests
// =============================================================================

describe('TableStorage', () => {
  let storage: TableStorage;

  beforeEach(() => {
    storage = createMemoryTableStorage('com/example/test-table');
  });

  describe('manifest operations', () => {
    it('should write and read manifest', async () => {
      const { manifest, schema } = createTable({
        location: 'com/example/test-table',
        schema: {
          columns: [{ name: 'id', type: 'uuid', nullable: false }],
        },
      });

      await storage.writeManifest(manifest);
      await storage.writeSchema(schema);

      const loaded = await storage.readManifest();

      expect(loaded).not.toBeNull();
      expect(loaded?.tableId).toBe(manifest.tableId);
      expect(loaded?.location).toBe('com/example/test-table');
    });

    it('should return null for non-existent manifest', async () => {
      const manifest = await storage.readManifest();
      expect(manifest).toBeNull();
    });

    it('should check manifest exists', async () => {
      expect(await storage.manifestExists()).toBe(false);

      const { manifest } = createTable({
        location: 'com/example/test-table',
        schema: {
          columns: [{ name: 'id', type: 'uuid', nullable: false }],
        },
      });
      await storage.writeManifest(manifest);

      expect(await storage.manifestExists()).toBe(true);
    });
  });

  describe('schema operations', () => {
    it('should write and read schema', async () => {
      const { schema } = createTable({
        location: 'com/example/test-table',
        schema: {
          columns: [
            { name: 'id', type: 'uuid', nullable: false },
            { name: 'name', type: 'string', nullable: true },
          ],
        },
      });

      await storage.writeSchema(schema);
      const loaded = await storage.readSchema(schema.schemaId);

      expect(loaded).not.toBeNull();
      expect(loaded?.schemaId).toBe(schema.schemaId);
      expect(loaded?.columns).toHaveLength(2);
    });

    it('should return null for non-existent schema', async () => {
      const schema = await storage.readSchema(999);
      expect(schema).toBeNull();
    });

    it('should list all schema versions', async () => {
      const { schema: v1 } = createTable({
        location: 'com/example/test-table',
        schema: {
          columns: [{ name: 'id', type: 'uuid', nullable: false }],
        },
      });

      const v2 = evolveSchema(v1, [
        { type: 'add_column', column: { name: 'email', type: 'string', nullable: true } },
      ]);

      await storage.writeSchema(v1);
      await storage.writeSchema(v2);

      const versions = await storage.listSchemas();

      expect(versions).toContain(1);
      expect(versions).toContain(2);
      expect(versions).toEqual([1, 2]); // Should be sorted
    });
  });

  describe('snapshot operations', () => {
    it('should write and read snapshot', async () => {
      const { manifest } = createTable({
        location: 'com/example/test-table',
        schema: {
          columns: [{ name: 'id', type: 'uuid', nullable: false }],
        },
      });

      const file = createManifestFile('data/block.bin', 1024, [], createFileStats(100, {}));
      const { snapshot } = appendFiles(manifest, null, [file]);

      await storage.writeSnapshot(snapshot);
      const loaded = await storage.readSnapshot(snapshot.snapshotId);

      expect(loaded).not.toBeNull();
      expect(loaded?.snapshotId).toBe(snapshot.snapshotId);
      expect(loaded?.manifestList).toHaveLength(1);
    });

    it('should return null for non-existent snapshot', async () => {
      const snapshot = await storage.readSnapshot('nonexistent-snapshot');
      expect(snapshot).toBeNull();
    });

    it('should list all snapshot IDs', async () => {
      const { manifest } = createTable({
        location: 'com/example/test-table',
        schema: {
          columns: [{ name: 'id', type: 'uuid', nullable: false }],
        },
      });

      const file1 = createManifestFile('data/block1.bin', 1024, [], createFileStats(100, {}));
      const { manifest: m1, snapshot: s1 } = appendFiles(manifest, null, [file1]);

      const file2 = createManifestFile('data/block2.bin', 1024, [], createFileStats(100, {}));
      const { snapshot: s2 } = appendFiles(m1, s1, [file2]);

      await storage.writeSnapshot(s1);
      await storage.writeSnapshot(s2);

      const snapshotIds = await storage.listSnapshots();

      expect(snapshotIds).toContain(s1.snapshotId);
      expect(snapshotIds).toContain(s2.snapshotId);
    });
  });

  describe('data file operations', () => {
    it('should write and read data file', async () => {
      const data = new Uint8Array([0x01, 0x02, 0x03, 0x04]);

      await storage.writeDataFile('data/year=2026/block.bin', data);
      const loaded = await storage.readDataFile('data/year=2026/block.bin');

      expect(loaded).toEqual(data);
    });

    it('should return null for non-existent data file', async () => {
      const data = await storage.readDataFile('data/nonexistent.bin');
      expect(data).toBeNull();
    });

    it('should delete data file', async () => {
      const data = new Uint8Array([0x01, 0x02]);
      await storage.writeDataFile('data/todelete.bin', data);

      await storage.deleteDataFile('data/todelete.bin');

      const loaded = await storage.readDataFile('data/todelete.bin');
      expect(loaded).toBeNull();
    });

    it('should list data files with partition prefix', async () => {
      await storage.writeDataFile('data/year=2025/block1.bin', new Uint8Array([1]));
      await storage.writeDataFile('data/year=2026/block1.bin', new Uint8Array([2]));
      await storage.writeDataFile('data/year=2026/block2.bin', new Uint8Array([3]));

      const files2026 = await storage.listDataFiles('year=2026/');

      expect(files2026).toHaveLength(2);
      expect(files2026.every(f => f.includes('year=2026/'))).toBe(true);
    });

    it('should get data file metadata', async () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      await storage.writeDataFile('data/meta-test.bin', data);

      const meta = await storage.getDataFileMetadata('data/meta-test.bin');

      expect(meta).not.toBeNull();
      expect(meta?.size).toBe(5);
    });
  });

  describe('utility operations', () => {
    it('should get table location', () => {
      expect(storage.getLocation()).toBe('com/example/test-table');
    });

    it('should delete entire table', async () => {
      const { manifest, schema } = createTable({
        location: 'com/example/test-table',
        schema: {
          columns: [{ name: 'id', type: 'uuid', nullable: false }],
        },
      });

      await storage.writeManifest(manifest);
      await storage.writeSchema(schema);
      await storage.writeDataFile('data/block.bin', new Uint8Array([1, 2, 3]));

      await storage.deleteTable();

      expect(await storage.manifestExists()).toBe(false);
      expect(await storage.readSchema(1)).toBeNull();
    });
  });
});

// =============================================================================
// Atomic Commit Tests
// =============================================================================

describe('atomicCommit', () => {
  it('should execute successful operation', async () => {
    const storage = createMemoryTableStorage('com/example/atomic-test');

    const result = await atomicCommit(storage, async (currentManifest) => {
      expect(currentManifest).toBeNull(); // New table

      const { manifest, schema } = createTable({
        location: 'com/example/atomic-test',
        schema: {
          columns: [{ name: 'id', type: 'uuid', nullable: false }],
        },
      });

      return {
        manifest,
        schema,
        result: 'table_created',
      };
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result).toBe('table_created');
    }

    // Verify data was persisted
    const manifest = await storage.readManifest();
    expect(manifest).not.toBeNull();
  });

  it('should include schema in commit', async () => {
    const storage = createMemoryTableStorage('com/example/schema-commit');

    await atomicCommit(storage, async () => {
      const { manifest, schema } = createTable({
        location: 'com/example/schema-commit',
        schema: {
          columns: [
            { name: 'id', type: 'uuid', nullable: false },
            { name: 'name', type: 'string', nullable: true },
          ],
        },
      });

      return { manifest, schema, result: null };
    });

    const schema = await storage.readSchema(1);
    expect(schema).not.toBeNull();
    expect(schema?.columns).toHaveLength(2);
  });

  it('should include snapshot in commit', async () => {
    const storage = createMemoryTableStorage('com/example/snapshot-commit');

    // First create the table
    await atomicCommit(storage, async () => {
      const { manifest, schema } = createTable({
        location: 'com/example/snapshot-commit',
        schema: {
          columns: [{ name: 'id', type: 'uuid', nullable: false }],
        },
      });

      return { manifest, schema, result: null };
    });

    // Then add data with snapshot
    await atomicCommit(storage, async (currentManifest) => {
      const file = createManifestFile('data/block.bin', 1024, [], createFileStats(100, {}));
      const { manifest, snapshot } = appendFiles(currentManifest!, null, [file]);

      return { manifest, snapshot, result: null };
    });

    const manifest = await storage.readManifest();
    expect(manifest?.currentSnapshotId).not.toBeNull();

    const snapshot = await storage.readSnapshot(manifest!.currentSnapshotId!);
    expect(snapshot).not.toBeNull();
  });

  it('should return error on failure', async () => {
    const storage = createMemoryTableStorage('com/example/failure-test');

    const result = await atomicCommit(storage, async () => {
      throw new Error('Simulated failure');
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('Simulated failure');
    }
  });

  it('should handle non-Error throws', async () => {
    const storage = createMemoryTableStorage('com/example/non-error-test');

    const result = await atomicCommit(storage, async () => {
      throw 'string error'; // Non-Error object
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('string error');
    }
  });

  it('should read current manifest for updates', async () => {
    const storage = createMemoryTableStorage('com/example/update-test');

    // Create initial table
    await atomicCommit(storage, async () => {
      const { manifest, schema } = createTable({
        location: 'com/example/update-test',
        schema: {
          columns: [{ name: 'id', type: 'uuid', nullable: false }],
        },
      });
      return { manifest, schema, result: null };
    });

    // Update with current manifest
    const result = await atomicCommit(storage, async (currentManifest) => {
      expect(currentManifest).not.toBeNull();
      expect(currentManifest?.location).toBe('com/example/update-test');

      const file = createManifestFile('data/block.bin', 1024, [], createFileStats(100, {}));
      const { manifest, snapshot } = appendFiles(currentManifest!, null, [file]);

      return { manifest, snapshot, result: 'updated' };
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result).toBe('updated');
    }
  });
});

// =============================================================================
// createMemoryTableStorage Tests
// =============================================================================

describe('createMemoryTableStorage', () => {
  it('should create isolated storage instances', async () => {
    const storage1 = createMemoryTableStorage('table1');
    const storage2 = createMemoryTableStorage('table2');

    const { manifest: m1, schema: s1 } = createTable({
      location: 'table1',
      schema: { columns: [{ name: 'id', type: 'int64', nullable: false }] },
    });

    await storage1.writeManifest(m1);
    await storage1.writeSchema(s1);

    // storage2 should not see storage1's data
    const manifest2 = await storage2.readManifest();
    expect(manifest2).toBeNull();
  });
});
