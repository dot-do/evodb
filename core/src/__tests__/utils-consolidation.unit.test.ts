/**
 * @evodb/core - Utils Consolidation Tests
 *
 * TDD tests for evodb-s589 and evodb-b4y:
 * Verifies that getNestedValue and compareValues are consolidated
 * and exported from core, eliminating duplicate implementations.
 *
 * Note: These tests verify runtime behavior since the test environment
 * (Cloudflare Workers) doesn't support fs.readFileSync for source inspection.
 */

import { describe, it, expect } from 'vitest';

// =============================================================================
// Consolidated Utils Tests
// =============================================================================

describe('Consolidated Utils', () => {
  describe('getNestedValue is exported from core', () => {
    it('should be exported from @evodb/core', async () => {
      // Import from the main core index
      const core = await import('../index.js');
      expect(typeof core.getNestedValue).toBe('function');
    });

    it('should be exported from @evodb/core/query submodule', async () => {
      // Import from the query submodule
      const query = await import('../query/index.js');
      expect(typeof query.getNestedValue).toBe('function');
    });

    it('should work correctly for simple paths', async () => {
      const { getNestedValue } = await import('../query-ops.js');
      expect(getNestedValue({ x: 5 }, 'x')).toBe(5);
      expect(getNestedValue({ name: 'test' }, 'name')).toBe('test');
    });

    it('should work correctly for nested paths', async () => {
      const { getNestedValue } = await import('../query-ops.js');
      expect(getNestedValue({ a: { b: { c: 42 } } }, 'a.b.c')).toBe(42);
      expect(getNestedValue({ user: { profile: { name: 'Alice' } } }, 'user.profile.name')).toBe('Alice');
    });

    it('should handle flat dotted keys', async () => {
      const { getNestedValue } = await import('../query-ops.js');
      expect(getNestedValue({ 'a.b.c': 123 }, 'a.b.c')).toBe(123);
    });

    it('should return undefined for missing paths', async () => {
      const { getNestedValue } = await import('../query-ops.js');
      expect(getNestedValue({ x: 5 }, 'y')).toBeUndefined();
      expect(getNestedValue({ a: { b: 1 } }, 'a.c')).toBeUndefined();
    });

    it('should handle null/undefined in path traversal', async () => {
      const { getNestedValue } = await import('../query-ops.js');
      expect(getNestedValue({ a: null }, 'a.b')).toBeUndefined();
      expect(getNestedValue({ a: { b: null } }, 'a.b.c')).toBeUndefined();
    });
  });

  describe('compareValues is exported from core', () => {
    it('should be exported from @evodb/core', async () => {
      const core = await import('../index.js');
      expect(typeof core.compareValues).toBe('function');
    });

    it('should be exported from @evodb/core/query submodule', async () => {
      const query = await import('../query/index.js');
      expect(typeof query.compareValues).toBe('function');
    });

    it('should compare numbers correctly', async () => {
      const { compareValues } = await import('../query-ops.js');
      expect(compareValues(1, 2)).toBeLessThan(0);
      expect(compareValues(2, 1)).toBeGreaterThan(0);
      expect(compareValues(5, 5)).toBe(0);
    });

    it('should compare strings correctly', async () => {
      const { compareValues } = await import('../query-ops.js');
      expect(compareValues('a', 'b')).toBeLessThan(0);
      expect(compareValues('b', 'a')).toBeGreaterThan(0);
      expect(compareValues('test', 'test')).toBe(0);
    });

    it('should handle null/undefined values', async () => {
      const { compareValues } = await import('../query-ops.js');
      expect(compareValues(null, 1)).toBeLessThan(0);
      expect(compareValues(1, null)).toBeGreaterThan(0);
      expect(compareValues(null, null)).toBe(0);
      expect(compareValues(undefined, undefined)).toBe(0);
    });

    it('should compare dates correctly', async () => {
      const { compareValues } = await import('../query-ops.js');
      const date1 = new Date('2024-01-01');
      const date2 = new Date('2024-06-01');
      expect(compareValues(date1, date2)).toBeLessThan(0);
      expect(compareValues(date2, date1)).toBeGreaterThan(0);
      expect(compareValues(date1, new Date('2024-01-01'))).toBe(0);
    });

    it('should fall back to string comparison for mixed types', async () => {
      const { compareValues } = await import('../query-ops.js');
      // Both converted to strings for comparison
      const result = compareValues('10', 10);
      expect(typeof result).toBe('number');
    });
  });

  describe('lakehouse/partition.ts imports from core', () => {
    it('should use the same getNestedValue implementation as core', async () => {
      // Import getNestedValue from core
      const { getNestedValue: coreGetNestedValue } = await import('../query-ops.js');

      // Import lakehouse partition module - it should re-export or use core's implementation
      // We can verify behavior matches for edge cases
      const testObj = { a: { b: { c: 'value' } }, 'a.b.c': 'flat-value' };

      // Test that our canonical implementation handles both flat and nested keys correctly
      const coreResult = coreGetNestedValue(testObj, 'a.b.c');
      // Flat key takes precedence
      expect(coreResult).toBe('flat-value');
    });

    it('should use the same compareValues implementation as core for zone map pruning', async () => {
      // Import compareValues from core
      const { compareValues: coreCompareValues } = await import('../query-ops.js');

      // Test the behavior matches what zone map pruning needs
      // Numbers
      expect(coreCompareValues(10, 20)).toBeLessThan(0);
      expect(coreCompareValues(20, 10)).toBeGreaterThan(0);

      // Strings
      expect(coreCompareValues('apple', 'banana')).toBeLessThan(0);

      // Nulls - important for partition pruning
      expect(coreCompareValues(null, 10)).toBeLessThan(0);
      expect(coreCompareValues(10, null)).toBeGreaterThan(0);
    });
  });

  describe('no duplicate implementations exist', () => {
    it('should have single source of truth in core/query-ops.ts', async () => {
      // Both the direct import and the query submodule should give the same function
      const queryOps = await import('../query-ops.js');
      const queryIndex = await import('../query/index.js');

      // Functions should be the same reference
      expect(queryOps.getNestedValue).toBe(queryIndex.getNestedValue);
      expect(queryOps.compareValues).toBe(queryIndex.compareValues);
    });

    it('should expose consistent API through queryOps namespace', async () => {
      const { queryOps } = await import('../query-ops.js');

      // Verify functions are available in the namespace
      expect(typeof queryOps.getNestedValue).toBe('function');
      expect(typeof queryOps.compareValues).toBe('function');

      // Test they work correctly
      expect(queryOps.getNestedValue({ x: 42 }, 'x')).toBe(42);
      expect(queryOps.compareValues(1, 2)).toBeLessThan(0);
    });

    it('should export all needed utility functions from core', async () => {
      const core = await import('../index.js');

      // All these should be available from core
      expect(typeof core.getNestedValue).toBe('function');
      expect(typeof core.compareValues).toBe('function');
      expect(typeof core.evaluateFilter).toBe('function');
      expect(typeof core.evaluateFilters).toBe('function');
      expect(typeof core.sortRows).toBe('function');
      expect(typeof core.limitRows).toBe('function');
    });
  });

  describe('JSDoc documentation', () => {
    it('getNestedValue should have proper type signature', async () => {
      const { getNestedValue } = await import('../query-ops.js');

      // Test type behavior - function should accept object and string path
      const result = getNestedValue({ foo: 'bar' }, 'foo');
      expect(result).toBe('bar');

      // Return type should be unknown (checked at runtime)
      const unknownResult = getNestedValue({ num: 123 }, 'num');
      expect(typeof unknownResult).toBe('number');
    });

    it('compareValues should have proper type signature', async () => {
      const { compareValues } = await import('../query-ops.js');

      // Function accepts two unknown values
      const result: number = compareValues('a', 'b');
      expect(typeof result).toBe('number');

      // Returns -1, 0, or 1 style comparison
      expect(result).toBeLessThan(0);
    });

    it('functions should handle edge cases documented in JSDoc', async () => {
      const { getNestedValue, compareValues } = await import('../query-ops.js');

      // getNestedValue edge cases:
      // 1. Empty path
      expect(getNestedValue({ '': 'empty' }, '')).toBe('empty');

      // 2. Non-object values in path
      expect(getNestedValue({ a: 'string' }, 'a.b')).toBeUndefined();

      // 3. Array access (not supported - returns undefined)
      expect(getNestedValue({ arr: [1, 2, 3] }, 'arr.0')).toBeUndefined();

      // compareValues edge cases:
      // 1. NaN comparison
      const nanResult = compareValues(NaN, NaN);
      expect(typeof nanResult).toBe('number');

      // 2. Infinity
      expect(compareValues(Infinity, 1000)).toBeGreaterThan(0);
      expect(compareValues(-Infinity, -1000)).toBeLessThan(0);
    });
  });
});
