/**
 * @evodb/core - ColumnStats Type Safety Tests (Issue: evodb-lgp2)
 *
 * Tests for the generic ColumnStats type and type-safe accessor functions.
 * Validates that type guards and accessors work correctly for different column types.
 */

import { describe, it, expect } from 'vitest';
import {
  type ColumnStats,
  type NumericColumnStats,
  type StringColumnStats,
  type BigIntColumnStats,
  type Column,
  Type,
  isNumericStats,
  isStringStats,
  isBigIntStats,
  getNumericStats,
  getStringStats,
  getBigIntStats,
} from '../types.js';

describe('ColumnStats Type Safety (evodb-lgp2)', () => {
  // ==========================================================================
  // Type Guard Tests
  // ==========================================================================

  describe('isNumericStats', () => {
    it('should return true for numeric min/max', () => {
      const stats: ColumnStats = { min: 0, max: 100, nullCount: 5, distinctEst: 50 };
      expect(isNumericStats(stats)).toBe(true);
    });

    it('should return true for undefined min/max', () => {
      const stats: ColumnStats = { min: undefined, max: undefined, nullCount: 10, distinctEst: 0 };
      expect(isNumericStats(stats)).toBe(true);
    });

    it('should return true for mixed number and undefined', () => {
      const stats: ColumnStats = { min: 0, max: undefined, nullCount: 5, distinctEst: 50 };
      expect(isNumericStats(stats)).toBe(true);
    });

    it('should return false for string min/max', () => {
      const stats: ColumnStats = { min: 'a', max: 'z', nullCount: 0, distinctEst: 26 };
      expect(isNumericStats(stats)).toBe(false);
    });

    it('should return false for bigint min/max', () => {
      const stats: ColumnStats = { min: 0n, max: 100n, nullCount: 0, distinctEst: 100 };
      expect(isNumericStats(stats)).toBe(false);
    });

    it('should return false for mixed types (string min, number max)', () => {
      const stats: ColumnStats = { min: 'a', max: 100, nullCount: 0, distinctEst: 10 };
      expect(isNumericStats(stats)).toBe(false);
    });
  });

  describe('isStringStats', () => {
    it('should return true for string min/max', () => {
      const stats: ColumnStats = { min: 'a', max: 'z', nullCount: 0, distinctEst: 26 };
      expect(isStringStats(stats)).toBe(true);
    });

    it('should return true for undefined min/max', () => {
      const stats: ColumnStats = { min: undefined, max: undefined, nullCount: 10, distinctEst: 0 };
      expect(isStringStats(stats)).toBe(true);
    });

    it('should return true for mixed string and undefined', () => {
      const stats: ColumnStats = { min: 'apple', max: undefined, nullCount: 5, distinctEst: 50 };
      expect(isStringStats(stats)).toBe(true);
    });

    it('should return false for numeric min/max', () => {
      const stats: ColumnStats = { min: 0, max: 100, nullCount: 5, distinctEst: 50 };
      expect(isStringStats(stats)).toBe(false);
    });

    it('should return false for empty string vs number', () => {
      const stats: ColumnStats = { min: '', max: 100, nullCount: 0, distinctEst: 10 };
      expect(isStringStats(stats)).toBe(false);
    });
  });

  describe('isBigIntStats', () => {
    it('should return true for bigint min/max', () => {
      const stats: ColumnStats = { min: 0n, max: 9007199254740992n, nullCount: 0, distinctEst: 100 };
      expect(isBigIntStats(stats)).toBe(true);
    });

    it('should return true for undefined min/max', () => {
      const stats: ColumnStats = { min: undefined, max: undefined, nullCount: 10, distinctEst: 0 };
      expect(isBigIntStats(stats)).toBe(true);
    });

    it('should return false for numeric min/max', () => {
      const stats: ColumnStats = { min: 0, max: 100, nullCount: 5, distinctEst: 50 };
      expect(isBigIntStats(stats)).toBe(false);
    });
  });

  // ==========================================================================
  // Accessor Tests
  // ==========================================================================

  describe('getNumericStats', () => {
    it('should extract numeric min/max', () => {
      const stats: ColumnStats = { min: 10, max: 90, nullCount: 5, distinctEst: 50 };
      const { min, max } = getNumericStats(stats);
      expect(min).toBe(10);
      expect(max).toBe(90);
    });

    it('should return null for undefined values', () => {
      const stats: ColumnStats = { min: undefined, max: undefined, nullCount: 10, distinctEst: 0 };
      const { min, max } = getNumericStats(stats);
      expect(min).toBeNull();
      expect(max).toBeNull();
    });

    it('should return null for non-numeric values', () => {
      const stats: ColumnStats = { min: 'a', max: 'z', nullCount: 0, distinctEst: 26 };
      const { min, max } = getNumericStats(stats);
      expect(min).toBeNull();
      expect(max).toBeNull();
    });

    it('should handle mixed types (number min, string max)', () => {
      const stats: ColumnStats = { min: 10, max: 'z', nullCount: 0, distinctEst: 10 };
      const { min, max } = getNumericStats(stats);
      expect(min).toBe(10);
      expect(max).toBeNull();
    });

    it('should handle zero correctly', () => {
      const stats: ColumnStats = { min: 0, max: 0, nullCount: 0, distinctEst: 1 };
      const { min, max } = getNumericStats(stats);
      expect(min).toBe(0);
      expect(max).toBe(0);
    });

    it('should handle negative numbers', () => {
      const stats: ColumnStats = { min: -100, max: -1, nullCount: 0, distinctEst: 100 };
      const { min, max } = getNumericStats(stats);
      expect(min).toBe(-100);
      expect(max).toBe(-1);
    });

    it('should handle Infinity', () => {
      const stats: ColumnStats = { min: -Infinity, max: Infinity, nullCount: 0, distinctEst: 100 };
      const { min, max } = getNumericStats(stats);
      expect(min).toBe(-Infinity);
      expect(max).toBe(Infinity);
    });
  });

  describe('getStringStats', () => {
    it('should extract string min/max', () => {
      const stats: ColumnStats = { min: 'apple', max: 'zebra', nullCount: 0, distinctEst: 100 };
      const { min, max } = getStringStats(stats);
      expect(min).toBe('apple');
      expect(max).toBe('zebra');
    });

    it('should return null for undefined values', () => {
      const stats: ColumnStats = { min: undefined, max: undefined, nullCount: 10, distinctEst: 0 };
      const { min, max } = getStringStats(stats);
      expect(min).toBeNull();
      expect(max).toBeNull();
    });

    it('should return null for non-string values', () => {
      const stats: ColumnStats = { min: 0, max: 100, nullCount: 5, distinctEst: 50 };
      const { min, max } = getStringStats(stats);
      expect(min).toBeNull();
      expect(max).toBeNull();
    });

    it('should handle empty strings', () => {
      const stats: ColumnStats = { min: '', max: 'z', nullCount: 0, distinctEst: 27 };
      const { min, max } = getStringStats(stats);
      expect(min).toBe('');
      expect(max).toBe('z');
    });
  });

  describe('getBigIntStats', () => {
    it('should extract bigint min/max', () => {
      const stats: ColumnStats = { min: 0n, max: 9007199254740992n, nullCount: 0, distinctEst: 100 };
      const { min, max } = getBigIntStats(stats);
      expect(min).toBe(0n);
      expect(max).toBe(9007199254740992n);
    });

    it('should return null for undefined values', () => {
      const stats: ColumnStats = { min: undefined, max: undefined, nullCount: 10, distinctEst: 0 };
      const { min, max } = getBigIntStats(stats);
      expect(min).toBeNull();
      expect(max).toBeNull();
    });

    it('should return null for non-bigint values', () => {
      const stats: ColumnStats = { min: 0, max: 100, nullCount: 5, distinctEst: 50 };
      const { min, max } = getBigIntStats(stats);
      expect(min).toBeNull();
      expect(max).toBeNull();
    });

    it('should handle negative bigints', () => {
      const stats: ColumnStats = { min: -9007199254740992n, max: -1n, nullCount: 0, distinctEst: 100 };
      const { min, max } = getBigIntStats(stats);
      expect(min).toBe(-9007199254740992n);
      expect(max).toBe(-1n);
    });
  });

  // ==========================================================================
  // Generic Column Type Tests
  // ==========================================================================

  describe('Generic Column<T> type', () => {
    it('should allow typed Column<number>', () => {
      const column: Column<number> = {
        path: 'age',
        type: Type.Int32,
        nullable: false,
        values: [25, 30, 35],
        nulls: [false, false, false],
      };

      expect(column.values[0]).toBe(25);
      expect(column.type).toBe(Type.Int32);
    });

    it('should allow typed Column<string>', () => {
      const column: Column<string> = {
        path: 'name',
        type: Type.String,
        nullable: false,
        values: ['Alice', 'Bob', 'Charlie'],
        nulls: [false, false, false],
      };

      expect(column.values[0]).toBe('Alice');
      expect(column.type).toBe(Type.String);
    });

    it('should allow default Column (unknown)', () => {
      const column: Column = {
        path: 'data',
        type: Type.Object,
        nullable: true,
        values: [{ a: 1 }, { b: 2 }, null],
        nulls: [false, false, true],
      };

      expect(column.values.length).toBe(3);
    });
  });

  // ==========================================================================
  // Typed ColumnStats Tests
  // ==========================================================================

  describe('Typed ColumnStats<T>', () => {
    it('should allow NumericColumnStats', () => {
      const stats: NumericColumnStats = {
        min: 0,
        max: 100,
        nullCount: 5,
        distinctEst: 50,
      };

      expect(stats.min).toBe(0);
      expect(stats.max).toBe(100);
    });

    it('should allow StringColumnStats', () => {
      const stats: StringColumnStats = {
        min: 'a',
        max: 'z',
        nullCount: 0,
        distinctEst: 26,
      };

      expect(stats.min).toBe('a');
      expect(stats.max).toBe('z');
    });

    it('should allow BigIntColumnStats', () => {
      const stats: BigIntColumnStats = {
        min: 0n,
        max: 9007199254740992n,
        nullCount: 0,
        distinctEst: 100,
      };

      expect(stats.min).toBe(0n);
      expect(stats.max).toBe(9007199254740992n);
    });
  });

  // ==========================================================================
  // Type Guard + Accessor Integration Tests
  // ==========================================================================

  describe('Type guard + accessor integration', () => {
    it('should safely compute numeric range after type guard', () => {
      const stats: ColumnStats = { min: 10, max: 100, nullCount: 5, distinctEst: 50 };

      if (isNumericStats(stats)) {
        // TypeScript knows stats.min and stats.max are number | undefined
        const range = (stats.max ?? 0) - (stats.min ?? 0);
        expect(range).toBe(90);
      }
    });

    it('should safely concatenate string range after type guard', () => {
      const stats: ColumnStats = { min: 'apple', max: 'zebra', nullCount: 0, distinctEst: 100 };

      if (isStringStats(stats)) {
        // TypeScript knows stats.min and stats.max are string | undefined
        const rangeStr = `${stats.min ?? ''} to ${stats.max ?? ''}`;
        expect(rangeStr).toBe('apple to zebra');
      }
    });

    it('should use accessor when type is uncertain', () => {
      function processStats(stats: ColumnStats): number | null {
        const { min, max } = getNumericStats(stats);
        if (min !== null && max !== null) {
          return max - min;
        }
        return null;
      }

      const numericStats: ColumnStats = { min: 10, max: 100, nullCount: 0, distinctEst: 50 };
      const stringStats: ColumnStats = { min: 'a', max: 'z', nullCount: 0, distinctEst: 26 };

      expect(processStats(numericStats)).toBe(90);
      expect(processStats(stringStats)).toBeNull();
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('Edge cases', () => {
    it('should handle NaN min/max', () => {
      const stats: ColumnStats = { min: NaN, max: NaN, nullCount: 0, distinctEst: 0 };

      // NaN is typeof number, so this returns true (but values are NaN)
      expect(isNumericStats(stats)).toBe(true);
      expect(isStringStats(stats)).toBe(false);

      const { min, max } = getNumericStats(stats);
      expect(Number.isNaN(min)).toBe(true);
      expect(Number.isNaN(max)).toBe(true);
    });

    it('should handle null (not undefined) as unknown type', () => {
      // TypeScript ColumnStats has min/max as T | undefined, not T | null
      // If someone passes null (violating the type), type guards should still work
      const stats = { min: null, max: null, nullCount: 10, distinctEst: 0 } as ColumnStats;

      expect(isNumericStats(stats)).toBe(false);
      expect(isStringStats(stats)).toBe(false);
      expect(isBigIntStats(stats)).toBe(false);

      // Accessors return null for invalid types
      expect(getNumericStats(stats).min).toBeNull();
      expect(getStringStats(stats).min).toBeNull();
      expect(getBigIntStats(stats).min).toBeNull();
    });

    it('should handle all-null column (undefined min/max)', () => {
      const allNullStats: ColumnStats = {
        min: undefined,
        max: undefined,
        nullCount: 1000,
        distinctEst: 0,
      };

      // All type guards return true for undefined min/max
      expect(isNumericStats(allNullStats)).toBe(true);
      expect(isStringStats(allNullStats)).toBe(true);
      expect(isBigIntStats(allNullStats)).toBe(true);

      // Accessors return null for undefined
      expect(getNumericStats(allNullStats).min).toBeNull();
      expect(getStringStats(allNullStats).min).toBeNull();
      expect(getBigIntStats(allNullStats).min).toBeNull();
    });
  });
});
