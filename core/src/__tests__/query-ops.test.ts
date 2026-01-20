/**
 * @evodb/core - Query Operations Tests
 *
 * Verifies shared filter, sort, and aggregation logic.
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateFilter,
  evaluateFilters,
  sortRows,
  limitRows,
  compareValues,
  compareForSort,
  computeAggregate,
  computeAggregations,
  likePatternToRegex,
  getNestedValue,
  setNestedValue,
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
