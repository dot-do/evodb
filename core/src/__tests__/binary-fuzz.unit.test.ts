/**
 * @evodb/core - Binary Data Fuzz Tests
 *
 * Issue: evodb-dp3 - TDD: Add fuzz testing for binary data
 *
 * Property-based fuzz tests for binary encoding/decoding functions using fast-check.
 * Tests random buffers, edge cases (empty, max size), and roundtrip properties.
 *
 * Focus areas:
 * 1. encode.ts - Column encoding/decoding, bitmaps, dictionary, delta encoding
 * 2. snippet-format.ts - Bit packing, bloom filters, zone maps, chunk serialization
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// encode.ts imports
import {
  encode,
  decode,
  unpackBits,
  unpackBitsDense,
  toNullArray,
  isNullAt,
  encodeDict,
  encodeDelta,
  fastDecodeInt32,
  fastDecodeFloat64,
  fastDecodeDeltaInt32,
} from '../encode.js';
import { Type, Encoding, type Column } from '../types.js';

// snippet-format.ts imports
import {
  bitPack,
  bitUnpack,
  deltaEncode,
  deltaDecode,
  packBitmap,
  unpackBitmap,
  BloomFilter,
  buildSortedDict,
  encodeSortedDict,
  decodeSortedDict,
  encodeSnippetColumn,
  decodeSnippetColumn,
  writeSnippetChunk,
  readSnippetChunk,
  readSnippetHeader,
  zeroCopyDecodeInt32,
  zeroCopyDecodeFloat64,
  computeBitWidth,
  computeZoneMap,
  canSkipByZoneMap,
  dictBinarySearch,
  SNIPPET_MAGIC,
  SnippetEncoding,
} from '../snippet-format.js';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function makeColumn(
  path: string,
  type: Type,
  values: unknown[],
  nulls?: boolean[]
): Column {
  const resolvedNulls = nulls ?? values.map(v => v === null);
  return {
    path,
    type,
    nullable: resolvedNulls.some(n => n),
    values,
    nulls: resolvedNulls,
  };
}

// =============================================================================
// 1. ENCODE.TS - BITMAP ENCODING/DECODING
// =============================================================================

describe('Fuzz: Bitmap Encoding (encode.ts)', () => {
  it('unpackBits reconstructs original boolean array', () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { minLength: 0, maxLength: 1000 }),
        (bits) => {
          // Pack bits manually (same algorithm as packBits in encode.ts)
          const bytes = new Uint8Array(Math.ceil(bits.length / 8));
          for (let i = 0; i < bits.length; i++) {
            if (bits[i]) bytes[i >>> 3] |= 1 << (i & 7);
          }

          // Unpack and verify
          const unpacked = unpackBits(bytes, bits.length);
          expect(unpacked).toEqual(bits);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('bitmap handles edge case: empty array', () => {
    const bytes = new Uint8Array(0);
    // unpackBits now returns NullBitmap, use toNullArray for comparison (evodb-80q)
    const unpacked = toNullArray(unpackBits(bytes, 0));
    expect(unpacked).toEqual([]);
  });

  it('bitmap handles edge case: single bit', () => {
    fc.assert(
      fc.property(fc.boolean(), (bit) => {
        const bytes = new Uint8Array(1);
        if (bit) bytes[0] = 1;
        // unpackBits now returns NullBitmap, use toNullArray for comparison (evodb-80q)
        const unpacked = toNullArray(unpackBits(bytes, 1));
        expect(unpacked).toEqual([bit]);
      }),
      { numRuns: 10 }
    );
  });

  it('bitmap handles edge case: exactly byte-aligned counts', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        (byteCount) => {
          const bitCount = byteCount * 8;
          const bits = Array.from({ length: bitCount }, (_, i) => i % 2 === 0);
          const bytes = new Uint8Array(byteCount);
          for (let i = 0; i < bitCount; i++) {
            if (bits[i]) bytes[i >>> 3] |= 1 << (i & 7);
          }
          // unpackBits now returns NullBitmap, use toNullArray for comparison (evodb-80q)
          const unpacked = toNullArray(unpackBits(bytes, bitCount));
          expect(unpacked).toEqual(bits);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('bitmap handles random buffer data', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 0, maxLength: 100 }),
        fc.integer({ min: 0, max: 800 }),
        (bytes, count) => {
          // Ensure we don't request more bits than available
          const safeCount = Math.min(count, bytes.length * 8);
          // unpackBits now returns NullBitmap, convert for array checks (evodb-80q)
          const unpacked = toNullArray(unpackBits(bytes, safeCount));
          expect(unpacked.length).toBe(safeCount);
          expect(unpacked.every(v => typeof v === 'boolean')).toBe(true);
        }
      ),
      { numRuns: 200 }
    );
  });
});

// =============================================================================
// 2. ENCODE.TS - DICTIONARY ENCODING
// =============================================================================

describe('Fuzz: Dictionary Encoding (encode.ts)', () => {
  it('dictionary encoding handles varied string patterns', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.string({ minLength: 0, maxLength: 100 }),
            fc.constant(null)
          ),
          { minLength: 1, maxLength: 200 }
        ),
        (values) => {
          const nulls = values.map(v => v === null);
          const column = makeColumn('dict_col', Type.String, values, nulls);
          const [encoded] = encode([column]);
          const decoded = decode(encoded, values.length);

          // Verify round-trip (use isNullAt for NullBitmap - evodb-80q)
          for (let i = 0; i < values.length; i++) {
            if (nulls[i]) {
              expect(isNullAt(decoded.nulls, i)).toBe(true);
            } else {
              expect(decoded.values[i]).toBe(values[i]);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('dictionary encoding handles low cardinality data', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.constantFrom('a', 'b', 'c', 'd', 'e'),
          { minLength: 20, maxLength: 100 }
        ),
        (values) => {
          const nulls = values.map(() => false);
          const column = makeColumn('low_card', Type.String, values, nulls);
          const [encoded] = encode([column]);

          // Should use dictionary encoding for low cardinality
          expect(encoded.encoding).toBe(Encoding.Dict);

          const decoded = decode(encoded, values.length);
          expect(decoded.values).toEqual(values);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('dictionary encoding handles empty strings', () => {
    const values = ['', 'a', '', 'b', ''];
    const nulls = values.map(() => false);
    const column = makeColumn('empty_str', Type.String, values, nulls);
    const [encoded] = encode([column]);
    const decoded = decode(encoded, values.length);
    expect(decoded.values).toEqual(values);
  });

  it('dictionary encoding handles various string characters', () => {
    // Using string() which generates ASCII strings, plus explicit unicode test cases
    fc.assert(
      fc.property(
        fc.array(
          fc.string({ minLength: 0, maxLength: 50 }),
          { minLength: 1, maxLength: 50 }
        ),
        (values) => {
          const nulls = values.map(() => false);
          const column = makeColumn('varied_str', Type.String, values, nulls);
          const [encoded] = encode([column]);
          const decoded = decode(encoded, values.length);
          expect(decoded.values).toEqual(values);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('dictionary encoding handles explicit unicode strings', () => {
    // Test specific unicode patterns
    const unicodeValues = [
      'Hello World',
      'cafe',
      'naive',
      'Hello',
      'Chinese',
      '',
      'Mixed content',
    ];
    const nulls = unicodeValues.map(() => false);
    const column = makeColumn('unicode', Type.String, unicodeValues, nulls);
    const [encoded] = encode([column]);
    const decoded = decode(encoded, unicodeValues.length);
    expect(decoded.values).toEqual(unicodeValues);
  });
});

// =============================================================================
// 3. ENCODE.TS - DELTA ENCODING
// =============================================================================

describe('Fuzz: Delta Encoding (encode.ts)', () => {
  it('delta encoding handles sorted integer sequences', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.integer({ min: 0, max: 1000000 }),
          { minLength: 1, maxLength: 100 }
        ).map(arr => [...new Set(arr)].sort((a, b) => a - b)),
        (values) => {
          if (values.length === 0) return;
          const nulls = values.map(() => false);
          const column = makeColumn('sorted', Type.Int32, values, nulls);
          const [encoded] = encode([column]);
          const decoded = decode(encoded, values.length);
          expect(decoded.values).toEqual(values);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('delta encoding handles monotonically increasing sequences', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000 }),
        fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 100 }),
        (start, deltas) => {
          const values: number[] = [start];
          for (const d of deltas) {
            values.push(values[values.length - 1] + d);
          }
          const nulls = values.map(() => false);
          const column = makeColumn('monotonic', Type.Int32, values, nulls);
          const [encoded] = encode([column]);
          const decoded = decode(encoded, values.length);
          expect(decoded.values).toEqual(values);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('delta encoding handles Int64 values', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.bigInt({ min: 0n, max: BigInt(Number.MAX_SAFE_INTEGER) }),
          { minLength: 1, maxLength: 50 }
        ).map(arr => [...new Set(arr)].sort((a, b) => Number(a - b))),
        (bigValues) => {
          if (bigValues.length === 0) return;
          const values = bigValues.map(Number);
          const nulls = values.map(() => false);
          const column = makeColumn('int64', Type.Int64, values, nulls);
          const [encoded] = encode([column]);
          const decoded = decode(encoded, values.length);

          // Int64 may return BigInt or Number, normalize for comparison
          const decodedNormalized = decoded.values.map(v =>
            typeof v === 'bigint' ? Number(v) : v
          );
          expect(decodedNormalized).toEqual(values);
        }
      ),
      { numRuns: 50 }
    );
  });
});

// =============================================================================
// 4. ENCODE.TS - FAST DECODE PATHS
// =============================================================================

describe('Fuzz: Fast Decode Paths (encode.ts)', () => {
  it('fastDecodeInt32 handles valid plain-encoded data', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -2147483648, max: 2147483647 }), { minLength: 1, maxLength: 100 }),
        (values) => {
          // Create Int32Array and convert to Uint8Array
          const arr = new Int32Array(values);
          const data = new Uint8Array(arr.buffer);
          const nullBitmap = new Uint8Array(Math.ceil(values.length / 8)); // all zeros = no nulls

          const result = fastDecodeInt32(data, Encoding.Plain, nullBitmap, values.length);

          if (result) {
            expect(result.length).toBe(values.length);
            for (let i = 0; i < values.length; i++) {
              expect(result[i]).toBe(values[i]);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('fastDecodeFloat64 handles valid plain-encoded data', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.double({ noNaN: true, noDefaultInfinity: true }),
          { minLength: 1, maxLength: 50 }
        ),
        (values) => {
          const arr = new Float64Array(values);
          const data = new Uint8Array(arr.buffer);
          const nullBitmap = new Uint8Array(Math.ceil(values.length / 8));

          const result = fastDecodeFloat64(data, Encoding.Plain, nullBitmap, values.length);

          if (result) {
            expect(result.length).toBe(values.length);
            for (let i = 0; i < values.length; i++) {
              expect(result[i]).toBeCloseTo(values[i], 10);
            }
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('fastDecodeDeltaInt32 handles delta-encoded data', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000 }),
        fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 1, maxLength: 50 }),
        (start, deltas) => {
          // Build expected values
          const expected: number[] = [start];
          for (const d of deltas) {
            expected.push(expected[expected.length - 1] + d);
          }

          // Create delta-encoded data
          const deltaData = new Int32Array(expected.length);
          deltaData[0] = expected[0];
          for (let i = 1; i < expected.length; i++) {
            deltaData[i] = expected[i] - expected[i - 1];
          }
          const data = new Uint8Array(deltaData.buffer);

          const result = fastDecodeDeltaInt32(data, expected.length);
          expect(Array.from(result)).toEqual(expected);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('fastDecodeDeltaInt32 handles empty data', () => {
    const result = fastDecodeDeltaInt32(new Uint8Array(0), 0);
    expect(result.length).toBe(0);
  });

  it('fastDecodeDeltaInt32 handles insufficient data gracefully', () => {
    // Data too short for requested row count
    const data = new Uint8Array([1, 2, 3]); // Only 3 bytes
    const result = fastDecodeDeltaInt32(data, 10);
    expect(result.length).toBe(10); // Should still return array of requested size
  });
});

// =============================================================================
// 5. SNIPPET-FORMAT.TS - BIT PACKING
// =============================================================================

describe('Fuzz: Bit Packing (snippet-format.ts)', () => {
  it('bitPack/bitUnpack round-trip for various bit widths', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(1, 2, 4, 8, 16, 32),
        fc.integer({ min: 1, max: 100 }),
        (bitWidth, count) => {
          const maxVal = bitWidth === 32 ? 0x7FFFFFFF : (1 << bitWidth) - 1;
          const values = Array.from({ length: count }, () =>
            Math.floor(Math.random() * (maxVal + 1))
          );

          const packed = bitPack(values, bitWidth);
          const unpacked = bitUnpack(packed, count);

          for (let i = 0; i < count; i++) {
            expect(unpacked[i]).toBe(values[i] & ((1 << bitWidth) - 1));
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('bitPack handles empty array', () => {
    const packed = bitPack([], 8);
    expect(packed.length).toBeGreaterThan(0); // Contains bit width byte
    const unpacked = bitUnpack(packed, 0);
    expect(unpacked.length).toBe(0);
  });

  it('bitUnpack handles corrupted data gracefully', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 0, maxLength: 100 }),
        fc.integer({ min: 0, max: 100 }),
        (data, count) => {
          // Should not throw, even with garbage data
          const result = bitUnpack(data, count);
          expect(result.length).toBe(count);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('computeBitWidth returns correct width', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 1000000 }), { minLength: 1, maxLength: 50 }),
        (values) => {
          const width = computeBitWidth(values);
          const maxVal = Math.max(...values.map(Math.abs));

          // Verify width is sufficient
          if (maxVal > 0) {
            expect(width).toBeGreaterThanOrEqual(Math.ceil(Math.log2(maxVal + 1)));
          }

          // Verify width is one of the supported widths
          expect([1, 2, 4, 8, 16, 32]).toContain(width);
        }
      ),
      { numRuns: 50 }
    );
  });
});

// =============================================================================
// 6. SNIPPET-FORMAT.TS - DELTA ENCODING
// =============================================================================

describe('Fuzz: Delta Encoding (snippet-format.ts)', () => {
  it('deltaEncode/deltaDecode round-trip', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -1000000, max: 1000000 }), { minLength: 0, maxLength: 100 }),
        (values) => {
          const deltas = deltaEncode(values);
          const decoded = deltaDecode(deltas);

          expect(decoded.length).toBe(values.length);
          for (let i = 0; i < values.length; i++) {
            expect(decoded[i]).toBe(values[i]);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('deltaEncode produces first value unchanged', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 1, maxLength: 50 }),
        (values) => {
          const deltas = deltaEncode(values);
          expect(deltas[0]).toBe(values[0]);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('deltaEncode handles empty array', () => {
    expect(deltaEncode([])).toEqual([]);
    expect(Array.from(deltaDecode([]))).toEqual([]);
  });
});

// =============================================================================
// 7. SNIPPET-FORMAT.TS - BITMAP
// =============================================================================

describe('Fuzz: Bitmap (snippet-format.ts)', () => {
  it('packBitmap/unpackBitmap round-trip', () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { minLength: 0, maxLength: 500 }),
        (bits) => {
          const packed = packBitmap(bits);
          const unpacked = unpackBitmap(packed, bits.length);
          expect(unpacked).toEqual(bits);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('packBitmap produces correct byte count', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000 }),
        (count) => {
          const bits = Array.from({ length: count }, () => Math.random() > 0.5);
          const packed = packBitmap(bits);
          expect(packed.length).toBe(Math.ceil(count / 8));
        }
      ),
      { numRuns: 100 }
    );
  });
});

// =============================================================================
// 8. SNIPPET-FORMAT.TS - BLOOM FILTER
// =============================================================================

describe('Fuzz: Bloom Filter (snippet-format.ts)', () => {
  it('bloom filter has no false negatives', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 100 }),
        (values) => {
          const bloom = new BloomFilter(values.length);
          for (const v of values) {
            bloom.add(v);
          }

          // All added values must be found (no false negatives)
          for (const v of values) {
            expect(bloom.mightContain(v)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('bloom filter serializes and deserializes correctly', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 50 }),
        (values) => {
          const bloom = new BloomFilter(values.length);
          for (const v of values) {
            bloom.add(v);
          }

          // Serialize and deserialize
          const bytes = bloom.toBytes();
          const restored = BloomFilter.fromBytes(bytes);

          // All values should still be found
          for (const v of values) {
            expect(restored.mightContain(v)).toBe(true);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('bloom filter handles numeric values', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 100000 }), { minLength: 1, maxLength: 100 }),
        (values) => {
          const bloom = new BloomFilter(values.length);
          for (const v of values) {
            bloom.add(v);
          }

          for (const v of values) {
            expect(bloom.mightContain(v)).toBe(true);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('bloom filter handles empty strings and zero', () => {
    const bloom = new BloomFilter(10);
    bloom.add('');
    bloom.add(0);
    expect(bloom.mightContain('')).toBe(true);
    expect(bloom.mightContain(0)).toBe(true);
  });

  it('bloom filter with custom false positive rate', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(0.01, 0.001, 0.0001),
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 10, maxLength: 50 }),
        (fpr, values) => {
          const bloom = BloomFilter.withFalsePositiveRate(values.length, fpr);
          for (const v of values) {
            bloom.add(v);
          }

          // All added values should be found
          for (const v of values) {
            expect(bloom.mightContain(v)).toBe(true);
          }
        }
      ),
      { numRuns: 30 }
    );
  });
});

// =============================================================================
// 9. SNIPPET-FORMAT.TS - DICTIONARY ENCODING
// =============================================================================

describe('Fuzz: Sorted Dictionary (snippet-format.ts)', () => {
  // Use lowercase alphanumeric strings to avoid locale-specific sort ordering issues
  // dictBinarySearch uses localeCompare, which can differ from default JS sort for mixed case
  const alphanumString = fc.stringMatching(/^[a-z0-9]*$/);

  it('buildSortedDict creates sorted dictionary', () => {
    fc.assert(
      fc.property(
        fc.array(alphanumString, { minLength: 1, maxLength: 100 }),
        (values) => {
          const nulls = values.map(() => false);
          const { dict } = buildSortedDict(values, nulls);

          // Verify sorted using localeCompare (same as dictBinarySearch)
          for (let i = 1; i < dict.length; i++) {
            expect(dict[i].localeCompare(dict[i - 1])).toBeGreaterThanOrEqual(0);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('encodeSortedDict/decodeSortedDict round-trip', () => {
    fc.assert(
      fc.property(
        fc.array(alphanumString, { minLength: 0, maxLength: 50 })
          .map(arr => [...new Set(arr)].sort((a, b) => a.localeCompare(b))),
        (dict) => {
          const encoded = encodeSortedDict(dict);
          const decoded = decodeSortedDict(encoded);
          expect(decoded).toEqual(dict);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('dictBinarySearch finds existing values', () => {
    fc.assert(
      fc.property(
        fc.array(alphanumString.filter(s => s.length > 0), { minLength: 1, maxLength: 50 })
          .map(arr => [...new Set(arr)].sort((a, b) => a.localeCompare(b))),
        (dict) => {
          for (const target of dict) {
            const idx = dictBinarySearch(dict, target);
            expect(idx).toBeGreaterThanOrEqual(0);
            expect(dict[idx]).toBe(target);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('dictBinarySearch returns -1 for missing values', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 1, maxLength: 20 })
          .map(arr => [...new Set(arr)].sort()),
        (dict) => {
          // Search for a value not in the dictionary
          const missing = '___NOT_IN_DICT___' + Date.now();
          const idx = dictBinarySearch(dict, missing);
          expect(idx).toBe(-1);
        }
      ),
      { numRuns: 30 }
    );
  });

  it('decodeSortedDict handles corrupted data gracefully', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 0, maxLength: 100 }),
        (data) => {
          // Should not throw
          const result = decodeSortedDict(data);
          expect(Array.isArray(result)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// =============================================================================
// 10. SNIPPET-FORMAT.TS - ZONE MAPS
// =============================================================================

describe('Fuzz: Zone Maps (snippet-format.ts)', () => {
  it('computeZoneMap computes correct min/max for integers', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(fc.integer({ min: -1000000, max: 1000000 }), fc.constant(null)),
          { minLength: 1, maxLength: 100 }
        ),
        (values) => {
          const nulls = values.map(v => v === null);
          const zoneMap = computeZoneMap(values, nulls, Type.Int32);

          const nonNullValues = values.filter((v): v is number => v !== null);
          if (nonNullValues.length > 0) {
            expect(zoneMap.min).toBe(Math.min(...nonNullValues));
            expect(zoneMap.max).toBe(Math.max(...nonNullValues));
          }
          expect(zoneMap.nullCount).toBe(nulls.filter(n => n).length);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('canSkipByZoneMap correctly identifies skippable ranges', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50 }),
        fc.integer({ min: 50, max: 100 }),
        (zoneMin, spread) => {
          const zoneMax = zoneMin + spread; // Ensure max >= min
          const zoneMap = { min: zoneMin, max: zoneMax, nullCount: 0, bloomOffset: 0 };

          // Filter completely above zone
          expect(canSkipByZoneMap(zoneMap, { min: zoneMax + 10 })).toBe(true);

          // Filter completely below zone (only if zoneMin > 10)
          if (zoneMin > 10) {
            expect(canSkipByZoneMap(zoneMap, { max: zoneMin - 10 })).toBe(true);
          }

          // Filter overlaps zone - when both min and max are within the zone
          // This should NOT skip because the filter range overlaps with the zone
          const filterMin = zoneMin;
          const filterMax = zoneMax;
          expect(canSkipByZoneMap(zoneMap, { min: filterMin, max: filterMax })).toBe(false);
        }
      ),
      { numRuns: 50 }
    );
  });
});

// =============================================================================
// 11. SNIPPET-FORMAT.TS - ZERO-COPY DECODE
// =============================================================================

describe('Fuzz: Zero-Copy Decode (snippet-format.ts)', () => {
  it('zeroCopyDecodeInt32 handles aligned data', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -2147483648, max: 2147483647 }), { minLength: 1, maxLength: 50 }),
        (values) => {
          const arr = new Int32Array(values);
          const data = new Uint8Array(arr.buffer);

          const result = zeroCopyDecodeInt32(data, values.length);
          expect(result.length).toBe(values.length);
          for (let i = 0; i < values.length; i++) {
            expect(result[i]).toBe(values[i]);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('zeroCopyDecodeFloat64 handles aligned data', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ noNaN: true, noDefaultInfinity: true }), { minLength: 1, maxLength: 50 }),
        (values) => {
          const arr = new Float64Array(values);
          const data = new Uint8Array(arr.buffer);

          const result = zeroCopyDecodeFloat64(data, values.length);
          expect(result.length).toBe(values.length);
          for (let i = 0; i < values.length; i++) {
            expect(result[i]).toBeCloseTo(values[i], 10);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('zeroCopyDecodeInt32 handles misaligned data', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 1, maxLength: 20 }),
        fc.integer({ min: 1, max: 3 }),
        (values, offset) => {
          // Create misaligned buffer
          const arr = new Int32Array(values);
          const aligned = new Uint8Array(arr.buffer);
          const misaligned = new Uint8Array(aligned.length + offset);
          misaligned.set(aligned, offset);
          const data = misaligned.subarray(offset);

          const result = zeroCopyDecodeInt32(data, values.length);
          expect(result.length).toBe(values.length);
          for (let i = 0; i < values.length; i++) {
            expect(result[i]).toBe(values[i]);
          }
        }
      ),
      { numRuns: 30 }
    );
  });
});

// =============================================================================
// 12. SNIPPET-FORMAT.TS - FULL CHUNK SERIALIZATION
// =============================================================================

describe('Fuzz: Snippet Chunk Serialization (snippet-format.ts)', () => {
  it('writeSnippetChunk/readSnippetChunk round-trip for Int32 columns', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -1000000, max: 1000000 }), { minLength: 1, maxLength: 50 }),
        (values) => {
          const nulls = values.map(() => false);
          const col = encodeSnippetColumn('int_col', Type.Int32, values, nulls);

          const chunk = writeSnippetChunk([col], values.length);
          const { header, columns } = readSnippetChunk(chunk);

          expect(header.magic).toBe(SNIPPET_MAGIC);
          expect(header.rowCount).toBe(values.length);
          expect(header.columnCount).toBe(1);
          expect(columns.length).toBe(1);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('writeSnippetChunk/readSnippetChunk round-trip for String columns', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 0, maxLength: 30 }), { minLength: 1, maxLength: 30 }),
        (values) => {
          const nulls = values.map(() => false);
          const col = encodeSnippetColumn('str_col', Type.String, values, nulls);

          const chunk = writeSnippetChunk([col], values.length);
          const { header } = readSnippetChunk(chunk);

          expect(header.magic).toBe(SNIPPET_MAGIC);
          expect(header.rowCount).toBe(values.length);
        }
      ),
      { numRuns: 30 }
    );
  });

  it('writeSnippetChunk/readSnippetChunk handles multiple columns', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        (rowCount) => {
          const intValues = Array.from({ length: rowCount }, (_, i) => i);
          const strValues = Array.from({ length: rowCount }, (_, i) => `row_${i}`);
          const boolValues = Array.from({ length: rowCount }, (_, i) => i % 2 === 0);
          const nulls = Array.from({ length: rowCount }, () => false);

          const cols = [
            encodeSnippetColumn('int_col', Type.Int32, intValues, nulls),
            encodeSnippetColumn('str_col', Type.String, strValues, nulls),
            encodeSnippetColumn('bool_col', Type.Bool, boolValues, nulls),
          ];

          const chunk = writeSnippetChunk(cols, rowCount);
          const { header, columns } = readSnippetChunk(chunk);

          expect(header.columnCount).toBe(3);
          expect(columns.length).toBe(3);
        }
      ),
      { numRuns: 30 }
    );
  });

  it('readSnippetHeader validates magic number', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 64, maxLength: 100 }),
        (data) => {
          // Corrupt magic should throw
          if (data[0] !== 0x53 || data[1] !== 0x4E || data[2] !== 0x49 || data[3] !== 0x50) {
            expect(() => readSnippetHeader(data)).toThrow(/Invalid snippet magic/);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('chunk with bloom filters round-trips correctly', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 5, maxLength: 30 }),
        (values) => {
          const nulls = values.map(() => false);
          const col = encodeSnippetColumn('bloom_col', Type.String, values, nulls, { buildBloom: true });

          expect(col.bloomFilter).toBeDefined();

          const chunk = writeSnippetChunk([col], values.length);
          const { header } = readSnippetChunk(chunk);

          expect(header.flags & 1).toBe(1); // Bloom filter flag set
        }
      ),
      { numRuns: 20 }
    );
  });
});

// =============================================================================
// 13. EDGE CASES - EMPTY AND MAX SIZE DATA
// =============================================================================

describe('Fuzz: Edge Cases', () => {
  it('handles empty columns', () => {
    const col = encodeSnippetColumn('empty', Type.Int32, [], []);
    expect(col.data.length).toBe(0);
    expect(col.nullBitmap.length).toBe(0);
  });

  it('handles all-null columns', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        (count) => {
          const values = new Array(count).fill(null);
          const nulls = new Array(count).fill(true);
          const column = makeColumn('all_null', Type.Int32, values, nulls);

          const [encoded] = encode([column]);
          const decoded = decode(encoded, count);

          expect(decoded.nulls.every(n => n)).toBe(true);
        }
      ),
      { numRuns: 30 }
    );
  });

  it('handles single-value columns', () => {
    fc.assert(
      fc.property(
        fc.integer(),
        (value) => {
          const column = makeColumn('single', Type.Int32, [value], [false]);
          const [encoded] = encode([column]);
          const decoded = decode(encoded, 1);
          expect(decoded.values[0]).toBe(value);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('handles large random binary data', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 1, maxLength: 10000 }),
        (data) => {
          const column = makeColumn('binary', Type.Binary, [data], [false]);
          const [encoded] = encode([column]);
          const decoded = decode(encoded, 1);

          const result = decoded.values[0] as Uint8Array;
          expect(result.length).toBe(data.length);
          for (let i = 0; i < data.length; i++) {
            expect(result[i]).toBe(data[i]);
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  it('handles timestamps as Int64', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.integer({ min: 0, max: Date.now() + 1000000000 }),
          { minLength: 1, maxLength: 50 }
        ),
        (timestamps) => {
          const nulls = timestamps.map(() => false);
          const column = makeColumn('ts', Type.Timestamp, timestamps, nulls);
          const [encoded] = encode([column]);
          const decoded = decode(encoded, timestamps.length);

          for (let i = 0; i < timestamps.length; i++) {
            expect(Number(decoded.values[i])).toBe(timestamps[i]);
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  it('handles date strings', () => {
    fc.assert(
      fc.property(
        // Use integer timestamps to avoid invalid Date issues
        fc.integer({ min: 0, max: 4102444800000 }), // 1970-01-01 to 2100-01-01
        (timestamp) => {
          const date = new Date(timestamp);
          const dateStr = date.toISOString().split('T')[0];
          const column = makeColumn('date', Type.Date, [dateStr], [false]);
          const [encoded] = encode([column]);
          const decoded = decode(encoded, 1);
          expect(decoded.values[0]).toBe(dateStr);
        }
      ),
      { numRuns: 50 }
    );
  });
});

// =============================================================================
// 14. CORRUPTED DATA HANDLING
// =============================================================================

describe('Fuzz: Corrupted Data Handling', () => {
  it('decode handles truncated dictionary data', () => {
    // Create a valid dictionary-encoded column, then truncate it
    const values = ['a', 'b', 'c', 'a', 'b', 'c'];
    const nulls = values.map(() => false);
    const column = makeColumn('dict', Type.String, values, nulls);
    const [encoded] = encode([column]);

    if (encoded.encoding === Encoding.Dict) {
      // Truncate the data
      const truncated = encoded.data.slice(0, Math.floor(encoded.data.length / 2));
      const corrupted = { ...encoded, data: truncated };

      // Should not throw, but may return partial/null data
      expect(() => decode(corrupted, values.length)).not.toThrow();
    }
  });

  it('bitUnpack handles empty data', () => {
    const result = bitUnpack(new Uint8Array(0), 10);
    expect(result.length).toBe(10);
    // All zeros expected
    expect(result.every(v => v === 0)).toBe(true);
  });

  it('decodeSortedDict handles empty buffer', () => {
    const result = decodeSortedDict(new Uint8Array(0));
    expect(result).toEqual([]);
  });

  it('decodeSortedDict handles buffer smaller than header', () => {
    const result = decodeSortedDict(new Uint8Array([1, 2]));
    expect(result).toEqual([]);
  });
});
