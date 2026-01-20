/**
 * @evodb/lakehouse - Error Handling Tests
 *
 * Comprehensive tests for error handling including:
 * - Manifest validation failures
 * - Schema validation errors
 * - Path utility edge cases
 * - Snapshot operations edge cases
 * - Compaction edge cases
 */

import { describe, it, expect } from 'vitest';

import {
  // Manifest operations
  createTable,
  appendFiles,
  overwriteFiles,
  createManifestFile,
  createFileStats,
  validateManifest,
  deserializeManifest,
  serializeManifest,
  setCurrentSchema,
  queryFiles,
  getSnapshot,
  setProperty,
  removeProperty,
  setProperties,
  recomputeStats,
  selectFilesForCompaction,
  generateCompactionPlan,
  analyzeCompaction,
  ManifestError,

  // Snapshot operations
  generateSnapshotId,
  findSnapshotById,
  findSnapshotAsOf,
  getSnapshotHistory,
  getAncestorIds,
  isAncestorOf,
  getExpiredSnapshots,
  getOrphanedFiles,
  getSnapshotRowCount,
  getSnapshotSizeBytes,

  // Snapshot cache and traverser
  SnapshotCache,
  createSnapshotCache,
  SnapshotChainTraverser,
  createSnapshotTraverser,

  // Path utilities
  parseUrl,
  urlToR2Path,
  r2PathToUrl,
  manifestPath,
  schemaDir,
  schemaFilePath,
  dataDir,
  snapshotsDir,
  snapshotFilePath,
  fullDataFilePath,
  joinPath,
  parentPath,
  basename,
  isChildOf,
  relativePath,
  buildPartitionPath,
  parsePartitionPath,
  timePartitionValues,
  generateBlockFilename,

  // Types
  type TableManifest,
  type Snapshot,
  type SnapshotRef,
  type ManifestFile,
} from '../index.js';

// =============================================================================
// Manifest Validation Tests
// =============================================================================

describe('Manifest Validation', () => {
  it('should reject manifest with invalid format version', () => {
    const manifest = {
      formatVersion: 2 as const,
      tableId: 'test-id',
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
    } as unknown as TableManifest;

    const result = validateManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('format'))).toBe(true);
  });

  it('should reject manifest with missing location', () => {
    const manifest = {
      formatVersion: 1,
      tableId: 'test-id',
      location: '',
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
    expect(result.errors.some(e => e.includes('location'))).toBe(true);
  });

  it('should reject manifest with no schemas', () => {
    const manifest = {
      formatVersion: 1,
      tableId: 'test-id',
      location: 'test',
      currentSchemaId: 1,
      schemas: [],
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

  it('should reject manifest with invalid current snapshot', () => {
    const manifest = {
      formatVersion: 1,
      tableId: 'test-id',
      location: 'test',
      currentSchemaId: 1,
      schemas: [{ schemaId: 1, path: '_schema/v1.json' }],
      partitionSpec: { specId: 0, fields: [] },
      currentSnapshotId: 'nonexistent-snapshot',
      snapshots: [{ snapshotId: 'other-snapshot', timestamp: Date.now(), parentSnapshotId: null }],
      stats: { totalRows: 0, totalFiles: 0, totalSizeBytes: 0, lastSnapshotTimestamp: null },
      properties: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as TableManifest;

    const result = validateManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('snapshot'))).toBe(true);
  });

  it('should pass validation for valid manifest', () => {
    const { manifest } = createTable({
      location: 'test',
      schema: { columns: [{ name: 'id', type: 'int64', nullable: false }] },
    });

    const result = validateManifest(manifest);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// =============================================================================
// Manifest Deserialization Tests
// =============================================================================

describe('deserializeManifest', () => {
  it('should throw on unsupported format version', () => {
    const json = JSON.stringify({
      formatVersion: 99,
      tableId: 'test',
      location: 'test',
    });

    expect(() => deserializeManifest(json)).toThrow(ManifestError);
  });

  it('should throw on invalid JSON', () => {
    expect(() => deserializeManifest('not valid json')).toThrow();
  });
});

// =============================================================================
// ManifestError Tests
// =============================================================================

describe('ManifestError', () => {
  it('should have correct name property', () => {
    const error = new ManifestError('Test error');
    expect(error.name).toBe('ManifestError');
  });

  it('should preserve error message', () => {
    const error = new ManifestError('Schema not found');
    expect(error.message).toBe('Schema not found');
  });

  it('should be instanceof Error', () => {
    const error = new ManifestError('Test');
    expect(error instanceof Error).toBe(true);
    expect(error instanceof ManifestError).toBe(true);
  });
});

// =============================================================================
// setCurrentSchema Tests
// =============================================================================

describe('setCurrentSchema', () => {
  it('should throw on non-existent schema', () => {
    const { manifest } = createTable({
      location: 'test',
      schema: { columns: [{ name: 'id', type: 'int64', nullable: false }] },
    });

    expect(() => setCurrentSchema(manifest, 999)).toThrow(ManifestError);
  });

  it('should update current schema', () => {
    const { manifest } = createTable({
      location: 'test',
      schema: { columns: [{ name: 'id', type: 'int64', nullable: false }] },
    });

    // Add another schema reference
    const manifestWithSchema = {
      ...manifest,
      schemas: [...manifest.schemas, { schemaId: 2, path: '_schema/v2.json' }],
    };

    const updated = setCurrentSchema(manifestWithSchema, 2);
    expect(updated.currentSchemaId).toBe(2);
  });
});

// =============================================================================
// queryFiles Tests
// =============================================================================

describe('queryFiles', () => {
  it('should return empty array for empty table', () => {
    const { manifest } = createTable({
      location: 'test',
      schema: { columns: [{ name: 'id', type: 'int64', nullable: false }] },
    });

    const loadSnapshot = () => null;
    const files = queryFiles(manifest, loadSnapshot, {});

    expect(files).toHaveLength(0);
  });

  it('should throw on non-existent snapshot', () => {
    const { manifest } = createTable({
      location: 'test',
      schema: { columns: [{ name: 'id', type: 'int64', nullable: false }] },
    });

    const file = createManifestFile('data/block.bin', 1024, [], createFileStats(100, {}));
    const { manifest: m1 } = appendFiles(manifest, null, [file]);

    // Loader returns null for all snapshots
    const loadSnapshot = () => null;

    expect(() => queryFiles(m1, loadSnapshot, {})).toThrow(ManifestError);
  });

  it('should query by snapshot ID', () => {
    const { manifest } = createTable({
      location: 'test',
      schema: { columns: [{ name: 'id', type: 'int64', nullable: false }] },
    });

    const file = createManifestFile('data/block.bin', 1024, [], createFileStats(100, {}));
    const { manifest: m1, snapshot: s1 } = appendFiles(manifest, null, [file]);

    const loadSnapshot = (id: string) => (id === s1.snapshotId ? s1 : null);
    const files = queryFiles(m1, loadSnapshot, { snapshotId: s1.snapshotId });

    expect(files).toHaveLength(1);
  });
});

// =============================================================================
// getSnapshot Tests
// =============================================================================

describe('getSnapshot', () => {
  it('should return null for empty table', () => {
    const { manifest } = createTable({
      location: 'test',
      schema: { columns: [{ name: 'id', type: 'int64', nullable: false }] },
    });

    const loadSnapshot = () => null;
    const snapshot = getSnapshot(manifest, loadSnapshot);

    expect(snapshot).toBeNull();
  });

  it('should load snapshot by ID', () => {
    const { manifest } = createTable({
      location: 'test',
      schema: { columns: [{ name: 'id', type: 'int64', nullable: false }] },
    });

    const file = createManifestFile('data/block.bin', 1024, [], createFileStats(100, {}));
    const { manifest: m1, snapshot: s1 } = appendFiles(manifest, null, [file]);

    const loadSnapshot = (id: string) => (id === s1.snapshotId ? s1 : null);
    const snapshot = getSnapshot(m1, loadSnapshot, s1.snapshotId);

    expect(snapshot?.snapshotId).toBe(s1.snapshotId);
  });

  it('should load snapshot by timestamp', () => {
    const { manifest } = createTable({
      location: 'test',
      schema: { columns: [{ name: 'id', type: 'int64', nullable: false }] },
    });

    const file = createManifestFile('data/block.bin', 1024, [], createFileStats(100, {}));
    const { manifest: m1, snapshot: s1 } = appendFiles(manifest, null, [file]);

    const loadSnapshot = (id: string) => (id === s1.snapshotId ? s1 : null);
    const snapshot = getSnapshot(m1, loadSnapshot, Date.now() + 10000);

    expect(snapshot?.snapshotId).toBe(s1.snapshotId);
  });

  it('should return null for timestamp before any snapshot', () => {
    const { manifest } = createTable({
      location: 'test',
      schema: { columns: [{ name: 'id', type: 'int64', nullable: false }] },
    });

    const file = createManifestFile('data/block.bin', 1024, [], createFileStats(100, {}));
    const { manifest: m1, snapshot: s1 } = appendFiles(manifest, null, [file]);

    const loadSnapshot = (id: string) => (id === s1.snapshotId ? s1 : null);
    const snapshot = getSnapshot(m1, loadSnapshot, 0);

    expect(snapshot).toBeNull();
  });
});

// =============================================================================
// Property Operations Tests
// =============================================================================

describe('Property Operations', () => {
  it('should set property', () => {
    const { manifest } = createTable({
      location: 'test',
      schema: { columns: [{ name: 'id', type: 'int64', nullable: false }] },
    });

    const updated = setProperty(manifest, 'retention.days', '30');

    expect(updated.properties['retention.days']).toBe('30');
    expect(updated.updatedAt).toBeGreaterThan(manifest.updatedAt - 1);
  });

  it('should remove property', () => {
    const { manifest } = createTable({
      location: 'test',
      schema: { columns: [{ name: 'id', type: 'int64', nullable: false }] },
      properties: { 'key1': 'value1', 'key2': 'value2' },
    });

    const updated = removeProperty(manifest, 'key1');

    expect('key1' in updated.properties).toBe(false);
    expect(updated.properties['key2']).toBe('value2');
  });

  it('should set multiple properties', () => {
    const { manifest } = createTable({
      location: 'test',
      schema: { columns: [{ name: 'id', type: 'int64', nullable: false }] },
    });

    const updated = setProperties(manifest, {
      'owner': 'data-team',
      'env': 'production',
    });

    expect(updated.properties['owner']).toBe('data-team');
    expect(updated.properties['env']).toBe('production');
  });
});

// =============================================================================
// recomputeStats Tests
// =============================================================================

describe('recomputeStats', () => {
  it('should reset stats for null snapshot', () => {
    const { manifest } = createTable({
      location: 'test',
      schema: { columns: [{ name: 'id', type: 'int64', nullable: false }] },
    });

    // Modify stats artificially
    manifest.stats.totalRows = 1000;
    manifest.stats.totalFiles = 10;

    const updated = recomputeStats(manifest, null);

    expect(updated.stats.totalRows).toBe(0);
    expect(updated.stats.totalFiles).toBe(0);
    expect(updated.stats.totalSizeBytes).toBe(0);
    expect(updated.stats.lastSnapshotTimestamp).toBeNull();
  });

  it('should compute stats from snapshot', () => {
    const { manifest } = createTable({
      location: 'test',
      schema: { columns: [{ name: 'id', type: 'int64', nullable: false }] },
    });

    const file1 = createManifestFile('data/block1.bin', 1024, [], createFileStats(100, {}));
    const file2 = createManifestFile('data/block2.bin', 2048, [], createFileStats(200, {}));
    const { snapshot } = appendFiles(manifest, null, [file1, file2]);

    const updated = recomputeStats(manifest, snapshot);

    expect(updated.stats.totalRows).toBe(300);
    expect(updated.stats.totalFiles).toBe(2);
    expect(updated.stats.totalSizeBytes).toBe(3072);
    expect(updated.stats.lastSnapshotTimestamp).toBe(snapshot.timestamp);
  });
});

// =============================================================================
// Path Utility Edge Cases
// =============================================================================

describe('Path Utilities Edge Cases', () => {
  describe('parseUrl', () => {
    it('should handle URL with port', () => {
      const result = parseUrl('https://api.example.com:8080/users');

      expect(result.hostname).toBe('api.example.com');
      expect(result.path).toBe('users');
    });

    it('should handle URL with query string', () => {
      const result = parseUrl('https://api.example.com/users?page=1');

      expect(result.hostname).toBe('api.example.com');
      // Query is part of the path (gets stripped by URL parsing)
    });

    it('should handle single segment hostname', () => {
      const result = parseUrl('localhost');

      expect(result.hostname).toBe('localhost');
      expect(result.r2Path).toBe('localhost');
    });

    it('should handle invalid URL gracefully', () => {
      // This tests the fallback for malformed input
      const result = parseUrl('://invalid');

      expect(result.hostname).toBe('://invalid');
    });
  });

  describe('urlToR2Path', () => {
    it('should handle empty hostname', () => {
      const result = urlToR2Path('', 'path');
      expect(result).toBe('path');
    });

    it('should handle path with leading slash', () => {
      const result = urlToR2Path('example.com', '/users/profile');
      expect(result).toBe('com/example/users/profile');
    });
  });

  describe('r2PathToUrl', () => {
    it('should handle single segment', () => {
      const result = r2PathToUrl('localhost');

      expect(result.hostname).toBe('localhost');
      expect(result.path).toBe('');
    });

    it('should handle pathDepth larger than segments', () => {
      const result = r2PathToUrl('com/example', 5);

      // When pathDepth > segments, hostname gets empty parts
      expect(result.path).toBe('com/example');
    });
  });

  describe('joinPath', () => {
    it('should handle empty segments', () => {
      const result = joinPath('a', '', 'b', '', 'c');
      expect(result).toBe('a/b/c');
    });

    it('should handle segments with slashes', () => {
      const result = joinPath('/start/', '/middle/', '/end/');
      expect(result).toBe('/start/middle/end/');
    });

    it('should handle single segment', () => {
      const result = joinPath('single');
      expect(result).toBe('single');
    });
  });

  describe('parentPath', () => {
    it('should return null for root path', () => {
      expect(parentPath('/')).toBeNull();
    });

    it('should return null for single segment', () => {
      expect(parentPath('file.txt')).toBeNull();
    });

    it('should handle trailing slashes', () => {
      expect(parentPath('a/b/c/')).toBe('a/b');
    });
  });

  describe('basename', () => {
    it('should handle path with trailing slash', () => {
      expect(basename('a/b/c/')).toBe('c');
    });

    it('should handle single segment', () => {
      expect(basename('file.txt')).toBe('file.txt');
    });
  });

  describe('isChildOf', () => {
    it('should return false for same path', () => {
      expect(isChildOf('a/b/c', 'a/b/c')).toBe(false);
    });

    it('should handle case-insensitive comparison', () => {
      expect(isChildOf('A/B/C/D', 'a/b/c')).toBe(true);
    });

    it('should require full segment match', () => {
      expect(isChildOf('a/bc/d', 'a/b')).toBe(false);
    });
  });

  describe('relativePath', () => {
    it('should return null for non-child path', () => {
      expect(relativePath('a/b', 'c/d/e')).toBeNull();
    });

    it('should return relative portion', () => {
      const result = relativePath('a/b', 'a/b/c/d');
      expect(result).toBe('/c/d');
    });
  });

  describe('parsePartitionPath', () => {
    it('should handle encoded values', () => {
      const path = 'key%3Dwithequals=value%2Fwithslash';
      const result = parsePartitionPath(path);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('key=withequals');
      expect(result[0].value).toBe('value/withslash');
    });

    it('should handle segments without equals', () => {
      const result = parsePartitionPath('year=2026/invalid-segment/month=1');

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('year');
      expect(result[1].name).toBe('month');
    });
  });

  describe('timePartitionValues', () => {
    it('should handle year granularity', () => {
      const ts = new Date('2026-06-15T10:30:00Z').getTime();
      const values = timePartitionValues(ts, 'year');

      expect(values).toHaveLength(1);
      expect(values[0]).toEqual({ name: 'year', value: 2026 });
    });

    it('should handle month granularity', () => {
      const ts = new Date('2026-06-15T10:30:00Z').getTime();
      const values = timePartitionValues(ts, 'month');

      expect(values).toHaveLength(2);
      expect(values[1]).toEqual({ name: 'month', value: 6 });
    });

    it('should handle hour granularity', () => {
      const ts = new Date('2026-06-15T10:30:00Z').getTime();
      const values = timePartitionValues(ts, 'hour');

      expect(values).toHaveLength(4);
      expect(values[3]).toEqual({ name: 'hour', value: 10 });
    });
  });

  describe('generateBlockFilename', () => {
    it('should generate unique filenames', () => {
      const names = new Set<string>();
      for (let i = 0; i < 100; i++) {
        names.add(generateBlockFilename());
      }
      expect(names.size).toBe(100);
    });

    it('should include prefix when provided', () => {
      const name = generateBlockFilename('myprefix');
      expect(name.startsWith('myprefix-')).toBe(true);
    });

    it('should use custom extension', () => {
      const name = generateBlockFilename('', 'parquet');
      expect(name.endsWith('.parquet')).toBe(true);
    });
  });

  describe('path construction functions', () => {
    const location = 'com/example/table';

    it('manifestPath should construct correct path', () => {
      expect(manifestPath(location)).toBe('com/example/table/_manifest.json');
    });

    it('schemaDir should construct correct path', () => {
      expect(schemaDir(location)).toBe('com/example/table/_schema');
    });

    it('schemaFilePath should construct correct path', () => {
      expect(schemaFilePath(location, 3)).toBe('com/example/table/_schema/v3.json');
    });

    it('dataDir should construct correct path', () => {
      expect(dataDir(location)).toBe('com/example/table/data');
    });

    it('snapshotsDir should construct correct path', () => {
      expect(snapshotsDir(location)).toBe('com/example/table/snapshots');
    });

    it('snapshotFilePath should construct correct path', () => {
      expect(snapshotFilePath(location, 'snap-123')).toBe('com/example/table/snapshots/snap-123.json');
    });

    it('fullDataFilePath should construct correct path', () => {
      const partitions = [{ name: 'year', value: 2026 }];
      expect(fullDataFilePath(location, partitions, 'block.bin')).toBe(
        'com/example/table/data/year=2026/block.bin'
      );
    });
  });
});

// =============================================================================
// Snapshot Operations Edge Cases
// =============================================================================

describe('Snapshot Operations Edge Cases', () => {
  describe('generateSnapshotId', () => {
    it('should generate sortable IDs', async () => {
      const id1 = generateSnapshotId();
      await new Promise(resolve => setTimeout(resolve, 5));
      const id2 = generateSnapshotId();

      // Lexicographical ordering should match time ordering
      expect(id1.localeCompare(id2)).toBeLessThan(0);
    });
  });

  describe('getSnapshotRowCount', () => {
    it('should sum row counts from all files', () => {
      const snapshot: Snapshot = {
        snapshotId: 'test',
        parentSnapshotId: null,
        timestamp: Date.now(),
        schemaId: 1,
        manifestList: [
          createManifestFile('f1', 1024, [], createFileStats(100, {})),
          createManifestFile('f2', 2048, [], createFileStats(250, {})),
        ],
        summary: { operation: 'append', addedFiles: 2, deletedFiles: 0, addedRows: 350, deletedRows: 0 },
      };

      expect(getSnapshotRowCount(snapshot)).toBe(350);
    });
  });

  describe('getSnapshotSizeBytes', () => {
    it('should sum file sizes from all files', () => {
      const snapshot: Snapshot = {
        snapshotId: 'test',
        parentSnapshotId: null,
        timestamp: Date.now(),
        schemaId: 1,
        manifestList: [
          createManifestFile('f1', 1024, [], createFileStats(100, {})),
          createManifestFile('f2', 2048, [], createFileStats(100, {})),
        ],
        summary: { operation: 'append', addedFiles: 2, deletedFiles: 0, addedRows: 200, deletedRows: 0 },
      };

      expect(getSnapshotSizeBytes(snapshot)).toBe(3072);
    });
  });

  describe('getAncestorIds', () => {
    it('should return empty for snapshot without parent', () => {
      const { manifest } = createTable({
        location: 'test',
        schema: { columns: [{ name: 'id', type: 'int64', nullable: false }] },
      });

      const file = createManifestFile('f1', 1024, [], createFileStats(100, {}));
      const { manifest: m1, snapshot: s1 } = appendFiles(manifest, null, [file]);

      const ancestors = getAncestorIds(m1, s1.snapshotId);
      expect(ancestors).toHaveLength(0);
    });

    it('should return ancestor chain', () => {
      const { manifest } = createTable({
        location: 'test',
        schema: { columns: [{ name: 'id', type: 'int64', nullable: false }] },
      });

      const file1 = createManifestFile('f1', 1024, [], createFileStats(100, {}));
      const { manifest: m1, snapshot: s1 } = appendFiles(manifest, null, [file1]);

      const file2 = createManifestFile('f2', 1024, [], createFileStats(100, {}));
      const { manifest: m2, snapshot: s2 } = appendFiles(m1, s1, [file2]);

      const file3 = createManifestFile('f3', 1024, [], createFileStats(100, {}));
      const { manifest: m3, snapshot: s3 } = appendFiles(m2, s2, [file3]);

      const ancestors = getAncestorIds(m3, s3.snapshotId);
      expect(ancestors).toHaveLength(2);
      expect(ancestors[0]).toBe(s2.snapshotId);
      expect(ancestors[1]).toBe(s1.snapshotId);
    });
  });

  describe('isAncestorOf', () => {
    it('should detect ancestor relationship', () => {
      const { manifest } = createTable({
        location: 'test',
        schema: { columns: [{ name: 'id', type: 'int64', nullable: false }] },
      });

      const file1 = createManifestFile('f1', 1024, [], createFileStats(100, {}));
      const { manifest: m1, snapshot: s1 } = appendFiles(manifest, null, [file1]);

      const file2 = createManifestFile('f2', 1024, [], createFileStats(100, {}));
      const { manifest: m2, snapshot: s2 } = appendFiles(m1, s1, [file2]);

      expect(isAncestorOf(m2, s1.snapshotId, s2.snapshotId)).toBe(true);
      expect(isAncestorOf(m2, s2.snapshotId, s1.snapshotId)).toBe(false);
    });
  });

  describe('getExpiredSnapshots', () => {
    it('should always retain current snapshot', () => {
      const { manifest } = createTable({
        location: 'test',
        schema: { columns: [{ name: 'id', type: 'int64', nullable: false }] },
      });

      const file = createManifestFile('f1', 1024, [], createFileStats(100, {}));
      const { manifest: m1 } = appendFiles(manifest, null, [file]);

      const expired = getExpiredSnapshots(m1, { olderThan: Date.now() + 10000, retainLast: 0 });

      // Current snapshot should be retained even with retainLast: 0
      expect(expired).toHaveLength(0);
    });

    it('should retain specified snapshot IDs', () => {
      const { manifest } = createTable({
        location: 'test',
        schema: { columns: [{ name: 'id', type: 'int64', nullable: false }] },
      });

      const file1 = createManifestFile('f1', 1024, [], createFileStats(100, {}));
      const { manifest: m1, snapshot: s1 } = appendFiles(manifest, null, [file1]);

      const file2 = createManifestFile('f2', 1024, [], createFileStats(100, {}));
      const { manifest: m2, snapshot: s2 } = appendFiles(m1, s1, [file2]);

      const expired = getExpiredSnapshots(m2, {
        olderThan: Date.now() + 10000,
        retainLast: 0,
        retainIds: [s1.snapshotId],
      });

      expect(expired).toHaveLength(0);
    });

    it('should retain last N snapshots', () => {
      const { manifest } = createTable({
        location: 'test',
        schema: { columns: [{ name: 'id', type: 'int64', nullable: false }] },
      });

      const file1 = createManifestFile('f1', 1024, [], createFileStats(100, {}));
      const { manifest: m1, snapshot: s1 } = appendFiles(manifest, null, [file1]);

      const file2 = createManifestFile('f2', 1024, [], createFileStats(100, {}));
      const { manifest: m2, snapshot: s2 } = appendFiles(m1, s1, [file2]);

      const file3 = createManifestFile('f3', 1024, [], createFileStats(100, {}));
      const { manifest: m3, snapshot: s3 } = appendFiles(m2, s2, [file3]);

      // Manually adjust timestamps to make them distinct for testing
      // This simulates snapshots created at different times
      const adjustedManifest = {
        ...m3,
        snapshots: [
          { ...m3.snapshots[0], timestamp: 1000 }, // s1 - oldest
          { ...m3.snapshots[1], timestamp: 2000 }, // s2 - middle
          { ...m3.snapshots[2], timestamp: 3000 }, // s3 - newest
        ],
      };

      const expired = getExpiredSnapshots(adjustedManifest, {
        olderThan: Date.now() + 10000,
        retainLast: 2,
      });

      // s3 is current (retained), s3 and s2 are last 2 (retained)
      // s1 should be expired
      expect(expired).toHaveLength(1);
      expect(expired[0].snapshotId).toBe(s1.snapshotId);
    });
  });

  describe('getOrphanedFiles', () => {
    it('should find files only in expired snapshots', () => {
      const file1 = createManifestFile('f1', 1024, [], createFileStats(100, {}));
      const file2 = createManifestFile('f2', 1024, [], createFileStats(100, {}));
      const file3 = createManifestFile('f3', 1024, [], createFileStats(100, {}));

      const snapshot1: Snapshot = {
        snapshotId: 's1',
        parentSnapshotId: null,
        timestamp: Date.now(),
        schemaId: 1,
        manifestList: [file1, file2],
        summary: { operation: 'append', addedFiles: 2, deletedFiles: 0, addedRows: 200, deletedRows: 0 },
      };

      const snapshot2: Snapshot = {
        snapshotId: 's2',
        parentSnapshotId: 's1',
        timestamp: Date.now(),
        schemaId: 1,
        manifestList: [file2, file3], // file1 is dropped, file3 is added
        summary: { operation: 'overwrite', addedFiles: 1, deletedFiles: 1, addedRows: 100, deletedRows: 100 },
      };

      const orphaned = getOrphanedFiles([snapshot1, snapshot2], new Set(['s1']));

      expect(orphaned).toHaveLength(1);
      expect(orphaned[0].path).toBe('f1');
    });
  });
});

// =============================================================================
// SnapshotCache Tests
// =============================================================================

describe('SnapshotCache', () => {
  it('should cache and retrieve snapshots', () => {
    const cache = createSnapshotCache();
    const snapshot: Snapshot = {
      snapshotId: 'test',
      parentSnapshotId: null,
      timestamp: Date.now(),
      schemaId: 1,
      manifestList: [],
      summary: { operation: 'append', addedFiles: 0, deletedFiles: 0, addedRows: 0, deletedRows: 0 },
    };

    cache.put(snapshot);
    const retrieved = cache.get('test');

    expect(retrieved?.snapshotId).toBe('test');
  });

  it('should return null for non-cached snapshot', () => {
    const cache = createSnapshotCache();
    expect(cache.get('nonexistent')).toBeNull();
  });

  it('should evict oldest entries when full', () => {
    const cache = createSnapshotCache({ maxSize: 2 });

    for (let i = 1; i <= 3; i++) {
      cache.put({
        snapshotId: `s${i}`,
        parentSnapshotId: null,
        timestamp: Date.now(),
        schemaId: 1,
        manifestList: [],
        summary: { operation: 'append', addedFiles: 0, deletedFiles: 0, addedRows: 0, deletedRows: 0 },
      });
    }

    const stats = cache.stats();
    expect(stats.size).toBe(2);
  });

  it('should invalidate snapshot', () => {
    const cache = createSnapshotCache();
    cache.put({
      snapshotId: 'test',
      parentSnapshotId: null,
      timestamp: Date.now(),
      schemaId: 1,
      manifestList: [],
      summary: { operation: 'append', addedFiles: 0, deletedFiles: 0, addedRows: 0, deletedRows: 0 },
    });

    cache.invalidate('test');

    expect(cache.get('test')).toBeNull();
  });

  it('should clear all entries', () => {
    const cache = createSnapshotCache();

    for (let i = 1; i <= 5; i++) {
      cache.put({
        snapshotId: `s${i}`,
        parentSnapshotId: null,
        timestamp: Date.now(),
        schemaId: 1,
        manifestList: [],
        summary: { operation: 'append', addedFiles: 0, deletedFiles: 0, addedRows: 0, deletedRows: 0 },
      });
    }

    cache.clear();

    expect(cache.stats().size).toBe(0);
  });

  it('should preload snapshots', () => {
    const cache = createSnapshotCache({ maxSize: 5 });
    const snapshots: Snapshot[] = [];

    for (let i = 1; i <= 3; i++) {
      snapshots.push({
        snapshotId: `s${i}`,
        parentSnapshotId: null,
        timestamp: Date.now(),
        schemaId: 1,
        manifestList: [],
        summary: { operation: 'append', addedFiles: 0, deletedFiles: 0, addedRows: 0, deletedRows: 0 },
      });
    }

    cache.preload(snapshots);

    expect(cache.stats().size).toBe(3);
  });
});

// =============================================================================
// SnapshotChainTraverser Tests
// =============================================================================

describe('SnapshotChainTraverser', () => {
  const createTestSnapshots = (): SnapshotRef[] => [
    { snapshotId: 's1', timestamp: 1000, parentSnapshotId: null },
    { snapshotId: 's2', timestamp: 2000, parentSnapshotId: 's1' },
    { snapshotId: 's3', timestamp: 3000, parentSnapshotId: 's2' },
    { snapshotId: 's4', timestamp: 4000, parentSnapshotId: 's2' }, // Branch
  ];

  it('should get ancestors', () => {
    const traverser = createSnapshotTraverser(createTestSnapshots());
    const ancestors = traverser.getAncestors('s3');

    expect(ancestors).toHaveLength(2);
    expect(ancestors[0].snapshotId).toBe('s2');
    expect(ancestors[1].snapshotId).toBe('s1');
  });

  it('should get ancestors with limit', () => {
    const traverser = createSnapshotTraverser(createTestSnapshots());
    const ancestors = traverser.getAncestors('s3', 1);

    expect(ancestors).toHaveLength(1);
    expect(ancestors[0].snapshotId).toBe('s2');
  });

  it('should get descendants', () => {
    const traverser = createSnapshotTraverser(createTestSnapshots());
    const descendants = traverser.getDescendants('s1');

    expect(descendants).toHaveLength(3);
  });

  it('should find common ancestor', () => {
    const traverser = createSnapshotTraverser(createTestSnapshots());
    const common = traverser.findCommonAncestor('s3', 's4');

    expect(common?.snapshotId).toBe('s2');
  });

  it('should return null when no common ancestor', () => {
    const snapshots: SnapshotRef[] = [
      { snapshotId: 's1', timestamp: 1000, parentSnapshotId: null },
      { snapshotId: 's2', timestamp: 2000, parentSnapshotId: null }, // No relation
    ];

    const traverser = createSnapshotTraverser(snapshots);
    const common = traverser.findCommonAncestor('s1', 's2');

    expect(common).toBeNull();
  });

  it('should get snapshot depth', () => {
    const traverser = createSnapshotTraverser(createTestSnapshots());

    expect(traverser.getDepth('s1')).toBe(0);
    expect(traverser.getDepth('s2')).toBe(1);
    expect(traverser.getDepth('s3')).toBe(2);
  });

  it('should get root snapshots', () => {
    const traverser = createSnapshotTraverser(createTestSnapshots());
    const roots = traverser.getRoots();

    expect(roots).toHaveLength(1);
    expect(roots[0].snapshotId).toBe('s1');
  });

  it('should get snapshot by ID', () => {
    const traverser = createSnapshotTraverser(createTestSnapshots());

    expect(traverser.getSnapshot('s2')?.snapshotId).toBe('s2');
    expect(traverser.getSnapshot('nonexistent')).toBeNull();
  });

  it('should get path between snapshots', () => {
    const traverser = createSnapshotTraverser(createTestSnapshots());
    const path = traverser.getPath('s3', 's4');

    expect(path.length).toBeGreaterThan(0);
    expect(path.some(s => s.snapshotId === 's2')).toBe(true); // Common ancestor
  });
});

// =============================================================================
// Compaction Edge Cases
// =============================================================================

describe('Compaction Edge Cases', () => {
  describe('selectFilesForCompaction', () => {
    it('should skip files larger than threshold', () => {
      const { manifest } = createTable({
        location: 'test',
        schema: { columns: [{ name: 'id', type: 'int64', nullable: false }] },
      });

      // Mix of small and large files
      const files: ManifestFile[] = [
        createManifestFile('f1', 500 * 1024, [{ name: 'year', value: 2026 }], createFileStats(100, {})),
        createManifestFile('f2', 500 * 1024, [{ name: 'year', value: 2026 }], createFileStats(100, {})),
        createManifestFile('f3', 10 * 1024 * 1024, [{ name: 'year', value: 2026 }], createFileStats(1000, {})),
      ];

      const { snapshot } = appendFiles(manifest, null, files);
      const groups = selectFilesForCompaction(snapshot, { minFileSizeBytes: 1024 * 1024 });

      expect(groups).toHaveLength(1);
      expect(groups[0]).toHaveLength(2); // Only small files
    });

    it('should group by partition', () => {
      const { manifest } = createTable({
        location: 'test',
        schema: { columns: [{ name: 'id', type: 'int64', nullable: false }] },
      });

      const files: ManifestFile[] = [
        createManifestFile('f1', 500 * 1024, [{ name: 'year', value: 2025 }], createFileStats(100, {})),
        createManifestFile('f2', 500 * 1024, [{ name: 'year', value: 2025 }], createFileStats(100, {})),
        createManifestFile('f3', 500 * 1024, [{ name: 'year', value: 2026 }], createFileStats(100, {})),
        createManifestFile('f4', 500 * 1024, [{ name: 'year', value: 2026 }], createFileStats(100, {})),
      ];

      const { snapshot } = appendFiles(manifest, null, files);
      const groups = selectFilesForCompaction(snapshot, { minFileSizeBytes: 1024 * 1024 });

      expect(groups).toHaveLength(2);
    });

    it('should apply partition filter', () => {
      const { manifest } = createTable({
        location: 'test',
        schema: { columns: [{ name: 'id', type: 'int64', nullable: false }] },
      });

      const files: ManifestFile[] = [
        createManifestFile('f1', 500 * 1024, [{ name: 'year', value: 2025 }], createFileStats(100, {})),
        createManifestFile('f2', 500 * 1024, [{ name: 'year', value: 2025 }], createFileStats(100, {})),
        createManifestFile('f3', 500 * 1024, [{ name: 'year', value: 2026 }], createFileStats(100, {})),
        createManifestFile('f4', 500 * 1024, [{ name: 'year', value: 2026 }], createFileStats(100, {})),
      ];

      const { snapshot } = appendFiles(manifest, null, files);
      const groups = selectFilesForCompaction(snapshot, {
        minFileSizeBytes: 1024 * 1024,
        partitionFilter: { year: { eq: 2026 } },
      });

      expect(groups).toHaveLength(1);
      expect(groups[0].every(f => f.partitions[0].value === 2026)).toBe(true);
    });

    it('should require minimum 2 files per group', () => {
      const { manifest } = createTable({
        location: 'test',
        schema: { columns: [{ name: 'id', type: 'int64', nullable: false }] },
      });

      const files: ManifestFile[] = [
        createManifestFile('f1', 500 * 1024, [{ name: 'year', value: 2025 }], createFileStats(100, {})),
        // Only one small file in each partition
        createManifestFile('f2', 500 * 1024, [{ name: 'year', value: 2026 }], createFileStats(100, {})),
      ];

      const { snapshot } = appendFiles(manifest, null, files);
      const groups = selectFilesForCompaction(snapshot, { minFileSizeBytes: 1024 * 1024 });

      expect(groups).toHaveLength(0);
    });
  });

  describe('generateCompactionPlan', () => {
    it('should handle empty file set', () => {
      const snapshot: Snapshot = {
        snapshotId: 'test',
        parentSnapshotId: null,
        timestamp: Date.now(),
        schemaId: 1,
        manifestList: [],
        summary: { operation: 'append', addedFiles: 0, deletedFiles: 0, addedRows: 0, deletedRows: 0 },
      };

      const plan = generateCompactionPlan(snapshot);

      expect(plan.groups).toHaveLength(0);
      expect(plan.totalFilesToCompact).toBe(0);
    });

    it('should respect maxFilesPerGroup', () => {
      const files: ManifestFile[] = Array.from({ length: 10 }, (_, i) =>
        createManifestFile(`f${i}`, 100 * 1024, [{ name: 'year', value: 2026 }], createFileStats(100, {}))
      );

      const snapshot: Snapshot = {
        snapshotId: 'test',
        parentSnapshotId: null,
        timestamp: Date.now(),
        schemaId: 1,
        manifestList: files,
        summary: { operation: 'append', addedFiles: 10, deletedFiles: 0, addedRows: 1000, deletedRows: 0 },
      };

      const plan = generateCompactionPlan(snapshot, {
        minFileSizeBytes: 1024 * 1024,
        maxFilesPerGroup: 3,
      });

      // Should split into multiple groups
      expect(plan.groups.length).toBeGreaterThan(1);
      expect(plan.groups.every(g => g.files.length <= 3)).toBe(true);
    });
  });

  describe('analyzeCompaction', () => {
    it('should provide recommendation based on fragmentation', () => {
      // Create many small files
      const smallFiles: ManifestFile[] = Array.from({ length: 100 }, (_, i) =>
        createManifestFile(`small-${i}`, 10 * 1024, [{ name: 'p', value: i % 10 }], createFileStats(10, {}))
      );

      const snapshot: Snapshot = {
        snapshotId: 'test',
        parentSnapshotId: null,
        timestamp: Date.now(),
        schemaId: 1,
        manifestList: smallFiles,
        summary: { operation: 'append', addedFiles: 100, deletedFiles: 0, addedRows: 1000, deletedRows: 0 },
      };

      const analysis = analyzeCompaction(snapshot, { minFileSizeBytes: 1024 * 1024 });

      expect(analysis.fragmentationRatio).toBe(1); // All files are small
      expect(analysis.recommendation).toBe('urgent');
    });

    it('should recommend none when no fragmentation', () => {
      const largeFiles: ManifestFile[] = Array.from({ length: 5 }, (_, i) =>
        createManifestFile(`large-${i}`, 100 * 1024 * 1024, [], createFileStats(10000, {}))
      );

      const snapshot: Snapshot = {
        snapshotId: 'test',
        parentSnapshotId: null,
        timestamp: Date.now(),
        schemaId: 1,
        manifestList: largeFiles,
        summary: { operation: 'append', addedFiles: 5, deletedFiles: 0, addedRows: 50000, deletedRows: 0 },
      };

      const analysis = analyzeCompaction(snapshot, { minFileSizeBytes: 1024 * 1024 });

      expect(analysis.eligibleFiles).toBe(0);
      expect(analysis.recommendation).toBe('none');
    });
  });
});
