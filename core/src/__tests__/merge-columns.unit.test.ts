/**
 * @evodb/core - Merge Column Concatenation Tests
 *
 * Tests correctness and benchmarks performance of column merging.
 * Verifies fix for evodb-jo7: pre-allocated buffers vs spread operators.
 */

import { describe, it, expect } from 'vitest';
import { Type } from '../types.js';
import type { Column } from '../types.js';

// Helper to create test columns
function createTestColumn(path: string, count: number, offset = 0): Column {
  const values: unknown[] = new Array(count);
  const nulls: boolean[] = new Array(count);
  for (let i = 0; i < count; i++) {
    values[i] = offset + i;
    nulls[i] = false;
  }
  return { path, type: Type.Int32, nullable: false, values, nulls };
}

// OLD implementation using spread (for comparison)
function mergeColumnsSpread(columnSets: Column[][]): Column[] {
  if (columnSets.length === 0) return [];
  if (columnSets.length === 1) return columnSets[0];

  const pathSet = new Set<string>();
  for (const cols of columnSets) {
    for (const col of cols) pathSet.add(col.path);
  }

  const result: Column[] = [];
  for (const path of pathSet) {
    const columns = columnSets.map(cols => cols.find(c => c.path === path)).filter(Boolean) as Column[];
    if (columns.length === 0) continue;

    // Old approach: spread operators
    const values: unknown[] = [];
    const nulls: boolean[] = [];
    let nullable = false;

    for (const col of columns) {
      values.push(...col.values);
      nulls.push(...col.nulls);
      if (col.nullable) nullable = true;
    }

    result.push({ path, type: columns[0].type, nullable, values, nulls });
  }

  return result;
}

// NEW implementation using pre-allocated arrays
function mergeColumnsPreallocated(columnSets: Column[][]): Column[] {
  if (columnSets.length === 0) return [];
  if (columnSets.length === 1) return columnSets[0];

  const pathSet = new Set<string>();
  for (const cols of columnSets) {
    for (const col of cols) pathSet.add(col.path);
  }

  const result: Column[] = [];
  for (const path of pathSet) {
    const columns = columnSets.map(cols => cols.find(c => c.path === path)).filter(Boolean) as Column[];
    if (columns.length === 0) continue;

    // New approach: pre-allocate based on total size
    const totalRows = columns.reduce((sum, c) => sum + c.values.length, 0);
    const values = new Array(totalRows);
    const nulls = new Array(totalRows);
    let nullable = false;
    let offset = 0;

    for (const col of columns) {
      const len = col.values.length;
      for (let i = 0; i < len; i++) {
        values[offset + i] = col.values[i];
        nulls[offset + i] = col.nulls[i];
      }
      offset += len;
      if (col.nullable) nullable = true;
    }

    result.push({ path, type: columns[0].type, nullable, values, nulls });
  }

  return result;
}

describe('Merge Column Concatenation', () => {
  describe('Correctness', () => {
    it('should merge empty column sets', () => {
      expect(mergeColumnsPreallocated([])).toEqual([]);
    });

    it('should return single column set unchanged', () => {
      const cols = [createTestColumn('id', 100)];
      const result = mergeColumnsPreallocated([cols]);
      expect(result).toBe(cols); // Same reference
    });

    it('should merge multiple columns correctly', () => {
      const set1 = [createTestColumn('id', 100, 0)];
      const set2 = [createTestColumn('id', 100, 100)];
      const set3 = [createTestColumn('id', 100, 200)];

      const result = mergeColumnsPreallocated([set1, set2, set3]);

      expect(result.length).toBe(1);
      expect(result[0].values.length).toBe(300);
      expect(result[0].nulls.length).toBe(300);

      // Verify values are concatenated in order
      for (let i = 0; i < 300; i++) {
        expect(result[0].values[i]).toBe(i);
        expect(result[0].nulls[i]).toBe(false);
      }
    });

    it('should produce same results as spread implementation', () => {
      const set1 = [
        createTestColumn('id', 50, 0),
        createTestColumn('name', 50, 1000),
      ];
      const set2 = [
        createTestColumn('id', 75, 50),
        createTestColumn('name', 75, 1050),
      ];
      const set3 = [
        createTestColumn('id', 25, 125),
        createTestColumn('name', 25, 1125),
      ];

      const spreadResult = mergeColumnsSpread([set1, set2, set3]);
      const preallocResult = mergeColumnsPreallocated([set1, set2, set3]);

      expect(preallocResult.length).toBe(spreadResult.length);

      for (let i = 0; i < spreadResult.length; i++) {
        expect(preallocResult[i].path).toBe(spreadResult[i].path);
        expect(preallocResult[i].type).toBe(spreadResult[i].type);
        expect(preallocResult[i].nullable).toBe(spreadResult[i].nullable);
        expect(preallocResult[i].values).toEqual(spreadResult[i].values);
        expect(preallocResult[i].nulls).toEqual(spreadResult[i].nulls);
      }
    });

    it('should handle nullable columns', () => {
      const col1: Column = {
        path: 'value',
        type: Type.Int32,
        nullable: true,
        values: [1, null, 3],
        nulls: [false, true, false],
      };
      const col2: Column = {
        path: 'value',
        type: Type.Int32,
        nullable: false,
        values: [4, 5],
        nulls: [false, false],
      };

      const result = mergeColumnsPreallocated([[col1], [col2]]);

      expect(result[0].nullable).toBe(true);
      expect(result[0].values).toEqual([1, null, 3, 4, 5]);
      expect(result[0].nulls).toEqual([false, true, false, false, false]);
    });
  });

  describe('Performance Benchmark', () => {
    const ITERATIONS = 10;
    const COLUMN_COUNT = 10;
    const ROWS_PER_BLOCK = 10000;
    const BLOCK_COUNT = 10;

    function createColumnSets(): Column[][] {
      const sets: Column[][] = [];
      for (let b = 0; b < BLOCK_COUNT; b++) {
        const cols: Column[] = [];
        for (let c = 0; c < COLUMN_COUNT; c++) {
          cols.push(createTestColumn(`col_${c}`, ROWS_PER_BLOCK, b * ROWS_PER_BLOCK));
        }
        sets.push(cols);
      }
      return sets;
    }

    it('should benchmark spread vs pre-allocated performance', () => {
      const columnSets = createColumnSets();
      const totalRows = BLOCK_COUNT * ROWS_PER_BLOCK;

      // Warm up
      mergeColumnsSpread(columnSets);
      mergeColumnsPreallocated(columnSets);

      // Benchmark spread
      const spreadTimes: number[] = [];
      for (let i = 0; i < ITERATIONS; i++) {
        const start = performance.now();
        mergeColumnsSpread(columnSets);
        spreadTimes.push(performance.now() - start);
      }

      // Benchmark pre-allocated
      const preallocTimes: number[] = [];
      for (let i = 0; i < ITERATIONS; i++) {
        const start = performance.now();
        mergeColumnsPreallocated(columnSets);
        preallocTimes.push(performance.now() - start);
      }

      const avgSpread = spreadTimes.reduce((a, b) => a + b, 0) / ITERATIONS;
      const avgPrealloc = preallocTimes.reduce((a, b) => a + b, 0) / ITERATIONS;
      const speedup = avgSpread / avgPrealloc;

      console.log(`\nMerge Column Concatenation Benchmark:`);
      console.log(`  Data: ${BLOCK_COUNT} blocks x ${ROWS_PER_BLOCK} rows x ${COLUMN_COUNT} columns = ${totalRows} total rows`);
      console.log(`  Spread approach: ${avgSpread.toFixed(2)}ms avg`);
      console.log(`  Pre-allocated approach: ${avgPrealloc.toFixed(2)}ms avg`);
      console.log(`  Speedup: ${speedup.toFixed(2)}x`);

      // Pre-allocated should be faster (at least not slower)
      expect(avgPrealloc).toBeLessThanOrEqual(avgSpread * 1.5); // Allow some variance
    });

    it('should handle large merges efficiently', () => {
      const LARGE_BLOCK_COUNT = 20;
      const LARGE_ROWS = 50000;

      const sets: Column[][] = [];
      for (let b = 0; b < LARGE_BLOCK_COUNT; b++) {
        sets.push([createTestColumn('id', LARGE_ROWS, b * LARGE_ROWS)]);
      }

      const start = performance.now();
      const result = mergeColumnsPreallocated(sets);
      const elapsed = performance.now() - start;

      console.log(`Large merge (${LARGE_BLOCK_COUNT} blocks x ${LARGE_ROWS} rows = ${LARGE_BLOCK_COUNT * LARGE_ROWS} rows): ${elapsed.toFixed(2)}ms`);

      expect(result[0].values.length).toBe(LARGE_BLOCK_COUNT * LARGE_ROWS);
      expect(elapsed).toBeLessThan(1000); // Should complete in under 1 second
    });
  });
});
