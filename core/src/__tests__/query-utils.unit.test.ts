/**
 * @evodb/core - Query Utilities Tests
 *
 * Verifies shared projection, zone map pruning, and row transformation logic.
 */

import { describe, it, expect } from 'vitest';
import {
  // Projection
  applyProjection,
  applyProjectionBatch,
  applyProjectionSpec,
  getColumnNames,
  // Zone map pruning
  canSatisfyFilter,
  canSatisfyAllFilters,
  prunePartitionsByZoneMap,
  // Filtering
  filterRows,
  filterRowsBatched,
  // Row transformation
  columnarToRows,
  rowsToColumnar,
  extractColumn,
  // Types
  type ZoneMap,
  type ProjectionSpec,
} from '../query-utils.js';

import type { FilterPredicate } from '../query-ops.js';

// =============================================================================
// Projection Tests
// =============================================================================

describe('applyProjection', () => {
  it('should extract specified columns', () => {
    const row = { id: 1, name: 'Alice', email: 'alice@example.com', age: 30 };
    const result = applyProjection(row, ['id', 'name']);
    expect(result).toEqual({ id: 1, name: 'Alice' });
  });

  it('should handle missing columns', () => {
    const row = { id: 1, name: 'Alice' };
    const result = applyProjection(row, ['id', 'email']);
    expect(result).toEqual({ id: 1, email: undefined });
  });

  it('should apply aliases', () => {
    const row = { user_name: 'Bob', user_id: 42 };
    const result = applyProjection(row, ['user_name', 'user_id'], {
      user_name: 'name',
      user_id: 'id',
    });
    expect(result).toEqual({ name: 'Bob', id: 42 });
  });

  it('should handle nested paths using flat key', () => {
    const row = { 'user.profile.name': 'Carol' };
    const result = applyProjection(row, ['user.profile.name']);
    expect(result).toEqual({ 'user.profile.name': 'Carol' });
  });

  it('should handle nested paths by traversal', () => {
    const row = { user: { profile: { name: 'Carol' } } };
    const result = applyProjection(row, ['user.profile.name']);
    expect(result).toEqual({ 'user.profile.name': 'Carol' });
  });

  it('should return empty object for empty columns', () => {
    const row = { id: 1, name: 'Alice' };
    const result = applyProjection(row, []);
    expect(result).toEqual({});
  });
});

describe('applyProjectionBatch', () => {
  it('should apply projection to multiple rows', () => {
    const rows = [
      { id: 1, name: 'Alice', extra: 'a' },
      { id: 2, name: 'Bob', extra: 'b' },
      { id: 3, name: 'Carol', extra: 'c' },
    ];
    const result = applyProjectionBatch(rows, ['id', 'name']);
    expect(result).toEqual([
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
      { id: 3, name: 'Carol' },
    ]);
  });

  it('should handle empty rows array', () => {
    const result = applyProjectionBatch([], ['id', 'name']);
    expect(result).toEqual([]);
  });
});

describe('applyProjectionSpec', () => {
  it('should apply projection spec with columns', () => {
    const row = { id: 1, name: 'Alice', _version: 5 };
    const spec: ProjectionSpec = { columns: ['id', 'name', '_version'] };
    const result = applyProjectionSpec(row, spec);
    expect(result).toEqual({ id: 1, name: 'Alice' });
  });

  it('should include metadata when specified', () => {
    const row = { id: 1, name: 'Alice', _version: 5 };
    const spec: ProjectionSpec = {
      columns: ['id', 'name', '_version'],
      includeMetadata: true,
    };
    const result = applyProjectionSpec(row, spec);
    expect(result).toEqual({ id: 1, name: 'Alice', _version: 5 });
  });

  it('should apply aliases from spec', () => {
    const row = { user_id: 42 };
    const spec: ProjectionSpec = {
      columns: ['user_id'],
      aliases: { user_id: 'id' },
    };
    const result = applyProjectionSpec(row, spec);
    expect(result).toEqual({ id: 42 });
  });
});

describe('getColumnNames', () => {
  it('should return all column names', () => {
    const row = { id: 1, name: 'Alice', email: 'alice@example.com' };
    const columns = getColumnNames(row, true);
    expect(columns).toEqual(['id', 'name', 'email']);
  });

  it('should exclude metadata columns by default', () => {
    const row = { id: 1, name: 'Alice', _id: 'abc', _version: 5 };
    const columns = getColumnNames(row);
    expect(columns).toEqual(['id', 'name']);
  });

  it('should include metadata columns when specified', () => {
    const row = { id: 1, _id: 'abc' };
    const columns = getColumnNames(row, true);
    expect(columns).toEqual(['id', '_id']);
  });
});

// =============================================================================
// Zone Map Pruning Tests
// =============================================================================

describe('canSatisfyFilter', () => {
  const makeZoneMap = (column: string, min: unknown, max: unknown, nullCount = 0): ZoneMap => ({
    columns: { [column]: { min, max, nullCount } },
  });

  it('should return true when no stats for column', () => {
    const zoneMap: ZoneMap = { columns: {} };
    const filter: FilterPredicate = { column: 'age', operator: 'eq', value: 30 };
    expect(canSatisfyFilter(zoneMap, filter)).toBe(true);
  });

  describe('eq operator', () => {
    it('should return true when value is within range', () => {
      const zoneMap = makeZoneMap('age', 20, 50);
      const filter: FilterPredicate = { column: 'age', operator: 'eq', value: 30 };
      expect(canSatisfyFilter(zoneMap, filter)).toBe(true);
    });

    it('should return true when value equals min', () => {
      const zoneMap = makeZoneMap('age', 20, 50);
      const filter: FilterPredicate = { column: 'age', operator: 'eq', value: 20 };
      expect(canSatisfyFilter(zoneMap, filter)).toBe(true);
    });

    it('should return true when value equals max', () => {
      const zoneMap = makeZoneMap('age', 20, 50);
      const filter: FilterPredicate = { column: 'age', operator: 'eq', value: 50 };
      expect(canSatisfyFilter(zoneMap, filter)).toBe(true);
    });

    it('should return false when value is below range', () => {
      const zoneMap = makeZoneMap('age', 20, 50);
      const filter: FilterPredicate = { column: 'age', operator: 'eq', value: 10 };
      expect(canSatisfyFilter(zoneMap, filter)).toBe(false);
    });

    it('should return false when value is above range', () => {
      const zoneMap = makeZoneMap('age', 20, 50);
      const filter: FilterPredicate = { column: 'age', operator: 'eq', value: 100 };
      expect(canSatisfyFilter(zoneMap, filter)).toBe(false);
    });
  });

  describe('gt operator', () => {
    it('should return true when max > value', () => {
      const zoneMap = makeZoneMap('age', 20, 50);
      const filter: FilterPredicate = { column: 'age', operator: 'gt', value: 40 };
      expect(canSatisfyFilter(zoneMap, filter)).toBe(true);
    });

    it('should return false when max <= value', () => {
      const zoneMap = makeZoneMap('age', 20, 50);
      const filter: FilterPredicate = { column: 'age', operator: 'gt', value: 60 };
      expect(canSatisfyFilter(zoneMap, filter)).toBe(false);
    });

    it('should return false when max = value (not strictly greater)', () => {
      const zoneMap = makeZoneMap('age', 20, 50);
      const filter: FilterPredicate = { column: 'age', operator: 'gt', value: 50 };
      expect(canSatisfyFilter(zoneMap, filter)).toBe(false);
    });
  });

  describe('gte operator', () => {
    it('should return true when max >= value', () => {
      const zoneMap = makeZoneMap('age', 20, 50);
      const filter: FilterPredicate = { column: 'age', operator: 'gte', value: 50 };
      expect(canSatisfyFilter(zoneMap, filter)).toBe(true);
    });

    it('should return false when max < value', () => {
      const zoneMap = makeZoneMap('age', 20, 50);
      const filter: FilterPredicate = { column: 'age', operator: 'gte', value: 60 };
      expect(canSatisfyFilter(zoneMap, filter)).toBe(false);
    });
  });

  describe('lt operator', () => {
    it('should return true when min < value', () => {
      const zoneMap = makeZoneMap('age', 20, 50);
      const filter: FilterPredicate = { column: 'age', operator: 'lt', value: 30 };
      expect(canSatisfyFilter(zoneMap, filter)).toBe(true);
    });

    it('should return false when min >= value', () => {
      const zoneMap = makeZoneMap('age', 20, 50);
      const filter: FilterPredicate = { column: 'age', operator: 'lt', value: 10 };
      expect(canSatisfyFilter(zoneMap, filter)).toBe(false);
    });
  });

  describe('lte operator', () => {
    it('should return true when min <= value', () => {
      const zoneMap = makeZoneMap('age', 20, 50);
      const filter: FilterPredicate = { column: 'age', operator: 'lte', value: 20 };
      expect(canSatisfyFilter(zoneMap, filter)).toBe(true);
    });

    it('should return false when min > value', () => {
      const zoneMap = makeZoneMap('age', 20, 50);
      const filter: FilterPredicate = { column: 'age', operator: 'lte', value: 10 };
      expect(canSatisfyFilter(zoneMap, filter)).toBe(false);
    });
  });

  describe('between operator', () => {
    it('should return true when ranges overlap', () => {
      const zoneMap = makeZoneMap('age', 20, 50);
      const filter: FilterPredicate = {
        column: 'age',
        operator: 'between',
        lowerBound: 30,
        upperBound: 60,
      };
      expect(canSatisfyFilter(zoneMap, filter)).toBe(true);
    });

    it('should return false when ranges do not overlap (filter above)', () => {
      const zoneMap = makeZoneMap('age', 20, 50);
      const filter: FilterPredicate = {
        column: 'age',
        operator: 'between',
        lowerBound: 60,
        upperBound: 80,
      };
      expect(canSatisfyFilter(zoneMap, filter)).toBe(false);
    });

    it('should return false when ranges do not overlap (filter below)', () => {
      const zoneMap = makeZoneMap('age', 20, 50);
      const filter: FilterPredicate = {
        column: 'age',
        operator: 'between',
        lowerBound: 5,
        upperBound: 15,
      };
      expect(canSatisfyFilter(zoneMap, filter)).toBe(false);
    });

    it('should handle array value format', () => {
      const zoneMap = makeZoneMap('age', 20, 50);
      const filter: FilterPredicate = {
        column: 'age',
        operator: 'between',
        value: [30, 60],
      };
      expect(canSatisfyFilter(zoneMap, filter)).toBe(true);
    });
  });

  describe('in operator', () => {
    it('should return true when any value is in range', () => {
      const zoneMap = makeZoneMap('age', 20, 50);
      const filter: FilterPredicate = {
        column: 'age',
        operator: 'in',
        values: [10, 30, 70],
      };
      expect(canSatisfyFilter(zoneMap, filter)).toBe(true);
    });

    it('should return false when no values are in range', () => {
      const zoneMap = makeZoneMap('age', 20, 50);
      const filter: FilterPredicate = {
        column: 'age',
        operator: 'in',
        values: [5, 10, 60, 70],
      };
      expect(canSatisfyFilter(zoneMap, filter)).toBe(false);
    });
  });

  describe('ne operator', () => {
    it('should return false when all values in partition equal filter value', () => {
      const zoneMap = makeZoneMap('status', 'active', 'active');
      const filter: FilterPredicate = { column: 'status', operator: 'ne', value: 'active' };
      expect(canSatisfyFilter(zoneMap, filter)).toBe(false);
    });

    it('should return true when values vary', () => {
      const zoneMap = makeZoneMap('status', 'active', 'inactive');
      const filter: FilterPredicate = { column: 'status', operator: 'ne', value: 'active' };
      expect(canSatisfyFilter(zoneMap, filter)).toBe(true);
    });
  });

  describe('null operators', () => {
    it('should return true for isNull when nullCount > 0', () => {
      const zoneMap = makeZoneMap('email', 'a@example.com', 'z@example.com', 5);
      const filter: FilterPredicate = { column: 'email', operator: 'isNull' };
      expect(canSatisfyFilter(zoneMap, filter)).toBe(true);
    });

    it('should return false for isNull when nullCount = 0', () => {
      const zoneMap = makeZoneMap('email', 'a@example.com', 'z@example.com', 0);
      const filter: FilterPredicate = { column: 'email', operator: 'isNull' };
      expect(canSatisfyFilter(zoneMap, filter)).toBe(false);
    });

    it('should return true for isNotNull when there are non-null values', () => {
      const zoneMap: ZoneMap = {
        columns: {
          email: { min: 'a@example.com', max: 'z@example.com', nullCount: 5, distinctCount: 100 },
        },
      };
      const filter: FilterPredicate = { column: 'email', operator: 'isNotNull' };
      expect(canSatisfyFilter(zoneMap, filter)).toBe(true);
    });
  });
});

describe('canSatisfyAllFilters', () => {
  it('should return true for empty filters', () => {
    const zoneMap: ZoneMap = { columns: {} };
    expect(canSatisfyAllFilters(zoneMap, [])).toBe(true);
  });

  it('should return true when all filters can be satisfied', () => {
    const zoneMap: ZoneMap = {
      columns: {
        age: { min: 20, max: 50, nullCount: 0 },
        status: { min: 'active', max: 'pending', nullCount: 0 },
      },
    };
    const filters: FilterPredicate[] = [
      { column: 'age', operator: 'gte', value: 25 },
      { column: 'status', operator: 'eq', value: 'active' },
    ];
    expect(canSatisfyAllFilters(zoneMap, filters)).toBe(true);
  });

  it('should return false when any filter cannot be satisfied', () => {
    const zoneMap: ZoneMap = {
      columns: {
        age: { min: 20, max: 50, nullCount: 0 },
        status: { min: 'active', max: 'pending', nullCount: 0 },
      },
    };
    const filters: FilterPredicate[] = [
      { column: 'age', operator: 'gte', value: 60 }, // Cannot be satisfied
      { column: 'status', operator: 'eq', value: 'active' },
    ];
    expect(canSatisfyAllFilters(zoneMap, filters)).toBe(false);
  });
});

describe('prunePartitionsByZoneMap', () => {
  const partitions = [
    {
      id: 'p1',
      zoneMap: { columns: { age: { min: 10, max: 30, nullCount: 0 } } },
    },
    {
      id: 'p2',
      zoneMap: { columns: { age: { min: 25, max: 50, nullCount: 0 } } },
    },
    {
      id: 'p3',
      zoneMap: { columns: { age: { min: 45, max: 70, nullCount: 0 } } },
    },
  ];

  it('should return all partitions for empty filters', () => {
    const result = prunePartitionsByZoneMap(partitions, []);
    expect(result).toHaveLength(3);
  });

  it('should prune partitions that cannot match', () => {
    const filters: FilterPredicate[] = [{ column: 'age', operator: 'gte', value: 40 }];
    const result = prunePartitionsByZoneMap(partitions, filters);
    expect(result.map(p => p.id)).toEqual(['p2', 'p3']);
  });

  it('should prune multiple partitions', () => {
    const filters: FilterPredicate[] = [{ column: 'age', operator: 'eq', value: 60 }];
    const result = prunePartitionsByZoneMap(partitions, filters);
    expect(result.map(p => p.id)).toEqual(['p3']);
  });

  it('should return empty array when all partitions pruned', () => {
    const filters: FilterPredicate[] = [{ column: 'age', operator: 'gt', value: 100 }];
    const result = prunePartitionsByZoneMap(partitions, filters);
    expect(result).toHaveLength(0);
  });
});

// =============================================================================
// Filtering Tests
// =============================================================================

describe('filterRows', () => {
  const rows = [
    { id: 1, name: 'Alice', status: 'active', age: 30 },
    { id: 2, name: 'Bob', status: 'inactive', age: 25 },
    { id: 3, name: 'Carol', status: 'active', age: 35 },
    { id: 4, name: 'Dave', status: 'pending', age: 40 },
  ];

  it('should return all rows for empty filters', () => {
    const result = filterRows(rows, []);
    expect(result).toHaveLength(4);
  });

  it('should filter by single predicate', () => {
    const filters: FilterPredicate[] = [
      { column: 'status', operator: 'eq', value: 'active' },
    ];
    const result = filterRows(rows, filters);
    expect(result.map(r => r.id)).toEqual([1, 3]);
  });

  it('should filter by multiple predicates (AND logic)', () => {
    const filters: FilterPredicate[] = [
      { column: 'status', operator: 'eq', value: 'active' },
      { column: 'age', operator: 'gt', value: 32 },
    ];
    const result = filterRows(rows, filters);
    expect(result.map(r => r.id)).toEqual([3]);
  });
});

describe('filterRowsBatched', () => {
  it('should filter rows in batches', async () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({
      id: i,
      value: i % 2 === 0 ? 'even' : 'odd',
    }));

    const result = await filterRowsBatched(
      rows,
      row => row.value === 'even',
      { batchSize: 25 }
    );

    expect(result).toHaveLength(50);
    expect(result.every(r => r.value === 'even')).toBe(true);
  });

  it('should call progress callback', async () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ id: i }));
    const progressCalls: Array<[number, number]> = [];

    await filterRowsBatched(
      rows,
      () => true,
      {
        batchSize: 30,
        onProgress: (processed, total) => {
          progressCalls.push([processed, total]);
        },
      }
    );

    expect(progressCalls).toEqual([
      [30, 100],
      [60, 100],
      [90, 100],
      [100, 100],
    ]);
  });

  it('should respect abort signal', async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
    const controller = new AbortController();

    // Abort after first batch
    setTimeout(() => controller.abort(), 0);

    await expect(
      filterRowsBatched(rows, () => true, {
        batchSize: 100,
        signal: controller.signal,
      })
    ).rejects.toThrow('Filter operation cancelled');
  });
});

// =============================================================================
// Row Transformation Tests
// =============================================================================

describe('columnarToRows', () => {
  it('should convert columnar data to rows', () => {
    const columnar = {
      id: [1, 2, 3],
      name: ['Alice', 'Bob', 'Carol'],
    };
    const rows = columnarToRows(columnar);
    expect(rows).toEqual([
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
      { id: 3, name: 'Carol' },
    ]);
  });

  it('should handle empty columnar data', () => {
    const rows = columnarToRows({});
    expect(rows).toEqual([]);
  });

  it('should handle single row', () => {
    const columnar = { id: [1], name: ['Alice'] };
    const rows = columnarToRows(columnar);
    expect(rows).toEqual([{ id: 1, name: 'Alice' }]);
  });
});

describe('rowsToColumnar', () => {
  it('should convert rows to columnar format', () => {
    const rows = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ];
    const columnar = rowsToColumnar(rows);
    expect(columnar).toEqual({
      id: [1, 2],
      name: ['Alice', 'Bob'],
    });
  });

  it('should respect specified columns', () => {
    const rows = [
      { id: 1, name: 'Alice', extra: 'x' },
      { id: 2, name: 'Bob', extra: 'y' },
    ];
    const columnar = rowsToColumnar(rows, ['id']);
    expect(columnar).toEqual({ id: [1, 2] });
  });

  it('should handle empty rows', () => {
    const columnar = rowsToColumnar([]);
    expect(columnar).toEqual({});
  });
});

describe('extractColumn', () => {
  it('should extract a single column as array', () => {
    const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const ids = extractColumn<number>(rows, 'id');
    expect(ids).toEqual([1, 2, 3]);
  });

  it('should handle nested paths', () => {
    const rows = [
      { user: { name: 'Alice' } },
      { user: { name: 'Bob' } },
    ];
    const names = extractColumn<string>(rows, 'user.name');
    expect(names).toEqual(['Alice', 'Bob']);
  });

  it('should handle missing values', () => {
    const rows = [{ id: 1 }, { name: 'Alice' }];
    const ids = extractColumn(rows, 'id');
    expect(ids).toEqual([1, undefined]);
  });
});
