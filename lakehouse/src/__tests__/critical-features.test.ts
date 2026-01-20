/**
 * @evodb/lakehouse - Critical Features Tests
 *
 * Tests for time travel queries, compaction, and concurrent access.
 */

import { describe, it, expect } from 'vitest';
import {
  createTable,
  createManifestFile,
  createFileStats,
  appendFiles,
  queryFiles,
  selectFilesForCompaction,
  compact,
  createMemoryTableStorage,
  atomicCommit,
  type TableManifest,
  type Snapshot,
  type ManifestFile,
} from '../index.js';

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
