/**
 * @evodb/core - Encode Type Validation Tests (TDD)
 *
 * Tests for runtime type validation in the encode module.
 * These tests verify that encode() properly validates:
 * - Column type is a valid Type enum value
 * - Null values are not present in non-nullable columns
 * - Value types match the declared column type
 * - Array element types match declared type
 *
 * Issue: evodb-4v3 - Type assertions in encoding need runtime validation
 */

import { describe, it, expect } from 'vitest';
import {
  encode,
  Type,
  type Column,
} from '../index.js';

// We'll import EncodingValidationError once it's created
// For now, we test that the right error is thrown

describe('Encode Type Validation', () => {
  // =============================================================================
  // 1. INVALID COLUMN TYPE TESTS
  // =============================================================================

  describe('Invalid Column Type', () => {
    it('should throw EncodingValidationError on invalid column type', () => {
      const column: Column = {
        path: 'test',
        type: 999 as Type, // Invalid type enum value
        nullable: false,
        values: [1, 2, 3],
        nulls: [false, false, false],
      };

      expect(() => encode([column])).toThrow();
      expect(() => encode([column])).toThrow(/invalid.*type|unknown.*type|unsupported.*type/i);
    });

    it('should throw EncodingValidationError on negative type enum', () => {
      const column: Column = {
        path: 'test',
        type: -1 as Type, // Negative type enum value
        nullable: false,
        values: ['a', 'b', 'c'],
        nulls: [false, false, false],
      };

      expect(() => encode([column])).toThrow();
      expect(() => encode([column])).toThrow(/invalid.*type|unknown.*type|unsupported.*type/i);
    });
  });

  // =============================================================================
  // 2. NULLABILITY CONSTRAINT TESTS
  // =============================================================================

  describe('Nullability Constraints', () => {
    it('should throw EncodingValidationError on null value in non-nullable column', () => {
      const column: Column = {
        path: 'required_field',
        type: Type.String,
        nullable: false, // Non-nullable
        values: ['valid', null, 'also valid'], // Contains null
        nulls: [false, true, false], // Marks second value as null
      };

      expect(() => encode([column])).toThrow();
      expect(() => encode([column])).toThrow(/null.*non-nullable|nullable.*constraint/i);
    });

    it('should throw EncodingValidationError on undefined value in non-nullable column', () => {
      const column: Column = {
        path: 'required_field',
        type: Type.Int32,
        nullable: false,
        values: [1, undefined, 3],
        nulls: [false, true, false],
      };

      expect(() => encode([column])).toThrow();
      expect(() => encode([column])).toThrow(/null.*non-nullable|nullable.*constraint/i);
    });

    it('should allow null values in nullable column', () => {
      const column: Column = {
        path: 'optional_field',
        type: Type.String,
        nullable: true, // Nullable - allowed
        values: ['valid', null, 'also valid'],
        nulls: [false, true, false],
      };

      // Should NOT throw
      expect(() => encode([column])).not.toThrow();
    });

    it('should allow all values null in nullable column', () => {
      const column: Column = {
        path: 'all_nulls',
        type: Type.Int32,
        nullable: true,
        values: [null, null, null],
        nulls: [true, true, true],
      };

      expect(() => encode([column])).not.toThrow();
    });
  });

  // =============================================================================
  // 3. TYPE MISMATCH TESTS
  // =============================================================================

  describe('Type Mismatch', () => {
    it('should throw EncodingValidationError on string in Int32 column', () => {
      const column: Column = {
        path: 'numeric_field',
        type: Type.Int32,
        nullable: false,
        values: [1, 'not a number', 3],
        nulls: [false, false, false],
      };

      expect(() => encode([column])).toThrow();
      expect(() => encode([column])).toThrow(/type.*mismatch|expected.*Int32|invalid.*value/i);
    });

    it('should throw EncodingValidationError on number in String column', () => {
      const column: Column = {
        path: 'text_field',
        type: Type.String,
        nullable: false,
        values: ['valid', 42, 'also valid'],
        nulls: [false, false, false],
      };

      expect(() => encode([column])).toThrow();
      expect(() => encode([column])).toThrow(/type.*mismatch|expected.*String|invalid.*value/i);
    });

    it('should throw EncodingValidationError on string in Float64 column', () => {
      const column: Column = {
        path: 'decimal_field',
        type: Type.Float64,
        nullable: false,
        values: [1.5, 'not a float', 3.14],
        nulls: [false, false, false],
      };

      expect(() => encode([column])).toThrow();
      expect(() => encode([column])).toThrow(/type.*mismatch|expected.*Float64|invalid.*value/i);
    });

    it('should throw EncodingValidationError on non-boolean in Bool column', () => {
      const column: Column = {
        path: 'flag_field',
        type: Type.Bool,
        nullable: false,
        values: [true, 'yes', false],
        nulls: [false, false, false],
      };

      expect(() => encode([column])).toThrow();
      expect(() => encode([column])).toThrow(/type.*mismatch|expected.*Bool|invalid.*value/i);
    });

    it('should throw EncodingValidationError on non-bigint in Int64 column', () => {
      const column: Column = {
        path: 'bigint_field',
        type: Type.Int64,
        nullable: false,
        values: [BigInt(1), 'not a bigint', BigInt(3)],
        nulls: [false, false, false],
      };

      expect(() => encode([column])).toThrow();
      expect(() => encode([column])).toThrow(/type.*mismatch|expected.*Int64|invalid.*value/i);
    });

    it('should throw EncodingValidationError on non-Uint8Array in Binary column', () => {
      const column: Column = {
        path: 'binary_field',
        type: Type.Binary,
        nullable: false,
        values: [new Uint8Array([1, 2]), 'not binary', new Uint8Array([3, 4])],
        nulls: [false, false, false],
      };

      expect(() => encode([column])).toThrow();
      expect(() => encode([column])).toThrow(/type.*mismatch|expected.*Binary|invalid.*value/i);
    });

    it('should allow number or Date in Timestamp column', () => {
      const column: Column = {
        path: 'timestamp_field',
        type: Type.Timestamp,
        nullable: false,
        values: [Date.now(), new Date(), 1234567890000],
        nulls: [false, false, false],
      };

      // Timestamps accept both number (ms since epoch) and Date objects
      expect(() => encode([column])).not.toThrow();
    });

    it('should throw EncodingValidationError on non-string in Date column', () => {
      const column: Column = {
        path: 'date_field',
        type: Type.Date,
        nullable: false,
        values: ['2024-01-01', 12345, '2024-12-31'],
        nulls: [false, false, false],
      };

      expect(() => encode([column])).toThrow();
      expect(() => encode([column])).toThrow(/type.*mismatch|expected.*Date|invalid.*value/i);
    });
  });

  // =============================================================================
  // 4. ARRAY VALUE VALIDATION TESTS
  // =============================================================================

  describe('Array Value Validation', () => {
    it('should throw EncodingValidationError when Array column has non-array value', () => {
      const column: Column = {
        path: 'list_field',
        type: Type.Array,
        nullable: false,
        values: [[1, 2, 3], 'not an array', [4, 5, 6]],
        nulls: [false, false, false],
      };

      expect(() => encode([column])).toThrow();
      expect(() => encode([column])).toThrow(/type.*mismatch|expected.*Array|invalid.*value/i);
    });

    it('should accept valid arrays in Array column', () => {
      const column: Column = {
        path: 'list_field',
        type: Type.Array,
        nullable: false,
        values: [[1, 2, 3], [4, 5], []],
        nulls: [false, false, false],
      };

      expect(() => encode([column])).not.toThrow();
    });
  });

  // =============================================================================
  // 5. OBJECT TYPE VALIDATION TESTS
  // =============================================================================

  describe('Object Type Validation', () => {
    it('should throw EncodingValidationError when Object column has primitive value', () => {
      const column: Column = {
        path: 'object_field',
        type: Type.Object,
        nullable: false,
        values: [{ key: 'value' }, 'not an object', { another: 'object' }],
        nulls: [false, false, false],
      };

      expect(() => encode([column])).toThrow();
      expect(() => encode([column])).toThrow(/type.*mismatch|expected.*Object|invalid.*value/i);
    });

    it('should throw EncodingValidationError when Object column has array value', () => {
      const column: Column = {
        path: 'object_field',
        type: Type.Object,
        nullable: false,
        values: [{ key: 'value' }, [1, 2, 3], { another: 'object' }],
        nulls: [false, false, false],
      };

      expect(() => encode([column])).toThrow();
      expect(() => encode([column])).toThrow(/type.*mismatch|expected.*Object|invalid.*value/i);
    });

    it('should accept valid objects in Object column', () => {
      const column: Column = {
        path: 'object_field',
        type: Type.Object,
        nullable: false,
        values: [{ a: 1 }, { b: 2 }, {}],
        nulls: [false, false, false],
      };

      expect(() => encode([column])).not.toThrow();
    });
  });

  // =============================================================================
  // 6. ERROR MESSAGE QUALITY TESTS
  // =============================================================================

  describe('Error Message Quality', () => {
    it('should include column path in error message', () => {
      const column: Column = {
        path: 'user.profile.age',
        type: Type.Int32,
        nullable: false,
        values: [25, 'thirty', 35],
        nulls: [false, false, false],
      };

      try {
        encode([column]);
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toMatch(/user\.profile\.age/);
      }
    });

    it('should include expected and actual type in error message', () => {
      const column: Column = {
        path: 'count',
        type: Type.Int32,
        nullable: false,
        values: [1, 'two', 3],
        nulls: [false, false, false],
      };

      try {
        encode([column]);
        expect.fail('Should have thrown');
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toMatch(/Int32|number/i);
        expect(message).toMatch(/string/i);
      }
    });

    it('should include value index in error message', () => {
      const column: Column = {
        path: 'items',
        type: Type.String,
        nullable: false,
        values: ['a', 'b', 42, 'd'],
        nulls: [false, false, false, false],
      };

      try {
        encode([column]);
        expect.fail('Should have thrown');
      } catch (error) {
        // Error should indicate which index has the problem (index 2)
        expect((error as Error).message).toMatch(/index.*2|at.*2|\[2\]/i);
      }
    });
  });

  // =============================================================================
  // 7. MULTIPLE COLUMN VALIDATION TESTS
  // =============================================================================

  describe('Multiple Column Validation', () => {
    it('should validate all columns and report first error', () => {
      const columns: Column[] = [
        {
          path: 'valid_col',
          type: Type.String,
          nullable: false,
          values: ['a', 'b', 'c'],
          nulls: [false, false, false],
        },
        {
          path: 'invalid_col',
          type: Type.Int32,
          nullable: false,
          values: [1, 'bad', 3],
          nulls: [false, false, false],
        },
      ];

      expect(() => encode(columns)).toThrow();
      expect(() => encode(columns)).toThrow(/invalid_col/);
    });

    it('should validate empty columns array', () => {
      // Empty array should be valid (no columns to encode)
      expect(() => encode([])).not.toThrow();
    });
  });

  // =============================================================================
  // 8. EDGE CASES
  // =============================================================================

  describe('Edge Cases', () => {
    it('should handle empty values array', () => {
      const column: Column = {
        path: 'empty',
        type: Type.String,
        nullable: false,
        values: [],
        nulls: [],
      };

      // Empty column should be valid
      expect(() => encode([column])).not.toThrow();
    });

    it('should handle single value', () => {
      const column: Column = {
        path: 'single',
        type: Type.Int32,
        nullable: false,
        values: ['not a number'],
        nulls: [false],
      };

      expect(() => encode([column])).toThrow();
    });

    it('should not skip validation for null values in type check', () => {
      // Even if nulls[i] is true, if the column is non-nullable, it should error
      const column: Column = {
        path: 'sneaky_null',
        type: Type.String,
        nullable: false,
        values: ['valid', 'also valid', null], // null value
        nulls: [false, false, true], // marked as null in bitmap
      };

      expect(() => encode([column])).toThrow();
      expect(() => encode([column])).toThrow(/null.*non-nullable/i);
    });

    it('should validate Null type column allows only null values', () => {
      const column: Column = {
        path: 'null_col',
        type: Type.Null,
        nullable: true,
        values: [null, null, null],
        nulls: [true, true, true],
      };

      expect(() => encode([column])).not.toThrow();
    });
  });
});
