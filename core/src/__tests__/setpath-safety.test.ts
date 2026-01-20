/**
 * @evodb/core - setPath Safety Tests (TDD)
 *
 * Tests for setPath function to ensure safe type handling and proper error
 * reporting when encountering invalid paths or type mismatches.
 *
 * Issue: pocs-f8uh - [P1] Unchecked array access with unsafe casts
 * Location: shred.ts:195-210
 */

import { describe, it, expect } from 'vitest';
import { shred, unshred } from '../index.js';

// =============================================================================
// SETPATH SAFETY TESTS
// =============================================================================

describe('setPath Safety', () => {
  describe('Type Validation', () => {
    it('should handle setting path on primitive that gets overwritten', () => {
      // When unshredding, the structure should be built correctly
      // This tests the scenario where intermediate values need to be objects
      const docs = [
        { a: { b: { c: 1 } } },
        { a: { b: { c: 2 } } },
      ];

      const columns = shred(docs);
      const result = unshred(columns);

      expect(result).toEqual(docs);
    });

    it('should handle mixed object/array paths correctly', () => {
      const docs = [
        { items: [{ name: 'a' }, { name: 'b' }] },
        { items: [{ name: 'c' }] },
      ];

      const columns = shred(docs);
      const result = unshred(columns);

      // Second doc only has one item
      expect(result[0]).toEqual({ items: [{ name: 'a' }, { name: 'b' }] });
      expect(result[1]).toEqual({ items: [{ name: 'c' }] });
    });

    it('should handle deeply nested array paths', () => {
      const docs = [
        { matrix: [[1, 2], [3, 4]] },
        { matrix: [[5, 6], [7, 8]] },
      ];

      const columns = shred(docs);
      const result = unshred(columns);

      expect(result).toEqual(docs);
    });

    it('should handle empty arrays gracefully', () => {
      const docs = [
        { items: [] },
        { items: [1, 2, 3] },
      ];

      const columns = shred(docs);
      const result = unshred(columns);

      // Empty array produces no columns, so reconstruction is different
      expect(result[0]).toEqual({});
      expect(result[1]).toEqual({ items: [1, 2, 3] });
    });
  });

  describe('Array Index Edge Cases', () => {
    it('should handle sparse arrays correctly', () => {
      // When document has items at indices 0 and 5 but not 1-4
      const docs = [
        { sparse: ['a', undefined, undefined, undefined, undefined, 'f'] },
      ];

      const columns = shred(docs);
      const result = unshred(columns);

      // Sparse positions should be reconstructed
      expect((result[0] as { sparse: unknown[] }).sparse[0]).toBe('a');
      expect((result[0] as { sparse: unknown[] }).sparse[5]).toBe('f');
    });

    it('should handle large array indices', () => {
      const docs = [{ arr: [] as unknown[] }];
      docs[0].arr[100] = 'value-at-100';

      const columns = shred(docs);
      const result = unshred(columns);

      expect((result[0] as { arr: unknown[] }).arr[100]).toBe('value-at-100');
    });

    it('should handle arrays with mixed types', () => {
      const docs = [
        { mixed: [1, 'two', true, null] },
      ];

      const columns = shred(docs);
      const result = unshred(columns);

      const mixed = (result[0] as { mixed: unknown[] }).mixed;
      expect(mixed[0]).toBe(1);
      expect(mixed[1]).toBe('two');
      expect(mixed[2]).toBe(true);
      // null values are not reconstructed (by design)
    });

    it('should handle negative-like string indices as object keys', () => {
      // Objects can have numeric-looking string keys
      const docs = [
        { obj: { '-1': 'negative', '0': 'zero', '1': 'one' } },
      ];

      const columns = shred(docs);
      const result = unshred(columns);

      expect(result).toEqual(docs);
    });
  });

  describe('Path Parsing Edge Cases', () => {
    it('should handle paths with multiple array indices', () => {
      const docs = [
        { data: [[['deep']]] },
      ];

      const columns = shred(docs);
      const result = unshred(columns);

      expect(result).toEqual(docs);
    });

    it('should handle paths with alternating object and array access', () => {
      const docs = [
        { users: [{ addresses: [{ city: 'NYC' }] }] },
      ];

      const columns = shred(docs);
      const result = unshred(columns);

      expect(result).toEqual(docs);
    });

    it('should handle empty path parts gracefully', () => {
      // Edge case: object with empty string key
      const docs = [
        { '': 'empty-key-value' },
      ];

      const columns = shred(docs);
      const result = unshred(columns);

      expect(result).toEqual(docs);
    });

    it('should handle keys that look like array indices', () => {
      const docs = [
        { '0': 'zero', '1': 'one', 'notNumber': 'text' },
      ];

      const columns = shred(docs);
      const result = unshred(columns);

      expect(result).toEqual(docs);
    });
  });

  describe('Null and Undefined Handling', () => {
    it('should not set null values during unshred', () => {
      const docs = [
        { name: 'Alice', age: null },
        { name: 'Bob' },
      ];

      const columns = shred(docs);
      const result = unshred(columns);

      // Null values should not create properties
      expect('age' in (result[0] as object)).toBe(false);
      expect('age' in (result[1] as object)).toBe(false);
    });

    it('should handle undefined in nested paths', () => {
      const docs = [
        { user: { name: 'Alice' } },
        { user: undefined },
      ];

      const columns = shred(docs);
      const result = unshred(columns);

      expect((result[0] as { user: { name: string } }).user.name).toBe('Alice');
      // undefined user should not create the property
    });
  });

  describe('Complex Reconstruction Scenarios', () => {
    it('should reconstruct complex nested objects correctly', () => {
      const docs = [
        {
          id: 1,
          user: {
            name: 'Alice',
            profile: {
              settings: {
                theme: 'dark',
                notifications: true,
              },
            },
            tags: ['admin', 'active'],
          },
        },
      ];

      const columns = shred(docs);
      const result = unshred(columns);

      expect(result).toEqual(docs);
    });

    it('should handle documents with different structures', () => {
      const docs = [
        { a: 1 },
        { b: 2 },
        { a: 3, b: 4 },
      ];

      const columns = shred(docs);
      const result = unshred(columns);

      expect(result[0]).toEqual({ a: 1 });
      expect(result[1]).toEqual({ b: 2 });
      expect(result[2]).toEqual({ a: 3, b: 4 });
    });

    it('should handle arrays of objects with varying fields', () => {
      const docs = [
        { items: [{ x: 1 }, { y: 2 }, { x: 3, y: 4 }] },
      ];

      const columns = shred(docs);
      const result = unshred(columns);

      const items = (result[0] as { items: object[] }).items;
      expect(items[0]).toEqual({ x: 1 });
      expect(items[1]).toEqual({ y: 2 });
      expect(items[2]).toEqual({ x: 3, y: 4 });
    });
  });

  describe('Path with Special Characters', () => {
    it('should handle keys with dots in them', () => {
      // Note: This is tricky because dots are used as separators
      // The current implementation may not handle this perfectly
      const docs = [
        { 'key.with.dots': 'value' },
      ];

      const columns = shred(docs);
      // The path will be 'key.with.dots' which will be treated as nested
      // This is a known limitation but shouldn't cause crashes
      expect(() => unshred(columns)).not.toThrow();
    });

    it('should handle keys with brackets in them', () => {
      const docs = [
        { 'key[0]': 'looks like array but is key' },
      ];

      const columns = shred(docs);
      // This may be misinterpreted but should not crash
      expect(() => unshred(columns)).not.toThrow();
    });
  });

  describe('Boundary Conditions', () => {
    it('should handle single-element paths', () => {
      const docs = [{ x: 1 }];

      const columns = shred(docs);
      const result = unshred(columns);

      expect(result).toEqual(docs);
    });

    it('should handle very deep nesting (10+ levels)', () => {
      const docs = [
        {
          l1: {
            l2: {
              l3: {
                l4: {
                  l5: {
                    l6: {
                      l7: {
                        l8: {
                          l9: {
                            l10: { value: 'deep' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      ];

      const columns = shred(docs);
      const result = unshred(columns);

      expect(result).toEqual(docs);
    });

    it('should handle many documents efficiently', () => {
      const docs = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        nested: { value: i * 2 },
      }));

      const columns = shred(docs);
      const result = unshred(columns);

      expect(result.length).toBe(1000);
      expect(result[0]).toEqual({ id: 0, nested: { value: 0 } });
      expect(result[999]).toEqual({ id: 999, nested: { value: 1998 } });
    });
  });

  describe('Type Safety During Path Construction', () => {
    it('should create arrays when path has numeric indices', () => {
      const docs = [
        { arr: ['a', 'b', 'c'] },
      ];

      const columns = shred(docs);
      const result = unshred(columns);

      expect(Array.isArray((result[0] as { arr: unknown }).arr)).toBe(true);
    });

    it('should create objects when path has string keys', () => {
      const docs = [
        { obj: { key: 'value' } },
      ];

      const columns = shred(docs);
      const result = unshred(columns);

      const obj = (result[0] as { obj: unknown }).obj;
      expect(typeof obj).toBe('object');
      expect(Array.isArray(obj)).toBe(false);
    });

    it('should handle transition from object to nested array', () => {
      const docs = [
        { data: { items: [1, 2, 3] } },
      ];

      const columns = shred(docs);
      const result = unshred(columns);

      expect(result).toEqual(docs);
    });

    it('should handle transition from array to nested object', () => {
      const docs = [
        { items: [{ name: 'first' }, { name: 'second' }] },
      ];

      const columns = shred(docs);
      const result = unshred(columns);

      expect(result).toEqual(docs);
    });
  });
});
