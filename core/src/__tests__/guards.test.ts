/**
 * Tests for type guards module
 *
 * These tests verify that each type guard correctly identifies values
 * and provides proper TypeScript type narrowing.
 */

import { describe, it, expect } from 'vitest';
import {
  isArray,
  isRecord,
  isNumber,
  isNumberIncludingNaN,
  isString,
  isBoolean,
  isNullish,
  isNotNullish,
  isBigInt,
  isFunction,
  isDate,
  isValidDate,
  isUint8Array,
  isArrayBuffer,
  assertArray,
  assertRecord,
  assertNumber,
  assertString,
} from '../guards.js';

describe('Type Guards', () => {
  describe('isArray', () => {
    it('returns true for arrays', () => {
      expect(isArray([])).toBe(true);
      expect(isArray([1, 2, 3])).toBe(true);
      expect(isArray(['a', 'b'])).toBe(true);
      expect(isArray([{ nested: true }])).toBe(true);
      expect(isArray(new Array(5))).toBe(true);
    });

    it('returns false for non-arrays', () => {
      expect(isArray(null)).toBe(false);
      expect(isArray(undefined)).toBe(false);
      expect(isArray({})).toBe(false);
      expect(isArray({ length: 0 })).toBe(false); // array-like but not array
      expect(isArray('array')).toBe(false);
      expect(isArray(123)).toBe(false);
      expect(isArray(true)).toBe(false);
      expect(isArray(() => [])).toBe(false);
    });

    it('narrows type correctly', () => {
      const value: unknown = [1, 2, 3];
      if (isArray(value)) {
        // TypeScript should allow array operations
        expect(value.length).toBe(3);
        expect(value[0]).toBe(1);
      }
    });
  });

  describe('isRecord', () => {
    it('returns true for plain objects', () => {
      expect(isRecord({})).toBe(true);
      expect(isRecord({ key: 'value' })).toBe(true);
      expect(isRecord({ nested: { deep: true } })).toBe(true);
      expect(isRecord(Object.create(null))).toBe(true);
    });

    it('returns false for non-objects', () => {
      expect(isRecord(null)).toBe(false);
      expect(isRecord(undefined)).toBe(false);
      expect(isRecord([])).toBe(false); // arrays are objects but not records
      expect(isRecord([1, 2, 3])).toBe(false);
      expect(isRecord('string')).toBe(false);
      expect(isRecord(123)).toBe(false);
      expect(isRecord(true)).toBe(false);
      expect(isRecord(() => {})).toBe(false);
    });

    it('narrows type correctly', () => {
      const value: unknown = { name: 'Alice', age: 30 };
      if (isRecord(value)) {
        // TypeScript should allow object operations
        expect(value.name).toBe('Alice');
        expect(Object.keys(value)).toContain('name');
      }
    });
  });

  describe('isNumber', () => {
    it('returns true for valid numbers', () => {
      expect(isNumber(0)).toBe(true);
      expect(isNumber(42)).toBe(true);
      expect(isNumber(-1)).toBe(true);
      expect(isNumber(3.14)).toBe(true);
      expect(isNumber(Number.MAX_VALUE)).toBe(true);
      expect(isNumber(Number.MIN_VALUE)).toBe(true);
      expect(isNumber(Infinity)).toBe(true);
      expect(isNumber(-Infinity)).toBe(true);
    });

    it('returns false for NaN (by design)', () => {
      expect(isNumber(NaN)).toBe(false);
      expect(isNumber(Number.NaN)).toBe(false);
      expect(isNumber(parseInt('not a number'))).toBe(false);
    });

    it('returns false for non-numbers', () => {
      expect(isNumber(null)).toBe(false);
      expect(isNumber(undefined)).toBe(false);
      expect(isNumber('42')).toBe(false);
      expect(isNumber('3.14')).toBe(false);
      expect(isNumber([])).toBe(false);
      expect(isNumber({})).toBe(false);
      expect(isNumber(true)).toBe(false);
      expect(isNumber(BigInt(42))).toBe(false);
    });

    it('narrows type correctly', () => {
      const value: unknown = 42;
      if (isNumber(value)) {
        // TypeScript should allow number operations
        expect(value * 2).toBe(84);
        expect(value.toFixed(2)).toBe('42.00');
      }
    });
  });

  describe('isNumberIncludingNaN', () => {
    it('returns true for all numbers including NaN', () => {
      expect(isNumberIncludingNaN(0)).toBe(true);
      expect(isNumberIncludingNaN(42)).toBe(true);
      expect(isNumberIncludingNaN(NaN)).toBe(true);
      expect(isNumberIncludingNaN(Infinity)).toBe(true);
    });

    it('returns false for non-numbers', () => {
      expect(isNumberIncludingNaN('42')).toBe(false);
      expect(isNumberIncludingNaN(null)).toBe(false);
      expect(isNumberIncludingNaN(undefined)).toBe(false);
    });
  });

  describe('isString', () => {
    it('returns true for strings', () => {
      expect(isString('')).toBe(true);
      expect(isString('hello')).toBe(true);
      expect(isString('123')).toBe(true);
      expect(isString(`template literal`)).toBe(true);
      expect(isString(String(42))).toBe(true);
    });

    it('returns false for non-strings', () => {
      expect(isString(null)).toBe(false);
      expect(isString(undefined)).toBe(false);
      expect(isString(123)).toBe(false);
      expect(isString([])).toBe(false);
      expect(isString({})).toBe(false);
      expect(isString(true)).toBe(false);
      expect(isString(new String('wrapped'))).toBe(false); // String object, not primitive
    });

    it('narrows type correctly', () => {
      const value: unknown = 'hello';
      if (isString(value)) {
        // TypeScript should allow string operations
        expect(value.toUpperCase()).toBe('HELLO');
        expect(value.length).toBe(5);
      }
    });
  });

  describe('isBoolean', () => {
    it('returns true for booleans', () => {
      expect(isBoolean(true)).toBe(true);
      expect(isBoolean(false)).toBe(true);
      expect(isBoolean(Boolean(1))).toBe(true);
      expect(isBoolean(!!0)).toBe(true);
    });

    it('returns false for non-booleans', () => {
      expect(isBoolean(null)).toBe(false);
      expect(isBoolean(undefined)).toBe(false);
      expect(isBoolean(0)).toBe(false);
      expect(isBoolean(1)).toBe(false);
      expect(isBoolean('')).toBe(false);
      expect(isBoolean('true')).toBe(false);
      expect(isBoolean([])).toBe(false);
      expect(isBoolean({})).toBe(false);
    });

    it('narrows type correctly', () => {
      const value: unknown = true;
      if (isBoolean(value)) {
        // TypeScript should allow boolean operations
        expect(!value).toBe(false);
      }
    });
  });

  describe('isNullish', () => {
    it('returns true for null and undefined', () => {
      expect(isNullish(null)).toBe(true);
      expect(isNullish(undefined)).toBe(true);
      expect(isNullish(void 0)).toBe(true);
    });

    it('returns false for other falsy values', () => {
      expect(isNullish(0)).toBe(false);
      expect(isNullish('')).toBe(false);
      expect(isNullish(false)).toBe(false);
      expect(isNullish(NaN)).toBe(false);
    });

    it('returns false for truthy values', () => {
      expect(isNullish(1)).toBe(false);
      expect(isNullish('string')).toBe(false);
      expect(isNullish([])).toBe(false);
      expect(isNullish({})).toBe(false);
    });
  });

  describe('isNotNullish', () => {
    it('returns false for null and undefined', () => {
      expect(isNotNullish(null)).toBe(false);
      expect(isNotNullish(undefined)).toBe(false);
    });

    it('returns true for everything else', () => {
      expect(isNotNullish(0)).toBe(true);
      expect(isNotNullish('')).toBe(true);
      expect(isNotNullish(false)).toBe(true);
      expect(isNotNullish([])).toBe(true);
      expect(isNotNullish({})).toBe(true);
    });

    it('works as array filter', () => {
      const items: (string | null | undefined)[] = ['a', null, 'b', undefined, 'c'];
      const filtered = items.filter(isNotNullish);
      expect(filtered).toEqual(['a', 'b', 'c']);
      // Type should be narrowed to string[]
      expect(filtered.every(item => typeof item === 'string')).toBe(true);
    });
  });

  describe('isBigInt', () => {
    it('returns true for bigints', () => {
      expect(isBigInt(BigInt(0))).toBe(true);
      expect(isBigInt(BigInt(42))).toBe(true);
      expect(isBigInt(BigInt(-1))).toBe(true);
      expect(isBigInt(BigInt('9007199254740991'))).toBe(true);
    });

    it('returns false for regular numbers', () => {
      expect(isBigInt(0)).toBe(false);
      expect(isBigInt(42)).toBe(false);
      expect(isBigInt(Number.MAX_SAFE_INTEGER)).toBe(false);
    });

    it('returns false for non-numbers', () => {
      expect(isBigInt(null)).toBe(false);
      expect(isBigInt('42')).toBe(false);
      expect(isBigInt({})).toBe(false);
    });
  });

  describe('isFunction', () => {
    it('returns true for functions', () => {
      expect(isFunction(() => {})).toBe(true);
      expect(isFunction(function() {})).toBe(true);
      expect(isFunction(async () => {})).toBe(true);
      expect(isFunction(function* () {})).toBe(true);
      expect(isFunction(Array.isArray)).toBe(true);
      expect(isFunction(console.log)).toBe(true);
    });

    it('returns false for non-functions', () => {
      expect(isFunction(null)).toBe(false);
      expect(isFunction(undefined)).toBe(false);
      expect(isFunction({})).toBe(false);
      expect(isFunction([])).toBe(false);
      expect(isFunction('function')).toBe(false);
    });
  });

  describe('isDate', () => {
    it('returns true for Date instances', () => {
      expect(isDate(new Date())).toBe(true);
      expect(isDate(new Date('2024-01-01'))).toBe(true);
      expect(isDate(new Date(0))).toBe(true);
    });

    it('returns true for invalid Date (Invalid Date is still a Date)', () => {
      expect(isDate(new Date('invalid'))).toBe(true);
    });

    it('returns false for non-dates', () => {
      expect(isDate(null)).toBe(false);
      expect(isDate(undefined)).toBe(false);
      expect(isDate('2024-01-01')).toBe(false);
      expect(isDate(Date.now())).toBe(false); // timestamp number
      expect(isDate({})).toBe(false);
    });
  });

  describe('isValidDate', () => {
    it('returns true for valid dates', () => {
      expect(isValidDate(new Date())).toBe(true);
      expect(isValidDate(new Date('2024-01-01'))).toBe(true);
      expect(isValidDate(new Date(0))).toBe(true);
    });

    it('returns false for invalid dates', () => {
      expect(isValidDate(new Date('invalid'))).toBe(false);
      expect(isValidDate(new Date(NaN))).toBe(false);
    });

    it('returns false for non-dates', () => {
      expect(isValidDate(null)).toBe(false);
      expect(isValidDate('2024-01-01')).toBe(false);
      expect(isValidDate(Date.now())).toBe(false);
    });
  });

  describe('isUint8Array', () => {
    it('returns true for Uint8Array', () => {
      expect(isUint8Array(new Uint8Array())).toBe(true);
      expect(isUint8Array(new Uint8Array([1, 2, 3]))).toBe(true);
      expect(isUint8Array(new Uint8Array(10))).toBe(true);
    });

    it('returns false for other typed arrays', () => {
      expect(isUint8Array(new Uint16Array())).toBe(false);
      expect(isUint8Array(new Int8Array())).toBe(false);
      expect(isUint8Array(new Float32Array())).toBe(false);
    });

    it('returns false for non-typed arrays', () => {
      expect(isUint8Array(null)).toBe(false);
      expect(isUint8Array([])).toBe(false);
      expect(isUint8Array(new ArrayBuffer(8))).toBe(false);
    });
  });

  describe('isArrayBuffer', () => {
    it('returns true for ArrayBuffer', () => {
      expect(isArrayBuffer(new ArrayBuffer(0))).toBe(true);
      expect(isArrayBuffer(new ArrayBuffer(8))).toBe(true);
    });

    it('returns false for typed arrays', () => {
      expect(isArrayBuffer(new Uint8Array())).toBe(false);
      expect(isArrayBuffer(new Uint8Array().buffer)).toBe(true); // but .buffer is ArrayBuffer
    });

    it('returns false for non-buffers', () => {
      expect(isArrayBuffer(null)).toBe(false);
      expect(isArrayBuffer([])).toBe(false);
      expect(isArrayBuffer({})).toBe(false);
    });
  });
});

describe('Assertion Helpers', () => {
  describe('assertArray', () => {
    it('does not throw for arrays', () => {
      expect(() => assertArray([])).not.toThrow();
      expect(() => assertArray([1, 2, 3])).not.toThrow();
    });

    it('throws TypeError for non-arrays', () => {
      expect(() => assertArray(null)).toThrow(TypeError);
      expect(() => assertArray({})).toThrow(TypeError);
      expect(() => assertArray('string')).toThrow(TypeError);
    });

    it('includes custom message in error', () => {
      expect(() => assertArray(null, 'Custom message')).toThrow('Custom message');
    });

    it('includes default message with type info', () => {
      expect(() => assertArray('string')).toThrow('Expected array, got string');
    });
  });

  describe('assertRecord', () => {
    it('does not throw for objects', () => {
      expect(() => assertRecord({})).not.toThrow();
      expect(() => assertRecord({ key: 'value' })).not.toThrow();
    });

    it('throws TypeError for non-objects', () => {
      expect(() => assertRecord(null)).toThrow(TypeError);
      expect(() => assertRecord([])).toThrow(TypeError);
      expect(() => assertRecord('string')).toThrow(TypeError);
    });

    it('includes custom message in error', () => {
      expect(() => assertRecord(null, 'Custom message')).toThrow('Custom message');
    });
  });

  describe('assertNumber', () => {
    it('does not throw for numbers', () => {
      expect(() => assertNumber(0)).not.toThrow();
      expect(() => assertNumber(42)).not.toThrow();
      expect(() => assertNumber(Infinity)).not.toThrow();
    });

    it('throws TypeError for NaN', () => {
      expect(() => assertNumber(NaN)).toThrow(TypeError);
    });

    it('throws TypeError for non-numbers', () => {
      expect(() => assertNumber(null)).toThrow(TypeError);
      expect(() => assertNumber('42')).toThrow(TypeError);
      expect(() => assertNumber({})).toThrow(TypeError);
    });

    it('includes custom message in error', () => {
      expect(() => assertNumber(null, 'Custom message')).toThrow('Custom message');
    });
  });

  describe('assertString', () => {
    it('does not throw for strings', () => {
      expect(() => assertString('')).not.toThrow();
      expect(() => assertString('hello')).not.toThrow();
    });

    it('throws TypeError for non-strings', () => {
      expect(() => assertString(null)).toThrow(TypeError);
      expect(() => assertString(123)).toThrow(TypeError);
      expect(() => assertString({})).toThrow(TypeError);
    });

    it('includes custom message in error', () => {
      expect(() => assertString(null, 'Custom message')).toThrow('Custom message');
    });
  });
});

describe('Integration: Guard + Assertion Pattern', () => {
  it('demonstrates safe type narrowing pattern', () => {
    function processData(data: unknown): string {
      if (isRecord(data) && isString(data.name)) {
        return `Hello, ${data.name}!`;
      }
      if (isArray(data) && data.every(isString)) {
        return data.join(', ');
      }
      if (isNumber(data)) {
        return `Number: ${data}`;
      }
      return 'Unknown data';
    }

    expect(processData({ name: 'Alice' })).toBe('Hello, Alice!');
    expect(processData(['a', 'b', 'c'])).toBe('a, b, c');
    expect(processData(42)).toBe('Number: 42');
    expect(processData(null)).toBe('Unknown data');
  });

  it('demonstrates assertion pattern for guaranteed types', () => {
    function parseConfig(json: string): Record<string, unknown> {
      const parsed: unknown = JSON.parse(json);
      assertRecord(parsed, 'Config must be an object');
      return parsed;
    }

    expect(parseConfig('{"key": "value"}')).toEqual({ key: 'value' });
    expect(() => parseConfig('"just a string"')).toThrow('Config must be an object');
    expect(() => parseConfig('[1, 2, 3]')).toThrow('Config must be an object');
  });
});
