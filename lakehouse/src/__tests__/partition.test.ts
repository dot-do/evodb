/**
 * @evodb/lakehouse - Partition Management Tests
 *
 * Comprehensive tests for partition operations including:
 * - Bucket and truncate transforms
 * - Partition index operations
 * - Edge cases in partition pruning
 * - Statistics and analysis functions
 */

import { describe, it, expect } from 'vitest';

import {
  // Partition spec creation
  createPartitionSpec,
  identityField,
  yearField,
  monthField,
  dayField,
  hourField,
  bucketField,
  truncateField,

  // Partition values
  computePartitionValues,

  // Pruning
  pruneByPartition,
  pruneByColumnStats,
  pruneFiles,
  pruneFilesOptimized,
  estimateSelectivity,
  analyzePruning,

  // Partition index
  PartitionIndex,
  createPartitionIndex,

  // Statistics
  getPartitionDistribution,
  getPartitionRange,

  // Helpers for creating test files
  createManifestFile,
  createFileStats,

  // Types
  type ManifestFile,
  type PartitionValue,
} from '../index.js';

// =============================================================================
// Test Helpers
// =============================================================================

function createTestFile(
  path: string,
  partitions: PartitionValue[],
  rowCount: number,
  columnStats: Record<string, { min?: unknown; max?: unknown; nullCount: number; distinctCount?: number }> = {}
): ManifestFile {
  return createManifestFile(
    path,
    rowCount * 100, // Estimated size
    partitions,
    createFileStats(rowCount, columnStats)
  );
}

// =============================================================================
// Bucket and Truncate Transform Tests
// =============================================================================

describe('Bucket and Truncate Transforms', () => {
  describe('bucketField', () => {
    it('should create bucket partition field with numBuckets', () => {
      const field = bucketField('user_id', 16);

      expect(field.sourceColumn).toBe('user_id');
      expect(field.transform.type).toBe('bucket');
      expect((field.transform as { type: 'bucket'; numBuckets: number }).numBuckets).toBe(16);
      expect(field.name).toBe('user_id_bucket');
    });

    it('should allow custom name for bucket field', () => {
      const field = bucketField('user_id', 8, 'uid_bucket');

      expect(field.name).toBe('uid_bucket');
    });

    it('should compute consistent bucket values', () => {
      const spec = createPartitionSpec([
        bucketField('user_id', 10),
      ]);

      // Same value should always hash to same bucket
      const values1 = computePartitionValues({ user_id: 'user-123' }, spec);
      const values2 = computePartitionValues({ user_id: 'user-123' }, spec);

      expect(values1[0].value).toBe(values2[0].value);
      expect(typeof values1[0].value).toBe('number');

      // Bucket should be within range
      const bucket = values1[0].value as number;
      expect(bucket).toBeGreaterThanOrEqual(0);
      expect(bucket).toBeLessThan(10);
    });

    it('should distribute values across buckets', () => {
      const spec = createPartitionSpec([
        bucketField('id', 4),
      ]);

      // Generate many values and check distribution
      const buckets = new Set<number>();
      for (let i = 0; i < 100; i++) {
        const values = computePartitionValues({ id: `user-${i}` }, spec);
        buckets.add(values[0].value as number);
      }

      // Should use multiple buckets (may not use all 4 but should have > 1)
      expect(buckets.size).toBeGreaterThan(1);
    });

    it('should handle numeric values in bucket', () => {
      const spec = createPartitionSpec([
        bucketField('account_id', 8),
      ]);

      const values = computePartitionValues({ account_id: 12345 }, spec);
      expect(typeof values[0].value).toBe('number');
      expect(values[0].value as number).toBeGreaterThanOrEqual(0);
      expect(values[0].value as number).toBeLessThan(8);
    });
  });

  describe('truncateField', () => {
    it('should create truncate partition field with width', () => {
      const field = truncateField('name', 3);

      expect(field.sourceColumn).toBe('name');
      expect(field.transform.type).toBe('truncate');
      expect((field.transform as { type: 'truncate'; width: number }).width).toBe(3);
      expect(field.name).toBe('name');
    });

    it('should allow custom name for truncate field', () => {
      const field = truncateField('email', 10, 'email_prefix');

      expect(field.name).toBe('email_prefix');
    });

    it('should truncate string values to width', () => {
      const spec = createPartitionSpec([
        truncateField('name', 3),
      ]);

      const values = computePartitionValues({ name: 'Alexander' }, spec);
      expect(values[0].value).toBe('Ale');
    });

    it('should handle strings shorter than width', () => {
      const spec = createPartitionSpec([
        truncateField('code', 10),
      ]);

      const values = computePartitionValues({ code: 'AB' }, spec);
      expect(values[0].value).toBe('AB');
    });

    it('should truncate numeric values by rounding down', () => {
      const spec = createPartitionSpec([
        truncateField('amount', 100),
      ]);

      const values1 = computePartitionValues({ amount: 123 }, spec);
      expect(values1[0].value).toBe(100);

      const values2 = computePartitionValues({ amount: 567 }, spec);
      expect(values2[0].value).toBe(500);

      const values3 = computePartitionValues({ amount: 99 }, spec);
      expect(values3[0].value).toBe(0);
    });

    it('should handle negative numbers in truncate', () => {
      const spec = createPartitionSpec([
        truncateField('balance', 50),
      ]);

      const values = computePartitionValues({ balance: -123 }, spec);
      expect(values[0].value).toBe(-150); // Math.floor(-123/50) * 50 = -3 * 50 = -150
    });
  });

  describe('hourField', () => {
    it('should extract hour from timestamp', () => {
      const spec = createPartitionSpec([
        hourField('event_time'),
      ]);

      // 2026-01-15T14:30:00Z
      const timestamp = new Date('2026-01-15T14:30:00Z').getTime();
      const values = computePartitionValues({ event_time: timestamp }, spec);

      expect(values[0].name).toBe('hour');
      expect(values[0].value).toBe(14);
    });

    it('should allow custom name for hour field', () => {
      const field = hourField('created_at', 'event_hour');
      expect(field.name).toBe('event_hour');
    });
  });
});

// =============================================================================
// Partition Index Tests
// =============================================================================

describe('PartitionIndex', () => {
  describe('getByValue', () => {
    it('should return files matching exact partition value', () => {
      const files: ManifestFile[] = [
        createTestFile('f1', [{ name: 'year', value: 2025 }], 100),
        createTestFile('f2', [{ name: 'year', value: 2026 }], 100),
        createTestFile('f3', [{ name: 'year', value: 2026 }], 150),
        createTestFile('f4', [{ name: 'year', value: 2027 }], 100),
      ];

      const index = createPartitionIndex(files);
      const result = index.getByValue('year', 2026);

      expect(result).toHaveLength(2);
      expect(result.map(f => f.path)).toContain('f2');
      expect(result.map(f => f.path)).toContain('f3');
    });

    it('should return empty array for non-existent value', () => {
      const files: ManifestFile[] = [
        createTestFile('f1', [{ name: 'year', value: 2026 }], 100),
      ];

      const index = createPartitionIndex(files);
      const result = index.getByValue('year', 2020);

      expect(result).toHaveLength(0);
    });

    it('should return empty array for non-existent partition name', () => {
      const files: ManifestFile[] = [
        createTestFile('f1', [{ name: 'year', value: 2026 }], 100),
      ];

      const index = createPartitionIndex(files);
      const result = index.getByValue('month', 1);

      expect(result).toHaveLength(0);
    });

    it('should handle null partition values', () => {
      const files: ManifestFile[] = [
        createTestFile('f1', [{ name: 'region', value: 'us' }], 100),
        createTestFile('f2', [{ name: 'region', value: null }], 100),
        createTestFile('f3', [{ name: 'region', value: 'eu' }], 100),
      ];

      const index = createPartitionIndex(files);
      const result = index.getByValue('region', null);

      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('f2');
    });
  });

  describe('getByValues', () => {
    it('should return files matching any of the given values', () => {
      const files: ManifestFile[] = [
        createTestFile('f1', [{ name: 'region', value: 'us' }], 100),
        createTestFile('f2', [{ name: 'region', value: 'eu' }], 100),
        createTestFile('f3', [{ name: 'region', value: 'asia' }], 100),
        createTestFile('f4', [{ name: 'region', value: 'us' }], 150),
      ];

      const index = createPartitionIndex(files);
      const result = index.getByValues('region', ['us', 'eu']);

      expect(result).toHaveLength(3);
      expect(result.map(f => f.path)).toContain('f1');
      expect(result.map(f => f.path)).toContain('f2');
      expect(result.map(f => f.path)).toContain('f4');
    });

    it('should deduplicate files when value matches multiple', () => {
      const files: ManifestFile[] = [
        createTestFile('f1', [{ name: 'type', value: 'A' }], 100),
      ];

      const index = createPartitionIndex(files);
      // Same file can't match multiple values, but dedup should still work
      const result = index.getByValues('type', ['A', 'A', 'A']);

      expect(result).toHaveLength(1);
    });
  });

  describe('getByRange', () => {
    it('should return files in numeric range', () => {
      const files: ManifestFile[] = [
        createTestFile('f1', [{ name: 'year', value: 2024 }], 100),
        createTestFile('f2', [{ name: 'year', value: 2025 }], 100),
        createTestFile('f3', [{ name: 'year', value: 2026 }], 100),
        createTestFile('f4', [{ name: 'year', value: 2027 }], 100),
      ];

      const index = createPartitionIndex(files);
      const result = index.getByRange('year', 2025, 2026, true);

      expect(result).toHaveLength(2);
      expect(result.map(f => f.path)).toContain('f2');
      expect(result.map(f => f.path)).toContain('f3');
    });

    it('should handle open-ended ranges (min only)', () => {
      const files: ManifestFile[] = [
        createTestFile('f1', [{ name: 'month', value: 1 }], 100),
        createTestFile('f2', [{ name: 'month', value: 6 }], 100),
        createTestFile('f3', [{ name: 'month', value: 12 }], 100),
      ];

      const index = createPartitionIndex(files);
      const result = index.getByRange('month', 6, null, true);

      expect(result).toHaveLength(2);
      expect(result.map(f => f.path)).toContain('f2');
      expect(result.map(f => f.path)).toContain('f3');
    });

    it('should handle open-ended ranges (max only)', () => {
      const files: ManifestFile[] = [
        createTestFile('f1', [{ name: 'day', value: 5 }], 100),
        createTestFile('f2', [{ name: 'day', value: 15 }], 100),
        createTestFile('f3', [{ name: 'day', value: 25 }], 100),
      ];

      const index = createPartitionIndex(files);
      const result = index.getByRange('day', null, 15, true);

      expect(result).toHaveLength(2);
      expect(result.map(f => f.path)).toContain('f1');
      expect(result.map(f => f.path)).toContain('f2');
    });

    it('should handle exclusive range', () => {
      const files: ManifestFile[] = [
        createTestFile('f1', [{ name: 'value', value: 10 }], 100),
        createTestFile('f2', [{ name: 'value', value: 20 }], 100),
        createTestFile('f3', [{ name: 'value', value: 30 }], 100),
      ];

      const index = createPartitionIndex(files);
      const result = index.getByRange('value', 10, 30, false);

      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('f2');
    });
  });

  describe('getUniqueValues', () => {
    it('should return all unique partition values', () => {
      const files: ManifestFile[] = [
        createTestFile('f1', [{ name: 'status', value: 'active' }], 100),
        createTestFile('f2', [{ name: 'status', value: 'pending' }], 100),
        createTestFile('f3', [{ name: 'status', value: 'active' }], 100),
        createTestFile('f4', [{ name: 'status', value: null }], 100),
      ];

      const index = createPartitionIndex(files);
      const values = index.getUniqueValues('status');

      expect(values).toHaveLength(3);
      expect(values).toContain('active');
      expect(values).toContain('pending');
      expect(values).toContain(null);
    });

    it('should return empty array for non-existent partition', () => {
      const files: ManifestFile[] = [
        createTestFile('f1', [{ name: 'year', value: 2026 }], 100),
      ];

      const index = createPartitionIndex(files);
      const values = index.getUniqueValues('month');

      expect(values).toHaveLength(0);
    });
  });

  describe('getAllFiles', () => {
    it('should return all files in index', () => {
      const files: ManifestFile[] = [
        createTestFile('f1', [{ name: 'year', value: 2026 }], 100),
        createTestFile('f2', [{ name: 'year', value: 2027 }], 100),
      ];

      const index = createPartitionIndex(files);
      const result = index.getAllFiles();

      expect(result).toHaveLength(2);
    });
  });
});

// =============================================================================
// Optimized Pruning Tests
// =============================================================================

describe('pruneFilesOptimized', () => {
  it('should use linear scan for small file sets', () => {
    const files: ManifestFile[] = Array.from({ length: 10 }, (_, i) =>
      createTestFile(`f${i}`, [{ name: 'year', value: 2020 + i }], 100)
    );

    const result = pruneFilesOptimized(files, { partitions: { year: { eq: 2025 } } }, 50);

    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('f5');
  });

  it('should use index for large file sets', () => {
    const files: ManifestFile[] = Array.from({ length: 100 }, (_, i) =>
      createTestFile(`f${i}`, [{ name: 'year', value: 2020 + (i % 10) }], 100)
    );

    const result = pruneFilesOptimized(files, { partitions: { year: { eq: 2025 } } }, 50);

    // Should have 10 files with year=2025 (indices 5, 15, 25, 35, 45, 55, 65, 75, 85, 95)
    expect(result).toHaveLength(10);
  });

  it('should combine partition and column pruning', () => {
    const files: ManifestFile[] = [
      createTestFile('f1', [{ name: 'year', value: 2026 }], 100, { age: { min: 20, max: 30, nullCount: 0 } }),
      createTestFile('f2', [{ name: 'year', value: 2026 }], 100, { age: { min: 40, max: 50, nullCount: 0 } }),
      createTestFile('f3', [{ name: 'year', value: 2025 }], 100, { age: { min: 20, max: 30, nullCount: 0 } }),
    ];

    const result = pruneFilesOptimized(
      files,
      {
        partitions: { year: { eq: 2026 } },
        columns: { age: { lte: 35 } },
      },
      1 // Force index usage
    );

    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('f1');
  });
});

// =============================================================================
// Selectivity and Analysis Tests
// =============================================================================

describe('estimateSelectivity', () => {
  it('should return 0 for empty file set', () => {
    const selectivity = estimateSelectivity([], { partitions: { year: { eq: 2026 } } });
    expect(selectivity).toBe(0);
  });

  it('should return 1 for empty filter', () => {
    const files: ManifestFile[] = [
      createTestFile('f1', [], 100),
      createTestFile('f2', [], 100),
    ];

    const selectivity = estimateSelectivity(files, {});
    expect(selectivity).toBe(1);
  });

  it('should calculate selectivity based on file pruning', () => {
    const files: ManifestFile[] = [
      createTestFile('f1', [{ name: 'year', value: 2025 }], 100),
      createTestFile('f2', [{ name: 'year', value: 2026 }], 100),
      createTestFile('f3', [{ name: 'year', value: 2026 }], 100),
      createTestFile('f4', [{ name: 'year', value: 2027 }], 100),
    ];

    const selectivity = estimateSelectivity(files, { partitions: { year: { eq: 2026 } } });

    expect(selectivity).toBe(0.5); // 2 out of 4 files
  });
});

describe('analyzePruning', () => {
  it('should analyze pruning effectiveness', () => {
    const files: ManifestFile[] = [
      createTestFile('f1', [{ name: 'year', value: 2026 }], 100, { age: { min: 20, max: 40, nullCount: 0 } }),
      createTestFile('f2', [{ name: 'year', value: 2026 }], 100, { age: { min: 50, max: 70, nullCount: 0 } }),
      createTestFile('f3', [{ name: 'year', value: 2025 }], 100, { age: { min: 20, max: 40, nullCount: 0 } }),
      createTestFile('f4', [{ name: 'year', value: 2025 }], 100, { age: { min: 50, max: 70, nullCount: 0 } }),
    ];

    const stats = analyzePruning(files, {
      partitions: { year: { eq: 2026 } },
      columns: { age: { lte: 45 } },
    });

    expect(stats.totalFiles).toBe(4);
    expect(stats.filesAfterPartitionPruning).toBe(2); // f1, f2
    expect(stats.filesAfterColumnPruning).toBe(1); // f1
    expect(stats.partitionSelectivity).toBe(0.5);
    expect(stats.columnSelectivity).toBe(0.5);
    expect(stats.overallSelectivity).toBe(0.25);
  });

  it('should calculate bytes pruned', () => {
    const files: ManifestFile[] = [
      createTestFile('f1', [{ name: 'type', value: 'A' }], 1000),
      createTestFile('f2', [{ name: 'type', value: 'B' }], 2000),
    ];

    const stats = analyzePruning(files, { partitions: { type: { eq: 'A' } } });

    expect(stats.prunedBytes).toBe(2000 * 100); // f2's size
    expect(stats.remainingBytes).toBe(1000 * 100); // f1's size
  });
});

// =============================================================================
// Partition Statistics Tests
// =============================================================================

describe('getPartitionDistribution', () => {
  it('should return row counts per partition value', () => {
    const files: ManifestFile[] = [
      createTestFile('f1', [{ name: 'region', value: 'us' }], 100),
      createTestFile('f2', [{ name: 'region', value: 'eu' }], 200),
      createTestFile('f3', [{ name: 'region', value: 'us' }], 150),
    ];

    const dist = getPartitionDistribution(files, 'region');

    expect(dist.get('us')).toBe(250); // 100 + 150
    expect(dist.get('eu')).toBe(200);
    expect(dist.size).toBe(2);
  });

  it('should handle null values', () => {
    const files: ManifestFile[] = [
      createTestFile('f1', [{ name: 'category', value: 'A' }], 100),
      createTestFile('f2', [{ name: 'category', value: null }], 50),
    ];

    const dist = getPartitionDistribution(files, 'category');

    expect(dist.get('A')).toBe(100);
    expect(dist.get(null)).toBe(50);
  });

  it('should handle missing partition names', () => {
    const files: ManifestFile[] = [
      createTestFile('f1', [{ name: 'year', value: 2026 }], 100),
    ];

    const dist = getPartitionDistribution(files, 'month');

    expect(dist.get(null)).toBe(100); // Falls back to null
  });
});

describe('getPartitionRange', () => {
  it('should return min and max partition values', () => {
    const files: ManifestFile[] = [
      createTestFile('f1', [{ name: 'year', value: 2024 }], 100),
      createTestFile('f2', [{ name: 'year', value: 2027 }], 100),
      createTestFile('f3', [{ name: 'year', value: 2025 }], 100),
    ];

    const range = getPartitionRange(files, 'year');

    expect(range).not.toBeNull();
    expect(range!.min).toBe(2024);
    expect(range!.max).toBe(2027);
  });

  it('should return null for empty files', () => {
    const range = getPartitionRange([], 'year');
    expect(range).toBeNull();
  });

  it('should skip null values in range calculation', () => {
    const files: ManifestFile[] = [
      createTestFile('f1', [{ name: 'score', value: 50 }], 100),
      createTestFile('f2', [{ name: 'score', value: null }], 100),
      createTestFile('f3', [{ name: 'score', value: 100 }], 100),
    ];

    const range = getPartitionRange(files, 'score');

    expect(range).not.toBeNull();
    expect(range!.min).toBe(50);
    expect(range!.max).toBe(100);
  });

  it('should handle string partition values', () => {
    const files: ManifestFile[] = [
      createTestFile('f1', [{ name: 'region', value: 'asia' }], 100),
      createTestFile('f2', [{ name: 'region', value: 'europe' }], 100),
      createTestFile('f3', [{ name: 'region', value: 'africa' }], 100),
    ];

    const range = getPartitionRange(files, 'region');

    expect(range).not.toBeNull();
    expect(range!.min).toBe('africa');
    expect(range!.max).toBe('europe');
  });
});

// =============================================================================
// Edge Cases in Partition Pruning
// =============================================================================

describe('Partition Pruning Edge Cases', () => {
  it('should handle files with multiple partitions', () => {
    const files: ManifestFile[] = [
      createTestFile('f1', [
        { name: 'year', value: 2026 },
        { name: 'month', value: 1 },
        { name: 'region', value: 'us' },
      ], 100),
      createTestFile('f2', [
        { name: 'year', value: 2026 },
        { name: 'month', value: 2 },
        { name: 'region', value: 'us' },
      ], 100),
      createTestFile('f3', [
        { name: 'year', value: 2026 },
        { name: 'month', value: 1 },
        { name: 'region', value: 'eu' },
      ], 100),
    ];

    const filtered = pruneByPartition(files, {
      year: { eq: 2026 },
      month: { eq: 1 },
      region: { eq: 'us' },
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].path).toBe('f1');
  });

  it('should handle empty partitions array', () => {
    const files: ManifestFile[] = [
      createTestFile('f1', [], 100),
      createTestFile('f2', [], 100),
    ];

    const filtered = pruneByPartition(files, { year: { eq: 2026 } });

    // Files without the partition won't match
    expect(filtered).toHaveLength(0);
  });

  it('should handle IN clause with single value', () => {
    const files: ManifestFile[] = [
      createTestFile('f1', [{ name: 'type', value: 'A' }], 100),
      createTestFile('f2', [{ name: 'type', value: 'B' }], 100),
    ];

    const filtered = pruneByPartition(files, { type: { in: ['A'] } });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].path).toBe('f1');
  });

  it('should handle IN clause with null in array', () => {
    const files: ManifestFile[] = [
      createTestFile('f1', [{ name: 'status', value: 'active' }], 100),
      createTestFile('f2', [{ name: 'status', value: null }], 100),
      createTestFile('f3', [{ name: 'status', value: 'inactive' }], 100),
    ];

    const filtered = pruneByPartition(files, { status: { in: ['active', null as unknown as string] } });

    expect(filtered).toHaveLength(2);
    expect(filtered.map(f => f.path)).toContain('f1');
    expect(filtered.map(f => f.path)).toContain('f2');
  });

  it('should handle string partition values with gte/lte', () => {
    const files: ManifestFile[] = [
      createTestFile('f1', [{ name: 'version', value: '1.0' }], 100),
      createTestFile('f2', [{ name: 'version', value: '2.0' }], 100),
      createTestFile('f3', [{ name: 'version', value: '3.0' }], 100),
    ];

    // String comparison uses parseFloat - "1.0", "2.0", "3.0" are parsed as 1, 2, 3
    // gte: 2 means value >= 2, so "2.0" (2) and "3.0" (3) pass
    const filtered = pruneByPartition(files, { version: { gte: 2 } });

    expect(filtered).toHaveLength(2);
    expect(filtered.map(f => f.path)).toContain('f2');
    expect(filtered.map(f => f.path)).toContain('f3');
  });
});

// =============================================================================
// Column Stats Pruning Edge Cases
// =============================================================================

describe('Column Stats Pruning Edge Cases', () => {
  it('should handle missing column stats', () => {
    const files: ManifestFile[] = [
      createTestFile('f1', [], 100, { age: { min: 20, max: 40, nullCount: 0 } }),
      createTestFile('f2', [], 100, {}), // No column stats
    ];

    const filtered = pruneByColumnStats(files, { age: { lte: 30 } });

    // f2 cannot be pruned because it has no stats
    expect(filtered).toHaveLength(2);
  });

  it('should prune by ne (not equal) when all values are same', () => {
    const files: ManifestFile[] = [
      createTestFile('f1', [], 100, { status: { min: 'active', max: 'active', nullCount: 0 } }),
      createTestFile('f2', [], 100, { status: { min: 'active', max: 'pending', nullCount: 0 } }),
    ];

    const filtered = pruneByColumnStats(files, { status: { ne: 'active' } });

    // f1 can be pruned (all values are 'active'), f2 cannot
    expect(filtered).toHaveLength(1);
    expect(filtered[0].path).toBe('f2');
  });

  it('should handle isNull filter', () => {
    const files: ManifestFile[] = [
      // f1: 0 nulls out of distinctCount=100, so has non-null values
      createTestFile('f1', [], 100, { email: { nullCount: 0, min: 'a@b.com', max: 'z@b.com', distinctCount: 100 } }),
      // f2: 50 nulls but distinctCount=100, so has some non-null values
      createTestFile('f2', [], 100, { email: { nullCount: 50, distinctCount: 100 } }),
      // f3: 100 nulls out of distinctCount=100, so all nulls
      createTestFile('f3', [], 100, { email: { nullCount: 100, distinctCount: 100 } }),
    ];

    // Looking for nulls (nullCount > 0)
    const withNulls = pruneByColumnStats(files, { email: { isNull: true } });
    expect(withNulls).toHaveLength(2);
    expect(withNulls.map(f => f.path)).toContain('f2');
    expect(withNulls.map(f => f.path)).toContain('f3');

    // Looking for non-nulls (nullCount < distinctCount)
    const withoutNulls = pruneByColumnStats(files, { email: { isNull: false } });
    expect(withoutNulls).toHaveLength(2);
    expect(withoutNulls.map(f => f.path)).toContain('f1');
    expect(withoutNulls.map(f => f.path)).toContain('f2');
  });

  it('should handle gt and lt filters', () => {
    const files: ManifestFile[] = [
      createTestFile('f1', [], 100, { score: { min: 0, max: 50, nullCount: 0 } }),
      createTestFile('f2', [], 100, { score: { min: 50, max: 100, nullCount: 0 } }),
      createTestFile('f3', [], 100, { score: { min: 100, max: 150, nullCount: 0 } }),
    ];

    // gt: 50 - file must have max > 50
    const gtFiltered = pruneByColumnStats(files, { score: { gt: 50 } });
    expect(gtFiltered).toHaveLength(2); // f2, f3

    // lt: 100 - file must have min < 100
    const ltFiltered = pruneByColumnStats(files, { score: { lt: 100 } });
    expect(ltFiltered).toHaveLength(2); // f1, f2
  });

  it('should handle between filter on columns', () => {
    const files: ManifestFile[] = [
      createTestFile('f1', [], 100, { value: { min: 10, max: 20, nullCount: 0 } }),
      createTestFile('f2', [], 100, { value: { min: 30, max: 40, nullCount: 0 } }),
      createTestFile('f3', [], 100, { value: { min: 50, max: 60, nullCount: 0 } }),
    ];

    const filtered = pruneByColumnStats(files, { value: { between: [25, 45] } });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].path).toBe('f2');
  });
});

// =============================================================================
// Compute Partition Values Edge Cases
// =============================================================================

describe('computePartitionValues Edge Cases', () => {
  it('should handle null source values', () => {
    const spec = createPartitionSpec([
      identityField('region'),
    ]);

    const values = computePartitionValues({ region: null }, spec);
    expect(values[0].value).toBeNull();
  });

  it('should handle undefined source values', () => {
    const spec = createPartitionSpec([
      identityField('category'),
    ]);

    const values = computePartitionValues({}, spec); // category is undefined
    expect(values[0].value).toBeNull();
  });

  it('should handle date string formats', () => {
    const spec = createPartitionSpec([
      yearField('date'),
      monthField('date'),
      dayField('date'),
    ]);

    // ISO date string
    const values = computePartitionValues({ date: '2026-03-15' }, spec);
    expect(values[0].value).toBe(2026);
    expect(values[1].value).toBe(3);
    expect(values[2].value).toBe(15);
  });

  it('should handle Date objects', () => {
    const spec = createPartitionSpec([
      yearField('created'),
      monthField('created'),
    ]);

    const values = computePartitionValues({ created: new Date('2026-07-20T10:30:00Z') }, spec);
    expect(values[0].value).toBe(2026);
    expect(values[1].value).toBe(7);
  });

  it('should return null for invalid dates', () => {
    const spec = createPartitionSpec([
      yearField('timestamp'),
    ]);

    const values = computePartitionValues({ timestamp: 'not-a-date' }, spec);
    expect(values[0].value).toBeNull();
  });

  it('should handle deeply nested source columns', () => {
    const spec = createPartitionSpec([
      identityField('user.address.country'),
    ]);

    const values = computePartitionValues({
      user: {
        address: {
          country: 'Japan',
        },
      },
    }, spec);

    expect(values[0].value).toBe('Japan');
  });

  it('should return null for partially missing nested paths', () => {
    const spec = createPartitionSpec([
      identityField('user.address.country'),
    ]);

    const values = computePartitionValues({
      user: {
        // address is missing
      },
    }, spec);

    expect(values[0].value).toBeNull();
  });

  it('should convert numbers to numbers in identity transform', () => {
    const spec = createPartitionSpec([
      identityField('count'),
    ]);

    const values = computePartitionValues({ count: 42 }, spec);
    expect(values[0].value).toBe(42);
    expect(typeof values[0].value).toBe('number');
  });
});
