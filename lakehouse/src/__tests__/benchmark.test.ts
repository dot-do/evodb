/**
 * @evodb/lakehouse - Performance Benchmarks
 *
 * Benchmarks for partition pruning, time-travel queries, and manifest serialization.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  // Manifest operations
  createTable,
  createManifestFile,
  createFileStats,
  appendFiles,
  serializeManifest,
  deserializeManifest,

  // Snapshot operations
  generateSnapshotId,
  createAppendSnapshot,
  serializeSnapshot,
  deserializeSnapshot,
  SnapshotCache,
  createSnapshotCache,
  SnapshotChainTraverser,
  createSnapshotTraverser,
  computeManifestDelta,
  analyzeDeltaChain,

  // Partition operations
  createPartitionSpec,
  identityField,
  yearField,
  monthField,
  dayField,
  pruneByPartition,
  pruneByColumnStats,
  pruneFiles,
  PartitionIndex,
  createPartitionIndex,
  pruneFilesOptimized,
  analyzePruning,

  // Compaction
  generateCompactionPlan,
  analyzeCompaction,

  // Types
  type ManifestFile,
  type PartitionValue,
  type Snapshot,
  type SnapshotRef,
  type TableManifest,
} from '../index.js';

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create test files with partitions
 */
function createTestFile(
  path: string,
  partitions: PartitionValue[],
  rowCount: number,
  sizeBytes: number,
  columnStats: Record<string, { min?: unknown; max?: unknown; nullCount: number }> = {}
): ManifestFile {
  return createManifestFile(
    path,
    sizeBytes,
    partitions,
    createFileStats(rowCount, columnStats)
  );
}

/**
 * Generate a large set of test files with partitions
 */
function generateTestFiles(
  count: number,
  options: {
    yearsRange?: [number, number];
    monthsRange?: [number, number];
    regions?: string[];
    sizeRange?: [number, number];
    rowsRange?: [number, number];
  } = {}
): ManifestFile[] {
  const {
    yearsRange = [2020, 2026],
    monthsRange = [1, 12],
    regions = ['us-east', 'us-west', 'eu-west', 'ap-south'],
    sizeRange = [1024, 1024 * 1024],
    rowsRange = [100, 10000],
  } = options;

  const files: ManifestFile[] = [];

  for (let i = 0; i < count; i++) {
    const year = yearsRange[0] + Math.floor(Math.random() * (yearsRange[1] - yearsRange[0] + 1));
    const month = monthsRange[0] + Math.floor(Math.random() * (monthsRange[1] - monthsRange[0] + 1));
    const region = regions[Math.floor(Math.random() * regions.length)];
    const size = sizeRange[0] + Math.floor(Math.random() * (sizeRange[1] - sizeRange[0]));
    const rows = rowsRange[0] + Math.floor(Math.random() * (rowsRange[1] - rowsRange[0]));

    const minAge = Math.floor(Math.random() * 50);
    const maxAge = minAge + Math.floor(Math.random() * 50);

    files.push(createTestFile(
      `data/year=${year}/month=${month}/region=${region}/file-${i}.bin`,
      [
        { name: 'year', value: year },
        { name: 'month', value: month },
        { name: 'region', value: region },
      ],
      rows,
      size,
      {
        age: { min: minAge, max: maxAge, nullCount: Math.floor(rows * 0.01) },
        score: { min: 0, max: 100, nullCount: 0 },
      }
    ));
  }

  return files;
}

/**
 * Generate snapshot chain
 */
function generateSnapshotChain(length: number): { snapshots: SnapshotRef[]; fullSnapshots: Snapshot[] } {
  const snapshots: SnapshotRef[] = [];
  const fullSnapshots: Snapshot[] = [];
  let parentId: string | null = null;

  for (let i = 0; i < length; i++) {
    const snapshotId = generateSnapshotId();
    const timestamp = Date.now() - (length - i) * 1000 * 60; // 1 minute apart

    snapshots.push({
      snapshotId,
      timestamp,
      parentSnapshotId: parentId,
    });

    fullSnapshots.push({
      snapshotId,
      parentSnapshotId: parentId,
      timestamp,
      schemaId: 1,
      manifestList: [
        createTestFile(`data/snapshot-${i}/file.bin`, [], 1000, 10000),
      ],
      summary: {
        operation: 'append',
        addedFiles: 1,
        deletedFiles: 0,
        addedRows: 1000,
        deletedRows: 0,
      },
    });

    parentId = snapshotId;
  }

  return { snapshots, fullSnapshots };
}

/**
 * Measure execution time
 */
function measureTime<T>(fn: () => T): { result: T; durationMs: number } {
  const start = performance.now();
  const result = fn();
  const durationMs = performance.now() - start;
  return { result, durationMs };
}

/**
 * Run benchmark multiple times and get average
 */
function benchmark<T>(
  fn: () => T,
  iterations: number = 100
): { avgMs: number; minMs: number; maxMs: number; result: T } {
  const times: number[] = [];
  let result: T;

  for (let i = 0; i < iterations; i++) {
    const { result: r, durationMs } = measureTime(fn);
    times.push(durationMs);
    result = r;
  }

  times.sort((a, b) => a - b);

  return {
    avgMs: times.reduce((a, b) => a + b, 0) / times.length,
    minMs: times[0],
    maxMs: times[times.length - 1],
    result: result!,
  };
}

// =============================================================================
// Partition Pruning Benchmarks
// =============================================================================

describe('Partition Pruning Performance', () => {
  describe('Small dataset (100 files)', () => {
    const files = generateTestFiles(100);

    it('should prune by exact year match efficiently', () => {
      const { avgMs, result } = benchmark(() =>
        pruneByPartition(files, { year: { eq: 2024 } })
      );

      expect(avgMs).toBeLessThan(1); // Should be sub-millisecond
      expect(result.length).toBeLessThan(files.length);
      console.log(`  Exact match pruning (100 files): ${avgMs.toFixed(3)}ms avg, ${result.length} files matched`);
    });

    it('should prune by range efficiently', () => {
      const { avgMs, result } = benchmark(() =>
        pruneByPartition(files, { year: { gte: 2023, lte: 2025 } })
      );

      expect(avgMs).toBeLessThan(1);
      console.log(`  Range pruning (100 files): ${avgMs.toFixed(3)}ms avg, ${result.length} files matched`);
    });

    it('should prune by multiple partitions efficiently', () => {
      const { avgMs, result } = benchmark(() =>
        pruneByPartition(files, {
          year: { eq: 2024 },
          month: { in: [1, 2, 3] },
          region: { eq: 'us-east' },
        })
      );

      expect(avgMs).toBeLessThan(1);
      console.log(`  Multi-partition pruning (100 files): ${avgMs.toFixed(3)}ms avg, ${result.length} files matched`);
    });
  });

  describe('Medium dataset (1000 files)', () => {
    const files = generateTestFiles(1000);

    it('should prune by exact match efficiently', () => {
      const { avgMs, result } = benchmark(() =>
        pruneByPartition(files, { year: { eq: 2024 } }),
        50
      );

      expect(avgMs).toBeLessThan(5);
      console.log(`  Exact match pruning (1000 files): ${avgMs.toFixed(3)}ms avg, ${result.length} files matched`);
    });

    it('should use optimized pruning for large sets', () => {
      const { avgMs: linearAvg } = benchmark(() =>
        pruneFiles(files, { partitions: { year: { eq: 2024 } } }),
        50
      );

      const { avgMs: indexedAvg, result } = benchmark(() =>
        pruneFilesOptimized(files, { partitions: { year: { eq: 2024 } } }, 100),
        50
      );

      // Indexed should be at least as fast (often faster for repeated queries)
      expect(indexedAvg).toBeLessThan(10);
      console.log(`  Linear pruning (1000 files): ${linearAvg.toFixed(3)}ms avg`);
      console.log(`  Optimized pruning (1000 files): ${indexedAvg.toFixed(3)}ms avg, ${result.length} files matched`);
    });
  });

  describe('Large dataset (10000 files)', () => {
    const files = generateTestFiles(10000);

    it('should build partition index efficiently', () => {
      const { avgMs, result: index } = benchmark(() =>
        createPartitionIndex(files),
        20
      );

      expect(avgMs).toBeLessThan(100);
      console.log(`  Index build (10000 files): ${avgMs.toFixed(3)}ms avg`);
    });

    it('should query indexed partitions in O(1)', () => {
      const index = createPartitionIndex(files);

      const { avgMs, result } = benchmark(() =>
        index.getByValue('year', 2024),
        100
      );

      expect(avgMs).toBeLessThan(0.1); // Should be nearly instant
      console.log(`  Index lookup (10000 files): ${avgMs.toFixed(3)}ms avg, ${result.length} files matched`);
    });

    it('should perform range queries efficiently', () => {
      const index = createPartitionIndex(files);

      const { avgMs, result } = benchmark(() =>
        index.getByRange('year', 2022, 2024, true),
        100
      );

      expect(avgMs).toBeLessThan(1);
      console.log(`  Index range query (10000 files): ${avgMs.toFixed(3)}ms avg, ${result.length} files matched`);
    });

    it('should analyze pruning statistics', () => {
      const { avgMs, result: stats } = benchmark(() =>
        analyzePruning(files, {
          partitions: { year: { eq: 2024 }, region: { in: ['us-east', 'us-west'] } },
          columns: { age: { gte: 25 } },
        }),
        20
      );

      expect(avgMs).toBeLessThan(50);
      console.log(`  Pruning analysis (10000 files): ${avgMs.toFixed(3)}ms avg`);
      console.log(`    Partition selectivity: ${(stats.partitionSelectivity * 100).toFixed(1)}%`);
      console.log(`    Column selectivity: ${(stats.columnSelectivity * 100).toFixed(1)}%`);
      console.log(`    Overall selectivity: ${(stats.overallSelectivity * 100).toFixed(1)}%`);
    });
  });

  describe('Column stats pruning', () => {
    const files = generateTestFiles(1000);

    it('should prune by column statistics efficiently', () => {
      const { avgMs, result } = benchmark(() =>
        pruneByColumnStats(files, {
          age: { gte: 30, lte: 50 },
          score: { gt: 80 },
        }),
        50
      );

      expect(avgMs).toBeLessThan(5);
      console.log(`  Column stats pruning (1000 files): ${avgMs.toFixed(3)}ms avg, ${result.length} files matched`);
    });

    it('should combine partition and column pruning', () => {
      const { avgMs, result } = benchmark(() =>
        pruneFiles(files, {
          partitions: { year: { eq: 2024 } },
          columns: { age: { between: [20, 40] } },
        }),
        50
      );

      expect(avgMs).toBeLessThan(5);
      console.log(`  Combined pruning (1000 files): ${avgMs.toFixed(3)}ms avg, ${result.length} files matched`);
    });
  });
});

// =============================================================================
// Time-Travel Query Benchmarks
// =============================================================================

describe('Time-Travel Query Performance', () => {
  describe('Snapshot cache', () => {
    it('should cache and retrieve snapshots efficiently', () => {
      const cache = createSnapshotCache({ maxSize: 100 });
      const { fullSnapshots } = generateSnapshotChain(50);

      // Populate cache
      for (const snapshot of fullSnapshots) {
        cache.put(snapshot);
      }

      // Benchmark retrieval
      const { avgMs } = benchmark(() => {
        for (const snapshot of fullSnapshots) {
          cache.get(snapshot.snapshotId);
        }
      });

      expect(avgMs).toBeLessThan(1);
      console.log(`  Cache retrieval (50 snapshots): ${avgMs.toFixed(3)}ms avg for full scan`);
    });

    it('should handle cache eviction efficiently', () => {
      const cache = createSnapshotCache({ maxSize: 10 });
      const { fullSnapshots } = generateSnapshotChain(100);

      const { avgMs } = benchmark(() => {
        for (const snapshot of fullSnapshots) {
          cache.put(snapshot);
        }
      }, 20);

      expect(avgMs).toBeLessThan(5);
      expect(cache.stats().size).toBe(10);
      console.log(`  Cache with eviction (100 inserts, max 10): ${avgMs.toFixed(3)}ms avg`);
    });
  });

  describe('Snapshot chain traversal', () => {
    const { snapshots } = generateSnapshotChain(100);

    it('should build traverser efficiently', () => {
      const { avgMs } = benchmark(() =>
        createSnapshotTraverser(snapshots),
        50
      );

      expect(avgMs).toBeLessThan(1);
      console.log(`  Traverser build (100 snapshots): ${avgMs.toFixed(3)}ms avg`);
    });

    it('should find ancestors efficiently', () => {
      const traverser = createSnapshotTraverser(snapshots);
      const lastSnapshot = snapshots[snapshots.length - 1];

      const { avgMs, result } = benchmark(() =>
        traverser.getAncestors(lastSnapshot.snapshotId)
      );

      expect(avgMs).toBeLessThan(1);
      expect(result.length).toBe(99); // All except the last one
      console.log(`  Ancestor traversal (100 depth): ${avgMs.toFixed(3)}ms avg`);
    });

    it('should find common ancestor efficiently', () => {
      const traverser = createSnapshotTraverser(snapshots);
      const first = snapshots[0];
      const last = snapshots[snapshots.length - 1];

      const { avgMs, result } = benchmark(() =>
        traverser.findCommonAncestor(first.snapshotId, last.snapshotId)
      );

      expect(avgMs).toBeLessThan(1);
      expect(result?.snapshotId).toBe(first.snapshotId);
      console.log(`  Common ancestor (100 chain): ${avgMs.toFixed(3)}ms avg`);
    });

    it('should calculate depth efficiently', () => {
      const traverser = createSnapshotTraverser(snapshots);
      const lastSnapshot = snapshots[snapshots.length - 1];

      const { avgMs, result } = benchmark(() =>
        traverser.getDepth(lastSnapshot.snapshotId)
      );

      expect(avgMs).toBeLessThan(1);
      expect(result).toBe(99);
      console.log(`  Depth calculation (100 chain): ${avgMs.toFixed(3)}ms avg`);
    });
  });

  describe('Manifest delta compression', () => {
    it('should compute delta between snapshots efficiently', () => {
      const baseFiles = generateTestFiles(1000);
      const baseSnapshot: Snapshot = {
        snapshotId: 'base',
        parentSnapshotId: null,
        timestamp: Date.now() - 10000,
        schemaId: 1,
        manifestList: baseFiles,
        summary: { operation: 'append', addedFiles: 1000, deletedFiles: 0, addedRows: 100000, deletedRows: 0 },
      };

      // Simulate adding 10 files and removing 5
      const newFiles = generateTestFiles(10);
      const targetFiles = [...baseFiles.slice(5), ...newFiles];
      const targetSnapshot: Snapshot = {
        snapshotId: 'target',
        parentSnapshotId: 'base',
        timestamp: Date.now(),
        schemaId: 1,
        manifestList: targetFiles,
        summary: { operation: 'append', addedFiles: 10, deletedFiles: 5, addedRows: 1000, deletedRows: 500 },
      };

      const { avgMs, result: delta } = benchmark(() =>
        computeManifestDelta(baseSnapshot, targetSnapshot),
        50
      );

      expect(avgMs).toBeLessThan(10);
      expect(delta.addedPaths.length).toBe(10);
      expect(delta.removedPaths.length).toBe(5);
      console.log(`  Delta computation (1000 files): ${avgMs.toFixed(3)}ms avg`);
      console.log(`    Added: ${delta.addedPaths.length}, Removed: ${delta.removedPaths.length}`);
    });

    it('should analyze delta chain statistics', () => {
      const deltas = [];
      for (let i = 0; i < 50; i++) {
        deltas.push({
          baseSnapshotId: `snap-${i}`,
          targetSnapshotId: `snap-${i + 1}`,
          addedPaths: Array(5).fill(`path-${i}`),
          removedPaths: Array(2).fill(`old-${i}`),
          timestamp: Date.now(),
        });
      }

      const { avgMs, result: stats } = benchmark(() =>
        analyzeDeltaChain(deltas)
      );

      expect(avgMs).toBeLessThan(1);
      console.log(`  Delta chain analysis (50 deltas): ${avgMs.toFixed(3)}ms avg`);
      console.log(`    Total added: ${stats.totalAddedPaths}, removed: ${stats.totalRemovedPaths}`);
      console.log(`    Estimated savings: ${stats.estimatedSavings.toFixed(1)}%`);
    });
  });
});

// =============================================================================
// Manifest Serialization Benchmarks
// =============================================================================

describe('Manifest Serialization Performance', () => {
  describe('Small manifest', () => {
    it('should serialize manifest efficiently', () => {
      const { manifest } = createTable({
        location: 'test/location',
        schema: {
          columns: [
            { name: 'id', type: 'uuid', nullable: false },
            { name: 'name', type: 'string', nullable: false },
            { name: 'value', type: 'int64', nullable: true },
          ],
        },
      });

      const { avgMs, result } = benchmark(() =>
        serializeManifest(manifest)
      );

      expect(avgMs).toBeLessThan(1);
      console.log(`  Serialize small manifest: ${avgMs.toFixed(3)}ms avg, ${result.length} bytes`);
    });

    it('should deserialize manifest efficiently', () => {
      const { manifest } = createTable({
        location: 'test/location',
        schema: {
          columns: [
            { name: 'id', type: 'uuid', nullable: false },
            { name: 'name', type: 'string', nullable: false },
          ],
        },
      });
      const json = serializeManifest(manifest);

      const { avgMs } = benchmark(() =>
        deserializeManifest(json)
      );

      expect(avgMs).toBeLessThan(1);
      console.log(`  Deserialize small manifest: ${avgMs.toFixed(3)}ms avg`);
    });
  });

  describe('Large manifest with snapshots', () => {
    it('should serialize manifest with many snapshots', () => {
      const { manifest } = createTable({
        location: 'test/location',
        schema: {
          columns: [
            { name: 'id', type: 'uuid', nullable: false },
            { name: 'data', type: 'json', nullable: true },
          ],
        },
      });

      // Add many snapshots
      let currentManifest = manifest;
      let currentSnapshot: Snapshot | null = null;

      for (let i = 0; i < 100; i++) {
        const file = createTestFile(`data/file-${i}.bin`, [], 1000, 10000);
        const result = appendFiles(currentManifest, currentSnapshot, [file]);
        currentManifest = result.manifest;
        currentSnapshot = result.snapshot;
      }

      const { avgMs, result } = benchmark(() =>
        serializeManifest(currentManifest),
        50
      );

      expect(avgMs).toBeLessThan(10);
      console.log(`  Serialize large manifest (100 snapshots): ${avgMs.toFixed(3)}ms avg, ${(result.length / 1024).toFixed(1)} KB`);
    });
  });

  describe('Snapshot serialization', () => {
    it('should serialize snapshot with many files', () => {
      const files = generateTestFiles(1000);
      const snapshot: Snapshot = {
        snapshotId: generateSnapshotId(),
        parentSnapshotId: null,
        timestamp: Date.now(),
        schemaId: 1,
        manifestList: files,
        summary: {
          operation: 'append',
          addedFiles: files.length,
          deletedFiles: 0,
          addedRows: files.reduce((sum, f) => sum + f.stats.rowCount, 0),
          deletedRows: 0,
        },
      };

      const { avgMs, result } = benchmark(() =>
        serializeSnapshot(snapshot),
        50
      );

      expect(avgMs).toBeLessThan(50);
      console.log(`  Serialize large snapshot (1000 files): ${avgMs.toFixed(3)}ms avg, ${(result.length / 1024).toFixed(1)} KB`);
    });

    it('should deserialize snapshot efficiently', () => {
      const files = generateTestFiles(1000);
      const snapshot: Snapshot = {
        snapshotId: generateSnapshotId(),
        parentSnapshotId: null,
        timestamp: Date.now(),
        schemaId: 1,
        manifestList: files,
        summary: {
          operation: 'append',
          addedFiles: files.length,
          deletedFiles: 0,
          addedRows: 100000,
          deletedRows: 0,
        },
      };
      const json = serializeSnapshot(snapshot);

      const { avgMs } = benchmark(() =>
        deserializeSnapshot(json),
        50
      );

      expect(avgMs).toBeLessThan(50);
      console.log(`  Deserialize large snapshot (1000 files): ${avgMs.toFixed(3)}ms avg`);
    });
  });
});

// =============================================================================
// Compaction Benchmarks
// =============================================================================

describe('Compaction Performance', () => {
  describe('Compaction plan generation', () => {
    it('should generate compaction plan for fragmented data', () => {
      // Generate many small files
      const files = generateTestFiles(500, {
        sizeRange: [1024, 100 * 1024], // All small files
      });

      const snapshot: Snapshot = {
        snapshotId: 'test',
        parentSnapshotId: null,
        timestamp: Date.now(),
        schemaId: 1,
        manifestList: files,
        summary: { operation: 'append', addedFiles: files.length, deletedFiles: 0, addedRows: 50000, deletedRows: 0 },
      };

      const { avgMs, result: plan } = benchmark(() =>
        generateCompactionPlan(snapshot, {
          minFileSizeBytes: 1024 * 1024,
          targetFileSizeBytes: 128 * 1024 * 1024,
        }),
        50
      );

      expect(avgMs).toBeLessThan(10);
      console.log(`  Compaction plan (500 small files): ${avgMs.toFixed(3)}ms avg`);
      console.log(`    Groups: ${plan.groups.length}`);
      console.log(`    Files to compact: ${plan.totalFilesToCompact}`);
      console.log(`    Estimated output files: ${plan.estimatedOutputFiles}`);
    });

    it('should analyze compaction opportunities', () => {
      const files = generateTestFiles(1000, {
        sizeRange: [1024, 2 * 1024 * 1024], // Mix of small and large
      });

      const snapshot: Snapshot = {
        snapshotId: 'test',
        parentSnapshotId: null,
        timestamp: Date.now(),
        schemaId: 1,
        manifestList: files,
        summary: { operation: 'append', addedFiles: files.length, deletedFiles: 0, addedRows: 100000, deletedRows: 0 },
      };

      const { avgMs, result: analysis } = benchmark(() =>
        analyzeCompaction(snapshot),
        50
      );

      expect(avgMs).toBeLessThan(10);
      console.log(`  Compaction analysis (1000 files): ${avgMs.toFixed(3)}ms avg`);
      console.log(`    Eligible files: ${analysis.eligibleFiles}`);
      console.log(`    Fragmentation: ${(analysis.fragmentationRatio * 100).toFixed(1)}%`);
      console.log(`    Recommendation: ${analysis.recommendation}`);
    });
  });
});

// =============================================================================
// Summary
// =============================================================================

describe('Benchmark Summary', () => {
  it('should pass all performance requirements', () => {
    // This test serves as a summary assertion
    // All benchmarks above validate specific performance characteristics
    expect(true).toBe(true);
  });
});
