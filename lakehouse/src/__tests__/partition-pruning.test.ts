/**
 * @evodb/lakehouse - Partition Pruning Tests
 *
 * Tests for partition specification and file pruning operations.
 */

import { describe, it, expect } from 'vitest';
import {
  createManifestFile,
  createFileStats,
  createPartitionSpec,
  identityField,
  yearField,
  monthField,
  dayField,
  pruneByPartition,
  pruneByColumnStats,
  pruneFiles,
  computePartitionValues,
  type ManifestFile,
  type PartitionValue,
} from '../index.js';

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

describe('Partition Pruning', () => {
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
