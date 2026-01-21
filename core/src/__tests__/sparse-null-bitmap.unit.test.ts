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
  unpackBitsDense,
  unpackBitsSparse,
  SparseNullSet,
  isAllNull,
  hasNoNulls,
  SPARSE_NULL_THRESHOLD,
  isNullAt,
  toNullArray,
  hasAnyNulls,
  countNulls,
  encode,
  decode,
  Type,
  type Column,
  type NullBitmap,
} from '../index.js';

// =============================================================================
// 1. SPARSE NULL COLUMN TESTS
// =============================================================================

describe('Sparse Null Bitmap Optimization', () => {
  // Issue evodb-80q: unpackBits now uses smart selection (sparse for < 10% null rate)
  describe('Smart unpackBits default selection (evodb-80q)', () => {
    it('should return SparseNullSet for sparse null data (< 10%)', () => {
      // 1000 elements with only 3 nulls (0.3% null rate) - should use sparse
      const count = 1000;
      const bitmap = new Uint8Array(Math.ceil(count / 8));

      // Set null bits at positions 10, 500, 999
      bitmap[10 >>> 3] |= 1 << (10 & 7);
      bitmap[500 >>> 3] |= 1 << (500 & 7);
      bitmap[999 >>> 3] |= 1 << (999 & 7);

      const nulls = unpackBits(bitmap, count);

      // Should return SparseNullSet for sparse data
      expect(nulls).toBeInstanceOf(SparseNullSet);

      // Verify nulls are at correct positions using isNullAt helper
      expect(isNullAt(nulls, 10)).toBe(true);
      expect(isNullAt(nulls, 500)).toBe(true);
      expect(isNullAt(nulls, 999)).toBe(true);

      // Verify non-null positions
      expect(isNullAt(nulls, 0)).toBe(false);
      expect(isNullAt(nulls, 9)).toBe(false);
      expect(isNullAt(nulls, 11)).toBe(false);
      expect(isNullAt(nulls, 499)).toBe(false);
      expect(isNullAt(nulls, 501)).toBe(false);
      expect(isNullAt(nulls, 998)).toBe(false);

      // Count total nulls
      expect(countNulls(nulls)).toBe(3);
    });

    it('should return boolean[] for dense null data (> 10%)', () => {
      // 100 elements with 50 nulls (50% null rate) - should use dense
      const count = 100;
      const bitmap = new Uint8Array(Math.ceil(count / 8));

      // Set first 50 positions as null
      for (let i = 0; i < 50; i++) {
        bitmap[i >>> 3] |= 1 << (i & 7);
      }

      const nulls = unpackBits(bitmap, count);

      // Should return boolean[] for dense data
      expect(Array.isArray(nulls)).toBe(true);
      expect(nulls).not.toBeInstanceOf(SparseNullSet);
      expect(countNulls(nulls)).toBe(50);
    });

    it('should handle all-null bitmap (returns dense array)', () => {
      const count = 100;
      const bitmap = new Uint8Array(Math.ceil(count / 8));
      bitmap.fill(0xFF);

      const nulls = unpackBits(bitmap, count);

      // 100% null rate - should use dense array
      expect(Array.isArray(nulls)).toBe(true);
      expect(countNulls(nulls)).toBe(count);
    });

    it('should handle no-null bitmap (returns SparseNullSet)', () => {
      const count = 100;
      const bitmap = new Uint8Array(Math.ceil(count / 8));
      // All zeros (no nulls) - 0% null rate, should use sparse

      const nulls = unpackBits(bitmap, count);

      // 0% null rate - should use SparseNullSet
      expect(nulls).toBeInstanceOf(SparseNullSet);
      expect(countNulls(nulls)).toBe(0);
      expect(hasAnyNulls(nulls)).toBe(false);
      expect((nulls as SparseNullSet).length).toBe(count);
    });

    it('should use threshold of 10% for sparse selection', () => {
      // Test exactly at the 10% boundary
      const count = 100;
      const bitmap = new Uint8Array(Math.ceil(count / 8));

      // Set exactly 10 nulls (10% null rate)
      for (let i = 0; i < 10; i++) {
        bitmap[i >>> 3] |= 1 << (i & 7);
      }

      const nullsAt10Pct = unpackBits(bitmap, count);
      // At exactly 10% threshold, should use sparse (threshold is <=)
      expect(nullsAt10Pct).toBeInstanceOf(SparseNullSet);

      // Set 11 nulls (11% null rate)
      bitmap[10 >>> 3] |= 1 << (10 & 7);
      const nullsAt11Pct = unpackBits(bitmap, count);
      // Above threshold, should use dense
      expect(Array.isArray(nullsAt11Pct)).toBe(true);
      expect(nullsAt11Pct).not.toBeInstanceOf(SparseNullSet);
    });
  });

  describe('unpackBitsDense for backward compatibility', () => {
    it('should always return boolean[] regardless of sparsity', () => {
      const count = 1000;
      const bitmap = new Uint8Array(Math.ceil(count / 8));

      // Only 3 nulls (0.3% - very sparse)
      bitmap[10 >>> 3] |= 1 << (10 & 7);
      bitmap[500 >>> 3] |= 1 << (500 & 7);
      bitmap[999 >>> 3] |= 1 << (999 & 7);

      const bits = unpackBitsDense(bitmap, count);

      // Should always return boolean[]
      expect(Array.isArray(bits)).toBe(true);
      expect(bits).not.toBeInstanceOf(SparseNullSet);
      expect(bits.length).toBe(count);

      // Verify correct values
      expect(bits[10]).toBe(true);
      expect(bits[500]).toBe(true);
      expect(bits[999]).toBe(true);
      expect(bits[0]).toBe(false);
    });
  });

  describe('NullBitmap helper functions', () => {
    it('isNullAt should work with both SparseNullSet and boolean[]', () => {
      const count = 100;
      const bitmap = new Uint8Array(Math.ceil(count / 8));
      bitmap[10 >>> 3] |= 1 << (10 & 7);
      bitmap[50 >>> 3] |= 1 << (50 & 7);

      const sparse = unpackBitsSparse(bitmap, count) as SparseNullSet;
      const dense = unpackBitsDense(bitmap, count);

      expect(isNullAt(sparse, 10)).toBe(true);
      expect(isNullAt(sparse, 50)).toBe(true);
      expect(isNullAt(sparse, 0)).toBe(false);
      expect(isNullAt(sparse, 99)).toBe(false);

      expect(isNullAt(dense, 10)).toBe(true);
      expect(isNullAt(dense, 50)).toBe(true);
      expect(isNullAt(dense, 0)).toBe(false);
      expect(isNullAt(dense, 99)).toBe(false);
    });

    it('toNullArray should convert both representations to boolean[]', () => {
      const count = 100;
      const bitmap = new Uint8Array(Math.ceil(count / 8));
      bitmap[10 >>> 3] |= 1 << (10 & 7);

      const sparse = unpackBitsSparse(bitmap, count) as SparseNullSet;
      const dense = unpackBitsDense(bitmap, count);

      const fromSparse = toNullArray(sparse);
      const fromDense = toNullArray(dense);

      expect(Array.isArray(fromSparse)).toBe(true);
      expect(Array.isArray(fromDense)).toBe(true);
      expect(fromSparse).toEqual(fromDense);
      expect(fromSparse[10]).toBe(true);
      expect(fromSparse[0]).toBe(false);
    });

    it('hasAnyNulls should work with both representations', () => {
      const count = 100;
      const emptyBitmap = new Uint8Array(Math.ceil(count / 8));
      const nullBitmap = new Uint8Array(Math.ceil(count / 8));
      nullBitmap[10 >>> 3] |= 1 << (10 & 7);

      const sparseEmpty = unpackBitsSparse(emptyBitmap, count);
      const sparseWithNulls = unpackBitsSparse(nullBitmap, count);
      const denseEmpty = unpackBitsDense(emptyBitmap, count);
      const denseWithNulls = unpackBitsDense(nullBitmap, count);

      expect(hasAnyNulls(sparseEmpty)).toBe(false);
      expect(hasAnyNulls(sparseWithNulls)).toBe(true);
      expect(hasAnyNulls(denseEmpty)).toBe(false);
      expect(hasAnyNulls(denseWithNulls)).toBe(true);
    });

    it('countNulls should work with both representations', () => {
      const count = 100;
      const bitmap = new Uint8Array(Math.ceil(count / 8));
      bitmap[10 >>> 3] |= 1 << (10 & 7);
      bitmap[20 >>> 3] |= 1 << (20 & 7);
      bitmap[30 >>> 3] |= 1 << (30 & 7);

      const sparse = unpackBitsSparse(bitmap, count);
      const dense = unpackBitsDense(bitmap, count);

      expect(countNulls(sparse)).toBe(3);
      expect(countNulls(dense)).toBe(3);
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

  describe('Integration with decode (evodb-80q)', () => {
    it('should return SparseNullSet for sparse data after decode', () => {
      // Create a column with sparse nulls (3 out of 1000 = 0.3%)
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

      // With evodb-80q, decode() now uses smart selection
      // 0.3% null rate should use SparseNullSet
      expect(decoded.nulls).toBeInstanceOf(SparseNullSet);

      // Verify nulls are preserved correctly using isNullAt helper
      expect(isNullAt(decoded.nulls, 100)).toBe(true);
      expect(isNullAt(decoded.nulls, 500)).toBe(true);
      expect(isNullAt(decoded.nulls, 900)).toBe(true);
      expect(isNullAt(decoded.nulls, 0)).toBe(false);
      expect(isNullAt(decoded.nulls, 101)).toBe(false);
    });

    it('should return boolean[] for dense data after decode', () => {
      // Create a column with dense nulls (60 out of 100 = 60%)
      const values: (number | null)[] = new Array(100).fill(null);
      const nulls: boolean[] = new Array(100).fill(true);

      // Set first 40 as non-null
      for (let i = 0; i < 40; i++) {
        nulls[i] = false;
        values[i] = i;
      }

      const column: Column = {
        path: 'dense_null_col',
        type: Type.Int32,
        nullable: true,
        values: values as unknown[],
        nulls,
      };

      const [encoded] = encode([column]);
      const decoded = decode(encoded, 100);

      // 60% null rate should use dense boolean[]
      expect(Array.isArray(decoded.nulls)).toBe(true);
      expect(decoded.nulls).not.toBeInstanceOf(SparseNullSet);

      // Verify nulls are preserved correctly
      expect(isNullAt(decoded.nulls, 0)).toBe(false);
      expect(isNullAt(decoded.nulls, 39)).toBe(false);
      expect(isNullAt(decoded.nulls, 40)).toBe(true);
      expect(isNullAt(decoded.nulls, 99)).toBe(true);
    });

    it('decoded Column nulls should support isNullAt helper', () => {
      // Ensure the decoded Column.nulls works with all helper functions
      const values: (number | null)[] = new Array(100).fill(42);
      const nulls: boolean[] = new Array(100).fill(false);
      nulls[10] = true; values[10] = null;
      nulls[50] = true; values[50] = null;

      const column: Column = {
        path: 'test_col',
        type: Type.Int32,
        nullable: true,
        values: values as unknown[],
        nulls,
      };

      const [encoded] = encode([column]);
      const decoded = decode(encoded, 100);

      // Test all helper functions work with decoded nulls
      expect(isNullAt(decoded.nulls, 10)).toBe(true);
      expect(isNullAt(decoded.nulls, 50)).toBe(true);
      expect(isNullAt(decoded.nulls, 0)).toBe(false);
      expect(hasAnyNulls(decoded.nulls)).toBe(true);
      expect(countNulls(decoded.nulls)).toBe(2);

      // toNullArray should always return boolean[]
      const nullArray = toNullArray(decoded.nulls);
      expect(Array.isArray(nullArray)).toBe(true);
      expect(nullArray[10]).toBe(true);
      expect(nullArray[50]).toBe(true);
    });
  });
});

// =============================================================================
// 2. PERFORMANCE BENCHMARKS (optional, for validation)
// =============================================================================

describe('Sparse Null Bitmap Performance', () => {
  it('smart unpackBits should be comparable to or faster than dense for sparse data', () => {
    const count = 100000;
    const bitmap = new Uint8Array(Math.ceil(count / 8));

    // Only 10 nulls (0.01% null rate - very sparse)
    for (let i = 0; i < 10; i++) {
      const pos = i * 10000;
      bitmap[pos >>> 3] |= 1 << (pos & 7);
    }

    // Warm up
    unpackBitsDense(bitmap, count);
    unpackBits(bitmap, count);

    // Benchmark dense unpack (always returns boolean[])
    const denseStart = performance.now();
    for (let i = 0; i < 100; i++) {
      unpackBitsDense(bitmap, count);
    }
    const denseTime = performance.now() - denseStart;

    // Benchmark smart unpack (returns SparseNullSet for sparse data)
    const smartStart = performance.now();
    for (let i = 0; i < 100; i++) {
      unpackBits(bitmap, count);
    }
    const smartTime = performance.now() - smartStart;

    // Smart unpack should be comparable or faster for sparse workloads
    console.log(`Dense unpack: ${denseTime}ms, Smart unpack: ${smartTime}ms`);

    // Handle edge case where times are too small to measure reliably
    if (denseTime > 0) {
      expect(smartTime).toBeLessThan(denseTime * 2);
    }
  });

  it('should handle isNull checks efficiently with isNullAt helper', () => {
    const count = 100000;
    const bitmap = new Uint8Array(Math.ceil(count / 8));

    // Sparse nulls
    const nullPositions = [100, 1000, 10000, 50000, 99000];
    for (const pos of nullPositions) {
      bitmap[pos >>> 3] |= 1 << (pos & 7);
    }

    const denseArray = unpackBitsDense(bitmap, count);
    const smart = unpackBits(bitmap, count);

    // Benchmark random access
    const testIndices = [0, 100, 5000, 10000, 99999];

    const denseStart = performance.now();
    for (let i = 0; i < 10000; i++) {
      for (const idx of testIndices) {
        const _ = denseArray[idx];
      }
    }
    const denseTime = performance.now() - denseStart;

    const smartStart = performance.now();
    for (let i = 0; i < 10000; i++) {
      for (const idx of testIndices) {
        const _ = isNullAt(smart, idx);
      }
    }
    const smartTime = performance.now() - smartStart;

    console.log(`Dense array access: ${denseTime}ms, Smart isNullAt: ${smartTime}ms`);

    // Both should be fast, smart should be comparable
    // Handle edge case where times are too small to measure reliably
    if (denseTime > 0) {
      // Allow 5x tolerance for timing variability in tests
      expect(smartTime).toBeLessThan(denseTime * 5 + 10);
    }
  });
});
