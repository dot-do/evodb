/**
 * @evodb/lakehouse - Snapshot Creation Tests
 *
 * Tests for snapshot operations including creating, finding, and diffing snapshots.
 */

import { describe, it, expect } from 'vitest';
import {
  createTable,
  createManifestFile,
  createFileStats,
  appendFiles,
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
  type ManifestFile,
  type Snapshot,
} from '../index.js';

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
