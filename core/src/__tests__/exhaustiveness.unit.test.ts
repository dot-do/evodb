/**
 * @evodb/core - Exhaustiveness Check Tests
 *
 * These tests verify that the assertNever helper function correctly
 * provides exhaustiveness checking for discriminated unions in switch statements.
 */

import { describe, it, expect } from 'vitest';
import { assertNever, Type, Encoding } from '../types.js';

// =============================================================================
// assertNever Helper Tests
// =============================================================================

describe('assertNever Helper', () => {
  describe('Runtime behavior', () => {
    it('should throw an error with default message when called with unexpected value', () => {
      // Force a value through that TypeScript would normally prevent
      const unexpectedValue = 'unexpected' as never;

      expect(() => assertNever(unexpectedValue)).toThrow('Unexpected value: "unexpected"');
    });

    it('should throw an error with custom message when provided', () => {
      const unexpectedValue = 42 as never;

      expect(() => assertNever(unexpectedValue, 'Custom error: got 42')).toThrow('Custom error: got 42');
    });

    it('should handle object values in default message', () => {
      const unexpectedValue = { type: 'unknown' } as never;

      expect(() => assertNever(unexpectedValue)).toThrow('Unexpected value: {"type":"unknown"}');
    });
  });

  describe('Type discriminator coverage (Type enum)', () => {
    // This test demonstrates that when all Type enum values are handled,
    // TypeScript infers that `type` in the default case is `never`.
    // If a new Type is added to the enum, this test would fail to compile
    // until the new case is handled.

    function getTypeDescription(type: Type): string {
      switch (type) {
        case Type.Null:
          return 'null';
        case Type.Bool:
          return 'boolean';
        case Type.Int32:
          return 'int32';
        case Type.Int64:
          return 'int64';
        case Type.Float64:
          return 'float64';
        case Type.String:
          return 'string';
        case Type.Binary:
          return 'binary';
        case Type.Array:
          return 'array';
        case Type.Object:
          return 'object';
        case Type.Timestamp:
          return 'timestamp';
        case Type.Date:
          return 'date';
        default:
          return assertNever(type, `Unhandled type: ${type}`);
      }
    }

    it('should handle all Type enum values', () => {
      expect(getTypeDescription(Type.Null)).toBe('null');
      expect(getTypeDescription(Type.Bool)).toBe('boolean');
      expect(getTypeDescription(Type.Int32)).toBe('int32');
      expect(getTypeDescription(Type.Int64)).toBe('int64');
      expect(getTypeDescription(Type.Float64)).toBe('float64');
      expect(getTypeDescription(Type.String)).toBe('string');
      expect(getTypeDescription(Type.Binary)).toBe('binary');
      expect(getTypeDescription(Type.Array)).toBe('array');
      expect(getTypeDescription(Type.Object)).toBe('object');
      expect(getTypeDescription(Type.Timestamp)).toBe('timestamp');
      expect(getTypeDescription(Type.Date)).toBe('date');
    });
  });

  describe('Encoding discriminator coverage (Encoding enum)', () => {
    function getEncodingDescription(encoding: Encoding): string {
      switch (encoding) {
        case Encoding.Plain:
          return 'plain';
        case Encoding.RLE:
          return 'run-length encoded';
        case Encoding.Dict:
          return 'dictionary encoded';
        case Encoding.Delta:
          return 'delta encoded';
        default:
          return assertNever(encoding, `Unhandled encoding: ${encoding}`);
      }
    }

    it('should handle all Encoding enum values', () => {
      expect(getEncodingDescription(Encoding.Plain)).toBe('plain');
      expect(getEncodingDescription(Encoding.RLE)).toBe('run-length encoded');
      expect(getEncodingDescription(Encoding.Dict)).toBe('dictionary encoded');
      expect(getEncodingDescription(Encoding.Delta)).toBe('delta encoded');
    });
  });

  describe('Discriminated union coverage', () => {
    // Example of a discriminated union type
    type SchemaChange =
      | { type: 'add_column'; column: string }
      | { type: 'drop_column'; columnName: string }
      | { type: 'rename_column'; oldName: string; newName: string };

    function describeSchemaChange(change: SchemaChange): string {
      switch (change.type) {
        case 'add_column':
          return `Add column: ${change.column}`;
        case 'drop_column':
          return `Drop column: ${change.columnName}`;
        case 'rename_column':
          return `Rename column: ${change.oldName} -> ${change.newName}`;
        default:
          // TypeScript infers change as `never` here when all cases are covered
          return assertNever(change, `Unhandled schema change type`);
      }
    }

    it('should handle all discriminated union cases', () => {
      expect(describeSchemaChange({ type: 'add_column', column: 'email' }))
        .toBe('Add column: email');

      expect(describeSchemaChange({ type: 'drop_column', columnName: 'temp' }))
        .toBe('Drop column: temp');

      expect(describeSchemaChange({ type: 'rename_column', oldName: 'old', newName: 'new' }))
        .toBe('Rename column: old -> new');
    });
  });
});

// =============================================================================
// Compile-time Exhaustiveness Verification
// =============================================================================

/**
 * These type-level tests verify that our switch statements correctly
 * narrow types to `never` when all cases are handled.
 *
 * If TypeScript compilation succeeds for this file, it means:
 * 1. All enum values are covered in their respective switches
 * 2. The assertNever function correctly accepts `never` type
 * 3. Adding a new enum value would cause a compile error
 */

// Type test: verify assertNever accepts never
type AssertNeverAcceptsNever = typeof assertNever extends (value: never, message?: string) => never ? true : false;
const _assertNeverCheck: AssertNeverAcceptsNever = true;
