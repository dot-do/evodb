/**
 * Branded Types Tests
 * Tests for compile-time and runtime type safety of branded ID types.
 *
 * Simplified per evodb-cn6:
 * - BlockId and TableId remain branded with validation
 * - SnapshotId, BatchId, WalId, SchemaId are plain string/number type aliases
 *
 * These tests verify:
 * 1. Runtime validation in constructor functions (BlockId, TableId only)
 * 2. Format validation for branded ID types
 * 3. Type guards work correctly (BlockId, TableId only)
 * 4. Integration with makeBlockId/makeWalId etc.
 */

import { describe, it, expect } from 'vitest';
import {
  // Branded types (BlockId, TableId only - evodb-cn6)
  type BlockId,
  type TableId,
  // Plain type aliases (evodb-cn6)
  type SnapshotId,
  type BatchId,
  type WalId,
  type SchemaId,
  // Validated constructors (BlockId, TableId only - evodb-cn6)
  blockId,
  tableId,
  // Unsafe constructors (BlockId, TableId only - evodb-cn6)
  unsafeBlockId,
  unsafeTableId,
  // Type guards (BlockId, TableId only - evodb-cn6)
  isValidBlockId,
  isValidTableId,
} from '../types.js';
import { makeBlockId, parseBlockId, makeWalId, parseWalId } from '../storage.js';

// =============================================================================
// BlockId Tests (branded with validation)
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
// TableId Tests (branded with validation)
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
// Plain Type Alias Tests (WalId, SnapshotId, BatchId, SchemaId - evodb-cn6)
// These are just type aliases for string/number, not branded types.
// =============================================================================

describe('Plain Type Aliases (evodb-cn6)', () => {
  describe('WalId (plain string)', () => {
    it('should be assignable from any string', () => {
      const id: WalId = 'any-string';
      expect(id).toBe('any-string');
    });

    it('should work with makeWalId()', () => {
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

  describe('SnapshotId (plain string)', () => {
    it('should be assignable from any string', () => {
      const id: SnapshotId = 'snap-12345';
      expect(id).toBe('snap-12345');
    });
  });

  describe('BatchId (plain string)', () => {
    it('should be assignable from any string', () => {
      const id: BatchId = 'batch-abc-123';
      expect(id).toBe('batch-abc-123');
    });
  });

  describe('SchemaId (plain number)', () => {
    it('should be assignable from any number', () => {
      const id: SchemaId = 42;
      expect(id).toBe(42);
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
    // These are now plain types, not branded (evodb-cn6)
    const wal: WalId = makeWalId(0n);
    const snapshot: SnapshotId = 'ts-random';
    const batch: BatchId = 'src_1_ts';
    const schema: SchemaId = 1;

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
});
