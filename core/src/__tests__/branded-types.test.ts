/**
 * Branded Types Tests
 * Tests for compile-time and runtime type safety of branded ID types.
 *
 * These tests verify:
 * 1. Runtime validation in constructor functions
 * 2. Format validation for each ID type
 * 3. Type guards work correctly
 * 4. Integration with makeBlockId/makeWalId etc.
 */

import { describe, it, expect } from 'vitest';
import {
  // Branded types
  type BlockId,
  type SnapshotId,
  type BatchId,
  type WalId,
  type SchemaId,
  type TableId,
  // Validated constructors
  blockId,
  snapshotId,
  batchId,
  walId,
  schemaId,
  tableId,
  // Unsafe constructors
  unsafeBlockId,
  unsafeSnapshotId,
  unsafeBatchId,
  unsafeWalId,
  unsafeSchemaId,
  unsafeTableId,
  // Type guards
  isValidBlockId,
  isValidSnapshotId,
  isValidBatchId,
  isValidWalId,
  isValidSchemaId,
  isValidTableId,
} from '../types.js';
import { makeBlockId, parseBlockId, makeWalId, parseWalId } from '../storage.js';

// =============================================================================
// BlockId Tests
// =============================================================================

describe('BlockId', () => {
  describe('blockId() constructor', () => {
    it('should accept valid BlockId format', () => {
      const id = blockId('data:0000000000:0000');
      expect(id).toBe('data:0000000000:0000');
    });

    it('should accept various valid prefixes', () => {
      expect(blockId('test:0000000000:0000')).toBe('test:0000000000:0000');
      expect(blockId('my-prefix:abc123:00ab')).toBe('my-prefix:abc123:00ab');
      expect(blockId('data_v2:zzz999:abcd')).toBe('data_v2:zzz999:abcd');
    });

    it('should throw on invalid format - missing parts', () => {
      expect(() => blockId('invalid')).toThrow('Invalid BlockId format');
      expect(() => blockId('only:one')).toThrow('Invalid BlockId format');
    });

    it('should throw on invalid format - too many parts', () => {
      expect(() => blockId('a:b:c:d')).toThrow('Invalid BlockId format');
    });

    it('should throw on invalid characters', () => {
      expect(() => blockId('data:!!!:0000')).toThrow('Invalid BlockId format');
      expect(() => blockId('data:0000:$$$')).toThrow('Invalid BlockId format');
    });

    it('should throw on empty string', () => {
      expect(() => blockId('')).toThrow('Invalid BlockId format');
    });
  });

  describe('unsafeBlockId() constructor', () => {
    it('should bypass validation', () => {
      const id = unsafeBlockId('anything-goes');
      expect(id).toBe('anything-goes');
    });
  });

  describe('isValidBlockId()', () => {
    it('should return true for valid formats', () => {
      expect(isValidBlockId('data:0000000000:0000')).toBe(true);
      expect(isValidBlockId('test:abc123:00ff')).toBe(true);
    });

    it('should return false for invalid formats', () => {
      expect(isValidBlockId('invalid')).toBe(false);
      expect(isValidBlockId('a:b')).toBe(false);
      expect(isValidBlockId('a:b:c:d')).toBe(false);
      expect(isValidBlockId('')).toBe(false);
    });
  });

  describe('integration with makeBlockId()', () => {
    it('should return BlockId type from makeBlockId', () => {
      const id: BlockId = makeBlockId('data', 12345, 1);
      expect(id).toContain('data:');
    });

    it('should roundtrip makeBlockId -> parseBlockId', () => {
      const id = makeBlockId('test', Date.now(), 42);
      const parsed = parseBlockId(id);
      expect(parsed).not.toBeNull();
      expect(parsed!.prefix).toBe('test');
      expect(parsed!.seq).toBe(42);
    });
  });
});

// =============================================================================
// WalId Tests
// =============================================================================

describe('WalId', () => {
  describe('walId() constructor', () => {
    it('should accept valid WalId format', () => {
      const id = walId('wal:000000000000');
      expect(id).toBe('wal:000000000000');
    });

    it('should accept various LSN values', () => {
      expect(walId('wal:00000000000z')).toBe('wal:00000000000z');
      expect(walId('wal:abcdef123456')).toBe('wal:abcdef123456');
    });

    it('should throw on invalid prefix', () => {
      expect(() => walId('wat:000000000000')).toThrow('Invalid WalId format');
      expect(() => walId('WAL:000000000000')).not.toThrow(); // Case insensitive
    });

    it('should throw on missing prefix', () => {
      expect(() => walId('000000000000')).toThrow('Invalid WalId format');
    });

    it('should throw on invalid characters', () => {
      expect(() => walId('wal:!!!')).toThrow('Invalid WalId format');
    });
  });

  describe('unsafeWalId() constructor', () => {
    it('should bypass validation', () => {
      const id = unsafeWalId('not-a-wal-id');
      expect(id).toBe('not-a-wal-id');
    });
  });

  describe('isValidWalId()', () => {
    it('should return true for valid formats', () => {
      expect(isValidWalId('wal:000000000000')).toBe(true);
      expect(isValidWalId('wal:abcdef')).toBe(true);
    });

    it('should return false for invalid formats', () => {
      expect(isValidWalId('invalid')).toBe(false);
      expect(isValidWalId('wal:')).toBe(false);
      expect(isValidWalId('')).toBe(false);
    });
  });

  describe('integration with makeWalId()', () => {
    it('should return WalId type from makeWalId', () => {
      const id: WalId = makeWalId(12345n);
      expect(id.startsWith('wal:')).toBe(true);
    });

    it('should roundtrip makeWalId -> parseWalId', () => {
      const lsn = 9876543210n;
      const id = makeWalId(lsn);
      const parsed = parseWalId(id);
      expect(parsed).toBe(lsn);
    });
  });
});

// =============================================================================
// SnapshotId Tests
// =============================================================================

describe('SnapshotId', () => {
  describe('snapshotId() constructor', () => {
    it('should accept valid SnapshotId format (ULID-like)', () => {
      const id = snapshotId('0000000001-abcdef12');
      expect(id).toBe('0000000001-abcdef12');
    });

    it('should accept various timestamp-random formats', () => {
      expect(snapshotId('abc123-xyz789')).toBe('abc123-xyz789');
      expect(snapshotId('1234567890-random')).toBe('1234567890-random');
    });

    it('should throw on invalid format - no hyphen', () => {
      expect(() => snapshotId('nohyphen')).toThrow('Invalid SnapshotId format');
    });

    it('should throw on empty parts', () => {
      expect(() => snapshotId('-random')).toThrow('Invalid SnapshotId format');
      expect(() => snapshotId('timestamp-')).toThrow('Invalid SnapshotId format');
    });

    it('should throw on invalid characters', () => {
      expect(() => snapshotId('!!!-random')).toThrow('Invalid SnapshotId format');
    });
  });

  describe('unsafeSnapshotId() constructor', () => {
    it('should bypass validation', () => {
      const id = unsafeSnapshotId('any-format');
      expect(id).toBe('any-format');
    });
  });

  describe('isValidSnapshotId()', () => {
    it('should return true for valid formats', () => {
      expect(isValidSnapshotId('timestamp-random')).toBe(true);
      expect(isValidSnapshotId('abc123-def456')).toBe(true);
    });

    it('should return false for invalid formats', () => {
      expect(isValidSnapshotId('nohyphen')).toBe(false);
      expect(isValidSnapshotId('')).toBe(false);
      expect(isValidSnapshotId('-')).toBe(false);
    });
  });
});

// =============================================================================
// BatchId Tests
// =============================================================================

describe('BatchId', () => {
  describe('batchId() constructor', () => {
    it('should accept valid BatchId format', () => {
      const id = batchId('abc12345_123_xyz789');
      expect(id).toBe('abc12345_123_xyz789');
    });

    it('should accept various prefix_seq_timestamp formats', () => {
      expect(batchId('source_1_timestamp')).toBe('source_1_timestamp');
      expect(batchId('do123_999_abc')).toBe('do123_999_abc');
    });

    it('should throw on invalid format - missing parts', () => {
      expect(() => batchId('only_one')).toThrow('Invalid BatchId format');
    });

    it('should throw on non-numeric sequence', () => {
      // Sequence must be numeric
      expect(() => batchId('prefix_abc_timestamp')).toThrow('Invalid BatchId format');
    });
  });

  describe('unsafeBatchId() constructor', () => {
    it('should bypass validation', () => {
      const id = unsafeBatchId('custom-format');
      expect(id).toBe('custom-format');
    });
  });

  describe('isValidBatchId()', () => {
    it('should return true for valid formats', () => {
      expect(isValidBatchId('source_123_time')).toBe(true);
      expect(isValidBatchId('abc_0_def')).toBe(true);
    });

    it('should return false for invalid formats', () => {
      expect(isValidBatchId('invalid')).toBe(false);
      expect(isValidBatchId('a_b_c_d')).toBe(false);
      expect(isValidBatchId('')).toBe(false);
    });
  });
});

// =============================================================================
// SchemaId Tests
// =============================================================================

describe('SchemaId', () => {
  describe('schemaId() constructor', () => {
    it('should accept valid non-negative integers', () => {
      expect(schemaId(0)).toBe(0);
      expect(schemaId(1)).toBe(1);
      expect(schemaId(100)).toBe(100);
    });

    it('should throw on negative numbers', () => {
      expect(() => schemaId(-1)).toThrow('Invalid SchemaId');
      expect(() => schemaId(-100)).toThrow('Invalid SchemaId');
    });

    it('should throw on non-integers', () => {
      expect(() => schemaId(1.5)).toThrow('Invalid SchemaId');
      expect(() => schemaId(NaN)).toThrow('Invalid SchemaId');
      expect(() => schemaId(Infinity)).toThrow('Invalid SchemaId');
    });
  });

  describe('unsafeSchemaId() constructor', () => {
    it('should bypass validation', () => {
      const id = unsafeSchemaId(-999);
      expect(id).toBe(-999);
    });
  });

  describe('isValidSchemaId()', () => {
    it('should return true for valid values', () => {
      expect(isValidSchemaId(0)).toBe(true);
      expect(isValidSchemaId(1)).toBe(true);
      expect(isValidSchemaId(Number.MAX_SAFE_INTEGER)).toBe(true);
    });

    it('should return false for invalid values', () => {
      expect(isValidSchemaId(-1)).toBe(false);
      expect(isValidSchemaId(1.5)).toBe(false);
      expect(isValidSchemaId(NaN)).toBe(false);
    });
  });
});

// =============================================================================
// TableId Tests
// =============================================================================

describe('TableId', () => {
  describe('tableId() constructor', () => {
    it('should accept valid UUID format', () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      expect(tableId(uuid)).toBe(uuid);
    });

    it('should accept various valid UUIDs', () => {
      expect(tableId('00000000-0000-0000-0000-000000000000')).toBeDefined();
      expect(tableId('ffffffff-ffff-ffff-ffff-ffffffffffff')).toBeDefined();
      expect(tableId('FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF')).toBeDefined(); // Case insensitive
    });

    it('should throw on invalid UUID format', () => {
      expect(() => tableId('not-a-uuid')).toThrow('Invalid TableId format');
      expect(() => tableId('12345678-1234-1234-1234-12345678901')).toThrow('Invalid TableId format'); // Too short
      expect(() => tableId('12345678-1234-1234-1234-1234567890123')).toThrow('Invalid TableId format'); // Too long
    });

    it('should throw on invalid characters', () => {
      expect(() => tableId('zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz')).toThrow('Invalid TableId format');
    });
  });

  describe('unsafeTableId() constructor', () => {
    it('should bypass validation', () => {
      const id = unsafeTableId('not-uuid');
      expect(id).toBe('not-uuid');
    });
  });

  describe('isValidTableId()', () => {
    it('should return true for valid UUIDs', () => {
      expect(isValidTableId('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
      expect(isValidTableId('00000000-0000-0000-0000-000000000000')).toBe(true);
    });

    it('should return false for invalid formats', () => {
      expect(isValidTableId('not-a-uuid')).toBe(false);
      expect(isValidTableId('')).toBe(false);
      expect(isValidTableId('123456781234123412341234567890ab')).toBe(false); // Missing hyphens
    });
  });
});

// =============================================================================
// Type Safety Tests (Compile-time behavior documented via test structure)
// =============================================================================

describe('Type Safety', () => {
  it('branded types are assignable to their base types', () => {
    // BlockId, WalId, SnapshotId, BatchId, TableId extend string
    const block: BlockId = makeBlockId('data', 0);
    const wal: WalId = makeWalId(0n);
    const snapshot: SnapshotId = snapshotId('ts-random');
    const batch: BatchId = batchId('src_1_ts');
    const table: TableId = tableId('123e4567-e89b-12d3-a456-426614174000');

    // These work because branded types extend string
    const blockStr: string = block;
    const walStr: string = wal;
    const snapshotStr: string = snapshot;
    const batchStr: string = batch;
    const tableStr: string = table;

    expect(typeof blockStr).toBe('string');
    expect(typeof walStr).toBe('string');
    expect(typeof snapshotStr).toBe('string');
    expect(typeof batchStr).toBe('string');
    expect(typeof tableStr).toBe('string');

    // SchemaId extends number
    const schema: SchemaId = schemaId(1);
    const schemaNum: number = schema;
    expect(typeof schemaNum).toBe('number');
  });

  it('functions accepting branded types work with those types', () => {
    // This documents intended usage - functions should declare branded type params
    function processBlock(id: BlockId): string {
      return `Processing block: ${id}`;
    }

    function processWal(id: WalId): string {
      return `Processing WAL: ${id}`;
    }

    const block = makeBlockId('data', 0);
    const wal = makeWalId(0n);

    expect(processBlock(block)).toContain('Processing block');
    expect(processWal(wal)).toContain('Processing WAL');
  });

  /**
   * NOTE: The following test documents compile-time behavior.
   * TypeScript would catch these errors at compile time:
   *
   * // ERROR: Argument of type 'WalId' is not assignable to parameter of type 'BlockId'
   * const wal = makeWalId(0n);
   * processBlock(wal);
   *
   * // ERROR: Argument of type 'BlockId' is not assignable to parameter of type 'WalId'
   * const block = makeBlockId('data', 0);
   * processWal(block);
   *
   * // ERROR: Argument of type 'string' is not assignable to parameter of type 'BlockId'
   * processBlock('plain-string');
   */
  it('documents that plain strings cannot be assigned to branded types (compile-time)', () => {
    // At runtime, these would work because branded types are just strings
    // But TypeScript prevents this at compile time
    // This test just documents the expected behavior
    expect(true).toBe(true);
  });
});

// =============================================================================
// Edge Cases and Error Messages
// =============================================================================

describe('Error Messages', () => {
  it('blockId error includes the invalid value', () => {
    try {
      blockId('bad-format');
    } catch (e) {
      expect((e as Error).message).toContain('bad-format');
    }
  });

  it('walId error includes the invalid value', () => {
    try {
      walId('bad-format');
    } catch (e) {
      expect((e as Error).message).toContain('bad-format');
    }
  });

  it('snapshotId error includes the invalid value', () => {
    try {
      snapshotId('bad');
    } catch (e) {
      expect((e as Error).message).toContain('bad');
    }
  });

  it('tableId error includes the invalid value', () => {
    try {
      tableId('not-uuid');
    } catch (e) {
      expect((e as Error).message).toContain('not-uuid');
    }
  });
});
