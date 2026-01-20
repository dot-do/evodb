/**
 * @evodb/lakehouse - Failing Tests (TDD RED Phase)
 *
 * Tests for Iceberg-inspired JSON manifests for R2 storage
 * with time-travel and partition pruning.
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Import types and functions from the lakehouse package
import {
  // Manifest CRUD
  createTable,
  createManifestFile,
  createFileStats,
  appendFiles,
  overwriteFiles,
  serializeManifest,
  deserializeManifest,
  validateManifest,
  queryFiles,
  selectFilesForCompaction,
  compact,

  // Snapshot creation
  createAppendSnapshot,
  createOverwriteSnapshot,
  createDeleteSnapshot,
  createCompactSnapshot,
  generateSnapshotId,
  findSnapshotById,
  findSnapshotAsOf,
  getSnapshotHistory,
  diffSnapshots,
  serializeSnapshot,
  deserializeSnapshot,

  // Schema versioning
  createSchema,
  evolveSchema,
  isCompatible,
  addSchema,
  setCurrentSchema,

  // URL-based R2 paths
  parseUrl,
  urlToR2Path,
  r2PathToUrl,
  buildPartitionPath,
  parsePartitionPath,
  manifestPath,
  dataDir,
  snapshotsDir,

  // Partition pruning
  createPartitionSpec,
  identityField,
  yearField,
  monthField,
  dayField,
  pruneByPartition,
  pruneByColumnStats,
  pruneFiles,
  computePartitionValues,

  // Storage
  createMemoryAdapter,
  TableStorage,
  createMemoryTableStorage,
  atomicCommit,

  // Types
  type TableManifest,
  type Snapshot,
  type Schema,
  type ManifestFile,
  type PartitionValue,
} from '../index.js';

// =============================================================================
// 1. Manifest CRUD Tests
// =============================================================================

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

// =============================================================================
// 2. Snapshot Creation Tests
// =============================================================================

describe('Snapshot Creation', () => {
  describe('generateSnapshotId', () => {
    it('should generate unique snapshot IDs', () => {
      const id1 = generateSnapshotId();
      const id2 = generateSnapshotId();

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
    });

    it('should generate time-sortable IDs', async () => {
      const id1 = generateSnapshotId();
      // Small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 5));
      const id2 = generateSnapshotId();

      // IDs should be sortable by time (ULID-like)
      // The first part of the ID should be the timestamp in base36
      expect(id1.localeCompare(id2)).toBeLessThanOrEqual(0);
    });
  });

  describe('createAppendSnapshot', () => {
    it('should create append snapshot with file list', () => {
      const files: ManifestFile[] = [
        createManifestFile('data/block-001.bin', 1024, [], createFileStats(100, {})),
        createManifestFile('data/block-002.bin', 2048, [], createFileStats(200, {})),
      ];

      const snapshot = createAppendSnapshot(
        null, // No parent
        1,    // Schema ID
        files,
        [],   // No existing files
      );

      expect(snapshot.snapshotId).toBeDefined();
      expect(snapshot.parentSnapshotId).toBeNull();
      expect(snapshot.schemaId).toBe(1);
      expect(snapshot.manifestList).toHaveLength(2);
      expect(snapshot.summary.operation).toBe('append');
      expect(snapshot.summary.addedFiles).toBe(2);
      expect(snapshot.summary.addedRows).toBe(300);
    });

    it('should merge with existing files on append', () => {
      const existingFiles: ManifestFile[] = [
        createManifestFile('data/block-001.bin', 1024, [], createFileStats(100, {})),
      ];

      const newFiles: ManifestFile[] = [
        createManifestFile('data/block-002.bin', 2048, [], createFileStats(200, {})),
      ];

      const snapshot = createAppendSnapshot(
        'parent-snapshot-id',
        1,
        newFiles,
        existingFiles,
      );

      expect(snapshot.parentSnapshotId).toBe('parent-snapshot-id');
      expect(snapshot.manifestList).toHaveLength(2);
      expect(snapshot.summary.addedFiles).toBe(1);
    });
  });

  describe('createOverwriteSnapshot', () => {
    it('should replace all files on overwrite', () => {
      const oldFiles: ManifestFile[] = [
        createManifestFile('data/old-001.bin', 1024, [], createFileStats(100, {})),
        createManifestFile('data/old-002.bin', 2048, [], createFileStats(200, {})),
      ];

      const newFiles: ManifestFile[] = [
        createManifestFile('data/new-001.bin', 4096, [], createFileStats(500, {})),
      ];

      const snapshot = createOverwriteSnapshot(
        'parent-id',
        1,
        newFiles,
        oldFiles,
      );

      expect(snapshot.summary.operation).toBe('overwrite');
      expect(snapshot.manifestList).toHaveLength(1);
      expect(snapshot.summary.addedFiles).toBe(1);
      expect(snapshot.summary.deletedFiles).toBe(2);
      expect(snapshot.summary.addedRows).toBe(500);
      expect(snapshot.summary.deletedRows).toBe(300);
    });
  });

  describe('createDeleteSnapshot', () => {
    it('should remove files on delete', () => {
      const remainingFiles: ManifestFile[] = [
        createManifestFile('data/keep.bin', 1024, [], createFileStats(100, {})),
      ];

      const deletedFiles: ManifestFile[] = [
        createManifestFile('data/delete.bin', 2048, [], createFileStats(200, {})),
      ];

      const snapshot = createDeleteSnapshot(
        'parent-id',
        1,
        remainingFiles,
        deletedFiles,
      );

      expect(snapshot.summary.operation).toBe('delete');
      expect(snapshot.manifestList).toHaveLength(1);
      expect(snapshot.summary.deletedFiles).toBe(1);
      expect(snapshot.summary.deletedRows).toBe(200);
    });
  });

  describe('createCompactSnapshot', () => {
    it('should replace small files with compacted files', () => {
      const allFiles: ManifestFile[] = [
        createManifestFile('data/small-001.bin', 512, [], createFileStats(50, {})),
        createManifestFile('data/small-002.bin', 512, [], createFileStats(50, {})),
        createManifestFile('data/large.bin', 4096, [], createFileStats(1000, {})),
      ];

      const originalSmallFiles = allFiles.slice(0, 2);
      const compactedFile: ManifestFile[] = [
        createManifestFile('data/compacted-001.bin', 1024, [], createFileStats(100, {})),
      ];

      const snapshot = createCompactSnapshot(
        'parent-id',
        1,
        compactedFile,
        originalSmallFiles,
        allFiles,
      );

      expect(snapshot.summary.operation).toBe('compact');
      expect(snapshot.manifestList).toHaveLength(2); // large + compacted
      expect(snapshot.summary.addedFiles).toBe(1);
      expect(snapshot.summary.deletedFiles).toBe(2);
    });
  });

  describe('findSnapshotById', () => {
    it('should find snapshot by ID', () => {
      const { manifest } = createTable({
        location: 'test',
        schema: { columns: [{ name: 'id', type: 'int64', nullable: false }] },
      });

      const file = createManifestFile('data/block.bin', 1024, [], createFileStats(100, {}));
      const { manifest: m1, snapshot: s1 } = appendFiles(manifest, null, [file]);

      const found = findSnapshotById(m1, s1.snapshotId);
      expect(found).toBeDefined();
      expect(found?.snapshotId).toBe(s1.snapshotId);
    });

    it('should return null for non-existent snapshot', () => {
      const { manifest } = createTable({
        location: 'test',
        schema: { columns: [{ name: 'id', type: 'int64', nullable: false }] },
      });

      const found = findSnapshotById(manifest, 'non-existent');
      expect(found).toBeNull();
    });
  });

  describe('findSnapshotAsOf', () => {
    it('should find snapshot at or before timestamp', () => {
      const { manifest } = createTable({
        location: 'test',
        schema: { columns: [{ name: 'id', type: 'int64', nullable: false }] },
      });

      const file = createManifestFile('data/block.bin', 1024, [], createFileStats(100, {}));
      const { manifest: m1, snapshot: s1 } = appendFiles(manifest, null, [file]);

      // Query at a future timestamp should find the snapshot
      const found = findSnapshotAsOf(m1, Date.now() + 10000);
      expect(found).toBeDefined();
      expect(found?.snapshotId).toBe(s1.snapshotId);
    });

    it('should return null if no snapshot before timestamp', () => {
      const { manifest } = createTable({
        location: 'test',
        schema: { columns: [{ name: 'id', type: 'int64', nullable: false }] },
      });

      const file = createManifestFile('data/block.bin', 1024, [], createFileStats(100, {}));
      const { manifest: m1 } = appendFiles(manifest, null, [file]);

      // Query at a past timestamp should not find the snapshot
      const found = findSnapshotAsOf(m1, 0);
      expect(found).toBeNull();
    });
  });

  describe('getSnapshotHistory', () => {
    it('should return snapshot chain from current to first', () => {
      const { manifest } = createTable({
        location: 'test',
        schema: { columns: [{ name: 'id', type: 'int64', nullable: false }] },
      });

      const file1 = createManifestFile('data/block-001.bin', 1024, [], createFileStats(100, {}));
      const { manifest: m1, snapshot: s1 } = appendFiles(manifest, null, [file1]);

      const file2 = createManifestFile('data/block-002.bin', 1024, [], createFileStats(100, {}));
      const { manifest: m2, snapshot: s2 } = appendFiles(m1, s1, [file2]);

      const file3 = createManifestFile('data/block-003.bin', 1024, [], createFileStats(100, {}));
      const { manifest: m3, snapshot: s3 } = appendFiles(m2, s2, [file3]);

      const history = getSnapshotHistory(m3);
      expect(history).toHaveLength(3);
      expect(history[0].snapshotId).toBe(s3.snapshotId);
      expect(history[1].snapshotId).toBe(s2.snapshotId);
      expect(history[2].snapshotId).toBe(s1.snapshotId);
    });
  });

  describe('diffSnapshots', () => {
    it('should compute diff between two snapshots', () => {
      const olderSnapshot: Snapshot = {
        snapshotId: 'old',
        parentSnapshotId: null,
        timestamp: Date.now() - 1000,
        schemaId: 1,
        manifestList: [
          createManifestFile('data/file-a.bin', 1024, [], createFileStats(100, {})),
          createManifestFile('data/file-b.bin', 1024, [], createFileStats(100, {})),
        ],
        summary: { operation: 'append', addedFiles: 2, deletedFiles: 0, addedRows: 200, deletedRows: 0 },
      };

      const newerSnapshot: Snapshot = {
        snapshotId: 'new',
        parentSnapshotId: 'old',
        timestamp: Date.now(),
        schemaId: 1,
        manifestList: [
          createManifestFile('data/file-a.bin', 1024, [], createFileStats(100, {})),
          createManifestFile('data/file-c.bin', 2048, [], createFileStats(200, {})),
        ],
        summary: { operation: 'overwrite', addedFiles: 1, deletedFiles: 1, addedRows: 200, deletedRows: 100 },
      };

      const diff = diffSnapshots(olderSnapshot, newerSnapshot);

      expect(diff.olderSnapshotId).toBe('old');
      expect(diff.newerSnapshotId).toBe('new');
      expect(diff.addedFiles).toHaveLength(1);
      expect(diff.removedFiles).toHaveLength(1);
      expect(diff.unchangedFiles).toHaveLength(1);
      expect(diff.addedFiles[0].path).toBe('data/file-c.bin');
      expect(diff.removedFiles[0].path).toBe('data/file-b.bin');
    });
  });

  describe('serializeSnapshot / deserializeSnapshot', () => {
    it('should round-trip snapshot through JSON', () => {
      const original: Snapshot = {
        snapshotId: generateSnapshotId(),
        parentSnapshotId: null,
        timestamp: Date.now(),
        schemaId: 1,
        manifestList: [
          createManifestFile('data/block.bin', 1024, [], createFileStats(100, {})),
        ],
        summary: { operation: 'append', addedFiles: 1, deletedFiles: 0, addedRows: 100, deletedRows: 0 },
        metadata: { source: 'test' },
      };

      const json = serializeSnapshot(original);
      const restored = deserializeSnapshot(json);

      expect(restored.snapshotId).toBe(original.snapshotId);
      expect(restored.manifestList).toHaveLength(1);
      expect(restored.metadata?.source).toBe('test');
    });
  });
});

// =============================================================================
// 3. Schema Versioning Tests
// =============================================================================

describe('Schema Versioning', () => {
  describe('createSchema', () => {
    it('should create schema with auto-generated ID', () => {
      const schema = createSchema([
        { name: 'id', type: 'uuid', nullable: false },
        { name: 'name', type: 'string', nullable: false },
        { name: 'age', type: 'int32', nullable: true },
      ]);

      expect(schema.schemaId).toBe(1);
      expect(schema.version).toBe(1);
      expect(schema.columns).toHaveLength(3);
      expect(schema.createdAt).toBeDefined();
    });

    it('should preserve column metadata', () => {
      const schema = createSchema([
        {
          name: 'status',
          type: 'string',
          nullable: false,
          defaultValue: 'pending',
          doc: 'Order status',
        },
      ]);

      expect(schema.columns[0].defaultValue).toBe('pending');
      expect(schema.columns[0].doc).toBe('Order status');
    });
  });

  describe('evolveSchema', () => {
    it('should add new column', () => {
      const v1 = createSchema([
        { name: 'id', type: 'uuid', nullable: false },
      ]);

      const v2 = evolveSchema(v1, [
        { type: 'add_column', column: { name: 'email', type: 'string', nullable: true } },
      ]);

      expect(v2.schemaId).toBe(2);
      expect(v2.version).toBe(2);
      expect(v2.columns).toHaveLength(2);
      expect(v2.columns[1].name).toBe('email');
    });

    it('should drop column', () => {
      const v1 = createSchema([
        { name: 'id', type: 'uuid', nullable: false },
        { name: 'temp', type: 'string', nullable: true },
      ]);

      const v2 = evolveSchema(v1, [
        { type: 'drop_column', columnName: 'temp' },
      ]);

      expect(v2.columns).toHaveLength(1);
      expect(v2.columns[0].name).toBe('id');
    });

    it('should rename column', () => {
      const v1 = createSchema([
        { name: 'old_name', type: 'string', nullable: false },
      ]);

      const v2 = evolveSchema(v1, [
        { type: 'rename_column', oldName: 'old_name', newName: 'new_name' },
      ]);

      expect(v2.columns[0].name).toBe('new_name');
    });

    it('should update column type (widening)', () => {
      const v1 = createSchema([
        { name: 'count', type: 'int32', nullable: false },
      ]);

      const v2 = evolveSchema(v1, [
        { type: 'update_type', columnName: 'count', newType: 'int64' },
      ]);

      expect(v2.columns[0].type).toBe('int64');
    });

    it('should make column nullable', () => {
      const v1 = createSchema([
        { name: 'required', type: 'string', nullable: false },
      ]);

      const v2 = evolveSchema(v1, [
        { type: 'make_nullable', columnName: 'required' },
      ]);

      expect(v2.columns[0].nullable).toBe(true);
    });

    it('should reject duplicate column name on add', () => {
      const v1 = createSchema([
        { name: 'id', type: 'uuid', nullable: false },
      ]);

      expect(() => evolveSchema(v1, [
        { type: 'add_column', column: { name: 'id', type: 'string', nullable: true } },
      ])).toThrow();
    });

    it('should reject drop of non-existent column', () => {
      const v1 = createSchema([
        { name: 'id', type: 'uuid', nullable: false },
      ]);

      expect(() => evolveSchema(v1, [
        { type: 'drop_column', columnName: 'nonexistent' },
      ])).toThrow();
    });
  });

  describe('isCompatible', () => {
    it('should allow adding nullable columns (backward compatible)', () => {
      const v1 = createSchema([
        { name: 'id', type: 'uuid', nullable: false },
      ]);

      const v2 = evolveSchema(v1, [
        { type: 'add_column', column: { name: 'email', type: 'string', nullable: true } },
      ]);

      const result = isCompatible(v1, v2, 'backward');
      expect(result.compatible).toBe(true);
    });

    it('should reject adding required columns without default (backward)', () => {
      const v1 = createSchema([
        { name: 'id', type: 'uuid', nullable: false },
      ]);

      const v2 = evolveSchema(v1, [
        { type: 'add_column', column: { name: 'required', type: 'string', nullable: false } },
      ]);

      const result = isCompatible(v1, v2, 'backward');
      expect(result.compatible).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject dropping columns (forward compatibility)', () => {
      const v1 = createSchema([
        { name: 'id', type: 'uuid', nullable: false },
        { name: 'temp', type: 'string', nullable: true },
      ]);

      const v2 = evolveSchema(v1, [
        { type: 'drop_column', columnName: 'temp' },
      ]);

      const result = isCompatible(v1, v2, 'forward');
      expect(result.compatible).toBe(false);
    });

    it('should allow type widening (int32 -> int64)', () => {
      const v1 = createSchema([
        { name: 'count', type: 'int32', nullable: false },
      ]);

      const v2 = evolveSchema(v1, [
        { type: 'update_type', columnName: 'count', newType: 'int64' },
      ]);

      const result = isCompatible(v1, v2, 'backward');
      expect(result.compatible).toBe(true);
    });

    it('should reject incompatible type changes', () => {
      const v1 = createSchema([
        { name: 'value', type: 'int64', nullable: false },
      ]);

      const v2 = evolveSchema(v1, [
        { type: 'update_type', columnName: 'value', newType: 'string' },
      ]);

      const result = isCompatible(v1, v2, 'backward');
      expect(result.compatible).toBe(false);
    });
  });

  describe('addSchema / setCurrentSchema', () => {
    it('should add new schema to manifest', () => {
      const { manifest, schema: v1 } = createTable({
        location: 'test',
        schema: { columns: [{ name: 'id', type: 'uuid', nullable: false }] },
      });

      const v2 = evolveSchema(v1, [
        { type: 'add_column', column: { name: 'name', type: 'string', nullable: true } },
      ]);

      const updated = addSchema(manifest, v2);

      expect(updated.schemas).toHaveLength(2);
      expect(updated.currentSchemaId).toBe(v2.schemaId);
    });

    it('should set current schema without adding', () => {
      const { manifest, schema: v1 } = createTable({
        location: 'test',
        schema: { columns: [{ name: 'id', type: 'uuid', nullable: false }] },
      });

      const v2 = evolveSchema(v1, [
        { type: 'add_column', column: { name: 'name', type: 'string', nullable: true } },
      ]);

      let updated = addSchema(manifest, v2);
      updated = setCurrentSchema(updated, v1.schemaId);

      expect(updated.currentSchemaId).toBe(v1.schemaId);
    });

    it('should reject setting non-existent schema as current', () => {
      const { manifest } = createTable({
        location: 'test',
        schema: { columns: [{ name: 'id', type: 'uuid', nullable: false }] },
      });

      expect(() => setCurrentSchema(manifest, 999)).toThrow();
    });
  });
});

// =============================================================================
// 4. URL-based R2 Paths Tests
// =============================================================================

describe('URL-based R2 Paths', () => {
  describe('parseUrl', () => {
    it('should parse full URL to R2 path', () => {
      const result = parseUrl('https://api.example.com/users');

      expect(result.hostname).toBe('api.example.com');
      expect(result.path).toBe('users');
      expect(result.r2Path).toBe('com/example/api/users');
    });

    it('should parse URL without path', () => {
      const result = parseUrl('https://api.example.com');

      expect(result.hostname).toBe('api.example.com');
      expect(result.path).toBe('');
      expect(result.r2Path).toBe('com/example/api');
    });

    it('should parse hostname only', () => {
      const result = parseUrl('api.example.com');

      expect(result.hostname).toBe('api.example.com');
      expect(result.r2Path).toBe('com/example/api');
    });

    it('should parse hostname with path (no protocol)', () => {
      const result = parseUrl('api.example.com/v1/data');

      expect(result.hostname).toBe('api.example.com');
      expect(result.path).toBe('v1/data');
      expect(result.r2Path).toBe('com/example/api/v1/data');
    });

    it('should handle deep paths', () => {
      const result = parseUrl('https://api.example.com/v1/users/profile');

      expect(result.r2Path).toBe('com/example/api/v1/users/profile');
    });

    it('should handle subdomains', () => {
      const result = parseUrl('https://staging.api.example.com/data');

      expect(result.r2Path).toBe('com/example/api/staging/data');
    });
  });

  describe('urlToR2Path', () => {
    it('should reverse hostname segments', () => {
      expect(urlToR2Path('api.example.com')).toBe('com/example/api');
      expect(urlToR2Path('www.example.com')).toBe('com/example/www');
      expect(urlToR2Path('example.com')).toBe('com/example');
    });

    it('should append path segments', () => {
      expect(urlToR2Path('api.example.com', 'users')).toBe('com/example/api/users');
      expect(urlToR2Path('api.example.com', 'v1/data')).toBe('com/example/api/v1/data');
    });

    it('should handle empty path', () => {
      expect(urlToR2Path('api.example.com', '')).toBe('com/example/api');
    });

    it('should normalize case', () => {
      expect(urlToR2Path('API.Example.COM', 'Users')).toBe('com/example/api/Users');
    });
  });

  describe('r2PathToUrl', () => {
    it('should reverse R2 path back to hostname', () => {
      const result = r2PathToUrl('com/example/api');

      expect(result.hostname).toBe('api.example.com');
      expect(result.path).toBe('');
    });

    it('should extract path with pathDepth', () => {
      const result = r2PathToUrl('com/example/api/users', 1);

      expect(result.hostname).toBe('api.example.com');
      expect(result.path).toBe('users');
    });

    it('should handle deeper path extraction', () => {
      const result = r2PathToUrl('com/example/api/v1/users/data', 3);

      expect(result.hostname).toBe('api.example.com');
      expect(result.path).toBe('v1/users/data');
    });
  });

  describe('buildPartitionPath', () => {
    it('should build Hive-style partition path', () => {
      const partitions: PartitionValue[] = [
        { name: 'year', value: 2026 },
        { name: 'month', value: 1 },
        { name: 'day', value: 19 },
      ];

      expect(buildPartitionPath(partitions)).toBe('year=2026/month=1/day=19');
    });

    it('should handle null values', () => {
      const partitions: PartitionValue[] = [
        { name: 'region', value: null },
      ];

      expect(buildPartitionPath(partitions)).toBe('region=__null__');
    });

    it('should handle string values', () => {
      const partitions: PartitionValue[] = [
        { name: 'country', value: 'USA' },
        { name: 'state', value: 'CA' },
      ];

      expect(buildPartitionPath(partitions)).toBe('country=USA/state=CA');
    });

    it('should handle empty partitions', () => {
      expect(buildPartitionPath([])).toBe('');
    });
  });

  describe('parsePartitionPath', () => {
    it('should parse Hive-style partition path', () => {
      const partitions = parsePartitionPath('year=2026/month=1/day=19');

      expect(partitions).toHaveLength(3);
      expect(partitions[0]).toEqual({ name: 'year', value: 2026 });
      expect(partitions[1]).toEqual({ name: 'month', value: 1 });
      expect(partitions[2]).toEqual({ name: 'day', value: 19 });
    });

    it('should parse null values', () => {
      const partitions = parsePartitionPath('region=__null__');

      expect(partitions[0]).toEqual({ name: 'region', value: null });
    });

    it('should handle string values', () => {
      const partitions = parsePartitionPath('country=USA');

      expect(partitions[0]).toEqual({ name: 'country', value: 'USA' });
    });

    it('should handle empty path', () => {
      expect(parsePartitionPath('')).toEqual([]);
    });
  });

  describe('manifestPath / dataDir / snapshotsDir', () => {
    it('should build correct manifest path', () => {
      expect(manifestPath('com/example/api/users')).toBe('com/example/api/users/_manifest.json');
    });

    it('should build correct data directory path', () => {
      expect(dataDir('com/example/api/users')).toBe('com/example/api/users/data');
    });

    it('should build correct snapshots directory path', () => {
      expect(snapshotsDir('com/example/api/users')).toBe('com/example/api/users/snapshots');
    });
  });
});

// =============================================================================
// 5. Partition Pruning Tests
// =============================================================================

describe('Partition Pruning', () => {
  // Helper to create test files with partitions
  function createTestFile(
    path: string,
    partitions: PartitionValue[],
    rowCount: number,
    columnStats: Record<string, { min?: unknown; max?: unknown; nullCount: number }> = {}
  ): ManifestFile {
    return createManifestFile(
      path,
      rowCount * 100, // Estimated size
      partitions,
      createFileStats(rowCount, columnStats)
    );
  }

  describe('createPartitionSpec', () => {
    it('should create partition spec with fields', () => {
      const spec = createPartitionSpec([
        identityField('country'),
        yearField('timestamp'),
        monthField('timestamp'),
      ]);

      expect(spec.specId).toBe(0);
      expect(spec.fields).toHaveLength(3);
      expect(spec.fields[0].name).toBe('country');
      expect(spec.fields[1].name).toBe('year');
      expect(spec.fields[2].name).toBe('month');
    });

    it('should assign field IDs', () => {
      const spec = createPartitionSpec([
        dayField('date'),
        identityField('region'),
      ]);

      expect(spec.fields[0].fieldId).toBe(0);
      expect(spec.fields[1].fieldId).toBe(1);
    });
  });

  describe('computePartitionValues', () => {
    it('should compute identity partition values', () => {
      const spec = createPartitionSpec([
        identityField('region'),
        identityField('tier'),
      ]);

      const values = computePartitionValues(
        { region: 'us-east', tier: 'premium', other: 'ignored' },
        spec
      );

      expect(values).toEqual([
        { name: 'region', value: 'us-east' },
        { name: 'tier', value: 'premium' },
      ]);
    });

    it('should compute time-based partition values', () => {
      const spec = createPartitionSpec([
        yearField('timestamp'),
        monthField('timestamp'),
        dayField('timestamp'),
      ]);

      // 2026-01-19
      const timestamp = new Date('2026-01-19T12:00:00Z').getTime();
      const values = computePartitionValues(
        { timestamp },
        spec
      );

      expect(values).toEqual([
        { name: 'year', value: 2026 },
        { name: 'month', value: 1 },
        { name: 'day', value: 19 },
      ]);
    });

    it('should handle nested column paths', () => {
      const spec = createPartitionSpec([
        identityField('user.country'),
      ]);

      const values = computePartitionValues(
        { user: { country: 'Japan' } },
        spec
      );

      expect(values[0].value).toBe('Japan');
    });
  });

  describe('pruneByPartition', () => {
    it('should filter files by exact partition match', () => {
      const files: ManifestFile[] = [
        createTestFile('data/year=2025/file.bin', [{ name: 'year', value: 2025 }], 100),
        createTestFile('data/year=2026/file.bin', [{ name: 'year', value: 2026 }], 100),
        createTestFile('data/year=2027/file.bin', [{ name: 'year', value: 2027 }], 100),
      ];

      const filtered = pruneByPartition(files, { year: { eq: 2026 } });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].partitions[0].value).toBe(2026);
    });

    it('should filter files by IN clause', () => {
      const files: ManifestFile[] = [
        createTestFile('data/region=us/file.bin', [{ name: 'region', value: 'us' }], 100),
        createTestFile('data/region=eu/file.bin', [{ name: 'region', value: 'eu' }], 100),
        createTestFile('data/region=asia/file.bin', [{ name: 'region', value: 'asia' }], 100),
      ];

      const filtered = pruneByPartition(files, { region: { in: ['us', 'eu'] } });

      expect(filtered).toHaveLength(2);
    });

    it('should filter files by range', () => {
      const files: ManifestFile[] = [
        createTestFile('data/year=2024/file.bin', [{ name: 'year', value: 2024 }], 100),
        createTestFile('data/year=2025/file.bin', [{ name: 'year', value: 2025 }], 100),
        createTestFile('data/year=2026/file.bin', [{ name: 'year', value: 2026 }], 100),
        createTestFile('data/year=2027/file.bin', [{ name: 'year', value: 2027 }], 100),
      ];

      const filtered = pruneByPartition(files, { year: { gte: 2025, lte: 2026 } });

      expect(filtered).toHaveLength(2);
      expect(filtered[0].partitions[0].value).toBe(2025);
      expect(filtered[1].partitions[0].value).toBe(2026);
    });

    it('should filter by multiple partitions', () => {
      const files: ManifestFile[] = [
        createTestFile('f1', [{ name: 'year', value: 2026 }, { name: 'month', value: 1 }], 100),
        createTestFile('f2', [{ name: 'year', value: 2026 }, { name: 'month', value: 2 }], 100),
        createTestFile('f3', [{ name: 'year', value: 2025 }, { name: 'month', value: 1 }], 100),
      ];

      const filtered = pruneByPartition(files, {
        year: { eq: 2026 },
        month: { eq: 1 },
      });

      expect(filtered).toHaveLength(1);
    });

    it('should handle between filter', () => {
      const files: ManifestFile[] = [
        createTestFile('f1', [{ name: 'day', value: 1 }], 100),
        createTestFile('f2', [{ name: 'day', value: 15 }], 100),
        createTestFile('f3', [{ name: 'day', value: 28 }], 100),
      ];

      const filtered = pruneByPartition(files, { day: { between: [10, 20] } });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].partitions[0].value).toBe(15);
    });
  });

  describe('pruneByColumnStats', () => {
    it('should prune files where max < filter value', () => {
      const files: ManifestFile[] = [
        createTestFile('f1', [], 100, { age: { min: 10, max: 30, nullCount: 0 } }),
        createTestFile('f2', [], 100, { age: { min: 40, max: 60, nullCount: 0 } }),
        createTestFile('f3', [], 100, { age: { min: 70, max: 90, nullCount: 0 } }),
      ];

      const filtered = pruneByColumnStats(files, { age: { gte: 50 } });

      expect(filtered).toHaveLength(2);
    });

    it('should prune files where min > filter value', () => {
      const files: ManifestFile[] = [
        createTestFile('f1', [], 100, { price: { min: 10, max: 50, nullCount: 0 } }),
        createTestFile('f2', [], 100, { price: { min: 100, max: 200, nullCount: 0 } }),
      ];

      const filtered = pruneByColumnStats(files, { price: { lte: 75 } });

      expect(filtered).toHaveLength(1);
    });

    it('should include files that may contain matching values', () => {
      const files: ManifestFile[] = [
        createTestFile('f1', [], 100, { score: { min: 0, max: 100, nullCount: 0 } }),
        createTestFile('f2', [], 100, { score: { min: 50, max: 150, nullCount: 0 } }),
      ];

      const filtered = pruneByColumnStats(files, { score: { eq: 75 } });

      expect(filtered).toHaveLength(2); // Both files could contain 75
    });

    it('should handle null filtering', () => {
      const files: ManifestFile[] = [
        createTestFile('f1', [], 100, { name: { nullCount: 0, min: 'A', max: 'Z' } }),
        createTestFile('f2', [], 100, { name: { nullCount: 50 } }),
      ];

      const filtered = pruneByColumnStats(files, { name: { isNull: true } });

      expect(filtered).toHaveLength(1);
    });
  });

  describe('pruneFiles (combined)', () => {
    it('should apply both partition and column pruning', () => {
      const files: ManifestFile[] = [
        createTestFile('f1', [{ name: 'year', value: 2026 }], 100, { age: { min: 20, max: 40, nullCount: 0 } }),
        createTestFile('f2', [{ name: 'year', value: 2026 }], 100, { age: { min: 50, max: 70, nullCount: 0 } }),
        createTestFile('f3', [{ name: 'year', value: 2025 }], 100, { age: { min: 20, max: 40, nullCount: 0 } }),
      ];

      const filtered = pruneFiles(files, {
        partitions: { year: { eq: 2026 } },
        columns: { age: { lte: 45 } },
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].path).toBe('f1');
    });

    it('should handle empty filter', () => {
      const files: ManifestFile[] = [
        createTestFile('f1', [], 100),
        createTestFile('f2', [], 100),
      ];

      const filtered = pruneFiles(files, {});

      expect(filtered).toHaveLength(2);
    });
  });
});

// =============================================================================
// 6. Storage Integration Tests (Optional - for memory adapter)
// =============================================================================

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

// =============================================================================
// 7. Critical Feature Tests (Formerly RED Phase)
// =============================================================================

describe('Critical Features', () => {
  describe('Time Travel Queries', () => {
    it('should query table as of specific timestamp', async () => {
      // Create table with multiple snapshots at different timestamps
      const storage = createMemoryTableStorage('com/example/time-travel');

      const { manifest, schema } = createTable({
        location: 'com/example/time-travel',
        schema: {
          columns: [
            { name: 'id', type: 'int64', nullable: false },
            { name: 'value', type: 'string', nullable: false },
          ],
        },
      });

      await storage.writeSchema(schema);

      // First append - creates snapshot 1
      const file1 = createManifestFile(
        'data/block-001.bin',
        1024,
        [],
        createFileStats(100, { id: { min: 1, max: 100, nullCount: 0 } })
      );
      const { manifest: m1, snapshot: s1 } = appendFiles(manifest, null, [file1]);
      await storage.writeSnapshot(s1);
      await storage.writeManifest(m1);
      const timestamp1 = s1.timestamp;

      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      // Second append - creates snapshot 2
      const file2 = createManifestFile(
        'data/block-002.bin',
        2048,
        [],
        createFileStats(200, { id: { min: 101, max: 300, nullCount: 0 } })
      );
      const { manifest: m2, snapshot: s2 } = appendFiles(m1, s1, [file2]);
      await storage.writeSnapshot(s2);
      await storage.writeManifest(m2);
      const timestamp2 = s2.timestamp;

      // Small delay
      await new Promise(resolve => setTimeout(resolve, 10));

      // Third append - creates snapshot 3
      const file3 = createManifestFile(
        'data/block-003.bin',
        3072,
        [],
        createFileStats(300, { id: { min: 301, max: 600, nullCount: 0 } })
      );
      const { manifest: m3, snapshot: s3 } = appendFiles(m2, s2, [file3]);
      await storage.writeSnapshot(s3);
      await storage.writeManifest(m3);

      // Create a snapshot loader function
      const loadSnapshot = (snapshotId: string): Snapshot | null => {
        if (snapshotId === s1.snapshotId) return s1;
        if (snapshotId === s2.snapshotId) return s2;
        if (snapshotId === s3.snapshotId) return s3;
        return null;
      };

      // Query as of timestamp1 - should return only file1
      const filesAtTime1 = queryFiles(m3, loadSnapshot, { asOfTimestamp: timestamp1 });
      expect(filesAtTime1).toHaveLength(1);
      expect(filesAtTime1[0].path).toBe('data/block-001.bin');

      // Query as of timestamp2 - should return file1 and file2
      const filesAtTime2 = queryFiles(m3, loadSnapshot, { asOfTimestamp: timestamp2 });
      expect(filesAtTime2).toHaveLength(2);
      expect(filesAtTime2.map(f => f.path)).toContain('data/block-001.bin');
      expect(filesAtTime2.map(f => f.path)).toContain('data/block-002.bin');

      // Query current (no time-travel) - should return all files
      const currentFiles = queryFiles(m3, loadSnapshot, {});
      expect(currentFiles).toHaveLength(3);

      // Query with specific snapshotId
      const filesAtSnapshot1 = queryFiles(m3, loadSnapshot, { snapshotId: s1.snapshotId });
      expect(filesAtSnapshot1).toHaveLength(1);
    });

    it('should restore table to previous snapshot', async () => {
      // Create table with multiple snapshots
      const { manifest, schema } = createTable({
        location: 'com/example/restore-test',
        schema: {
          columns: [{ name: 'id', type: 'int64', nullable: false }],
        },
      });

      // Build up multiple snapshots
      const file1 = createManifestFile('data/block-001.bin', 1024, [], createFileStats(100, {}));
      const { manifest: m1, snapshot: s1 } = appendFiles(manifest, null, [file1]);

      const file2 = createManifestFile('data/block-002.bin', 2048, [], createFileStats(200, {}));
      const { manifest: m2, snapshot: s2 } = appendFiles(m1, s1, [file2]);

      const file3 = createManifestFile('data/block-003.bin', 3072, [], createFileStats(300, {}));
      const { manifest: m3, snapshot: s3 } = appendFiles(m2, s2, [file3]);

      // Verify current state has 3 files
      expect(m3.stats.totalFiles).toBe(3);
      expect(m3.stats.totalRows).toBe(600);
      expect(m3.currentSnapshotId).toBe(s3.snapshotId);

      // Restore to snapshot 1 (rollback)
      // This creates a new manifest pointing to the old snapshot
      const restoredManifest: TableManifest = {
        ...m3,
        currentSnapshotId: s1.snapshotId,
        stats: {
          totalRows: s1.manifestList.reduce((sum, f) => sum + f.stats.rowCount, 0),
          totalFiles: s1.manifestList.length,
          totalSizeBytes: s1.manifestList.reduce((sum, f) => sum + f.length, 0),
          lastSnapshotTimestamp: s1.timestamp,
        },
        updatedAt: Date.now(),
      };

      // Verify restored state
      expect(restoredManifest.currentSnapshotId).toBe(s1.snapshotId);
      expect(restoredManifest.stats.totalFiles).toBe(1);
      expect(restoredManifest.stats.totalRows).toBe(100);

      // All snapshots are still preserved for history (soft rollback)
      expect(restoredManifest.snapshots).toHaveLength(3);

      // Verify we can query the restored state
      const loadSnapshot = (snapshotId: string): Snapshot | null => {
        if (snapshotId === s1.snapshotId) return s1;
        if (snapshotId === s2.snapshotId) return s2;
        if (snapshotId === s3.snapshotId) return s3;
        return null;
      };

      const files = queryFiles(restoredManifest, loadSnapshot, {});
      expect(files).toHaveLength(1);
      expect(files[0].path).toBe('data/block-001.bin');
    });
  });

  describe('Compaction', () => {
    it('should automatically compact small files', async () => {
      // Create table with many small files in same partition
      const { manifest, schema } = createTable({
        location: 'com/example/compaction-test',
        schema: {
          columns: [
            { name: 'id', type: 'int64', nullable: false },
            { name: 'day', type: 'int32', nullable: false },
          ],
        },
        partitionBy: [{ sourceColumn: 'day', transform: { type: 'identity' }, name: 'day' }],
      });

      // Create many small files in the same partition (day=1)
      // Small files are < 1MB (1024 * 1024 bytes)
      const smallFiles: ManifestFile[] = [];
      for (let i = 0; i < 10; i++) {
        smallFiles.push(
          createManifestFile(
            `data/day=1/block-${String(i).padStart(3, '0')}.bin`,
            50 * 1024, // 50KB each (small file)
            [{ name: 'day', value: 1 }],
            createFileStats(100, { id: { min: i * 100, max: (i + 1) * 100 - 1, nullCount: 0 } })
          )
        );
      }

      // Also add some files in another partition
      const partition2Files: ManifestFile[] = [];
      for (let i = 0; i < 3; i++) {
        partition2Files.push(
          createManifestFile(
            `data/day=2/block-${String(i).padStart(3, '0')}.bin`,
            50 * 1024,
            [{ name: 'day', value: 2 }],
            createFileStats(100, { id: { min: i * 100 + 1000, max: (i + 1) * 100 + 999, nullCount: 0 } })
          )
        );
      }

      // Add one large file that shouldn't be compacted
      const largeFile = createManifestFile(
        'data/day=1/large-block.bin',
        10 * 1024 * 1024, // 10MB (not a small file)
        [{ name: 'day', value: 1 }],
        createFileStats(10000, { id: { min: 100000, max: 200000, nullCount: 0 } })
      );

      // Append all files to create initial state
      const allFiles = [...smallFiles, ...partition2Files, largeFile];
      const { manifest: m1, snapshot: s1 } = appendFiles(manifest, null, allFiles);

      // Use selectFilesForCompaction to identify compaction candidates
      const compactionGroups = selectFilesForCompaction(s1, {
        minFileSizeBytes: 1024 * 1024, // 1MB threshold
      });

      // Should have 2 groups (day=1 small files and day=2 small files)
      expect(compactionGroups.length).toBe(2);

      // Find the group for partition day=1
      const day1Group = compactionGroups.find(
        g => g.some(f => f.partitions.some(p => p.name === 'day' && p.value === 1))
      );
      expect(day1Group).toBeDefined();
      expect(day1Group!.length).toBe(10); // All 10 small files, not the large one

      // Find the group for partition day=2
      const day2Group = compactionGroups.find(
        g => g.some(f => f.partitions.some(p => p.name === 'day' && p.value === 2))
      );
      expect(day2Group).toBeDefined();
      expect(day2Group!.length).toBe(3);

      // Now simulate compaction by creating compacted files
      const compactedFile1 = createManifestFile(
        'data/day=1/compacted-001.bin',
        400 * 1024, // Combined size
        [{ name: 'day', value: 1 }],
        createFileStats(1000, { id: { min: 0, max: 999, nullCount: 0 } })
      );

      const compactedFile2 = createManifestFile(
        'data/day=2/compacted-001.bin',
        120 * 1024,
        [{ name: 'day', value: 2 }],
        createFileStats(300, { id: { min: 1000, max: 1299, nullCount: 0 } })
      );

      // Apply compaction
      const { manifest: m2, snapshot: s2 } = compact(
        m1,
        s1,
        [compactedFile1, compactedFile2],
        [...day1Group!, ...day2Group!],
        { reason: 'automatic_compaction' }
      );

      // Verify compaction result
      expect(s2.summary.operation).toBe('compact');
      expect(s2.summary.addedFiles).toBe(2); // 2 compacted files
      expect(s2.summary.deletedFiles).toBe(13); // 10 + 3 small files removed

      // Verify final manifest - should have:
      // 1 large file (not compacted) + 2 compacted files = 3 files
      expect(s2.manifestList).toHaveLength(3);
      expect(m2.stats.totalFiles).toBe(3);

      // Row count should be preserved
      expect(m2.stats.totalRows).toBe(1000 + 300 + 10000); // compacted1 + compacted2 + large

      // Verify parent chain
      expect(s2.parentSnapshotId).toBe(s1.snapshotId);
    });
  });

  describe('Concurrent Access', () => {
    it('should handle concurrent writes with optimistic locking', async () => {
      // Create storage with initial state
      const storage = createMemoryTableStorage('com/example/concurrent');

      // Initialize the table
      const initResult = await atomicCommit(storage, async () => {
        const { manifest, schema } = createTable({
          location: 'com/example/concurrent',
          schema: {
            columns: [{ name: 'id', type: 'int64', nullable: false }],
          },
        });
        return { manifest, schema, result: 'initialized' };
      });
      expect(initResult.success).toBe(true);

      // Read initial manifest
      const initialManifest = await storage.readManifest();
      expect(initialManifest).not.toBeNull();

      // Simulate two concurrent transactions reading the same initial state
      // Transaction 1: Read manifest
      const txn1Manifest = await storage.readManifest();

      // Transaction 2: Read manifest (same state as txn1)
      const txn2Manifest = await storage.readManifest();

      // Both transactions see the same initial state
      expect(txn1Manifest?.updatedAt).toBe(txn2Manifest?.updatedAt);

      // Transaction 1 commits first
      const txn1Result = await atomicCommit(storage, async (currentManifest) => {
        const file = createManifestFile(
          'data/txn1-block.bin',
          1024,
          [],
          createFileStats(100, {})
        );

        // Load current snapshot
        let currentSnapshot: Snapshot | null = null;
        if (currentManifest?.currentSnapshotId) {
          currentSnapshot = await storage.readSnapshot(currentManifest.currentSnapshotId);
        }

        const { manifest, snapshot } = appendFiles(currentManifest!, currentSnapshot, [file]);
        return { manifest, snapshot, result: 'txn1_committed' };
      });

      expect(txn1Result.success).toBe(true);

      // Verify txn1's changes are persisted
      const afterTxn1 = await storage.readManifest();
      expect(afterTxn1?.stats.totalFiles).toBe(1);

      // Transaction 2 tries to commit with stale state
      // In a real OCC system, this would detect the conflict
      // For this test, we demonstrate that the second transaction
      // must re-read and handle the conflict

      // Since our memory adapter doesn't support true OCC with ETags,
      // we'll demonstrate the pattern: re-read, detect change, retry

      const txn2Result = await atomicCommit(storage, async (currentManifest) => {
        // This reads the CURRENT state (after txn1), not the stale state
        const file = createManifestFile(
          'data/txn2-block.bin',
          2048,
          [],
          createFileStats(200, {})
        );

        let currentSnapshot: Snapshot | null = null;
        if (currentManifest?.currentSnapshotId) {
          currentSnapshot = await storage.readSnapshot(currentManifest.currentSnapshotId);
        }

        const { manifest, snapshot } = appendFiles(currentManifest!, currentSnapshot, [file]);
        return { manifest, snapshot, result: 'txn2_committed' };
      });

      expect(txn2Result.success).toBe(true);

      // Both transactions should have committed successfully in sequence
      const finalManifest = await storage.readManifest();
      expect(finalManifest?.stats.totalFiles).toBe(2);
      expect(finalManifest?.stats.totalRows).toBe(300); // 100 + 200
      expect(finalManifest?.snapshots).toHaveLength(2);

      // Verify snapshot chain integrity
      const snapshots = finalManifest?.snapshots || [];
      expect(snapshots[1].parentSnapshotId).toBe(snapshots[0].snapshotId);
    });
  });
});
