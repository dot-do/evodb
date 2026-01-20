/**
 * @evodb/core - WAL and Block ID Utilities Tests
 *
 * Tests for WAL ID and Block ID parsing safety.
 * Issue: pocs-pr9d - BigInt parsing crashes on malformed WAL IDs
 */

import { describe, it, expect } from 'vitest';
import {
  makeWalId,
  parseWalId,
  makeBlockId,
  parseBlockId,
} from '../storage.ts';

describe('WAL ID utilities', () => {
  describe('makeWalId', () => {
    it('should create valid WAL ID from bigint', () => {
      const id = makeWalId(0n);
      expect(id).toBe('wal:000000000000');
    });

    it('should create WAL ID with proper base-36 encoding', () => {
      const id = makeWalId(35n); // 35 in base-36 is 'z'
      expect(id).toBe('wal:00000000000z');
    });

    it('should handle large LSN values', () => {
      const id = makeWalId(BigInt('9007199254740991')); // Number.MAX_SAFE_INTEGER
      expect(id.startsWith('wal:')).toBe(true);
      expect(id.length).toBe(16); // 'wal:' + 12 chars
    });

    it('should handle very large BigInt values near limit', () => {
      const largeValue = BigInt('999999999999999999999');
      const id = makeWalId(largeValue);
      expect(id.startsWith('wal:')).toBe(true);
    });
  });

  describe('parseWalId', () => {
    it('should parse valid WAL ID', () => {
      const lsn = parseWalId('wal:000000000000');
      expect(lsn).toBe(0n);
    });

    it('should roundtrip makeWalId -> parseWalId', () => {
      const original = 12345n;
      const id = makeWalId(original);
      const parsed = parseWalId(id);
      expect(parsed).toBe(original);
    });

    it('should roundtrip large values', () => {
      const original = BigInt('9007199254740991');
      const id = makeWalId(original);
      const parsed = parseWalId(id);
      expect(parsed).toBe(original);
    });

    it('should return null for invalid prefix (not wal:)', () => {
      expect(parseWalId('block:000000000000')).toBeNull();
      expect(parseWalId('xxx:000000000000')).toBeNull();
      expect(parseWalId('wa:000000000000')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(parseWalId('')).toBeNull();
    });

    // BUG: These tests expose the crash - BigInt(NaN) throws
    it('should return null for invalid base-36 characters (not crash)', () => {
      // Characters like '!' or '$' are not valid base-36
      expect(parseWalId('wal:!@#$%^&*()')).toBeNull();
      expect(parseWalId('wal:invalid!!!')).toBeNull();
    });

    it('should return null for empty string after prefix', () => {
      expect(parseWalId('wal:')).toBeNull();
    });

    it('should return null for whitespace after prefix', () => {
      expect(parseWalId('wal:   ')).toBeNull();
      expect(parseWalId('wal:\t\n')).toBeNull();
    });

    it('should return null for mixed valid/invalid characters', () => {
      expect(parseWalId('wal:abc123$$$')).toBeNull();
      expect(parseWalId('wal:12.34')).toBeNull();
      expect(parseWalId('wal:-123')).toBeNull();
    });

    it('should handle mixed case (base-36 is case-insensitive)', () => {
      // Base-36 uses 0-9 and a-z, should work with uppercase too
      const lower = parseWalId('wal:00000000000z');
      const upper = parseWalId('wal:00000000000Z');
      expect(lower).toBe(upper);
    });

    it('should handle leading zeros correctly', () => {
      const id = parseWalId('wal:000000000001');
      expect(id).toBe(1n);
    });
  });
});

describe('Block ID utilities', () => {
  describe('makeBlockId', () => {
    it('should create valid block ID', () => {
      const id = makeBlockId('data', 0, 0);
      expect(id).toBe('data:0000000000:0000');
    });

    it('should encode timestamp in base-36', () => {
      const id = makeBlockId('data', 36, 0);
      expect(id).toBe('data:0000000010:0000');
    });

    it('should encode sequence in base-36', () => {
      const id = makeBlockId('data', 0, 36);
      expect(id).toBe('data:0000000010:0000');
    });

    it('should handle default seq=0', () => {
      const id = makeBlockId('data', 1000);
      expect(id).toContain(':0000');
    });
  });

  describe('parseBlockId', () => {
    it('should parse valid block ID', () => {
      const result = parseBlockId('data:0000000000:0000');
      expect(result).toEqual({ prefix: 'data', timestamp: 0, seq: 0 });
    });

    it('should roundtrip makeBlockId -> parseBlockId', () => {
      const id = makeBlockId('test', 12345, 67);
      const result = parseBlockId(id);
      expect(result).toEqual({ prefix: 'test', timestamp: 12345, seq: 67 });
    });

    it('should return null for wrong number of parts', () => {
      expect(parseBlockId('data:only')).toBeNull();
      expect(parseBlockId('data:one:two:three')).toBeNull();
      expect(parseBlockId('noparts')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(parseBlockId('')).toBeNull();
    });

    // BUG: These tests expose parseInt returning NaN without validation
    it('should return null for invalid base-36 timestamp (not NaN)', () => {
      const result = parseBlockId('data:!@#$:0000');
      // Currently returns { prefix: 'data', timestamp: NaN, seq: 0 }
      // Should return null
      expect(result).toBeNull();
    });

    it('should return null for invalid base-36 sequence (not NaN)', () => {
      const result = parseBlockId('data:0000000000:!@#$');
      // Currently returns { prefix: 'data', timestamp: 0, seq: NaN }
      // Should return null
      expect(result).toBeNull();
    });

    it('should return null when both timestamp and seq are invalid', () => {
      expect(parseBlockId('data:***:???')).toBeNull();
    });

    it('should return null for empty timestamp or seq parts', () => {
      expect(parseBlockId('data::0000')).toBeNull();
      expect(parseBlockId('data:0000:')).toBeNull();
      expect(parseBlockId('data::')).toBeNull();
    });

    it('should handle large timestamp values', () => {
      const largeTs = Date.now();
      const id = makeBlockId('data', largeTs, 0);
      const result = parseBlockId(id);
      expect(result?.timestamp).toBe(largeTs);
    });
  });
});
