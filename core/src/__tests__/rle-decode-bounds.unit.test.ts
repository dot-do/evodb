/**
 * @evodb/core - RLE/Delta Decode Bounds Validation Tests (TDD)
 *
 * Tests for RLE and Delta decode count bounds validation.
 * Ensures proper error handling for invalid count parameters.
 *
 * Issue: evodb-imj - RLE/Delta decode count bounds validation
 *
 * These tests verify that decode functions properly validate:
 * - Negative count values throw descriptive errors
 * - Count values exceeding buffer size throw descriptive errors
 * - Valid counts work correctly
 */

import { describe, it, expect } from 'vitest';
import {
  decode,
  encode,
  fastDecodeDeltaInt32,
  Type,
  Encoding,
  type Column,
  type EncodedColumn,
} from '../index.js';

// =============================================================================
// HELPER: Create encoded data for testing
// =============================================================================

/**
 * Create a minimal RLE-encoded column for testing
 */
function createRLEEncodedColumn(values: number[], rowCount: number): EncodedColumn {
  const column: Column = {
    path: 'test',
    type: Type.Int32,
    nullable: false,
    values: values,
    nulls: Array(values.length).fill(false),
  };

  // Force RLE encoding by creating many runs of same value
  const rleColumn: Column = {
    path: 'test',
    type: Type.Int32,
    nullable: false,
    values: Array(rowCount).fill(42), // All same value triggers RLE
    nulls: Array(rowCount).fill(false),
  };

  const encoded = encode([rleColumn]);
  return encoded[0];
}

/**
 * Create a Delta-encoded column for testing
 */
function createDeltaEncodedColumn(values: number[]): EncodedColumn {
  // Create sorted values to trigger delta encoding
  const sortedValues = values.slice().sort((a, b) => a - b);
  const column: Column = {
    path: 'test',
    type: Type.Int32,
    nullable: false,
    values: sortedValues,
    nulls: Array(sortedValues.length).fill(false),
  };

  const encoded = encode([column]);
  return encoded[0];
}

/**
 * Create raw delta-encoded Int32 data
 */
function createRawDeltaInt32Data(values: number[]): Uint8Array {
  if (values.length === 0) return new Uint8Array(0);

  const deltas = new Int32Array(values.length);
  deltas[0] = values[0];
  for (let i = 1; i < values.length; i++) {
    deltas[i] = values[i] - values[i - 1];
  }
  return new Uint8Array(deltas.buffer);
}

// =============================================================================
// 1. RLE DECODE BOUNDS VALIDATION TESTS
// =============================================================================

describe('RLE Decode Bounds Validation', () => {
  describe('Negative count validation', () => {
    it('should throw on negative rowCount', () => {
      const encoded = createRLEEncodedColumn([1, 2, 3], 3);

      expect(() => {
        decode(encoded, -1);
      }).toThrow(/count|negative|invalid|bounds/i);
    });

    it('should throw on negative rowCount -100', () => {
      const encoded = createRLEEncodedColumn([1, 2, 3], 3);

      expect(() => {
        decode(encoded, -100);
      }).toThrow(/count|negative|invalid|bounds/i);
    });

    it('should throw on Number.MIN_SAFE_INTEGER rowCount', () => {
      const encoded = createRLEEncodedColumn([1, 2, 3], 3);

      expect(() => {
        decode(encoded, Number.MIN_SAFE_INTEGER);
      }).toThrow(/count|negative|invalid|bounds/i);
    });
  });

  describe('Count exceeding safe limits validation', () => {
    it('should throw when rowCount exceeds MAX_DECODE_COUNT', () => {
      // Create small encoded data but request way too many rows
      const encoded = createRLEEncodedColumn([1, 2, 3], 3);

      // Request more than MAX_DECODE_COUNT (2^31 - 1)
      const excessiveCount = 2 ** 31;
      expect(() => {
        decode(encoded, excessiveCount);
      }).toThrow(/count|exceed|capacity|maximum/i);
    });

    it('should throw when rowCount is Number.MAX_SAFE_INTEGER', () => {
      const encoded = createRLEEncodedColumn([1, 2, 3], 3);

      expect(() => {
        decode(encoded, Number.MAX_SAFE_INTEGER);
      }).toThrow(/count|exceed|capacity|maximum/i);
    });
  });

  describe('Valid counts work correctly', () => {
    it('should decode successfully with count = 0', () => {
      const encoded = createRLEEncodedColumn([1, 2, 3], 3);

      const result = decode(encoded, 0);
      expect(result.values).toHaveLength(0);
    });

    it('should decode successfully with valid count matching data', () => {
      const column: Column = {
        path: 'test',
        type: Type.Int32,
        nullable: false,
        values: [42, 42, 42, 42, 42],
        nulls: [false, false, false, false, false],
      };

      const [encoded] = encode([column]);
      const decoded = decode(encoded, 5);

      expect(decoded.values).toEqual([42, 42, 42, 42, 42]);
    });
  });
});

// =============================================================================
// 2. DELTA DECODE BOUNDS VALIDATION TESTS
// =============================================================================

describe('Delta Decode Bounds Validation', () => {
  describe('Negative count validation', () => {
    it('should throw on negative rowCount for delta decoding', () => {
      // Create sorted values to trigger delta encoding
      const column: Column = {
        path: 'test',
        type: Type.Int32,
        nullable: false,
        values: [1, 2, 3, 4, 5], // sorted = delta encoded
        nulls: [false, false, false, false, false],
      };

      const [encoded] = encode([column]);

      // If delta encoded, this should throw on negative count
      expect(() => {
        decode(encoded, -1);
      }).toThrow(/count|negative|invalid|bounds/i);
    });

    it('should throw on negative count for fastDecodeDeltaInt32', () => {
      const data = createRawDeltaInt32Data([1, 2, 3, 4, 5]);

      expect(() => {
        fastDecodeDeltaInt32(data, -1);
      }).toThrow(/count|negative|invalid|bounds/i);
    });

    it('should throw on large negative count for fastDecodeDeltaInt32', () => {
      const data = createRawDeltaInt32Data([1, 2, 3, 4, 5]);

      expect(() => {
        fastDecodeDeltaInt32(data, -1000);
      }).toThrow(/count|negative|invalid|bounds/i);
    });
  });

  describe('Count exceeding buffer size validation', () => {
    it('should throw when rowCount exceeds delta buffer capacity', () => {
      const data = createRawDeltaInt32Data([1, 2, 3, 4, 5]);

      // Request more values than the buffer can provide
      // 5 Int32 values = 20 bytes, but requesting 1000 values needs 4000 bytes
      expect(() => {
        fastDecodeDeltaInt32(data, 1000);
      }).toThrow(/count|exceed|buffer|bounds|capacity/i);
    });

    it('should throw when count is much larger than buffer', () => {
      const data = createRawDeltaInt32Data([1, 2, 3]);

      expect(() => {
        fastDecodeDeltaInt32(data, 1000000);
      }).toThrow(/count|exceed|buffer|bounds|capacity/i);
    });

    it('should throw when count exceeds available Int32 values', () => {
      // Create buffer that can hold 10 Int32 values
      const data = createRawDeltaInt32Data(Array.from({ length: 10 }, (_, i) => i));

      // Request 11 values - exactly one more than available
      expect(() => {
        fastDecodeDeltaInt32(data, 11);
      }).toThrow(/count|exceed|buffer|bounds|capacity/i);
    });
  });

  describe('Valid counts work correctly', () => {
    it('should decode delta successfully with count = 0', () => {
      const data = createRawDeltaInt32Data([1, 2, 3, 4, 5]);

      const result = fastDecodeDeltaInt32(data, 0);
      expect(result).toHaveLength(0);
    });

    it('should decode delta successfully with valid count', () => {
      const data = createRawDeltaInt32Data([10, 20, 30, 40, 50]);

      const result = fastDecodeDeltaInt32(data, 5);
      expect(result).toHaveLength(5);
      expect(result[0]).toBe(10);
      expect(result[1]).toBe(20);
      expect(result[2]).toBe(30);
      expect(result[3]).toBe(40);
      expect(result[4]).toBe(50);
    });

    it('should decode delta with count less than available data', () => {
      const data = createRawDeltaInt32Data([1, 2, 3, 4, 5]);

      const result = fastDecodeDeltaInt32(data, 3);
      expect(result).toHaveLength(3);
      expect(result[0]).toBe(1);
      expect(result[1]).toBe(2);
      expect(result[2]).toBe(3);
    });
  });
});

// =============================================================================
// 3. EDGE CASES
// =============================================================================

describe('Decode Bounds Edge Cases', () => {
  it('should handle empty buffer with count 0', () => {
    const emptyData = new Uint8Array(0);

    const result = fastDecodeDeltaInt32(emptyData, 0);
    expect(result).toHaveLength(0);
  });

  it('should throw on empty buffer with non-zero count', () => {
    const emptyData = new Uint8Array(0);

    expect(() => {
      fastDecodeDeltaInt32(emptyData, 5);
    }).toThrow(/count|exceed|buffer|bounds|capacity|empty/i);
  });

  it('should throw on NaN count', () => {
    const data = createRawDeltaInt32Data([1, 2, 3]);

    expect(() => {
      fastDecodeDeltaInt32(data, NaN);
    }).toThrow(/count|invalid|NaN|bounds/i);
  });

  it('should throw on Infinity count', () => {
    const data = createRawDeltaInt32Data([1, 2, 3]);

    expect(() => {
      fastDecodeDeltaInt32(data, Infinity);
    }).toThrow(/count|invalid|Infinity|bounds/i);
  });

  it('should throw on -Infinity count', () => {
    const data = createRawDeltaInt32Data([1, 2, 3]);

    expect(() => {
      fastDecodeDeltaInt32(data, -Infinity);
    }).toThrow(/count|invalid|Infinity|bounds/i);
  });
});
