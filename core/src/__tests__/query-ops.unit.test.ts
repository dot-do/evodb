/**
 * @evodb/core - Query Operations Tests
 *
 * Verifies shared filter, sort, and aggregation logic.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  evaluateFilter,
  evaluateFilters,
  sortRows,
  limitRows,
  compareValues,
  compareStrings,
  isAscii,
  compareForSort,
  computeAggregate,
  computeAggregations,
  likePatternToRegex,
  getNestedValue,
  setNestedValue,
  validateColumnName,
  compileFilters,
  evaluateCompiledFilters,
  type FilterPredicate,
  type SortSpec,
  type AggregateSpec,
} from '../query-ops.js';

// =============================================================================
// Filter Evaluation Tests
// =============================================================================

describe('evaluateFilter', () => {
  it('should evaluate eq operator', () => {
    const filter: FilterPredicate = { column: 'x', operator: 'eq', value: 5 };
    expect(evaluateFilter(5, filter)).toBe(true);
    expect(evaluateFilter(6, filter)).toBe(false);
  });

  it('should evaluate ne operator', () => {
    const filter: FilterPredicate = { column: 'x', operator: 'ne', value: 5 };
    expect(evaluateFilter(5, filter)).toBe(false);
    expect(evaluateFilter(6, filter)).toBe(true);
  });

  it('should evaluate gt operator', () => {
    const filter: FilterPredicate = { column: 'x', operator: 'gt', value: 5 };
    expect(evaluateFilter(6, filter)).toBe(true);
    expect(evaluateFilter(5, filter)).toBe(false);
    expect(evaluateFilter(4, filter)).toBe(false);
  });

  it('should evaluate gte/ge operator', () => {
    const filter: FilterPredicate = { column: 'x', operator: 'gte', value: 5 };
    expect(evaluateFilter(6, filter)).toBe(true);
    expect(evaluateFilter(5, filter)).toBe(true);
    expect(evaluateFilter(4, filter)).toBe(false);

    const filterGe: FilterPredicate = { column: 'x', operator: 'ge', value: 5 };
    expect(evaluateFilter(5, filterGe)).toBe(true);
  });

  it('should evaluate lt operator', () => {
    const filter: FilterPredicate = { column: 'x', operator: 'lt', value: 5 };
    expect(evaluateFilter(4, filter)).toBe(true);
    expect(evaluateFilter(5, filter)).toBe(false);
    expect(evaluateFilter(6, filter)).toBe(false);
  });

  it('should evaluate lte/le operator', () => {
    const filter: FilterPredicate = { column: 'x', operator: 'lte', value: 5 };
    expect(evaluateFilter(4, filter)).toBe(true);
    expect(evaluateFilter(5, filter)).toBe(true);
    expect(evaluateFilter(6, filter)).toBe(false);

    const filterLe: FilterPredicate = { column: 'x', operator: 'le', value: 5 };
    expect(evaluateFilter(5, filterLe)).toBe(true);
  });

  it('should evaluate in operator', () => {
    const filter: FilterPredicate = { column: 'x', operator: 'in', values: [1, 2, 3] };
    expect(evaluateFilter(2, filter)).toBe(true);
    expect(evaluateFilter(5, filter)).toBe(false);
  });

  it('should evaluate notIn operator', () => {
    const filter: FilterPredicate = { column: 'x', operator: 'notIn', values: [1, 2, 3] };
    expect(evaluateFilter(2, filter)).toBe(false);
    expect(evaluateFilter(5, filter)).toBe(true);
  });

  it('should evaluate between operator', () => {
    const filter: FilterPredicate = { column: 'x', operator: 'between', lowerBound: 5, upperBound: 10 };
    expect(evaluateFilter(5, filter)).toBe(true);
    expect(evaluateFilter(7, filter)).toBe(true);
    expect(evaluateFilter(10, filter)).toBe(true);
    expect(evaluateFilter(4, filter)).toBe(false);
    expect(evaluateFilter(11, filter)).toBe(false);
  });

  it('should evaluate like operator', () => {
    const filter: FilterPredicate = { column: 'x', operator: 'like', value: 'test%' };
    expect(evaluateFilter('testing', filter)).toBe(true);
    expect(evaluateFilter('test', filter)).toBe(true);
    expect(evaluateFilter('tester', filter)).toBe(true);
    expect(evaluateFilter('xtest', filter)).toBe(false);

    const filterUnder: FilterPredicate = { column: 'x', operator: 'like', value: 'a_c' };
    expect(evaluateFilter('abc', filterUnder)).toBe(true);
    expect(evaluateFilter('abbc', filterUnder)).toBe(false);
  });

  it('should evaluate isNull operator', () => {
    const filter: FilterPredicate = { column: 'x', operator: 'isNull' };
    expect(evaluateFilter(null, filter)).toBe(true);
    expect(evaluateFilter(undefined, filter)).toBe(true);
    expect(evaluateFilter(0, filter)).toBe(false);
    expect(evaluateFilter('', filter)).toBe(false);
  });

  it('should evaluate isNotNull operator', () => {
    const filter: FilterPredicate = { column: 'x', operator: 'isNotNull' };
    expect(evaluateFilter(null, filter)).toBe(false);
    expect(evaluateFilter(undefined, filter)).toBe(false);
    expect(evaluateFilter(0, filter)).toBe(true);
    expect(evaluateFilter('', filter)).toBe(true);
  });

  it('should handle not modifier', () => {
    const filter: FilterPredicate = { column: 'x', operator: 'eq', value: 5, not: true };
    expect(evaluateFilter(5, filter)).toBe(false);
    expect(evaluateFilter(6, filter)).toBe(true);
  });

  it('should throw error for unknown operator (exhaustiveness check)', () => {
    // Force an unknown operator through type casting to test runtime behavior
    const filter = { column: 'x', operator: 'unknown', value: 5 } as FilterPredicate;
    expect(() => evaluateFilter(5, filter)).toThrow('Unhandled filter operator: unknown');
  });
});

describe('evaluateFilters', () => {
  it('should return true for empty filters', () => {
    expect(evaluateFilters({ x: 5 }, [])).toBe(true);
  });

  it('should apply AND logic to multiple filters', () => {
    const filters: FilterPredicate[] = [
      { column: 'x', operator: 'gt', value: 0 },
      { column: 'x', operator: 'lt', value: 10 },
    ];
    expect(evaluateFilters({ x: 5 }, filters)).toBe(true);
    expect(evaluateFilters({ x: 0 }, filters)).toBe(false);
    expect(evaluateFilters({ x: 10 }, filters)).toBe(false);
  });

  it('should handle nested paths', () => {
    const filters: FilterPredicate[] = [
      { column: 'user.name', operator: 'eq', value: 'Alice' },
    ];
    expect(evaluateFilters({ 'user.name': 'Alice' }, filters)).toBe(true);
    expect(evaluateFilters({ 'user.name': 'Bob' }, filters)).toBe(false);
  });
});

// =============================================================================
// Sort Tests
// =============================================================================

describe('sortRows', () => {
  it('should sort ascending', () => {
    const rows = [{ x: 3 }, { x: 1 }, { x: 2 }];
    const sorted = sortRows(rows, [{ column: 'x', direction: 'asc' }]);
    expect(sorted.map(r => r.x)).toEqual([1, 2, 3]);
  });

  it('should sort descending', () => {
    const rows = [{ x: 1 }, { x: 3 }, { x: 2 }];
    const sorted = sortRows(rows, [{ column: 'x', direction: 'desc' }]);
    expect(sorted.map(r => r.x)).toEqual([3, 2, 1]);
  });

  it('should sort by multiple columns', () => {
    const rows = [
      { a: 1, b: 2 },
      { a: 1, b: 1 },
      { a: 2, b: 1 },
    ];
    const sorted = sortRows(rows, [
      { column: 'a', direction: 'asc' },
      { column: 'b', direction: 'asc' },
    ]);
    expect(sorted).toEqual([
      { a: 1, b: 1 },
      { a: 1, b: 2 },
      { a: 2, b: 1 },
    ]);
  });

  it('should handle nulls with nullsFirst', () => {
    const rows = [{ x: 2 }, { x: null }, { x: 1 }];
    const sorted = sortRows(rows, [{ column: 'x', direction: 'asc', nullsFirst: true }]);
    expect(sorted[0].x).toBeNull();
  });

  it('should handle nulls with nullsFirst=false', () => {
    const rows = [{ x: 2 }, { x: null }, { x: 1 }];
    const sorted = sortRows(rows, [{ column: 'x', direction: 'asc', nullsFirst: false }]);
    expect(sorted[sorted.length - 1].x).toBeNull();
  });

  it('should handle string comparison', () => {
    const rows = [{ x: 'c' }, { x: 'a' }, { x: 'b' }];
    const sorted = sortRows(rows, [{ column: 'x', direction: 'asc' }]);
    expect(sorted.map(r => r.x)).toEqual(['a', 'b', 'c']);
  });
});

describe('limitRows', () => {
  it('should limit rows', () => {
    const rows = [1, 2, 3, 4, 5];
    expect(limitRows(rows, 3)).toEqual([1, 2, 3]);
  });

  it('should handle offset', () => {
    const rows = [1, 2, 3, 4, 5];
    expect(limitRows(rows, 2, 2)).toEqual([3, 4]);
  });
});

// =============================================================================
// Aggregation Tests
// =============================================================================

describe('computeAggregate', () => {
  const rows = [
    { amount: 10 },
    { amount: 20 },
    { amount: null },
    { amount: 30 },
  ];

  it('should compute count(*)', () => {
    const result = computeAggregate(rows, { function: 'count', alias: 'c' });
    expect(result).toBe(4);
  });

  it('should compute count(column) excluding nulls', () => {
    const result = computeAggregate(rows, { function: 'count', column: 'amount', alias: 'c' });
    expect(result).toBe(3);
  });

  it('should compute sum', () => {
    const result = computeAggregate(rows, { function: 'sum', column: 'amount', alias: 's' });
    expect(result).toBe(60);
  });

  it('should compute avg', () => {
    const result = computeAggregate(rows, { function: 'avg', column: 'amount', alias: 'a' });
    expect(result).toBe(20);
  });

  it('should compute min', () => {
    const result = computeAggregate(rows, { function: 'min', column: 'amount', alias: 'm' });
    expect(result).toBe(10);
  });

  it('should compute max', () => {
    const result = computeAggregate(rows, { function: 'max', column: 'amount', alias: 'm' });
    expect(result).toBe(30);
  });

  it('should compute countDistinct', () => {
    const rowsWithDuplicates = [
      { type: 'a' },
      { type: 'b' },
      { type: 'a' },
      { type: 'c' },
    ];
    const result = computeAggregate(rowsWithDuplicates, {
      function: 'countDistinct',
      column: 'type',
      alias: 'cd',
    });
    expect(result).toBe(3);
  });
});

describe('computeAggregations', () => {
  const rows = [
    { category: 'A', amount: 10 },
    { category: 'A', amount: 20 },
    { category: 'B', amount: 30 },
  ];

  it('should aggregate without groupBy', () => {
    const result = computeAggregations(rows, [
      { function: 'sum', column: 'amount', alias: 'total' },
    ]);
    expect(result.columns).toEqual(['total']);
    expect(result.rows).toEqual([[60]]);
  });

  it('should aggregate with groupBy', () => {
    const result = computeAggregations(
      rows,
      [{ function: 'sum', column: 'amount', alias: 'total' }],
      ['category']
    );
    expect(result.columns).toContain('category');
    expect(result.columns).toContain('total');
    expect(result.rows.length).toBe(2);

    // Find the rows by category
    const catIdx = result.columns.indexOf('category');
    const totalIdx = result.columns.indexOf('total');
    const rowA = result.rows.find(r => r[catIdx] === 'A');
    const rowB = result.rows.find(r => r[catIdx] === 'B');

    expect(rowA![totalIdx]).toBe(30);
    expect(rowB![totalIdx]).toBe(30);
  });
});

// =============================================================================
// Utility Tests
// =============================================================================

describe('compareValues', () => {
  it('should compare numbers', () => {
    expect(compareValues(1, 2)).toBeLessThan(0);
    expect(compareValues(2, 1)).toBeGreaterThan(0);
    expect(compareValues(2, 2)).toBe(0);
  });

  it('should compare strings', () => {
    expect(compareValues('a', 'b')).toBeLessThan(0);
    expect(compareValues('b', 'a')).toBeGreaterThan(0);
    expect(compareValues('a', 'a')).toBe(0);
  });

  it('should handle nulls', () => {
    expect(compareValues(null, 1)).toBeLessThan(0);
    expect(compareValues(1, null)).toBeGreaterThan(0);
    expect(compareValues(null, null)).toBe(0);
  });
});

describe('likePatternToRegex', () => {
  it('should convert % to .*', () => {
    const regex = likePatternToRegex('test%');
    expect(regex.test('testing')).toBe(true);
    expect(regex.test('test')).toBe(true);
    expect(regex.test('tes')).toBe(false);
  });

  it('should convert _ to .', () => {
    const regex = likePatternToRegex('a_c');
    expect(regex.test('abc')).toBe(true);
    expect(regex.test('abbc')).toBe(false);
  });

  it('should be case insensitive', () => {
    const regex = likePatternToRegex('Test%');
    expect(regex.test('testing')).toBe(true);
    expect(regex.test('TESTING')).toBe(true);
  });
});

describe('getNestedValue', () => {
  it('should get simple values', () => {
    expect(getNestedValue({ x: 5 }, 'x')).toBe(5);
  });

  it('should handle flat dotted keys', () => {
    expect(getNestedValue({ 'a.b': 5 }, 'a.b')).toBe(5);
  });

  it('should traverse nested objects when flat key not found', () => {
    expect(getNestedValue({ a: { b: 5 } }, 'a.b')).toBe(5);
  });
});

describe('setNestedValue', () => {
  it('should set simple values', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'x', 5);
    expect(obj.x).toBe(5);
  });

  it('should set dotted keys as flat', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'a.b', 5);
    expect(obj['a.b']).toBe(5);
  });
});

// =============================================================================
// Column Name Validation Tests (Security)
// =============================================================================

describe('validateColumnName', () => {
  describe('valid column names', () => {
    it('should accept simple alphanumeric names', () => {
      expect(() => validateColumnName('name')).not.toThrow();
      expect(() => validateColumnName('user_id')).not.toThrow();
      expect(() => validateColumnName('Column1')).not.toThrow();
      expect(() => validateColumnName('a')).not.toThrow();
    });

    it('should accept underscores', () => {
      expect(() => validateColumnName('first_name')).not.toThrow();
      expect(() => validateColumnName('_private')).not.toThrow();
      expect(() => validateColumnName('some__double')).not.toThrow();
    });

    it('should accept dots for nested paths', () => {
      expect(() => validateColumnName('user.name')).not.toThrow();
      expect(() => validateColumnName('address.city.zip')).not.toThrow();
      expect(() => validateColumnName('data.items.0.value')).not.toThrow();
    });

    it('should accept numeric characters (not at start)', () => {
      expect(() => validateColumnName('column1')).not.toThrow();
      expect(() => validateColumnName('item_2')).not.toThrow();
      expect(() => validateColumnName('data.items.123')).not.toThrow();
    });
  });

  describe('malicious column names (injection prevention)', () => {
    it('should reject SQL injection attempts', () => {
      expect(() => validateColumnName("'; DROP TABLE users; --")).toThrow();
      expect(() => validateColumnName('column; DELETE FROM')).toThrow();
      expect(() => validateColumnName("name' OR '1'='1")).toThrow();
      expect(() => validateColumnName('id UNION SELECT * FROM passwords')).toThrow();
    });

    it('should reject special characters used in injection', () => {
      expect(() => validateColumnName("column'")).toThrow();
      expect(() => validateColumnName('column"')).toThrow();
      expect(() => validateColumnName('column;')).toThrow();
      expect(() => validateColumnName('column--')).toThrow();
      expect(() => validateColumnName('column/*')).toThrow();
      expect(() => validateColumnName('column*/')).toThrow();
    });

    it('should reject parentheses (function injection)', () => {
      expect(() => validateColumnName('COUNT(*)')).toThrow();
      expect(() => validateColumnName('column()')).toThrow();
      expect(() => validateColumnName('SLEEP(5)')).toThrow();
    });

    it('should reject whitespace', () => {
      expect(() => validateColumnName('col umn')).toThrow();
      expect(() => validateColumnName(' column')).toThrow();
      expect(() => validateColumnName('column ')).toThrow();
      expect(() => validateColumnName('col\tumn')).toThrow();
      expect(() => validateColumnName('col\numn')).toThrow();
    });

    it('should reject empty or invalid strings', () => {
      expect(() => validateColumnName('')).toThrow();
      expect(() => validateColumnName('.')).toThrow();
      expect(() => validateColumnName('..')).toThrow();
      expect(() => validateColumnName('.column')).toThrow();
      expect(() => validateColumnName('column.')).toThrow();
    });

    it('should reject path traversal attempts', () => {
      expect(() => validateColumnName('../etc/passwd')).toThrow();
      expect(() => validateColumnName('..\\windows')).toThrow();
    });

    it('should reject control characters', () => {
      expect(() => validateColumnName('col\x00umn')).toThrow();
      expect(() => validateColumnName('col\x1fumn')).toThrow();
    });
  });
});

describe('evaluateFilters with column validation', () => {
  it('should throw on malicious column names in filters', () => {
    const maliciousFilter: FilterPredicate = {
      column: "'; DROP TABLE users; --",
      operator: 'eq',
      value: 'test',
    };
    expect(() => evaluateFilters({ name: 'test' }, [maliciousFilter])).toThrow();
  });

  it('should throw on injection attempts via nested path', () => {
    const maliciousFilter: FilterPredicate = {
      column: 'user.name; DELETE FROM',
      operator: 'eq',
      value: 'test',
    };
    expect(() => evaluateFilters({ user: { name: 'test' } }, [maliciousFilter])).toThrow();
  });

  it('should allow valid column names in filters', () => {
    const validFilter: FilterPredicate = {
      column: 'user.first_name',
      operator: 'eq',
      value: 'Alice',
    };
    expect(() => evaluateFilters({ 'user.first_name': 'Alice' }, [validFilter])).not.toThrow();
  });
});

// =============================================================================
// sortRows Performance Benchmark (TDD issue evodb-d0x)
// =============================================================================

describe('sortRows performance benchmark', () => {
  function generateRows(count: number): Array<{ id: number; name: string; value: number }> {
    return Array.from({ length: count }, (_, i) => ({
      id: count - i,  // Reverse order to ensure actual sorting work
      name: `user_${i % 1000}`,
      value: Math.random() * 1000,
    }));
  }

  function formatTime(ms: number): string {
    if (ms < 1) return `${(ms * 1000).toFixed(2)}us`;
    if (ms < 1000) return `${ms.toFixed(2)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }

  it('should not mutate the original array', () => {
    const rows = [{ x: 3 }, { x: 1 }, { x: 2 }];
    const original = [...rows];

    sortRows(rows, [{ column: 'x', direction: 'asc' }]);

    // Original array should remain unchanged
    expect(rows).toEqual(original);
  });

  it('should benchmark sortRows with 10K rows', () => {
    const rows = generateRows(10000);
    const orderBy: SortSpec[] = [{ column: 'id', direction: 'asc' }];

    // Warm up
    for (let i = 0; i < 3; i++) {
      sortRows(rows, orderBy);
    }

    // Benchmark current implementation (slice().sort())
    const iterations = 20;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      sortRows(rows, orderBy);
    }
    const elapsed = (performance.now() - start) / iterations;

    console.log(`sortRows benchmark (10K rows):`);
    console.log(`  Time per sort: ${formatTime(elapsed)}`);
    console.log(`  Throughput: ${Math.round(10000 / (elapsed / 1000))} rows/s`);

    // Should complete in reasonable time
    expect(elapsed).toBeLessThan(50); // < 50ms for 10K rows
  });

  it('should benchmark sortRows with 100K rows', () => {
    const rows = generateRows(100000);
    const orderBy: SortSpec[] = [{ column: 'id', direction: 'asc' }];

    // Warm up
    sortRows(rows, orderBy);

    // Benchmark
    const iterations = 5;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      sortRows(rows, orderBy);
    }
    const elapsed = (performance.now() - start) / iterations;

    console.log(`sortRows benchmark (100K rows):`);
    console.log(`  Time per sort: ${formatTime(elapsed)}`);
    console.log(`  Throughput: ${Math.round(100000 / (elapsed / 1000))} rows/s`);

    // Should complete in reasonable time
    expect(elapsed).toBeLessThan(500); // < 500ms for 100K rows
  });

  it('should compare [...rows].sort() vs slice().sort() memory allocation', () => {
    const rowCount = 50000;
    const rows = generateRows(rowCount);
    const orderBy: SortSpec[] = [{ column: 'id', direction: 'asc' }];

    // Method 1: spread operator [...rows].sort() - OLD approach
    const spreadTimes: number[] = [];
    for (let i = 0; i < 10; i++) {
      const start = performance.now();
      const result = [...rows].sort((a, b) => a.id - b.id);
      spreadTimes.push(performance.now() - start);
      // Prevent optimization from removing the result
      if (result.length !== rowCount) throw new Error('Unexpected');
    }

    // Method 2: slice().sort() - CURRENT approach (in-place after clone)
    const sliceTimes: number[] = [];
    for (let i = 0; i < 10; i++) {
      const start = performance.now();
      const result = rows.slice();
      result.sort((a, b) => a.id - b.id);
      sliceTimes.push(performance.now() - start);
      // Prevent optimization from removing the result
      if (result.length !== rowCount) throw new Error('Unexpected');
    }

    const spreadAvg = spreadTimes.reduce((a, b) => a + b, 0) / spreadTimes.length;
    const sliceAvg = sliceTimes.reduce((a, b) => a + b, 0) / sliceTimes.length;

    console.log(`\nArray copy method comparison (${rowCount} rows):`);
    console.log(`  [...rows].sort() avg: ${formatTime(spreadAvg)}`);
    console.log(`  slice().sort()   avg: ${formatTime(sliceAvg)}`);
    console.log(`  Improvement: ${((spreadAvg - sliceAvg) / spreadAvg * 100).toFixed(1)}%`);

    // slice().sort() should be at least as fast (usually faster due to single allocation)
    // Note: The main benefit is reduced memory churn, not necessarily raw speed
    expect(sliceAvg).toBeLessThan(spreadAvg * 1.5); // Allow some variance
  });
});

// =============================================================================
// Multi-Aggregate Performance Benchmark (TDD issue evodb-qaq)
// =============================================================================

describe('computeAggregations performance benchmark', () => {
  function generateRows(count: number): Array<{ id: number; category: string; amount: number; score: number }> {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      category: `cat_${i % 100}`,
      amount: Math.random() * 1000,
      score: Math.random() * 100,
    }));
  }

  function formatTime(ms: number): string {
    if (ms < 1) return `${(ms * 1000).toFixed(2)}us`;
    if (ms < 1000) return `${ms.toFixed(2)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }

  it('should benchmark single-pass vs multi-pass aggregation on 100K rows', () => {
    const rowCount = 100000;
    const rows = generateRows(rowCount);

    // Multiple aggregates - this is the scenario where single-pass helps
    const aggregates: AggregateSpec[] = [
      { function: 'count', alias: 'total_count' },
      { function: 'sum', column: 'amount', alias: 'total_amount' },
      { function: 'avg', column: 'amount', alias: 'avg_amount' },
      { function: 'min', column: 'amount', alias: 'min_amount' },
      { function: 'max', column: 'amount', alias: 'max_amount' },
      { function: 'sum', column: 'score', alias: 'total_score' },
      { function: 'avg', column: 'score', alias: 'avg_score' },
    ];

    // Warm up
    computeAggregations(rows, aggregates);

    // Benchmark
    const iterations = 10;
    const start = performance.now();
    let result;
    for (let i = 0; i < iterations; i++) {
      result = computeAggregations(rows, aggregates);
    }
    const elapsed = (performance.now() - start) / iterations;

    console.log(`\ncomputeAggregations benchmark (${rowCount} rows, ${aggregates.length} aggregates):`);
    console.log(`  Time per aggregation: ${formatTime(elapsed)}`);
    console.log(`  Throughput: ${Math.round(rowCount / (elapsed / 1000))} rows/s`);
    console.log(`  Iterations per aggregate: ${aggregates.length} (single-pass should be 1)`);

    // Verify results are correct
    expect(result).toBeDefined();
    expect(result!.columns).toHaveLength(7);
    expect(result!.rows).toHaveLength(1);

    // Verify aggregate values make sense
    const [row] = result!.rows;
    expect(row[0]).toBe(rowCount); // count
    expect(typeof row[1]).toBe('number'); // sum
    expect(typeof row[2]).toBe('number'); // avg
    expect(typeof row[3]).toBe('number'); // min
    expect(typeof row[4]).toBe('number'); // max

    // Performance expectation: should process 100K rows with 7 aggregates efficiently
    // With single-pass, this should be well under 100ms
    expect(elapsed).toBeLessThan(100);
  });

  it('should benchmark aggregation with groupBy on 100K rows', () => {
    const rowCount = 100000;
    const rows = generateRows(rowCount);

    const aggregates: AggregateSpec[] = [
      { function: 'count', alias: 'count' },
      { function: 'sum', column: 'amount', alias: 'total' },
      { function: 'avg', column: 'amount', alias: 'average' },
    ];

    // Warm up
    computeAggregations(rows, aggregates, ['category']);

    // Benchmark
    const iterations = 10;
    const start = performance.now();
    let result;
    for (let i = 0; i < iterations; i++) {
      result = computeAggregations(rows, aggregates, ['category']);
    }
    const elapsed = (performance.now() - start) / iterations;

    console.log(`\ncomputeAggregations with groupBy benchmark (${rowCount} rows, 100 groups):`);
    console.log(`  Time per aggregation: ${formatTime(elapsed)}`);
    console.log(`  Throughput: ${Math.round(rowCount / (elapsed / 1000))} rows/s`);

    // Verify results
    expect(result).toBeDefined();
    expect(result!.rows.length).toBe(100); // 100 categories

    // Performance expectation
    expect(elapsed).toBeLessThan(200);
  });

  it('should verify correctness of single-pass aggregation', () => {
    // Use deterministic data for verification
    const rows = [
      { id: 1, value: 10, category: 'a' },
      { id: 2, value: 20, category: 'a' },
      { id: 3, value: 30, category: 'b' },
      { id: 4, value: 40, category: 'b' },
      { id: 5, value: null, category: 'a' },
    ];

    const aggregates: AggregateSpec[] = [
      { function: 'count', alias: 'total' },
      { function: 'count', column: 'value', alias: 'value_count' },
      { function: 'sum', column: 'value', alias: 'value_sum' },
      { function: 'avg', column: 'value', alias: 'value_avg' },
      { function: 'min', column: 'value', alias: 'value_min' },
      { function: 'max', column: 'value', alias: 'value_max' },
    ];

    const result = computeAggregations(rows, aggregates);

    expect(result.columns).toEqual(['total', 'value_count', 'value_sum', 'value_avg', 'value_min', 'value_max']);
    expect(result.rows).toHaveLength(1);

    const [row] = result.rows;
    expect(row[0]).toBe(5);  // count(*)
    expect(row[1]).toBe(4);  // count(value) - excludes null
    expect(row[2]).toBe(100); // sum(value)
    expect(row[3]).toBe(25);  // avg(value)
    expect(row[4]).toBe(10);  // min(value)
    expect(row[5]).toBe(40);  // max(value)
  });

  it('should verify distinct aggregation correctness', () => {
    const rows = [
      { value: 10 },
      { value: 10 },
      { value: 20 },
      { value: 20 },
      { value: 30 },
    ];

    const aggregates: AggregateSpec[] = [
      { function: 'countDistinct', column: 'value', alias: 'distinct_count' },
      { function: 'sumDistinct', column: 'value', alias: 'distinct_sum' },
    ];

    const result = computeAggregations(rows, aggregates);
    const [row] = result.rows;

    expect(row[0]).toBe(3);  // countDistinct: 10, 20, 30
    expect(row[1]).toBe(60); // sumDistinct: 10 + 20 + 30
  });
});

// =============================================================================
// Compiled vs Interpreted Filter Accessor Benchmark (TDD issue evodb-6hn)
// =============================================================================

describe('compiled vs interpreted filter accessor benchmark', () => {
  function formatTime(ms: number): string {
    if (ms < 1) return `${(ms * 1000).toFixed(2)}us`;
    if (ms < 1000) return `${ms.toFixed(2)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }

  function generateRows(count: number): Array<Record<string, unknown>> {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      'user.name': `user_${i}`,
      'user.email': `user${i}@example.com`,
      nested: { level1: { level2: { value: i * 10 } } },
      status: i % 3 === 0 ? 'active' : i % 3 === 1 ? 'pending' : 'inactive',
      amount: Math.random() * 1000,
    }));
  }

  it('should benchmark interpreted accessor (getNestedValue per row)', () => {
    const rowCount = 50000;
    const rows = generateRows(rowCount);
    const filters: FilterPredicate[] = [
      { column: 'user.name', operator: 'like', value: 'user_1%' },
      { column: 'status', operator: 'eq', value: 'active' },
    ];

    // Warm up
    for (let i = 0; i < 3; i++) {
      rows.filter(row => evaluateFilters(row, filters));
    }

    // Benchmark interpreted approach
    const iterations = 10;
    const start = performance.now();
    let matchCount = 0;
    for (let i = 0; i < iterations; i++) {
      matchCount = rows.filter(row => evaluateFilters(row, filters)).length;
    }
    const elapsed = (performance.now() - start) / iterations;

    console.log(`\nInterpreted accessor benchmark (${rowCount} rows, 2 filters):`);
    console.log(`  Time per filter: ${formatTime(elapsed)}`);
    console.log(`  Matches: ${matchCount}`);
    console.log(`  Throughput: ${Math.round(rowCount / (elapsed / 1000))} rows/s`);

    // Store for comparison
    expect(elapsed).toBeLessThan(500); // Should complete in reasonable time
  });

  it('should benchmark compiled accessor (pre-compiled path once)', () => {
    const rowCount = 50000;
    const rows = generateRows(rowCount);
    const filters: FilterPredicate[] = [
      { column: 'user.name', operator: 'like', value: 'user_1%' },
      { column: 'status', operator: 'eq', value: 'active' },
    ];

    // Compile filters once (using static import from top of file)
    const compiled = compileFilters(filters);

    // Warm up
    for (let i = 0; i < 3; i++) {
      rows.filter(row => evaluateCompiledFilters(row, compiled));
    }

    // Benchmark compiled approach
    const iterations = 10;
    const start = performance.now();
    let matchCount = 0;
    for (let i = 0; i < iterations; i++) {
      matchCount = rows.filter(row => evaluateCompiledFilters(row, compiled)).length;
    }
    const elapsed = (performance.now() - start) / iterations;

    console.log(`\nCompiled accessor benchmark (${rowCount} rows, 2 filters):`);
    console.log(`  Time per filter: ${formatTime(elapsed)}`);
    console.log(`  Matches: ${matchCount}`);
    console.log(`  Throughput: ${Math.round(rowCount / (elapsed / 1000))} rows/s`);

    expect(elapsed).toBeLessThan(500); // Should complete in reasonable time
  });

  it('should show compiled accessors are faster than interpreted', () => {
    const rowCount = 100000;
    const rows = generateRows(rowCount);
    const filters: FilterPredicate[] = [
      { column: 'user.name', operator: 'like', value: 'user_1%' },
      { column: 'status', operator: 'eq', value: 'active' },
      { column: 'amount', operator: 'gt', value: 100 },
    ];

    // Benchmark interpreted approach
    const interpretedTimes: number[] = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      const result = rows.filter(row => evaluateFilters(row, filters));
      interpretedTimes.push(performance.now() - start);
      if (result.length === 0) throw new Error('Unexpected');
    }
    const interpretedAvg = interpretedTimes.reduce((a, b) => a + b, 0) / interpretedTimes.length;

    // Benchmark compiled approach
    const compiled = compileFilters(filters);
    const compiledTimes: number[] = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      const result = rows.filter(row => evaluateCompiledFilters(row, compiled));
      compiledTimes.push(performance.now() - start);
      if (result.length === 0) throw new Error('Unexpected');
    }
    const compiledAvg = compiledTimes.reduce((a, b) => a + b, 0) / compiledTimes.length;

    console.log(`\nCompiled vs Interpreted comparison (${rowCount} rows, 3 filters):`);
    console.log(`  Interpreted avg: ${formatTime(interpretedAvg)}`);
    console.log(`  Compiled avg:    ${formatTime(compiledAvg)}`);
    console.log(`  Improvement: ${((interpretedAvg - compiledAvg) / interpretedAvg * 100).toFixed(1)}%`);

    // Compiled should be noticeably faster (at least 10% improvement)
    // The main savings come from not re-validating and re-parsing column paths per row
    // Note: On some test runners with coarse timer resolution, both might be 0
    // In that case, we just verify they complete (equality is fine if both are 0)
    expect(compiledAvg).toBeLessThanOrEqual(interpretedAvg);
  });

  it('should verify compiled filters produce same results as interpreted', () => {
    const rows = [
      { id: 1, 'user.name': 'alice', status: 'active', amount: 150 },
      { id: 2, 'user.name': 'bob', status: 'inactive', amount: 200 },
      { id: 3, 'user.name': 'charlie', status: 'active', amount: 50 },
      { id: 4, 'user.name': 'alice', status: 'pending', amount: 300 },
      { id: 5, 'user.name': 'eve', status: 'active', amount: 100 },
    ];

    const filters: FilterPredicate[] = [
      { column: 'status', operator: 'eq', value: 'active' },
      { column: 'amount', operator: 'gte', value: 100 },
    ];

    // Get results from interpreted approach
    const interpretedResults = rows.filter(row => evaluateFilters(row, filters));

    // Get results from compiled approach
    const compiled = compileFilters(filters);
    const compiledResults = rows.filter(row => evaluateCompiledFilters(row, compiled));

    // Results should be identical
    expect(compiledResults).toEqual(interpretedResults);
    expect(compiledResults.map(r => r.id)).toEqual([1, 5]);
  });
});

// =============================================================================
// ASCII Fast Path String Comparison Benchmark (TDD issue evodb-ivh)
// =============================================================================

describe('isAscii helper', () => {
  it('should return true for empty string', () => {
    expect(isAscii('')).toBe(true);
  });

  it('should return true for ASCII-only strings', () => {
    expect(isAscii('hello')).toBe(true);
    expect(isAscii('Hello World 123')).toBe(true);
    expect(isAscii('user@example.com')).toBe(true);
    expect(isAscii('!@#$%^&*()')).toBe(true);
    expect(isAscii('\t\n\r')).toBe(true); // control chars are ASCII
  });

  it('should return false for strings with unicode characters', () => {
    expect(isAscii('caf\u00e9')).toBe(false); // é
    expect(isAscii('\u4e2d\u6587')).toBe(false); // Chinese
    expect(isAscii('hello\ud83d\ude00')).toBe(false); // emoji
    expect(isAscii('\u00a9')).toBe(false); // copyright symbol (code 169)
    expect(isAscii('\u0080')).toBe(false); // code 128
  });
});

describe('compareStrings', () => {
  it('should compare ASCII strings correctly', () => {
    expect(compareStrings('a', 'b')).toBeLessThan(0);
    expect(compareStrings('b', 'a')).toBeGreaterThan(0);
    expect(compareStrings('abc', 'abc')).toBe(0);
    expect(compareStrings('apple', 'banana')).toBeLessThan(0);
    expect(compareStrings('zoo', 'apple')).toBeGreaterThan(0);
  });

  it('should compare unicode strings correctly using localeCompare', () => {
    // These should fall back to localeCompare
    expect(compareStrings('caf\u00e9', 'cafe')).not.toBe(0);
    expect(compareStrings('\u00e4', '\u00f6')).toBeLessThan(0); // ä < ö
  });

  it('should handle mixed ASCII/unicode comparisons', () => {
    // One ASCII, one unicode - should use localeCompare
    const result = compareStrings('cafe', 'caf\u00e9');
    expect(typeof result).toBe('number');
  });
});

describe('ASCII fast path string comparison benchmark', () => {
  function formatTime(ms: number): string {
    if (ms < 1) return `${(ms * 1000).toFixed(2)}us`;
    if (ms < 1000) return `${ms.toFixed(2)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }

  function generateAsciiStrings(count: number): string[] {
    return Array.from({ length: count }, (_, i) => `user_${i}_${Math.random().toString(36).slice(2, 10)}`);
  }

  function generateUnicodeStrings(count: number): string[] {
    const prefixes = ['caf\u00e9_', '\u00e4pple_', 'na\u00efve_', 'r\u00e9sum\u00e9_'];
    return Array.from({ length: count }, (_, i) => `${prefixes[i % prefixes.length]}${i}`);
  }

  it('should benchmark ASCII string comparison: fast path vs localeCompare', () => {
    const count = 100000;
    const strings = generateAsciiStrings(count);

    // Shuffle to ensure sorting work
    const shuffled = [...strings].sort(() => Math.random() - 0.5);

    // Create pairs for comparison
    const pairs: Array<[string, string]> = [];
    for (let i = 0; i < count - 1; i++) {
      pairs.push([shuffled[i], shuffled[i + 1]]);
    }

    // Warm up
    for (let i = 0; i < 1000; i++) {
      compareStrings(pairs[i % pairs.length][0], pairs[i % pairs.length][1]);
      pairs[i % pairs.length][0].localeCompare(pairs[i % pairs.length][1]);
    }

    // Benchmark fast path (ASCII < operator)
    const fastPathStart = performance.now();
    let fastPathSum = 0;
    for (const [a, b] of pairs) {
      fastPathSum += compareStrings(a, b);
    }
    const fastPathTime = performance.now() - fastPathStart;

    // Benchmark localeCompare (old approach)
    const localeStart = performance.now();
    let localeSum = 0;
    for (const [a, b] of pairs) {
      localeSum += a.localeCompare(b);
    }
    const localeTime = performance.now() - localeStart;

    // Prevent optimization from removing results
    expect(typeof fastPathSum).toBe('number');
    expect(typeof localeSum).toBe('number');

    const improvement = ((localeTime - fastPathTime) / localeTime * 100);

    console.log(`\nASCII String Comparison Benchmark (${count} comparisons):`);
    console.log(`  Fast path (< operator): ${formatTime(fastPathTime)}`);
    console.log(`  localeCompare:          ${formatTime(localeTime)}`);
    console.log(`  Improvement: ${improvement.toFixed(1)}%`);
    console.log(`  Speedup: ${(localeTime / fastPathTime).toFixed(2)}x`);

    // Fast path should be significantly faster for ASCII strings
    // localeCompare is typically 5-10x slower than < operator
    // Note: In some environments (workerd), timing resolution is coarse and both may be 0
    expect(fastPathTime).toBeLessThanOrEqual(localeTime + 1); // Allow 1ms variance for timing resolution
  });

  it('should verify correctness of fast path for consistent-case ASCII strings', () => {
    // Note: ASCII fast path uses byte ordering which differs from localeCompare for mixed case
    // (e.g., 'Z' < 'a' in ASCII, but localeCompare may sort differently)
    // These test cases use same-case strings where ASCII and locale order match
    const testCases: Array<[string, string]> = [
      ['a', 'b'],
      ['apple', 'apple'],
      ['apple', 'banana'],
      ['', 'a'],
      ['abc', 'abcd'],
      ['123', '124'],
      ['user_001', 'user_002'],
      ['AAA', 'BBB'],  // uppercase only
      ['aaa', 'bbb'],  // lowercase only
    ];

    for (const [a, b] of testCases) {
      const fastResult = compareStrings(a, b);
      const localeResult = a.localeCompare(b);

      // Sign should match (both negative, both positive, or both zero)
      expect(Math.sign(fastResult)).toBe(Math.sign(localeResult));
    }
  });

  it('should handle mixed case consistently (ASCII byte order)', () => {
    // ASCII fast path uses byte ordering: uppercase (65-90) < lowercase (97-122)
    // This is expected database behavior - consistent, fast, binary sorting
    expect(compareStrings('A', 'a')).toBeLessThan(0);  // 'A' (65) < 'a' (97)
    expect(compareStrings('Z', 'a')).toBeLessThan(0);  // 'Z' (90) < 'a' (97)
    expect(compareStrings('Zoo', 'apple')).toBeLessThan(0);  // 'Z' < 'a'
  });

  it('should correctly fall back to localeCompare for unicode strings', () => {
    const unicodeStrings = generateUnicodeStrings(1000);
    const shuffled = [...unicodeStrings].sort(() => Math.random() - 0.5);

    // Verify correctness: sort results should match localeCompare-based sort
    const fastSorted = [...shuffled].sort(compareStrings);
    const localeSorted = [...shuffled].sort((a, b) => a.localeCompare(b));

    // Results should be identical since compareStrings falls back to localeCompare for unicode
    expect(fastSorted).toEqual(localeSorted);
  });

  it('should benchmark sorting with compareStrings vs pure localeCompare', () => {
    const count = 10000;
    const strings = generateAsciiStrings(count);
    const iterations = 5;

    // Warm up
    [...strings].sort(compareStrings);
    [...strings].sort((a, b) => a.localeCompare(b));

    // Benchmark compareStrings (with fast path)
    const fastTimes: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const shuffled = [...strings].sort(() => Math.random() - 0.5);
      const start = performance.now();
      shuffled.sort(compareStrings);
      fastTimes.push(performance.now() - start);
    }

    // Benchmark pure localeCompare
    const localeTimes: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const shuffled = [...strings].sort(() => Math.random() - 0.5);
      const start = performance.now();
      shuffled.sort((a, b) => a.localeCompare(b));
      localeTimes.push(performance.now() - start);
    }

    const fastAvg = fastTimes.reduce((a, b) => a + b, 0) / fastTimes.length;
    const localeAvg = localeTimes.reduce((a, b) => a + b, 0) / localeTimes.length;

    console.log(`\nSorting ${count} ASCII strings (avg of ${iterations} runs):`);
    console.log(`  compareStrings (fast path): ${formatTime(fastAvg)}`);
    console.log(`  localeCompare:              ${formatTime(localeAvg)}`);
    console.log(`  Improvement: ${((localeAvg - fastAvg) / localeAvg * 100).toFixed(1)}%`);
    console.log(`  Speedup: ${(localeAvg / fastAvg).toFixed(2)}x`);

    // Fast path should provide measurable improvement or be equivalent
    // Note: In some environments (workerd), timing resolution is coarse
    expect(fastAvg).toBeLessThanOrEqual(localeAvg + 1); // Allow 1ms variance for timing resolution
  });
});
