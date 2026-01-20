/**
 * @evodb/lakehouse - Storage Adapter Tests
 *
 * Tests for memory storage adapter and table storage operations.
 */

import { describe, it, expect } from 'vitest';
import {
  createTable,
  createManifestFile,
  createFileStats,
  appendFiles,
  evolveSchema,
  createMemoryAdapter,
  createMemoryTableStorage,
  atomicCommit,
} from '../index.js';

describe('Memory Storage Adapter', () => {
  describe('createMemoryAdapter', () => {
    it('should create in-memory storage adapter', async () => {
      const adapter = createMemoryAdapter();

      await adapter.writeJson('test/data.json', { key: 'value' });
      const data = await adapter.readJson<{ key: string }>('test/data.json');

      expect(data).toEqual({ key: 'value' });
    });

    it('should return null for non-existent files', async () => {
      const adapter = createMemoryAdapter();

      const data = await adapter.readJson('nonexistent.json');
      expect(data).toBeNull();
    });

    it('should list files with prefix', async () => {
      const adapter = createMemoryAdapter();

      await adapter.writeJson('data/file1.json', {});
      await adapter.writeJson('data/file2.json', {});
      await adapter.writeJson('other/file3.json', {});

      const files = await adapter.list('data/');
      expect(files).toHaveLength(2);
    });

    it('should delete files', async () => {
      const adapter = createMemoryAdapter();

      await adapter.writeJson('test.json', { value: 1 });
      expect(await adapter.exists('test.json')).toBe(true);

      await adapter.delete('test.json');
      expect(await adapter.exists('test.json')).toBe(false);
    });
  });

  describe('TableStorage', () => {
    it('should persist table manifest to storage', async () => {
      const storage = createMemoryTableStorage('com/example/users');

      const { manifest, schema } = createTable({
        location: 'com/example/users',
        schema: {
          columns: [{ name: 'id', type: 'uuid', nullable: false }],
        },
      });

      // Write manifest and schema
      await storage.writeManifest(manifest);
      await storage.writeSchema(schema);

      // Read back and verify
      const loadedManifest = await storage.readManifest();
      expect(loadedManifest?.tableId).toBe(manifest.tableId);

      const loadedSchema = await storage.readSchema(schema.schemaId);
      expect(loadedSchema?.columns).toHaveLength(1);
    });

    it('should persist snapshots', async () => {
      const storage = createMemoryTableStorage('test');

      const { manifest } = createTable({
        location: 'test',
        schema: {
          columns: [{ name: 'id', type: 'int64', nullable: false }],
        },
      });

      const file = createManifestFile('data/block.bin', 1024, [], createFileStats(100, {}));
      const { snapshot } = appendFiles(manifest, null, [file]);

      await storage.writeSnapshot(snapshot);
      const loaded = await storage.readSnapshot(snapshot.snapshotId);

      expect(loaded?.snapshotId).toBe(snapshot.snapshotId);
      expect(loaded?.manifestList).toHaveLength(1);
    });

    it('should list schemas and snapshots', async () => {
      const storage = createMemoryTableStorage('com/example/tables');

      const { manifest, schema: v1 } = createTable({
        location: 'com/example/tables',
        schema: {
          columns: [{ name: 'id', type: 'uuid', nullable: false }],
        },
      });

      const v2 = evolveSchema(v1, [
        { type: 'add_column', column: { name: 'name', type: 'string', nullable: true } },
      ]);

      await storage.writeSchema(v1);
      await storage.writeSchema(v2);

      const schemaIds = await storage.listSchemas();
      expect(schemaIds).toContain(1);
      expect(schemaIds).toContain(2);
    });

    it('should support atomic commit', async () => {
      // This is a RED phase test - atomic commit API may need refinement
      // The atomicCommit function should ensure consistency
      const storage = createMemoryTableStorage('com/example/atomic');

      const result = await atomicCommit(storage, async (currentManifest, s) => {
        const { manifest, schema } = createTable({
          location: 'com/example/atomic',
          schema: {
            columns: [{ name: 'value', type: 'int64', nullable: false }],
          },
        });

        return {
          manifest,
          schema,
          result: 'created',
        };
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result).toBe('created');
      }

      const loadedManifest = await storage.readManifest();
      expect(loadedManifest).not.toBeNull();
    });
  });
});
