/**
 * Branded Types Tests
 * Tests for compile-time and runtime type safety of branded ID types.
 *
 * After evodb-3ju simplification:
 * - BlockId and TableId remain branded with validation
 * - SnapshotId, BatchId, WalId, SchemaId are now plain string/number types
 *
 * These tests verify:
 * 1. Runtime validation in constructor functions (BlockId, TableId only)
 * 2. Format validation for branded ID types
 * 3. Type guards work correctly (BlockId, TableId only)
 * 4. Integration with makeBlockId/makeWalId etc.
 * 5. Plain type constructors pass through without validation
 */

import { describe, it, expect } from 'vitest';
import {
  // Branded types (still branded)
  type BlockId,
  type TableId,
  // Plain types (simplified from branded - evodb-3ju)
  type SnapshotId,
  type BatchId,
  type WalId,
  type SchemaId,
  // Validated constructors (BlockId, TableId only)
  blockId,
  tableId,
  // Pass-through constructors (deprecated, no validation)
  snapshotId,
  batchId,
  walId,
  schemaId,
  // Unsafe constructors
  unsafeBlockId,
  unsafeSnapshotId,
  unsafeBatchId,
  unsafeWalId,
  unsafeSchemaId,
  unsafeTableId,
  // Type guards (BlockId, TableId only - evodb-3ju)
  isValidBlockId,
  isValidTableId,
} from '../types.js';
import { makeBlockId, parseBlockId, makeWalId, parseWalId } from '../storage.js';

// =============================================================================
// BlockId Tests (still branded with validation)
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
// TableId Tests (still branded with validation)
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
// WalId Tests (simplified to plain string - evodb-3ju)
// =============================================================================

describe('WalId (plain string - evodb-3ju)', () => {
  describe('walId() constructor (deprecated, pass-through)', () => {
    it('should accept any string without validation', () => {
      // No longer validates format
      expect(walId('wal:000000000000')).toBe('wal:000000000000');
      expect(walId('any-string')).toBe('any-string');
      expect(walId('')).toBe('');
    });
  });

  describe('unsafeWalId() constructor (deprecated)', () => {
    it('should pass through any value', () => {
      const id = unsafeWalId('not-a-wal-id');
      expect(id).toBe('not-a-wal-id');
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
// SnapshotId Tests (simplified to plain string - evodb-3ju)
// =============================================================================

describe('SnapshotId (plain string - evodb-3ju)', () => {
  describe('snapshotId() constructor (deprecated, pass-through)', () => {
    it('should accept any string without validation', () => {
      // No longer validates format
      expect(snapshotId('0000000001-abcdef12')).toBe('0000000001-abcdef12');
      expect(snapshotId('any-string')).toBe('any-string');
      expect(snapshotId('nohyphen')).toBe('nohyphen');
      expect(snapshotId('')).toBe('');
    });
  });

  describe('unsafeSnapshotId() constructor (deprecated)', () => {
    it('should pass through any value', () => {
      const id = unsafeSnapshotId('any-format');
      expect(id).toBe('any-format');
    });
  });
});

// =============================================================================
// BatchId Tests (simplified to plain string - evodb-3ju)
// =============================================================================

describe('BatchId (plain string - evodb-3ju)', () => {
  describe('batchId() constructor (deprecated, pass-through)', () => {
    it('should accept any string without validation', () => {
      // No longer validates format
      expect(batchId('abc12345_123_xyz789')).toBe('abc12345_123_xyz789');
      expect(batchId('any-string')).toBe('any-string');
      expect(batchId('only_one')).toBe('only_one');
      expect(batchId('')).toBe('');
    });
  });

  describe('unsafeBatchId() constructor (deprecated)', () => {
    it('should pass through any value', () => {
      const id = unsafeBatchId('custom-format');
      expect(id).toBe('custom-format');
    });
  });
});

// =============================================================================
// SchemaId Tests (simplified to plain number - evodb-3ju)
// =============================================================================

describe('SchemaId (plain number - evodb-3ju)', () => {
  describe('schemaId() constructor (deprecated, pass-through)', () => {
    it('should accept any number without validation', () => {
      // No longer validates format
      expect(schemaId(0)).toBe(0);
      expect(schemaId(1)).toBe(1);
      expect(schemaId(100)).toBe(100);
      expect(schemaId(-1)).toBe(-1);  // Now allowed
      expect(schemaId(1.5)).toBe(1.5); // Now allowed
      expect(schemaId(NaN)).toBeNaN(); // Now allowed
    });
  });

  describe('unsafeSchemaId() constructor (deprecated)', () => {
    it('should pass through any value', () => {
      const id = unsafeSchemaId(-999);
      expect(id).toBe(-999);
    });
  });
});

// =============================================================================
// Type Safety Tests (Compile-time behavior documented via test structure)
// =============================================================================

describe('Type Safety', () => {
  it('branded types (BlockId, TableId) are assignable to their base types', () => {
    const block: BlockId = makeBlockId('data', 0);
    const table: TableId = tableId('123e4567-e89b-12d3-a456-426614174000');

    // These work because branded types extend string
    const blockStr: string = block;
    const tableStr: string = table;

    expect(typeof blockStr).toBe('string');
    expect(typeof tableStr).toBe('string');
  });

  it('plain types (WalId, SnapshotId, BatchId, SchemaId) are just string/number', () => {
    // These are now plain types, not branded (evodb-3ju)
    const wal: WalId = makeWalId(0n);
    const snapshot: SnapshotId = snapshotId('ts-random');
    const batch: BatchId = batchId('src_1_ts');
    const schema: SchemaId = schemaId(1);

    // Direct string/number assignment works
    const walStr: string = wal;
    const snapshotStr: string = snapshot;
    const batchStr: string = batch;
    const schemaNum: number = schema;

    expect(typeof walStr).toBe('string');
    expect(typeof snapshotStr).toBe('string');
    expect(typeof batchStr).toBe('string');
    expect(typeof schemaNum).toBe('number');
  });

  it('functions accepting branded types work with those types', () => {
    // This documents intended usage - functions should declare branded type params
    function processBlock(id: BlockId): string {
      return `Processing block: ${id}`;
    }

    const block = makeBlockId('data', 0);

    expect(processBlock(block)).toContain('Processing block');
  });

  /**
   * NOTE: The following test documents compile-time behavior.
   * TypeScript would catch these errors at compile time for branded types:
   *
   * // ERROR: Argument of type 'string' is not assignable to parameter of type 'BlockId'
   * processBlock('plain-string');
   *
   * // ERROR: Argument of type 'string' is not assignable to parameter of type 'TableId'
   * tableId('not-a-function-result');
   *
   * However, for plain types (WalId, SnapshotId, etc.), any string/number can be assigned.
   */
  it('documents that plain strings cannot be assigned to branded types (compile-time)', () => {
    // At runtime, these would work because branded types are just strings
    // But TypeScript prevents this at compile time for BlockId and TableId
    // WalId, SnapshotId, BatchId are now just strings, so they accept any string
    // SchemaId is now just number, so it accepts any number
    expect(true).toBe(true);
  });
});

// =============================================================================
// Edge Cases and Error Messages (for branded types only)
// =============================================================================

describe('Error Messages', () => {
  it('blockId error includes the invalid value', () => {
    try {
      blockId('bad-format');
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as Error).message).toContain('bad-format');
    }
  });

  it('tableId error includes the invalid value', () => {
    try {
      tableId('not-uuid');
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as Error).message).toContain('not-uuid');
    }
  });

  // Note: walId, snapshotId, batchId, schemaId no longer throw errors (evodb-3ju)
});
