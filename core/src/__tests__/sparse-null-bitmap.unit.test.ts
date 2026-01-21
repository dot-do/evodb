/**
 * @evodb/core - Sparse Null Bitmap Optimization Tests (TDD)
 *
 * Issue: evodb-qp6 - Optimize null bitmap for sparse data
 *
 * Problem: unpackBits() in encode.ts creates a full boolean array regardless of
 * null density. For sparse null columns (few nulls in large arrays), this is wasteful.
 *
 * Solution:
 * 1. Sparse representation for sparse null data (store null indices instead of full bitmap)
 * 2. Early-exit optimization for dense data (all-null or no-null cases)
 * 3. Lazy iteration API for memory-efficient processing
 */

import { describe, it, expect } from 'vitest';
import {
  unpackBits,
  unpackBitsSparse,
  SparseNullSet,
  isAllNull,
  hasNoNulls,
  SPARSE_NULL_THRESHOLD,
  encode,
  decode,
  Type,
  type Column,
} from '../index.js';

// =============================================================================
// 1. SPARSE NULL COLUMN TESTS
// =============================================================================

describe('Sparse Null Bitmap Optimization', () => {
  describe('Current unpackBits baseline behavior', () => {
    it('should correctly unpack sparse null bitmap', () => {
      // 1000 elements with only 3 nulls at positions 10, 500, 999
      const count = 1000;
      const bitmap = new Uint8Array(Math.ceil(count / 8));

      // Set null bits at positions 10, 500, 999
      bitmap[10 >>> 3] |= 1 << (10 & 7);   // position 10
      bitmap[500 >>> 3] |= 1 << (500 & 7); // position 500
      bitmap[999 >>> 3] |= 1 << (999 & 7); // position 999

      const bits = unpackBits(bitmap, count);

      // Verify nulls are at correct positions
      expect(bits[10]).toBe(true);
      expect(bits[500]).toBe(true);
      expect(bits[999]).toBe(true);

      // Verify all other positions are false
      expect(bits[0]).toBe(false);
      expect(bits[9]).toBe(false);
      expect(bits[11]).toBe(false);
      expect(bits[499]).toBe(false);
      expect(bits[501]).toBe(false);
      expect(bits[998]).toBe(false);

      // Count total nulls
      const nullCount = bits.filter(b => b).length;
      expect(nullCount).toBe(3);
    });

    it('should handle all-null bitmap', () => {
      const count = 100;
      const bitmap = new Uint8Array(Math.ceil(count / 8));
      // Set all bits to 1
      bitmap.fill(0xFF);

      const bits = unpackBits(bitmap, count);

      // All positions should be true (null)
      expect(bits.every(b => b)).toBe(true);
      expect(bits.length).toBe(count);
    });

    it('should handle no-null bitmap', () => {
      const count = 100;
      const bitmap = new Uint8Array(Math.ceil(count / 8));
      // All zeros (no nulls)

      const bits = unpackBits(bitmap, count);

      // All positions should be false (not null)
      expect(bits.every(b => !b)).toBe(true);
      expect(bits.length).toBe(count);
    });
  });

  describe('Sparse null set representation', () => {
    it('should provide efficient sparse representation for few nulls', () => {
      const count = 10000;
      const bitmap = new Uint8Array(Math.ceil(count / 8));

      // Set 5 null bits in 10000 elements (0.05% null rate)
      const nullPositions = [42, 1337, 5000, 7777, 9999];
      for (const pos of nullPositions) {
        bitmap[pos >>> 3] |= 1 << (pos & 7);
      }

      const sparse = unpackBitsSparse(bitmap, count);

      // Should detect as sparse and return SparseNullSet
      expect(sparse).toBeInstanceOf(SparseNullSet);
      expect((sparse as SparseNullSet).nullCount).toBe(5);
      expect((sparse as SparseNullSet).totalCount).toBe(count);

      // Should correctly identify null positions
      expect((sparse as SparseNullSet).isNull(42)).toBe(true);
      expect((sparse as SparseNullSet).isNull(1337)).toBe(true);
      expect((sparse as SparseNullSet).isNull(5000)).toBe(true);
      expect((sparse as SparseNullSet).isNull(7777)).toBe(true);
      expect((sparse as SparseNullSet).isNull(9999)).toBe(true);

      // Non-null positions
      expect((sparse as SparseNullSet).isNull(0)).toBe(false);
      expect((sparse as SparseNullSet).isNull(43)).toBe(false);
      expect((sparse as SparseNullSet).isNull(9998)).toBe(false);
    });

    it('should iterate only null indices efficiently', () => {
      const count = 100000;
      const bitmap = new Uint8Array(Math.ceil(count / 8));

      const expectedNulls = [100, 5000, 50000, 99999];
      for (const pos of expectedNulls) {
        bitmap[pos >>> 3] |= 1 << (pos & 7);
      }

      const sparse = unpackBitsSparse(bitmap, count) as SparseNullSet;
      const foundNulls: number[] = [];

      for (const idx of sparse.nullIndices()) {
        foundNulls.push(idx);
      }

      expect(foundNulls).toEqual(expectedNulls);
    });

    it('should fall back to dense array for high null rates', () => {
      const count = 100;
      const bitmap = new Uint8Array(Math.ceil(count / 8));

      // Set 60% as null - should not use sparse representation
      for (let i = 0; i < 60; i++) {
        bitmap[i >>> 3] |= 1 << (i & 7);
      }

      const result = unpackBitsSparse(bitmap, count);

      // For dense data, should return a regular boolean array
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(count);
    });
  });

  describe('Early exit optimizations', () => {
    it('should detect all-null bitmap in O(n/8) instead of O(n)', () => {
      const count = 10000;
      const bitmap = new Uint8Array(Math.ceil(count / 8));
      bitmap.fill(0xFF);

      // Handle the partial byte at the end
      const partialBits = count & 7;
      if (partialBits > 0) {
        // Last byte should have only the valid bits set
        bitmap[bitmap.length - 1] = (1 << partialBits) - 1;
      }

      const result = isAllNull(bitmap, count);
      expect(result).toBe(true);
    });

    it('should detect no-null bitmap in O(n/8) instead of O(n)', () => {
      const count = 10000;
      const bitmap = new Uint8Array(Math.ceil(count / 8));
      // All zeros = no nulls

      const result = hasNoNulls(bitmap, count);
      expect(result).toBe(true);
    });

    it('should early-exit on first non-matching byte', () => {
      const count = 10000;
      const bitmap = new Uint8Array(Math.ceil(count / 8));

      // Set just one bit in the middle
      bitmap[500 >>> 3] |= 1 << (500 & 7);

      // Neither all-null nor no-null
      expect(isAllNull(bitmap, count)).toBe(false);
      expect(hasNoNulls(bitmap, count)).toBe(false);
    });
  });

  describe('Memory efficiency', () => {
    it('should use less memory for sparse null data', () => {
      const count = 100000;
      const bitmap = new Uint8Array(Math.ceil(count / 8));

      // Only 10 nulls in 100K elements
      const nullPositions = [1, 100, 1000, 5000, 10000, 25000, 50000, 75000, 90000, 99999];
      for (const pos of nullPositions) {
        bitmap[pos >>> 3] |= 1 << (pos & 7);
      }

      const sparse = unpackBitsSparse(bitmap, count);

      // SparseNullSet should store only null indices (Set of 10 numbers)
      // vs boolean array of 100K elements
      expect(sparse).toBeInstanceOf(SparseNullSet);

      // Memory: ~10 * 8 bytes for Set vs ~100K bytes for boolean array
      // The sparse representation should be dramatically smaller
      expect((sparse as SparseNullSet).nullCount).toBe(10);
    });

    it('should handle empty null set (no nulls)', () => {
      const count = 10000;
      const bitmap = new Uint8Array(Math.ceil(count / 8));
      // All zeros = no nulls

      const sparse = unpackBitsSparse(bitmap, count);

      expect(sparse).toBeInstanceOf(SparseNullSet);
      expect((sparse as SparseNullSet).nullCount).toBe(0);
      expect((sparse as SparseNullSet).isNull(0)).toBe(false);
      expect((sparse as SparseNullSet).isNull(9999)).toBe(false);
    });
  });

  describe('SparseNullSet API', () => {
    it('should provide efficient null checking', () => {
      const nullIndices = new Set([10, 20, 30, 40, 50]);
      const sparse = new SparseNullSet(nullIndices, 100);

      // Check null positions
      expect(sparse.isNull(10)).toBe(true);
      expect(sparse.isNull(20)).toBe(true);
      expect(sparse.isNull(50)).toBe(true);

      // Check non-null positions
      expect(sparse.isNull(0)).toBe(false);
      expect(sparse.isNull(11)).toBe(false);
      expect(sparse.isNull(99)).toBe(false);
    });

    it('should provide toArray() for compatibility', () => {
      const nullIndices = new Set([1, 3, 5]);
      const sparse = new SparseNullSet(nullIndices, 7);

      const array = sparse.toArray();
      expect(array).toEqual([false, true, false, true, false, true, false]);
    });

    it('should support length property', () => {
      const sparse = new SparseNullSet(new Set([1, 2, 3]), 1000);
      expect(sparse.length).toBe(1000);
      expect(sparse.totalCount).toBe(1000);
    });

    it('should be iterable like an array', () => {
      const nullIndices = new Set([0, 2, 4]);
      const sparse = new SparseNullSet(nullIndices, 5);

      const values: boolean[] = [];
      for (const isNull of sparse) {
        values.push(isNull);
      }

      expect(values).toEqual([true, false, true, false, true]);
    });
  });

  describe('Threshold-based selection', () => {
    it('should use sparse representation below 10% null rate', () => {
      // Default threshold should be around 10%
      expect(SPARSE_NULL_THRESHOLD).toBeLessThanOrEqual(0.1);

      const count = 1000;
      const bitmap = new Uint8Array(Math.ceil(count / 8));

      // Set 5% nulls (50 out of 1000)
      for (let i = 0; i < 50; i++) {
        const pos = i * 20; // Spread them out
        bitmap[pos >>> 3] |= 1 << (pos & 7);
      }

      const result = unpackBitsSparse(bitmap, count);
      expect(result).toBeInstanceOf(SparseNullSet);
    });

    it('should use dense array above threshold', () => {
      const count = 100;
      const bitmap = new Uint8Array(Math.ceil(count / 8));

      // Set 50% nulls - well above threshold
      for (let i = 0; i < 50; i++) {
        bitmap[i >>> 3] |= 1 << (i & 7);
      }

      const result = unpackBitsSparse(bitmap, count);

      // Should return regular array, not SparseNullSet
      expect(result).not.toBeInstanceOf(SparseNullSet);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Integration with decode', () => {
    it('should work seamlessly with existing decode path', () => {
      // Create a column with sparse nulls
      const values: (number | null)[] = new Array(1000).fill(42);
      const nulls: boolean[] = new Array(1000).fill(false);

      // Set only 3 nulls
      nulls[100] = true; values[100] = null;
      nulls[500] = true; values[500] = null;
      nulls[900] = true; values[900] = null;

      const column: Column = {
        path: 'sparse_null_col',
        type: Type.Int32,
        nullable: true,
        values: values as unknown[],
        nulls,
      };

      const [encoded] = encode([column]);
      const decoded = decode(encoded, 1000);

      // Verify nulls are preserved correctly
      expect(decoded.nulls[100]).toBe(true);
      expect(decoded.nulls[500]).toBe(true);
      expect(decoded.nulls[900]).toBe(true);
      expect(decoded.nulls[0]).toBe(false);
      expect(decoded.nulls[101]).toBe(false);
    });
  });
});

// =============================================================================
// 2. PERFORMANCE BENCHMARKS (optional, for validation)
// =============================================================================

describe('Sparse Null Bitmap Performance', () => {
  it('should be faster than full unpack for sparse data', () => {
    const count = 100000;
    const bitmap = new Uint8Array(Math.ceil(count / 8));

    // Only 10 nulls
    for (let i = 0; i < 10; i++) {
      const pos = i * 10000;
      bitmap[pos >>> 3] |= 1 << (pos & 7);
    }

    // Warm up
    unpackBits(bitmap, count);
    unpackBitsSparse(bitmap, count);

    // Benchmark full unpack
    const fullStart = performance.now();
    for (let i = 0; i < 100; i++) {
      unpackBits(bitmap, count);
    }
    const fullTime = performance.now() - fullStart;

    // Benchmark sparse unpack
    const sparseStart = performance.now();
    for (let i = 0; i < 100; i++) {
      unpackBitsSparse(bitmap, count);
    }
    const sparseTime = performance.now() - sparseStart;

    // Sparse should be faster for this workload
    // Allow some tolerance since it depends on runtime conditions
    console.log(`Full unpack: ${fullTime}ms, Sparse unpack: ${sparseTime}ms`);

    // At minimum, sparse should not be significantly slower
    // Handle edge case where times are too small to measure reliably
    if (fullTime > 0) {
      expect(sparseTime).toBeLessThan(fullTime * 2);
    }
  });

  it('should handle isNull checks efficiently', () => {
    const count = 100000;
    const bitmap = new Uint8Array(Math.ceil(count / 8));

    // Sparse nulls
    const nullPositions = [100, 1000, 10000, 50000, 99000];
    for (const pos of nullPositions) {
      bitmap[pos >>> 3] |= 1 << (pos & 7);
    }

    const fullArray = unpackBits(bitmap, count);
    const sparse = unpackBitsSparse(bitmap, count) as SparseNullSet;

    // Benchmark random access
    const testIndices = [0, 100, 5000, 10000, 99999];

    const fullStart = performance.now();
    for (let i = 0; i < 10000; i++) {
      for (const idx of testIndices) {
        const _ = fullArray[idx];
      }
    }
    const fullTime = performance.now() - fullStart;

    const sparseStart = performance.now();
    for (let i = 0; i < 10000; i++) {
      for (const idx of testIndices) {
        const _ = sparse.isNull(idx);
      }
    }
    const sparseTime = performance.now() - sparseStart;

    console.log(`Array access: ${fullTime}ms, Sparse isNull: ${sparseTime}ms`);

    // Both should be fast, sparse should be comparable
    // Set.has() is O(1) just like array access
    // Handle edge case where times are too small to measure reliably
    if (fullTime > 0) {
      expect(sparseTime).toBeLessThan(fullTime * 3);
    }
  });
});
