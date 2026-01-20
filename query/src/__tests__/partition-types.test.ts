/**
 * Tests for partition value types
 *
 * These tests verify that the PartitionValue and PartitionValues
 * type guards work correctly.
 */

import { describe, it, expect } from 'vitest';
import {
  isPartitionValue,
  isPartitionValues,
  type PartitionValue,
  type PartitionValues,
} from '../types.js';

describe('PartitionValue', () => {
  describe('isPartitionValue', () => {
    it('returns true for null', () => {
      expect(isPartitionValue(null)).toBe(true);
    });

    it('returns true for strings', () => {
      expect(isPartitionValue('')).toBe(true);
      expect(isPartitionValue('us-east-1')).toBe(true);
      expect(isPartitionValue('2024-01-15')).toBe(true);
    });

    it('returns true for numbers', () => {
      expect(isPartitionValue(0)).toBe(true);
      expect(isPartitionValue(2024)).toBe(true);
      expect(isPartitionValue(-1)).toBe(true);
      expect(isPartitionValue(3.14)).toBe(true);
      expect(isPartitionValue(Infinity)).toBe(true);
      expect(isPartitionValue(NaN)).toBe(true);
    });

    it('returns true for booleans', () => {
      expect(isPartitionValue(true)).toBe(true);
      expect(isPartitionValue(false)).toBe(true);
    });

    it('returns false for undefined', () => {
      expect(isPartitionValue(undefined)).toBe(false);
    });

    it('returns false for objects', () => {
      expect(isPartitionValue({})).toBe(false);
      expect(isPartitionValue({ key: 'value' })).toBe(false);
    });

    it('returns false for arrays', () => {
      expect(isPartitionValue([])).toBe(false);
      expect(isPartitionValue([1, 2, 3])).toBe(false);
    });

    it('returns false for functions', () => {
      expect(isPartitionValue(() => {})).toBe(false);
    });

    it('returns false for symbols', () => {
      expect(isPartitionValue(Symbol('test'))).toBe(false);
    });

    it('returns false for bigint', () => {
      expect(isPartitionValue(BigInt(123))).toBe(false);
    });

    it('returns false for Date objects', () => {
      expect(isPartitionValue(new Date())).toBe(false);
    });
  });
});

describe('PartitionValues', () => {
  describe('isPartitionValues', () => {
    it('returns true for empty object', () => {
      expect(isPartitionValues({})).toBe(true);
    });

    it('returns true for object with string values', () => {
      const values: PartitionValues = {
        region: 'us-east-1',
        category: 'electronics',
      };
      expect(isPartitionValues(values)).toBe(true);
    });

    it('returns true for object with number values', () => {
      const values: PartitionValues = {
        year: 2024,
        month: 1,
        day: 15,
      };
      expect(isPartitionValues(values)).toBe(true);
    });

    it('returns true for object with boolean values', () => {
      const values: PartitionValues = {
        isActive: true,
        isDeleted: false,
      };
      expect(isPartitionValues(values)).toBe(true);
    });

    it('returns true for object with null values', () => {
      const values: PartitionValues = {
        region: null,
        category: null,
      };
      expect(isPartitionValues(values)).toBe(true);
    });

    it('returns true for mixed valid types', () => {
      const values: PartitionValues = {
        year: 2024,
        region: 'us-east-1',
        isActive: true,
        deletedAt: null,
      };
      expect(isPartitionValues(values)).toBe(true);
    });

    it('returns false for null', () => {
      expect(isPartitionValues(null)).toBe(false);
    });

    it('returns false for array', () => {
      expect(isPartitionValues([])).toBe(false);
      expect(isPartitionValues([{ year: 2024 }])).toBe(false);
    });

    it('returns false for primitive types', () => {
      expect(isPartitionValues('string')).toBe(false);
      expect(isPartitionValues(123)).toBe(false);
      expect(isPartitionValues(true)).toBe(false);
      expect(isPartitionValues(undefined)).toBe(false);
    });

    it('returns false for object with undefined values', () => {
      expect(isPartitionValues({ region: undefined })).toBe(false);
    });

    it('returns false for object with object values', () => {
      expect(isPartitionValues({ nested: { key: 'value' } })).toBe(false);
    });

    it('returns false for object with array values', () => {
      expect(isPartitionValues({ tags: ['a', 'b'] })).toBe(false);
    });

    it('returns false for object with function values', () => {
      expect(isPartitionValues({ fn: () => {} })).toBe(false);
    });

    it('returns false for object with Date values', () => {
      expect(isPartitionValues({ date: new Date() })).toBe(false);
    });

    it('returns false for object with bigint values', () => {
      expect(isPartitionValues({ big: BigInt(123) })).toBe(false);
    });
  });
});
