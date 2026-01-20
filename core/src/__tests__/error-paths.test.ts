/**
 * Error Path Tests for @evodb/core
 *
 * TDD: Comprehensive error path coverage for:
 * - Corrupt block data
 * - Invalid encoding/decoding
 * - Schema validation failures
 * - Memory constraint violations
 * - Type ID validation errors
 *
 * Issue: evodb-r1h - Add error path tests
 */

import { describe, it, expect } from 'vitest';
// Import from specific modules instead of index for better resolution
import { writeBlock, readBlock, getBlockStats } from '../block.js';
import { encode, decode } from '../encode.js';
import {
  Type,
  Encoding,
  MAGIC,
  blockId,
  snapshotId,
  batchId,
  walId,
  schemaId,
  tableId,
  isValidBlockId,
  isValidSnapshotId,
  isValidBatchId,
  isValidWalId,
  isValidSchemaId,
  isValidTableId,
  stringToTypeEnum,
  typeEnumToString,
  type Column,
  type EncodedColumn,
  type Schema,
} from '../types.js';
import { EvoDBError, StorageError, ValidationError } from '../errors.js';
import {
  isCompatible,
  serializeSchema,
  deserializeSchema,
  migrateColumns,
  schemaDiff,
} from '../schema.js';

// =============================================================================
// 1. CORRUPT BLOCK DATA TESTS
// =============================================================================

describe('Corrupt Block Data Error Paths', () => {
  describe('readBlock with corrupt data', () => {
    it('should throw error for invalid magic number', () => {
      // Create data with wrong magic number
      const corruptData = new Uint8Array(100);
      const view = new DataView(corruptData.buffer);
      view.setUint32(0, 0xDEADBEEF, true); // Wrong magic

      expect(() => readBlock(corruptData)).toThrow('Invalid block magic');
    });

    it('should throw error for truncated header', () => {
      // Data too short to contain header
      const truncatedData = new Uint8Array(10);
      const view = new DataView(truncatedData.buffer);
      view.setUint32(0, MAGIC, true); // Correct magic but too short

      expect(() => readBlock(truncatedData)).toThrow();
    });

    it('should throw error for empty data', () => {
      const emptyData = new Uint8Array(0);

      expect(() => readBlock(emptyData)).toThrow();
    });

    it('should throw error for getBlockStats with invalid magic', () => {
      const corruptData = new Uint8Array(20);
      new DataView(corruptData.buffer).setUint32(0, 0x00000000, true);

      expect(() => getBlockStats(corruptData)).toThrow('Invalid block');
    });

    it('should throw error for getBlockStats with empty data', () => {
      const emptyData = new Uint8Array(0);

      expect(() => getBlockStats(emptyData)).toThrow();
    });

    it('should handle block with mismatched column count', () => {
      // Create a minimal valid block first, then corrupt the column count
      const column: Column = {
        path: 'test',
        type: Type.Int32,
        nullable: false,
        values: [1, 2, 3],
        nulls: [false, false, false],
      };

      const encoded = encode([column]);
      const block = writeBlock(encoded, { rowCount: 3 });

      // Corrupt the column count field (offset 14)
      const view = new DataView(block.buffer);
      view.setUint16(14, 999, true); // Set invalid column count

      // This should fail during parsing
      expect(() => readBlock(block)).toThrow();
    });
  });

  describe('decode with corrupt encoded data', () => {
    it('should handle dictionary encoding with corrupt data', () => {
      // Create encoded column with truncated dictionary data
      const encoded: EncodedColumn = {
        path: 'test',
        type: Type.String,
        encoding: Encoding.Dict,
        data: new Uint8Array([1, 2, 3]), // Too short for valid dict
        nullBitmap: new Uint8Array([0]),
        stats: { min: '', max: '', nullCount: 0, distinctEst: 1 },
      };

      // Decoding truncated dictionary should throw or return invalid data
      expect(() => decode(encoded, 5)).toThrow();
    });

    it('should handle RLE encoding with corrupt data', () => {
      const encoded: EncodedColumn = {
        path: 'test',
        type: Type.Int32,
        encoding: Encoding.RLE,
        data: new Uint8Array([255, 255]), // Invalid RLE structure
        nullBitmap: new Uint8Array([0]),
        stats: { min: 0, max: 0, nullCount: 0, distinctEst: 1 },
      };

      // Should throw for corrupt data that can't be parsed
      expect(() => decode(encoded, 5)).toThrow();
    });

    it('should handle delta encoding with misaligned data', () => {
      const encoded: EncodedColumn = {
        path: 'test',
        type: Type.Int32,
        encoding: Encoding.Delta,
        data: new Uint8Array([1, 2, 3]), // Not aligned to 4 bytes for Int32
        nullBitmap: new Uint8Array([0]),
        stats: { min: 0, max: 0, nullCount: 0, distinctEst: 1 },
      };

      // Should throw for misaligned data
      expect(() => decode(encoded, 2)).toThrow();
    });

    it('should handle plain encoding with insufficient data for row count', () => {
      const encoded: EncodedColumn = {
        path: 'test',
        type: Type.Int32,
        encoding: Encoding.Plain,
        data: new Uint8Array([1, 2, 3, 4]), // Only 1 int32, but asking for 10 rows
        nullBitmap: new Uint8Array([0]),
        stats: { min: 0, max: 0, nullCount: 0, distinctEst: 1 },
      };

      // Should throw for insufficient data
      expect(() => decode(encoded, 10)).toThrow();
    });
  });
});

// =============================================================================
// 2. BRANDED TYPE ID VALIDATION ERRORS
// =============================================================================

describe('Branded Type ID Validation Error Paths', () => {
  describe('BlockId validation', () => {
    it('should throw for invalid BlockId format - no colons', () => {
      expect(() => blockId('invalidformat')).toThrow('Invalid BlockId format');
    });

    it('should throw for BlockId with single colon', () => {
      expect(() => blockId('prefix:timestamp')).toThrow('Invalid BlockId format');
    });

    it('should throw for empty BlockId', () => {
      expect(() => blockId('')).toThrow('Invalid BlockId format');
    });

    it('should throw for BlockId with spaces', () => {
      expect(() => blockId('pre fix:1234:0001')).toThrow('Invalid BlockId format');
    });

    it('should validate correctly - isValidBlockId returns false for invalid', () => {
      expect(isValidBlockId('invalid')).toBe(false);
      expect(isValidBlockId('only:one')).toBe(false);
      expect(isValidBlockId('')).toBe(false);
    });

    it('should validate correctly - isValidBlockId returns true for valid', () => {
      expect(isValidBlockId('prefix:abc123:0001')).toBe(true);
      expect(isValidBlockId('data:timestamp:seq')).toBe(true);
    });
  });

  describe('SnapshotId validation', () => {
    it('should throw for invalid SnapshotId format - no hyphen', () => {
      expect(() => snapshotId('nohyphen')).toThrow('Invalid SnapshotId format');
    });

    it('should throw for empty SnapshotId', () => {
      expect(() => snapshotId('')).toThrow('Invalid SnapshotId format');
    });

    it('should validate correctly - isValidSnapshotId', () => {
      expect(isValidSnapshotId('invalid')).toBe(false);
      expect(isValidSnapshotId('abc123-def456')).toBe(true);
    });
  });

  describe('BatchId validation', () => {
    it('should throw for invalid BatchId format - wrong separator', () => {
      expect(() => batchId('prefix-1-timestamp')).toThrow('Invalid BatchId format');
    });

    it('should throw for BatchId without numeric sequence', () => {
      expect(() => batchId('prefix_abc_timestamp')).toThrow('Invalid BatchId format');
    });

    it('should validate correctly - isValidBatchId', () => {
      expect(isValidBatchId('invalid')).toBe(false);
      expect(isValidBatchId('source_123_abc123')).toBe(true);
    });
  });

  describe('WalId validation', () => {
    it('should throw for invalid WalId format - wrong prefix', () => {
      expect(() => walId('log:123')).toThrow('Invalid WalId format');
    });

    it('should throw for WalId without lsn', () => {
      expect(() => walId('wal:')).toThrow('Invalid WalId format');
    });

    it('should throw for empty WalId', () => {
      expect(() => walId('')).toThrow('Invalid WalId format');
    });

    it('should validate correctly - isValidWalId', () => {
      expect(isValidWalId('invalid')).toBe(false);
      expect(isValidWalId('wal:abc123')).toBe(true);
    });
  });

  describe('SchemaId validation', () => {
    it('should throw for negative SchemaId', () => {
      expect(() => schemaId(-1)).toThrow('Invalid SchemaId');
    });

    it('should throw for non-integer SchemaId', () => {
      expect(() => schemaId(1.5)).toThrow('Invalid SchemaId');
    });

    it('should throw for NaN SchemaId', () => {
      expect(() => schemaId(NaN)).toThrow('Invalid SchemaId');
    });

    it('should throw for Infinity SchemaId', () => {
      expect(() => schemaId(Infinity)).toThrow('Invalid SchemaId');
    });

    it('should validate correctly - isValidSchemaId', () => {
      expect(isValidSchemaId(-1)).toBe(false);
      expect(isValidSchemaId(1.5)).toBe(false);
      expect(isValidSchemaId(NaN)).toBe(false);
      expect(isValidSchemaId(0)).toBe(true);
      expect(isValidSchemaId(100)).toBe(true);
    });
  });

  describe('TableId validation', () => {
    it('should throw for invalid UUID format', () => {
      expect(() => tableId('not-a-uuid')).toThrow('Invalid TableId format');
    });

    it('should throw for UUID with wrong length', () => {
      expect(() => tableId('12345678-1234-1234-1234-12345678901')).toThrow('Invalid TableId format');
    });

    it('should throw for empty TableId', () => {
      expect(() => tableId('')).toThrow('Invalid TableId format');
    });

    it('should throw for UUID with invalid characters', () => {
      expect(() => tableId('gggggggg-gggg-gggg-gggg-gggggggggggg')).toThrow('Invalid TableId format');
    });

    it('should validate correctly - isValidTableId', () => {
      expect(isValidTableId('not-uuid')).toBe(false);
      expect(isValidTableId('12345678-1234-1234-1234-123456789012')).toBe(true);
      expect(isValidTableId('abcdef01-2345-6789-abcd-ef0123456789')).toBe(true);
    });
  });
});

// =============================================================================
// 3. SCHEMA VALIDATION AND CONVERSION ERRORS
// =============================================================================

describe('Schema Validation Error Paths', () => {
  describe('Type conversion errors', () => {
    it('should throw for unknown Type enum in typeEnumToString', () => {
      // Force an invalid type through type assertion
      const invalidType = 999 as Type;
      // Should throw (exact message varies by implementation)
      expect(() => typeEnumToString(invalidType)).toThrow();
    });

    it('should throw for unknown type string in stringToTypeEnum', () => {
      const invalidType = 'unknown_type' as any;
      // Should throw (exact message varies by implementation)
      expect(() => stringToTypeEnum(invalidType)).toThrow();
    });
  });

  // Note: Schema conversion tests (schemaToTableSchema/tableSchemaToSchema) are covered
  // in the branded-types tests. Here we focus on error paths for validation.
});

// =============================================================================
// 4. ENCODING EDGE CASES AND ERRORS
// =============================================================================

describe('Encoding Error Paths', () => {
  describe('encode with edge case columns', () => {
    it('should handle column with all null values', () => {
      const column: Column = {
        path: 'all_nulls',
        type: Type.String,
        nullable: true,
        values: [null, null, null, null, null],
        nulls: [true, true, true, true, true],
      };

      const encoded = encode([column]);
      expect(encoded).toHaveLength(1);
      expect(encoded[0].stats.nullCount).toBe(5);

      // Decode should return all nulls
      const decoded = decode(encoded[0], 5);
      expect(decoded.values.every(v => v === null)).toBe(true);
    });

    it('should handle empty column (no rows)', () => {
      const column: Column = {
        path: 'empty',
        type: Type.Int32,
        nullable: false,
        values: [],
        nulls: [],
      };

      const encoded = encode([column]);
      expect(encoded).toHaveLength(1);
      expect(encoded[0].data.length).toBe(0);

      const decoded = decode(encoded[0], 0);
      expect(decoded.values).toHaveLength(0);
    });

    it('should handle column with single value', () => {
      const column: Column = {
        path: 'single',
        type: Type.Int32,
        nullable: false,
        values: [42],
        nulls: [false],
      };

      const encoded = encode([column]);
      const decoded = decode(encoded[0], 1);
      expect(decoded.values).toEqual([42]);
    });

    it('should handle very long strings', () => {
      const longString = 'x'.repeat(65535); // Max uint16 length
      const column: Column = {
        path: 'long_string',
        type: Type.String,
        nullable: false,
        values: [longString],
        nulls: [false],
      };

      const encoded = encode([column]);
      const decoded = decode(encoded[0], 1);
      expect(decoded.values[0]).toBe(longString);
    });

    it('should handle binary data with embedded nulls', () => {
      const binaryData = new Uint8Array([0, 1, 0, 2, 0, 3]);
      const column: Column = {
        path: 'binary',
        type: Type.Binary,
        nullable: false,
        values: [binaryData],
        nulls: [false],
      };

      const encoded = encode([column]);
      const decoded = decode(encoded[0], 1);
      expect(decoded.values[0]).toEqual(binaryData);
    });
  });

  describe('writeBlock with edge cases', () => {
    it('should handle block with no columns', () => {
      const block = writeBlock([], { rowCount: 0 });
      expect(block.length).toBeGreaterThan(0);

      const { header, columns } = readBlock(block);
      expect(header.columnCount).toBe(0);
      expect(columns).toHaveLength(0);
    });

    it('should handle block with very large row count', () => {
      const column: Column = {
        path: 'ids',
        type: Type.Int32,
        nullable: false,
        values: Array.from({ length: 10000 }, (_, i) => i),
        nulls: Array(10000).fill(false),
      };

      const encoded = encode([column]);
      const block = writeBlock(encoded, { rowCount: 10000 });

      const { header } = readBlock(block);
      expect(header.rowCount).toBe(10000);
    });

    it('should handle block with LSN range', () => {
      const column: Column = {
        path: 'data',
        type: Type.Int32,
        nullable: false,
        values: [1, 2, 3],
        nulls: [false, false, false],
      };

      const encoded = encode([column]);
      const block = writeBlock(encoded, {
        rowCount: 3,
        minLsn: 100n,
        maxLsn: 200n,
        schemaId: 42,
      });

      const { header } = readBlock(block);
      expect(header.minLsn).toBe(100n);
      expect(header.maxLsn).toBe(200n);
      expect(header.schemaId).toBe(42);
    });
  });
});

// =============================================================================
// 5. MEMORY CONSTRAINT EDGE CASES
// =============================================================================

describe('Memory Constraint Edge Cases', () => {
  it('should handle encoding columns that exceed typical memory limits gracefully', () => {
    // Create a reasonably large but manageable column
    const size = 100000; // 100K rows
    const column: Column = {
      path: 'large_col',
      type: Type.Int32,
      nullable: false,
      values: Array.from({ length: size }, (_, i) => i),
      nulls: Array(size).fill(false),
    };

    // This should not throw
    const encoded = encode([column]);
    expect(encoded).toHaveLength(1);

    // Delta encoding should be used for sorted integers
    expect(encoded[0].encoding).toBe(Encoding.Delta);
  });

  it('should handle high cardinality strings without dictionary encoding', () => {
    // Each string is unique, so dictionary encoding would be inefficient
    const size = 1000;
    const column: Column = {
      path: 'unique_strings',
      type: Type.String,
      nullable: false,
      values: Array.from({ length: size }, (_, i) => `unique_string_${i}_${Math.random()}`),
      nulls: Array(size).fill(false),
    };

    const encoded = encode([column]);
    // Should NOT use dictionary encoding for high cardinality
    expect(encoded[0].encoding).toBe(Encoding.Plain);
  });

  it('should handle mixed null/non-null values efficiently', () => {
    const size = 1000;
    const column: Column = {
      path: 'sparse',
      type: Type.Float64,
      nullable: true,
      values: Array.from({ length: size }, (_, i) => i % 10 === 0 ? null : i * 1.5),
      nulls: Array.from({ length: size }, (_, i) => i % 10 === 0),
    };

    const encoded = encode([column]);
    expect(encoded[0].stats.nullCount).toBe(100); // 10% nulls
  });
});

// =============================================================================
// 6. INVALID SCHEMA EVOLUTION TESTS
// =============================================================================

describe('Invalid Schema Evolution Error Paths', () => {
  describe('Schema compatibility checks', () => {
    it('should reject schema with incompatible type change (String -> Int32)', () => {
      const older: Schema = {
        id: 1,
        version: 1,
        columns: [{ path: 'id', type: Type.String, nullable: false }],
      };

      const newer: Schema = {
        id: 1,
        version: 2,
        columns: [{ path: 'id', type: Type.Int32, nullable: false }],
      };

      // String -> Int32 is not a valid promotion
      expect(isCompatible(older, newer)).toBe(false);
    });

    it('should reject schema with incompatible type change (Float64 -> Int32)', () => {
      

      const older: Schema = {
        id: 1,
        version: 1,
        columns: [{ path: 'value', type: Type.Float64, nullable: false }],
      };

      const newer: Schema = {
        id: 1,
        version: 2,
        columns: [{ path: 'value', type: Type.Int32, nullable: false }],
      };

      // Float64 -> Int32 would lose precision
      expect(isCompatible(older, newer)).toBe(false);
    });

    it('should reject new non-nullable column without default', () => {
      

      const older: Schema = {
        id: 1,
        version: 1,
        columns: [{ path: 'id', type: Type.Int32, nullable: false }],
      };

      const newer: Schema = {
        id: 1,
        version: 2,
        columns: [
          { path: 'id', type: Type.Int32, nullable: false },
          { path: 'required_field', type: Type.String, nullable: false },
          // New required field without default - incompatible!
        ],
      };

      expect(isCompatible(older, newer)).toBe(false);
    });

    it('should accept new nullable column', () => {
      

      const older: Schema = {
        id: 1,
        version: 1,
        columns: [{ path: 'id', type: Type.Int32, nullable: false }],
      };

      const newer: Schema = {
        id: 1,
        version: 2,
        columns: [
          { path: 'id', type: Type.Int32, nullable: false },
          { path: 'optional_field', type: Type.String, nullable: true },
        ],
      };

      expect(isCompatible(older, newer)).toBe(true);
    });

    it('should accept new column with default value', () => {
      

      const older: Schema = {
        id: 1,
        version: 1,
        columns: [{ path: 'id', type: Type.Int32, nullable: false }],
      };

      const newer: Schema = {
        id: 1,
        version: 2,
        columns: [
          { path: 'id', type: Type.Int32, nullable: false },
          { path: 'status', type: Type.String, nullable: false, defaultValue: 'pending' },
        ],
      };

      expect(isCompatible(older, newer)).toBe(true);
    });

    it('should accept compatible type promotion (Int32 -> Int64)', () => {
      

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

      expect(isCompatible(older, newer)).toBe(true);
    });

    it('should accept compatible type promotion (Int32 -> Float64)', () => {
      

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

      expect(isCompatible(older, newer)).toBe(true);
    });

    it('should accept any type to String promotion', () => {
      

      const older: Schema = {
        id: 1,
        version: 1,
        columns: [
          { path: 'int_field', type: Type.Int32, nullable: false },
          { path: 'float_field', type: Type.Float64, nullable: false },
          { path: 'bool_field', type: Type.Bool, nullable: false },
        ],
      };

      const newer: Schema = {
        id: 1,
        version: 2,
        columns: [
          { path: 'int_field', type: Type.String, nullable: false },
          { path: 'float_field', type: Type.String, nullable: false },
          { path: 'bool_field', type: Type.String, nullable: false },
        ],
      };

      expect(isCompatible(older, newer)).toBe(true);
    });
  });

  describe('Schema serialization/deserialization errors', () => {
    it('should handle serialization of schema with no columns', () => {
      

      const schema: Schema = {
        id: 1,
        version: 1,
        columns: [],
      };

      const bytes = serializeSchema(schema);
      const restored = deserializeSchema(bytes);

      expect(restored.columns).toHaveLength(0);
      expect(restored.id).toBe(1);
      expect(restored.version).toBe(1);
    });

    it('should handle schema with default values of all types', () => {
      

      const schema: Schema = {
        id: 1,
        version: 1,
        columns: [
          { path: 'bool_col', type: Type.Bool, nullable: false, defaultValue: true },
          { path: 'int32_col', type: Type.Int32, nullable: false, defaultValue: 42 },
          { path: 'int64_col', type: Type.Int64, nullable: false, defaultValue: BigInt('9007199254740993') },
          { path: 'float64_col', type: Type.Float64, nullable: false, defaultValue: 3.14159 },
          { path: 'string_col', type: Type.String, nullable: false, defaultValue: 'hello' },
          { path: 'date_col', type: Type.Date, nullable: false, defaultValue: '2024-01-01' },
        ],
      };

      const bytes = serializeSchema(schema);
      const restored = deserializeSchema(bytes);

      expect(restored.columns[0].defaultValue).toBe(true);
      expect(restored.columns[1].defaultValue).toBe(42);
      expect(restored.columns[2].defaultValue).toBe(BigInt('9007199254740993'));
      expect(restored.columns[3].defaultValue).toBeCloseTo(3.14159, 4);
      expect(restored.columns[4].defaultValue).toBe('hello');
      expect(restored.columns[5].defaultValue).toBe('2024-01-01');
    });

    it('should throw for deserializing truncated schema data', () => {
      

      // Too short - missing column count
      const truncatedData = new Uint8Array([1, 0, 0, 0, 1, 0, 0]);

      expect(() => deserializeSchema(truncatedData)).toThrow();
    });

    it('should throw for deserializing empty schema data', () => {
      

      const emptyData = new Uint8Array(0);

      expect(() => deserializeSchema(emptyData)).toThrow();
    });
  });

  describe('Schema migration edge cases', () => {
    it('should handle migrating columns with type promotion', () => {
      

      const columns: Column[] = [{
        path: 'count',
        type: Type.Int32,
        nullable: false,
        values: [1, 2, 3],
        nulls: [false, false, false],
      }];

      const oldSchema: Schema = {
        id: 1,
        version: 1,
        columns: [{ path: 'count', type: Type.Int32, nullable: false }],
      };

      const newSchema: Schema = {
        id: 1,
        version: 2,
        columns: [{ path: 'count', type: Type.Int64, nullable: false }],
      };

      const migrated = migrateColumns(columns, oldSchema, newSchema);

      expect(migrated[0].type).toBe(Type.Int64);
      expect(migrated[0].values[0]).toBe(BigInt(1));
      expect(migrated[0].values[1]).toBe(BigInt(2));
      expect(migrated[0].values[2]).toBe(BigInt(3));
    });

    it('should handle migrating columns with new column addition', () => {
      

      const columns: Column[] = [{
        path: 'id',
        type: Type.Int32,
        nullable: false,
        values: [1, 2, 3],
        nulls: [false, false, false],
      }];

      const oldSchema: Schema = {
        id: 1,
        version: 1,
        columns: [{ path: 'id', type: Type.Int32, nullable: false }],
      };

      const newSchema: Schema = {
        id: 1,
        version: 2,
        columns: [
          { path: 'id', type: Type.Int32, nullable: false },
          { path: 'status', type: Type.String, nullable: false, defaultValue: 'active' },
        ],
      };

      const migrated = migrateColumns(columns, oldSchema, newSchema);

      expect(migrated).toHaveLength(2);
      expect(migrated[1].path).toBe('status');
      expect(migrated[1].values).toEqual(['active', 'active', 'active']);
      expect(migrated[1].nulls).toEqual([false, false, false]);
    });

    it('should handle migrating columns with nullable new column (no default)', () => {
      

      const columns: Column[] = [{
        path: 'id',
        type: Type.Int32,
        nullable: false,
        values: [1, 2, 3],
        nulls: [false, false, false],
      }];

      const oldSchema: Schema = {
        id: 1,
        version: 1,
        columns: [{ path: 'id', type: Type.Int32, nullable: false }],
      };

      const newSchema: Schema = {
        id: 1,
        version: 2,
        columns: [
          { path: 'id', type: Type.Int32, nullable: false },
          { path: 'optional', type: Type.String, nullable: true },
        ],
      };

      const migrated = migrateColumns(columns, oldSchema, newSchema);

      expect(migrated).toHaveLength(2);
      expect(migrated[1].path).toBe('optional');
      expect(migrated[1].values).toEqual([null, null, null]);
      expect(migrated[1].nulls).toEqual([true, true, true]);
    });

    it('should handle migrating empty columns array', () => {
      

      const columns: Column[] = [];

      const oldSchema: Schema = {
        id: 1,
        version: 1,
        columns: [],
      };

      const newSchema: Schema = {
        id: 1,
        version: 2,
        columns: [{ path: 'new_col', type: Type.String, nullable: true }],
      };

      const migrated = migrateColumns(columns, oldSchema, newSchema);

      expect(migrated).toHaveLength(1);
      expect(migrated[0].values).toHaveLength(0);
    });
  });

  describe('Schema diff edge cases', () => {
    it('should detect added columns', () => {
      

      const older: Schema = {
        id: 1,
        version: 1,
        columns: [{ path: 'id', type: Type.Int32, nullable: false }],
      };

      const newer: Schema = {
        id: 1,
        version: 2,
        columns: [
          { path: 'id', type: Type.Int32, nullable: false },
          { path: 'name', type: Type.String, nullable: true },
        ],
      };

      const diff = schemaDiff(older, newer);

      expect(diff.added).toContain('name');
      expect(diff.removed).toHaveLength(0);
      expect(diff.modified).toHaveLength(0);
    });

    it('should detect removed columns', () => {
      

      const older: Schema = {
        id: 1,
        version: 1,
        columns: [
          { path: 'id', type: Type.Int32, nullable: false },
          { path: 'deprecated', type: Type.String, nullable: true },
        ],
      };

      const newer: Schema = {
        id: 1,
        version: 2,
        columns: [{ path: 'id', type: Type.Int32, nullable: false }],
      };

      const diff = schemaDiff(older, newer);

      expect(diff.added).toHaveLength(0);
      expect(diff.removed).toContain('deprecated');
      expect(diff.modified).toHaveLength(0);
    });

    it('should detect modified columns (type change)', () => {
      

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

      const diff = schemaDiff(older, newer);

      expect(diff.added).toHaveLength(0);
      expect(diff.removed).toHaveLength(0);
      expect(diff.modified).toContain('count');
    });

    it('should detect modified columns (nullable change)', () => {
      

      const older: Schema = {
        id: 1,
        version: 1,
        columns: [{ path: 'name', type: Type.String, nullable: false }],
      };

      const newer: Schema = {
        id: 1,
        version: 2,
        columns: [{ path: 'name', type: Type.String, nullable: true }],
      };

      const diff = schemaDiff(older, newer);

      expect(diff.modified).toContain('name');
    });

    it('should handle identical schemas', () => {
      

      const schema: Schema = {
        id: 1,
        version: 1,
        columns: [
          { path: 'id', type: Type.Int32, nullable: false },
          { path: 'name', type: Type.String, nullable: true },
        ],
      };

      const diff = schemaDiff(schema, schema);

      expect(diff.added).toHaveLength(0);
      expect(diff.removed).toHaveLength(0);
      expect(diff.modified).toHaveLength(0);
    });

    it('should handle empty schemas', () => {
      

      const older: Schema = { id: 1, version: 1, columns: [] };
      const newer: Schema = { id: 1, version: 2, columns: [] };

      const diff = schemaDiff(older, newer);

      expect(diff.added).toHaveLength(0);
      expect(diff.removed).toHaveLength(0);
      expect(diff.modified).toHaveLength(0);
    });
  });
});

// =============================================================================
// 7. ERROR CLASS INTEGRATION
// =============================================================================

describe('Error Class Integration', () => {
  it('should allow creating StorageError with custom codes', () => {
    const error = new StorageError('R2 bucket unavailable', 'R2_UNAVAILABLE');

    expect(error).toBeInstanceOf(EvoDBError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('StorageError');
    expect(error.code).toBe('R2_UNAVAILABLE');
    expect(error.message).toBe('R2 bucket unavailable');
  });

  it('should allow creating ValidationError with custom codes', () => {
    const error = new ValidationError('Schema mismatch', 'SCHEMA_MISMATCH');

    expect(error).toBeInstanceOf(EvoDBError);
    expect(error.name).toBe('ValidationError');
    expect(error.code).toBe('SCHEMA_MISMATCH');
  });

  it('should support error chaining patterns', () => {
    const originalError = new Error('Network timeout');

    try {
      throw new StorageError(`Failed to write: ${originalError.message}`, 'WRITE_FAILED');
    } catch (e) {
      expect(e).toBeInstanceOf(StorageError);
      expect((e as StorageError).message).toContain('Network timeout');
    }
  });
});
