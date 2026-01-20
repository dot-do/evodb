/**
 * @evodb/lakehouse - Manifest CRUD Operations Tests
 *
 * Tests for creating, reading, updating, and deleting table manifests.
 */

import { describe, it, expect } from 'vitest';
import {
  createTable,
  createManifestFile,
  createFileStats,
  appendFiles,
  serializeManifest,
  deserializeManifest,
  validateManifest,
  type TableManifest,
} from '../index.js';

describe('Manifest CRUD Operations', () => {
  describe('createTable', () => {
    it('should create a new table manifest with given location', () => {
      const { manifest, schema } = createTable({
        location: 'com/example/api/users',
        schema: {
          columns: [
            { name: 'id', type: 'uuid', nullable: false },
            { name: 'name', type: 'string', nullable: false },
            { name: 'email', type: 'string', nullable: true },
          ],
        },
      });

      expect(manifest.formatVersion).toBe(1);
      expect(manifest.location).toBe('com/example/api/users');
      expect(manifest.tableId).toBeDefined();
      expect(manifest.currentSchemaId).toBe(1);
      expect(manifest.schemas).toHaveLength(1);
      expect(manifest.currentSnapshotId).toBeNull();
      expect(manifest.snapshots).toHaveLength(0);
      expect(manifest.stats.totalRows).toBe(0);
      expect(schema.columns).toHaveLength(3);
    });

    it('should create table with partition specification', () => {
      const { manifest } = createTable({
        location: 'com/example/events',
        schema: {
          columns: [
            { name: 'timestamp', type: 'timestamp', nullable: false },
            { name: 'event_type', type: 'string', nullable: false },
          ],
        },
        partitionBy: [
          { sourceColumn: 'timestamp', transform: { type: 'day' }, name: 'day' },
          { sourceColumn: 'event_type', transform: { type: 'identity' }, name: 'event_type' },
        ],
      });

      expect(manifest.partitionSpec.fields).toHaveLength(2);
      expect(manifest.partitionSpec.fields[0].name).toBe('day');
      expect(manifest.partitionSpec.fields[1].name).toBe('event_type');
    });

    it('should create table with custom properties', () => {
      const { manifest } = createTable({
        location: 'com/example/data',
        schema: {
          columns: [{ name: 'value', type: 'int64', nullable: false }],
        },
        properties: {
          'retention.days': '30',
          'owner': 'data-team',
        },
      });

      expect(manifest.properties['retention.days']).toBe('30');
      expect(manifest.properties['owner']).toBe('data-team');
    });
  });

  describe('createManifestFile', () => {
    it('should create manifest file entry with stats', () => {
      const stats = createFileStats(1000, {
        id: { nullCount: 0, min: 1, max: 1000 },
        name: { nullCount: 50, distinctCount: 500 },
      });

      const file = createManifestFile(
        'data/year=2026/month=1/block-001.bin',
        65536,
        [
          { name: 'year', value: 2026 },
          { name: 'month', value: 1 },
        ],
        stats
      );

      expect(file.path).toBe('data/year=2026/month=1/block-001.bin');
      expect(file.length).toBe(65536);
      expect(file.format).toBe('columnar-json-lite');
      expect(file.partitions).toHaveLength(2);
      expect(file.stats.rowCount).toBe(1000);
      expect(file.stats.columnStats.id.min).toBe(1);
    });

    it('should support custom file format', () => {
      const file = createManifestFile(
        'data/file.parquet',
        1024,
        [],
        createFileStats(100, {}),
        { format: 'parquet' }
      );

      expect(file.format).toBe('parquet');
    });

    it('should support LSN range for CDC tracking', () => {
      const file = createManifestFile(
        'data/block.bin',
        2048,
        [],
        createFileStats(500, {}),
        {
          sourceDoId: 'do-123',
          lsnRange: { minLsn: '1000', maxLsn: '1500' },
        }
      );

      expect(file.sourceDoId).toBe('do-123');
      expect(file.lsnRange?.minLsn).toBe('1000');
      expect(file.lsnRange?.maxLsn).toBe('1500');
    });
  });

  describe('appendFiles', () => {
    it('should append files to empty table', () => {
      const { manifest } = createTable({
        location: 'com/example/users',
        schema: {
          columns: [{ name: 'id', type: 'int64', nullable: false }],
        },
      });

      const file = createManifestFile(
        'data/block-001.bin',
        1024,
        [],
        createFileStats(100, {})
      );

      const { manifest: updated, snapshot } = appendFiles(manifest, null, [file]);

      expect(updated.currentSnapshotId).toBeDefined();
      expect(updated.snapshots).toHaveLength(1);
      expect(updated.stats.totalFiles).toBe(1);
      expect(updated.stats.totalRows).toBe(100);
      expect(snapshot.manifestList).toHaveLength(1);
      expect(snapshot.summary.operation).toBe('append');
      expect(snapshot.summary.addedFiles).toBe(1);
    });

    it('should append files to existing snapshot', () => {
      const { manifest } = createTable({
        location: 'com/example/users',
        schema: {
          columns: [{ name: 'id', type: 'int64', nullable: false }],
        },
      });

      const file1 = createManifestFile('data/block-001.bin', 1024, [], createFileStats(100, {}));
      const { manifest: m1, snapshot: s1 } = appendFiles(manifest, null, [file1]);

      const file2 = createManifestFile('data/block-002.bin', 2048, [], createFileStats(200, {}));
      const { manifest: m2, snapshot: s2 } = appendFiles(m1, s1, [file2]);

      expect(m2.snapshots).toHaveLength(2);
      expect(m2.stats.totalFiles).toBe(2);
      expect(m2.stats.totalRows).toBe(300);
      expect(s2.manifestList).toHaveLength(2);
      expect(s2.parentSnapshotId).toBe(s1.snapshotId);
    });
  });

  describe('serializeManifest / deserializeManifest', () => {
    it('should serialize manifest to JSON', () => {
      const { manifest } = createTable({
        location: 'com/example/test',
        schema: {
          columns: [{ name: 'id', type: 'int64', nullable: false }],
        },
      });

      const json = serializeManifest(manifest);
      expect(typeof json).toBe('string');
      expect(json).toContain('"formatVersion":');
      expect(json).toContain('"location": "com/example/test"');
    });

    it('should deserialize manifest from JSON', () => {
      const { manifest: original } = createTable({
        location: 'com/example/test',
        schema: {
          columns: [{ name: 'id', type: 'int64', nullable: false }],
        },
      });

      const json = serializeManifest(original);
      const restored = deserializeManifest(json);

      expect(restored.tableId).toBe(original.tableId);
      expect(restored.location).toBe(original.location);
      expect(restored.formatVersion).toBe(1);
    });

    it('should reject unsupported format version', () => {
      const badJson = JSON.stringify({
        formatVersion: 99,
        tableId: 'test',
        location: 'test',
      });

      expect(() => deserializeManifest(badJson)).toThrow();
    });
  });

  describe('validateManifest', () => {
    it('should validate a correct manifest', () => {
      const { manifest } = createTable({
        location: 'com/example/test',
        schema: {
          columns: [{ name: 'id', type: 'int64', nullable: false }],
        },
      });

      const result = validateManifest(manifest);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing tableId', () => {
      const manifest = {
        formatVersion: 1,
        tableId: '',
        location: 'test',
        currentSchemaId: 1,
        schemas: [{ schemaId: 1, path: '_schema/v1.json' }],
        partitionSpec: { specId: 0, fields: [] },
        currentSnapshotId: null,
        snapshots: [],
        stats: { totalRows: 0, totalFiles: 0, totalSizeBytes: 0, lastSnapshotTimestamp: null },
        properties: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as TableManifest;

      const result = validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('tableId'))).toBe(true);
    });

    it('should detect invalid schema reference', () => {
      const manifest = {
        formatVersion: 1,
        tableId: 'test-id',
        location: 'test',
        currentSchemaId: 99, // Non-existent
        schemas: [{ schemaId: 1, path: '_schema/v1.json' }],
        partitionSpec: { specId: 0, fields: [] },
        currentSnapshotId: null,
        snapshots: [],
        stats: { totalRows: 0, totalFiles: 0, totalSizeBytes: 0, lastSnapshotTimestamp: null },
        properties: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as TableManifest;

      const result = validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('schema'))).toBe(true);
    });
  });
});
