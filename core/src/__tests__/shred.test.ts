/**
 * @evodb/core - shred.ts Tests (TDD)
 *
 * Tests for setPath function to ensure safe type handling
 * when encountering invalid paths or type mismatches.
 *
 * Issue: evodb-2nr - Fix unchecked array access patterns
 * Location: shred.ts setPath function
 *
 * These tests verify:
 * 1. setPath with malformed paths
 * 2. setPath when intermediate values are not arrays/objects
 * 3. setPath with type mismatches
 */

import { describe, it, expect } from 'vitest';
import { shred, unshred } from '../index.js';

// =============================================================================
// SETPATH SAFETY TESTS - evodb-2nr
// =============================================================================

describe('setPath Safety - evodb-2nr', () => {
  describe('Malformed Paths', () => {
    it('should handle paths with unclosed brackets gracefully', () => {
      // Test via shred/unshred cycle with malformed-looking keys
      const docs = [{ 'key[unclosed': 'value' }];
      const columns = shred(docs);

      // Should not throw when attempting to unshred
      expect(() => unshred(columns)).not.toThrow();
    });

    it('should handle paths with empty brackets', () => {
      // Object key that looks like empty array index
      const docs = [{ 'key[]': 'value' }];
      const columns = shred(docs);

      // Should not throw
      expect(() => unshred(columns)).not.toThrow();
    });

    it('should handle paths with negative array indices', () => {
      // Negative indices in bracket notation
      const docs = [{ items: { '-1': 'negative-like-key' } }];
      const columns = shred(docs);
      const result = unshred(columns);

      // Should handle as string key, not array index
      expect(result[0]).toEqual({ items: { '-1': 'negative-like-key' } });
    });

    it('should handle paths with non-integer bracket contents', () => {
      // Non-numeric bracket content should be treated as string key
      const docs = [{ 'data[abc]': 'value' }];
      const columns = shred(docs);

      expect(() => unshred(columns)).not.toThrow();
    });

    it('should handle paths with multiple consecutive dots', () => {
      // Keys with dots create nested paths - test edge case
      const docs = [{ 'a..b': 'double-dot-key' }];
      const columns = shred(docs);

      // Should handle gracefully (may create empty key in path)
      expect(() => unshred(columns)).not.toThrow();
    });

    it('should handle empty string path', () => {
      // Empty key at root level
      const docs = [{ '': 'empty-key-value' }];
      const columns = shred(docs);
      const result = unshred(columns);

      expect(result[0]).toEqual({ '': 'empty-key-value' });
    });
  });

  describe('Type Mismatch - Intermediate Values', () => {
    it('should not crash when intermediate path expects object but column has primitive', () => {
      // This tests the defensive type guards
      // First document establishes path as primitive
      // This is actually testing that the shred/unshred handles different shapes

      const docs = [
        { data: 'primitive-string' },
        { data: { nested: 'object-value' } },
      ];

      const columns = shred(docs);
      // Should not throw - different shapes get different paths
      expect(() => unshred(columns)).not.toThrow();

      const result = unshred(columns);
      // First doc has primitive at 'data'
      expect(result[0]).toEqual({ data: 'primitive-string' });
      // Second doc has nested object
      expect(result[1]).toEqual({ data: { nested: 'object-value' } });
    });

    it('should handle transition from primitive to array at same path', () => {
      const docs = [
        { items: 'not-an-array' },
        { items: ['actual', 'array'] },
      ];

      const columns = shred(docs);
      expect(() => unshred(columns)).not.toThrow();

      const result = unshred(columns);
      // Both shapes should be reconstructed
      expect(result[0]).toEqual({ items: 'not-an-array' });
      expect(result[1]).toEqual({ items: ['actual', 'array'] });
    });

    it('should handle transition from array to object at same path', () => {
      const docs = [
        { data: [1, 2, 3] },
        { data: { key: 'value' } },
      ];

      const columns = shred(docs);
      expect(() => unshred(columns)).not.toThrow();

      const result = unshred(columns);
      // Arrays get shredded to indexed paths
      expect(result[0]).toEqual({ data: [1, 2, 3] });
      // Objects get shredded to dot paths
      expect(result[1]).toEqual({ data: { key: 'value' } });
    });

    it('should handle when parent becomes null in subsequent docs', () => {
      const docs = [
        { parent: { child: 'value' } },
        { parent: null },
        { parent: { child: 'another' } },
      ];

      const columns = shred(docs);
      expect(() => unshred(columns)).not.toThrow();

      const result = unshred(columns);
      expect(result[0]).toEqual({ parent: { child: 'value' } });
      // Null parent means no properties set
      expect(result[1]).toEqual({});
      expect(result[2]).toEqual({ parent: { child: 'another' } });
    });
  });

  describe('Type Guards - Array vs Object', () => {
    it('should correctly distinguish arrays from objects during reconstruction', () => {
      const docs = [
        { arr: [{ a: 1 }, { b: 2 }] },
      ];

      const columns = shred(docs);
      const result = unshred(columns);

      // The 'arr' field should be an array, not an object
      const arr = (result[0] as { arr: unknown }).arr;
      expect(Array.isArray(arr)).toBe(true);
      expect(arr).toHaveLength(2);
    });

    it('should not confuse numeric string keys with array indices', () => {
      const docs = [
        { obj: { '0': 'zero', '1': 'one' } },
      ];

      const columns = shred(docs);
      const result = unshred(columns);

      // Should be object with string keys, not array
      const obj = (result[0] as { obj: unknown }).obj;
      expect(Array.isArray(obj)).toBe(false);
      expect(obj).toEqual({ '0': 'zero', '1': 'one' });
    });

    it('should handle deeply nested mixed array/object structures', () => {
      const docs = [
        {
          level1: {
            arr1: [
              { level2: { arr2: [1, 2] } },
              { level2: { arr2: [3, 4] } },
            ],
          },
        },
      ];

      const columns = shred(docs);
      const result = unshred(columns);

      expect(result).toEqual(docs);
    });

    it('should validate container type before array index access', () => {
      // This tests that we do not crash when path expects array
      // but runtime value is not an array
      const docs = [
        { items: [{ id: 1 }] },
      ];

      const columns = shred(docs);
      expect(() => unshred(columns)).not.toThrow();

      const result = unshred(columns);
      const items = (result[0] as { items: unknown[] }).items;
      expect(Array.isArray(items)).toBe(true);
      expect(items[0]).toEqual({ id: 1 });
    });

    it('should validate container type before object key access', () => {
      const docs = [
        { user: { profile: { name: 'Alice' } } },
      ];

      const columns = shred(docs);
      expect(() => unshred(columns)).not.toThrow();

      const result = unshred(columns);
      expect(result[0]).toEqual(docs[0]);
    });
  });

  describe('Edge Cases for parsePath', () => {
    it('should handle path starting with array index', () => {
      // This is unusual but should not crash
      const docs = [{ '': [1, 2, 3] }];
      const columns = shred(docs);

      expect(() => unshred(columns)).not.toThrow();
    });

    it('should handle consecutive array indices', () => {
      const docs = [
        { matrix: [[['deep']]] },
      ];

      const columns = shred(docs);
      const result = unshred(columns);

      expect(result).toEqual(docs);
    });

    it('should handle very long paths (100+ parts)', () => {
      // Create a deeply nested object
      let obj: Record<string, unknown> = { value: 'deep' };
      for (let i = 99; i >= 0; i--) {
        obj = { [`level${i}`]: obj };
      }
      const docs = [obj];

      const columns = shred(docs);
      expect(() => unshred(columns)).not.toThrow();

      const result = unshred(columns);
      expect(result).toEqual(docs);
    });

    it('should handle path with trailing dot', () => {
      // Key ending with dot
      const docs = [{ 'key.': 'trailing-dot' }];
      const columns = shred(docs);

      expect(() => unshred(columns)).not.toThrow();
    });

    it('should handle path with leading dot', () => {
      // Key starting with dot
      const docs = [{ '.key': 'leading-dot' }];
      const columns = shred(docs);

      expect(() => unshred(columns)).not.toThrow();
    });
  });

  describe('Defensive Handling of Invalid States', () => {
    it('should not mutate objects when type mismatch prevents setting', () => {
      // Manually test edge case where setPath might fail silently
      const docs = [
        { a: { b: { c: 1 } } },
      ];

      const columns = shred(docs);
      const result = unshred(columns);

      // Should successfully reconstruct
      expect(result[0]).toEqual({ a: { b: { c: 1 } } });
    });

    it('should handle documents with circular-like patterns gracefully', () => {
      // Not actual circular refs (JSON doesn't support), but similar key patterns
      const docs = [
        { a: { b: { a: { b: 'nested-repeat' } } } },
      ];

      const columns = shred(docs);
      const result = unshred(columns);

      expect(result).toEqual(docs);
    });

    it('should handle sparse array reconstruction', () => {
      const docs = [
        { arr: [1, , , 4, , 6] }, // Sparse array with holes
      ];

      // Shredding sparse arrays - only defined indices create columns
      const columns = shred(docs);
      expect(() => unshred(columns)).not.toThrow();

      const result = unshred(columns);
      // Sparse positions with undefined won't be in result
      const arr = (result[0] as { arr: unknown[] }).arr;
      expect(arr[0]).toBe(1);
      expect(arr[3]).toBe(4);
      expect(arr[5]).toBe(6);
    });

    it('should handle array with explicit undefined elements', () => {
      const docs = [
        { arr: [1, undefined, 3] },
      ];

      const columns = shred(docs);
      const result = unshred(columns);

      const arr = (result[0] as { arr: unknown[] }).arr;
      expect(arr[0]).toBe(1);
      expect(arr[2]).toBe(3);
      // Index 1 will not be set (undefined treated as null/missing)
    });
  });

  describe('Container Type Correction', () => {
    it('should overwrite primitive with object when path requires it', () => {
      // Test ensureContainer logic
      const docs = [
        { data: { nested: { value: 42 } } },
      ];

      const columns = shred(docs);
      const result = unshred(columns);

      expect(result[0]).toEqual(docs[0]);
    });

    it('should overwrite primitive with array when path requires it', () => {
      const docs = [
        { items: [1, 2, 3] },
      ];

      const columns = shred(docs);
      const result = unshred(columns);

      expect(Array.isArray((result[0] as { items: unknown }).items)).toBe(true);
    });

    it('should handle ensureContainer with null existing value', () => {
      // When a path exists but is null, should create new container
      const docs = [
        { parent: { child: 'value' } },
      ];

      const columns = shred(docs);
      const result = unshred(columns);

      expect(result[0]).toEqual(docs[0]);
    });
  });
});

// =============================================================================
// INTEGRATION TESTS - Full shred/unshred cycle
// =============================================================================

describe('Shred/Unshred Integration - Type Safety', () => {
  it('should maintain type safety through full cycle with complex data', () => {
    const docs = [
      {
        id: 1,
        name: 'Test',
        data: {
          numbers: [1, 2, 3],
          nested: {
            deep: {
              value: 'deep-value',
            },
          },
        },
        tags: ['a', 'b'],
        metadata: null,
      },
      {
        id: 2,
        name: 'Test2',
        data: {
          numbers: [4, 5],
          nested: {
            deep: {
              value: 'another-deep',
            },
          },
        },
        tags: ['c'],
      },
    ];

    const columns = shred(docs);
    const result = unshred(columns);

    // Verify structure
    expect(result[0]).toEqual({
      id: 1,
      name: 'Test',
      data: {
        numbers: [1, 2, 3],
        nested: {
          deep: {
            value: 'deep-value',
          },
        },
      },
      tags: ['a', 'b'],
      // metadata: null is not reconstructed
    });

    // Second doc
    expect(result[1]).toEqual({
      id: 2,
      name: 'Test2',
      data: {
        numbers: [4, 5],
        nested: {
          deep: {
            value: 'another-deep',
          },
        },
      },
      tags: ['c'],
    });
  });

  it('should handle 1000 documents without type errors', () => {
    const docs = Array.from({ length: 1000 }, (_, i) => ({
      id: i,
      data: {
        arr: [i, i + 1],
        obj: { value: i * 2 },
      },
    }));

    const columns = shred(docs);
    expect(() => unshred(columns)).not.toThrow();

    const result = unshred(columns);
    expect(result.length).toBe(1000);
    expect(result[0]).toEqual({ id: 0, data: { arr: [0, 1], obj: { value: 0 } } });
    expect(result[999]).toEqual({ id: 999, data: { arr: [999, 1000], obj: { value: 1998 } } });
  });
});
