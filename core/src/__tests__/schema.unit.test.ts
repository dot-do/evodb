/**
 * Schema module unit tests
 *
 * Tests for schema inference and compatibility checking.
 */

import { describe, it, expect } from 'vitest';
import { inferSchema, isSchemaCompatible, isCompatible } from '../schema.ts';
import { Type, type Column, type Schema } from '../types.ts';

describe('schema', () => {
  // =============================================================================
  // inferSchema tests
  // =============================================================================

  describe('inferSchema', () => {
    it('should create schema from columns with default id and version', () => {
      const columns: Column[] = [
        { path: 'name', type: Type.String, nullable: false, values: ['Alice'], nulls: [false] },
        { path: 'age', type: Type.Int32, nullable: true, values: [30], nulls: [false] },
      ];

      const schema = inferSchema(columns);

      expect(schema.id).toBe(1);
      expect(schema.version).toBe(1);
      expect(schema.columns).toHaveLength(2);
      expect(schema.columns[0]).toEqual({ path: 'name', type: Type.String, nullable: false });
      expect(schema.columns[1]).toEqual({ path: 'age', type: Type.Int32, nullable: true });
    });

    it('should create schema with custom id and version', () => {
      const columns: Column[] = [
        { path: 'id', type: Type.Int64, nullable: false, values: [1n], nulls: [false] },
      ];

      const schema = inferSchema(columns, 42, 7);

      expect(schema.id).toBe(42);
      expect(schema.version).toBe(7);
    });

    it('should handle empty columns array', () => {
      const schema = inferSchema([]);

      expect(schema.id).toBe(1);
      expect(schema.version).toBe(1);
      expect(schema.columns).toHaveLength(0);
    });

    it('should extract only path, type, and nullable from columns', () => {
      const columns: Column[] = [
        {
          path: 'data',
          type: Type.Binary,
          nullable: true,
          values: [new Uint8Array([1, 2, 3])],
          nulls: [false],
        },
      ];

      const schema = inferSchema(columns);

      // Schema columns should not have values or nulls arrays
      expect(schema.columns[0]).toEqual({ path: 'data', type: Type.Binary, nullable: true });
      expect((schema.columns[0] as unknown as Column).values).toBeUndefined();
      expect((schema.columns[0] as unknown as Column).nulls).toBeUndefined();
    });

    it('should handle all column types', () => {
      const columns: Column[] = [
        { path: 'null_col', type: Type.Null, nullable: true, values: [null], nulls: [true] },
        { path: 'bool_col', type: Type.Bool, nullable: false, values: [true], nulls: [false] },
        { path: 'int32_col', type: Type.Int32, nullable: false, values: [42], nulls: [false] },
        { path: 'int64_col', type: Type.Int64, nullable: false, values: [42n], nulls: [false] },
        { path: 'float64_col', type: Type.Float64, nullable: false, values: [3.14], nulls: [false] },
        { path: 'string_col', type: Type.String, nullable: false, values: ['hello'], nulls: [false] },
        { path: 'binary_col', type: Type.Binary, nullable: false, values: [new Uint8Array()], nulls: [false] },
        { path: 'array_col', type: Type.Array, nullable: false, values: [[1, 2]], nulls: [false] },
        { path: 'object_col', type: Type.Object, nullable: false, values: [{ a: 1 }], nulls: [false] },
        { path: 'timestamp_col', type: Type.Timestamp, nullable: false, values: [Date.now()], nulls: [false] },
        { path: 'date_col', type: Type.Date, nullable: false, values: ['2024-01-01'], nulls: [false] },
      ];

      const schema = inferSchema(columns);

      expect(schema.columns).toHaveLength(11);
      expect(schema.columns.map(c => c.type)).toEqual([
        Type.Null, Type.Bool, Type.Int32, Type.Int64, Type.Float64,
        Type.String, Type.Binary, Type.Array, Type.Object, Type.Timestamp, Type.Date,
      ]);
    });
  });

  // =============================================================================
  // isSchemaCompatible tests
  // =============================================================================

  describe('isSchemaCompatible', () => {
    it('should return true for identical schemas', () => {
      const schema: Schema = {
        id: 1,
        version: 1,
        columns: [
          { path: 'name', type: Type.String, nullable: false },
          { path: 'age', type: Type.Int32, nullable: true },
        ],
      };

      expect(isSchemaCompatible(schema, schema)).toBe(true);
    });

    it('should return true when new schema adds nullable column', () => {
      const older: Schema = {
        id: 1,
        version: 1,
        columns: [{ path: 'name', type: Type.String, nullable: false }],
      };

      const newer: Schema = {
        id: 1,
        version: 2,
        columns: [
          { path: 'name', type: Type.String, nullable: false },
          { path: 'age', type: Type.Int32, nullable: true },
        ],
      };

      expect(isSchemaCompatible(older, newer)).toBe(true);
    });

    it('should return true when new schema adds column with default value', () => {
      const older: Schema = {
        id: 1,
        version: 1,
        columns: [{ path: 'name', type: Type.String, nullable: false }],
      };

      const newer: Schema = {
        id: 1,
        version: 2,
        columns: [
          { path: 'name', type: Type.String, nullable: false },
          { path: 'count', type: Type.Int32, nullable: false, defaultValue: 0 },
        ],
      };

      expect(isSchemaCompatible(older, newer)).toBe(true);
    });

    it('should return false when new schema adds non-nullable column without default', () => {
      const older: Schema = {
        id: 1,
        version: 1,
        columns: [{ path: 'name', type: Type.String, nullable: false }],
      };

      const newer: Schema = {
        id: 1,
        version: 2,
        columns: [
          { path: 'name', type: Type.String, nullable: false },
          { path: 'age', type: Type.Int32, nullable: false },
        ],
      };

      expect(isSchemaCompatible(older, newer)).toBe(false);
    });

    it('should return true for Int32 -> Int64 promotion', () => {
      const older: Schema = {
        id: 1,
        version: 1,
        columns: [{ path: 'count', type: Type.Int32, nullable: false }],
      };

      const newer: Schema = {
        id: 1,
        version: 2,
        columns: [{ path: 'count', type: Type.Int64, nullable: false }],
      };

      expect(isSchemaCompatible(older, newer)).toBe(true);
    });

    it('should return true for Int32 -> Float64 promotion', () => {
      const older: Schema = {
        id: 1,
        version: 1,
        columns: [{ path: 'value', type: Type.Int32, nullable: false }],
      };

      const newer: Schema = {
        id: 1,
        version: 2,
        columns: [{ path: 'value', type: Type.Float64, nullable: false }],
      };

      expect(isSchemaCompatible(older, newer)).toBe(true);
    });

    it('should return true for Int64 -> Float64 promotion', () => {
      const older: Schema = {
        id: 1,
        version: 1,
        columns: [{ path: 'value', type: Type.Int64, nullable: false }],
      };

      const newer: Schema = {
        id: 1,
        version: 2,
        columns: [{ path: 'value', type: Type.Float64, nullable: false }],
      };

      expect(isSchemaCompatible(older, newer)).toBe(true);
    });

    it('should return true for any type -> String promotion', () => {
      const types = [Type.Bool, Type.Int32, Type.Int64, Type.Float64, Type.Timestamp];

      for (const fromType of types) {
        const older: Schema = {
          id: 1,
          version: 1,
          columns: [{ path: 'value', type: fromType, nullable: false }],
        };

        const newer: Schema = {
          id: 1,
          version: 2,
          columns: [{ path: 'value', type: Type.String, nullable: false }],
        };

        expect(isSchemaCompatible(older, newer)).toBe(true);
      }
    });

    it('should return false for incompatible type change', () => {
      const older: Schema = {
        id: 1,
        version: 1,
        columns: [{ path: 'value', type: Type.String, nullable: false }],
      };

      const newer: Schema = {
        id: 1,
        version: 2,
        columns: [{ path: 'value', type: Type.Int32, nullable: false }],
      };

      expect(isSchemaCompatible(older, newer)).toBe(false);
    });

    it('should return false for Int64 -> Int32 downgrade', () => {
      const older: Schema = {
        id: 1,
        version: 1,
        columns: [{ path: 'value', type: Type.Int64, nullable: false }],
      };

      const newer: Schema = {
        id: 1,
        version: 2,
        columns: [{ path: 'value', type: Type.Int32, nullable: false }],
      };

      expect(isSchemaCompatible(older, newer)).toBe(false);
    });

    it('should handle column removal in newer schema', () => {
      const older: Schema = {
        id: 1,
        version: 1,
        columns: [
          { path: 'name', type: Type.String, nullable: false },
          { path: 'age', type: Type.Int32, nullable: true },
        ],
      };

      const newer: Schema = {
        id: 1,
        version: 2,
        columns: [{ path: 'name', type: Type.String, nullable: false }],
      };

      // Removing columns is compatible (old data still has the column, just not used)
      expect(isSchemaCompatible(older, newer)).toBe(true);
    });

    it('should handle empty schemas', () => {
      const empty: Schema = { id: 1, version: 1, columns: [] };

      expect(isSchemaCompatible(empty, empty)).toBe(true);
    });

    it('should handle schema with nullable column becoming non-nullable with default', () => {
      const older: Schema = {
        id: 1,
        version: 1,
        columns: [{ path: 'value', type: Type.Int32, nullable: true }],
      };

      const newer: Schema = {
        id: 1,
        version: 2,
        columns: [{ path: 'value', type: Type.Int32, nullable: false }],
      };

      // Types match, so this is compatible (nullability change doesn't affect type promotion)
      expect(isSchemaCompatible(older, newer)).toBe(true);
    });
  });

  // =============================================================================
  // isCompatible (deprecated alias) tests
  // =============================================================================

  describe('isCompatible (deprecated)', () => {
    it('should be an alias for isSchemaCompatible', () => {
      expect(isCompatible).toBe(isSchemaCompatible);
    });
  });
});
