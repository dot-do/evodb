/**
 * @evodb/core - Array Bounds Checking Tests (TDD)
 *
 * Tests for array access patterns to ensure proper bounds checking.
 *
 * Issue: evodb-2nr - Fix unchecked array access patterns
 *
 * These tests verify:
 * 1. Dictionary decoding with corrupted/invalid indices
 * 2. Delta decoding with truncated data
 * 3. BitPacking with corrupt bit width
 * 4. Snippet format decoding with invalid indices
 */

import { describe, it, expect } from 'vitest';
import {
  decode,
  encode,
  unpackBits,
  fastDecodeDeltaInt32,
} from '../encode.js';
import {
  bitUnpack,
  decodeSortedDict,
  decodeSnippetColumn,
  type SnippetColumn,
  SnippetEncoding,
} from '../snippet-format.js';
import { Type, Encoding, type EncodedColumn } from '../types.js';

// =============================================================================
// DICTIONARY DECODE BOUNDS TESTS - encode.ts line 305
// =============================================================================

describe('Dictionary Decode Bounds - evodb-2nr', () => {
  describe('decodeDict with invalid indices', () => {
    it('should handle dictionary index exceeding dict length gracefully', () => {
      // Create encoded dictionary data with an index that exceeds dict length
      // Dictionary format: dictSize(4) + entries + indices
      const dictEntries = ['alpha', 'beta', 'gamma'];
      const encoder = new TextEncoder();

      // Build dictionary bytes
      const chunks: Uint8Array[] = [];

      // Dict size
      const dictSizeBuf = new Uint8Array(4);
      new DataView(dictSizeBuf.buffer).setUint32(0, dictEntries.length, true);
      chunks.push(dictSizeBuf);

      // Dict entries (length-prefixed)
      for (const entry of dictEntries) {
        const encoded = encoder.encode(entry);
        const lenBuf = new Uint8Array(2);
        new DataView(lenBuf.buffer).setUint16(0, encoded.length, true);
        chunks.push(lenBuf);
        chunks.push(encoded);
      }

      // Indices with INVALID index (999 > dict.length which is 3)
      // Normal indices would be 0, 1, 2, but we include 999 (out of bounds)
      const indices = new Uint16Array([0, 1, 999, 2]); // Index 999 is out of bounds
      chunks.push(new Uint8Array(indices.buffer));

      // Concatenate
      const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
      const data = new Uint8Array(totalLen);
      let offset = 0;
      for (const chunk of chunks) {
        data.set(chunk, offset);
        offset += chunk.length;
      }

      // Create EncodedColumn with this corrupted data
      const rowCount = 4;
      const nullBitmap = new Uint8Array(1); // No nulls (all zeros)
      const encodedCol: EncodedColumn = {
        path: 'test',
        type: Type.String,
        encoding: Encoding.Dict,
        data,
        nullBitmap,
        stats: { min: undefined, max: undefined, nullCount: 0, distinctEst: 3 },
      };

      // Should not throw but should handle the out-of-bounds index
      const result = decode(encodedCol, rowCount);

      // The third value (index 999) should be handled - either null or return undefined gracefully
      expect(result.values).toHaveLength(rowCount);
      // The out-of-bounds index should be null or an empty/fallback value, not crash
      expect(result.values[2]).toBeNull();
    });

    it('should handle empty dictionary with non-zero indices', () => {
      // Dictionary with 0 entries but indices referring to non-existent entries
      const data = new Uint8Array(4 + 4); // dictSize(4) + 2 indices(4)
      const view = new DataView(data.buffer);
      view.setUint32(0, 0, true); // Dict size = 0
      view.setUint16(4, 5, true); // Index 5 (invalid, dict is empty)
      view.setUint16(6, 10, true); // Index 10 (invalid)

      const encodedCol: EncodedColumn = {
        path: 'test',
        type: Type.String,
        encoding: Encoding.Dict,
        data,
        nullBitmap: new Uint8Array(1),
        stats: { min: undefined, max: undefined, nullCount: 0, distinctEst: 0 },
      };

      // Should not throw
      const result = decode(encodedCol, 2);
      expect(result.values).toHaveLength(2);
      // Both should be null since dict is empty
      expect(result.values[0]).toBeNull();
      expect(result.values[1]).toBeNull();
    });

    it('should handle negative dictionary indices (as high uint16)', () => {
      // Create a dictionary with valid entries
      const dictEntries = ['one', 'two'];
      const encoder = new TextEncoder();
      const chunks: Uint8Array[] = [];

      // Dict size
      const dictSizeBuf = new Uint8Array(4);
      new DataView(dictSizeBuf.buffer).setUint32(0, dictEntries.length, true);
      chunks.push(dictSizeBuf);

      // Dict entries
      for (const entry of dictEntries) {
        const encoded = encoder.encode(entry);
        const lenBuf = new Uint8Array(2);
        new DataView(lenBuf.buffer).setUint16(0, encoded.length, true);
        chunks.push(lenBuf);
        chunks.push(encoded);
      }

      // Indices with 0xFFFE (not 0xFFFF which is null marker, but still invalid)
      const indices = new Uint16Array([0, 0xFFFE]);
      chunks.push(new Uint8Array(indices.buffer));

      const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
      const data = new Uint8Array(totalLen);
      let offset = 0;
      for (const chunk of chunks) {
        data.set(chunk, offset);
        offset += chunk.length;
      }

      const encodedCol: EncodedColumn = {
        path: 'test',
        type: Type.String,
        encoding: Encoding.Dict,
        data,
        nullBitmap: new Uint8Array(1),
        stats: { min: undefined, max: undefined, nullCount: 0, distinctEst: 2 },
      };

      // Should not throw
      const result = decode(encodedCol, 2);
      expect(result.values).toHaveLength(2);
      expect(result.values[0]).toBe('one');
      // Index 0xFFFE is out of bounds, should be handled gracefully
      expect(result.values[1]).toBeNull();
    });
  });
});

// =============================================================================
// DELTA DECODE BOUNDS TESTS - encode.ts fastDecodeDeltaInt32
// =============================================================================

describe('Delta Decode Bounds - evodb-2nr', () => {
  it('should handle rowCount greater than available data', () => {
    // Data for only 2 values but requesting 10
    const data = new Uint8Array(8); // Only 2 Int32s worth of data
    const view = new DataView(data.buffer);
    view.setInt32(0, 100, true); // First value
    view.setInt32(4, 5, true); // Delta

    // Request 10 rows but only have data for 2
    const result = fastDecodeDeltaInt32(data, 10);

    // Should return what it can without crashing
    expect(result).toBeDefined();
    expect(result.length).toBe(10);
    // First 2 should have proper values
    expect(result[0]).toBe(100);
    expect(result[1]).toBe(105);
    // Remaining should have some fallback (not NaN or crash)
  });

  it('should handle empty data with non-zero rowCount', () => {
    const data = new Uint8Array(0);

    // Should not throw with empty data
    const result = fastDecodeDeltaInt32(data, 5);
    expect(result).toBeDefined();
    expect(result.length).toBe(5);
  });

  it('should handle data shorter than single Int32', () => {
    // Only 2 bytes when we need at least 4
    const data = new Uint8Array(2);

    const result = fastDecodeDeltaInt32(data, 1);
    expect(result).toBeDefined();
    expect(result.length).toBe(1);
  });
});

// =============================================================================
// BITUNPACK BOUNDS TESTS - snippet-format.ts bitUnpack
// =============================================================================

describe('BitUnpack Bounds - evodb-2nr', () => {
  it('should handle count larger than available data allows', () => {
    // Data with bit width 8, so each value needs 1 byte after header
    const data = new Uint8Array([8, 0x01, 0x02]); // bit width 8, only 2 bytes of data

    // Request 100 values but only have data for ~2
    const result = bitUnpack(data, 100);

    // Should not crash, should return array of requested length
    expect(result).toBeDefined();
    expect(result.length).toBe(100);
    // First 2 should be correct
    expect(result[0]).toBe(1);
    expect(result[1]).toBe(2);
  });

  it('should handle zero-length data', () => {
    const data = new Uint8Array(0);

    // Should not crash with empty data
    expect(() => bitUnpack(data, 5)).not.toThrow();
  });

  it('should handle invalid bit width (0)', () => {
    const data = new Uint8Array([0, 0x01, 0x02]); // bit width 0

    // Should handle bit width 0 gracefully
    expect(() => bitUnpack(data, 10)).not.toThrow();
  });

  it('should handle very large bit width (255)', () => {
    const data = new Uint8Array([255, 0x01, 0x02]); // bit width 255

    // Should not crash with extremely large bit width
    expect(() => bitUnpack(data, 1)).not.toThrow();
  });
});

// =============================================================================
// SNIPPET COLUMN DECODE BOUNDS TESTS - snippet-format.ts
// =============================================================================

describe('Snippet Column Decode Bounds - evodb-2nr', () => {
  describe('decodeDictColumn with invalid indices', () => {
    it('should handle Dict encoding with out-of-bounds indices in SnippetColumn', () => {
      // Create dictionary data with invalid indices
      const dictEntries = ['apple', 'banana'];
      const encoder = new TextEncoder();
      const chunks: Uint8Array[] = [];

      // Dict size
      const dictSizeBuf = new Uint8Array(4);
      new DataView(dictSizeBuf.buffer).setUint32(0, dictEntries.length, true);
      chunks.push(dictSizeBuf);

      // Dict entries
      for (const entry of dictEntries) {
        const encoded = encoder.encode(entry);
        const lenBuf = new Uint8Array(2);
        new DataView(lenBuf.buffer).setUint16(0, encoded.length, true);
        chunks.push(lenBuf);
        chunks.push(encoded);
      }

      // Indices: 0, 1, 100 (out of bounds), 0xFFFF (null marker)
      const indices = new Uint16Array([0, 1, 100, 0xFFFF]);
      chunks.push(new Uint8Array(indices.buffer));

      const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
      const data = new Uint8Array(totalLen);
      let offset = 0;
      for (const chunk of chunks) {
        data.set(chunk, offset);
        offset += chunk.length;
      }

      const snippetCol: SnippetColumn = {
        path: 'fruits',
        type: Type.String,
        encoding: SnippetEncoding.Dict,
        data,
        // Bitmap convention: bit=1 means null, bit=0 means non-null
        // 0b00001000 = bit 3 is set (4th value is null), bits 0-2 unset (first 3 non-null)
        nullBitmap: new Uint8Array([0b00001000]),
        zoneMap: { min: 0, max: 0, nullCount: 1, bloomOffset: 0 },
        sorted: false,
      };

      // 3 non-null values expected (indices 0, 1, 100)
      const result = decodeSnippetColumn(snippetCol, 4);

      expect(result.values).toHaveLength(3); // Only non-null count
      // First two should be valid
      expect(result.values[0]).toBe('apple');
      expect(result.values[1]).toBe('banana');
      // Third (index 100) should be handled gracefully - empty string or fallback
      expect(result.values[2]).toBe('');
    });
  });

  describe('decodeDeltaBitPack with truncated data', () => {
    it('should handle DeltaBitPack with insufficient data', () => {
      // DeltaBitPack needs at least 4 bytes for first value
      const data = new Uint8Array(2); // Only 2 bytes

      const snippetCol: SnippetColumn = {
        path: 'ids',
        type: Type.Int32,
        encoding: SnippetEncoding.DeltaBitPack,
        data,
        nullBitmap: new Uint8Array([0b00000111]), // 3 non-null values
        zoneMap: { min: 0, max: 100, nullCount: 0, bloomOffset: 0 },
        sorted: true,
      };

      // Should not throw, should handle gracefully
      const result = decodeSnippetColumn(snippetCol, 3);
      expect(result.values).toBeDefined();
    });

    it('should handle DeltaBitPack with empty packed deltas', () => {
      // Only first value, no packed deltas
      const data = new Uint8Array(4);
      new DataView(data.buffer).setInt32(0, 42, true);

      const snippetCol: SnippetColumn = {
        path: 'ids',
        type: Type.Int32,
        encoding: SnippetEncoding.DeltaBitPack,
        data,
        nullBitmap: new Uint8Array([0b00001111]), // 4 non-null values
        zoneMap: { min: 42, max: 42, nullCount: 0, bloomOffset: 0 },
        sorted: true,
      };

      // Requesting 4 values but only have first value encoded
      const result = decodeSnippetColumn(snippetCol, 4);
      expect(result.values).toBeDefined();
      // First value should be correct
      if (result.values.length > 0) {
        expect(result.values[0]).toBe(42);
      }
    });
  });

  describe('decodeRawStrings bounds', () => {
    it('should handle Raw string encoding with count exceeding data', () => {
      // Create length-prefixed strings but not enough for requested count
      const encoder = new TextEncoder();
      const str1 = encoder.encode('hello');

      const data = new Uint8Array(2 + str1.length);
      new DataView(data.buffer).setUint16(0, str1.length, true);
      data.set(str1, 2);

      const snippetCol: SnippetColumn = {
        path: 'names',
        type: Type.String,
        encoding: SnippetEncoding.Raw,
        data,
        nullBitmap: new Uint8Array([0b00001111]), // 4 non-null values
        zoneMap: { min: 0, max: 0, nullCount: 0, bloomOffset: 0 },
        sorted: false,
      };

      // Requesting 4 values but only have data for 1
      // This should handle bounds gracefully
      expect(() => decodeSnippetColumn(snippetCol, 4)).not.toThrow();
    });
  });
});

// =============================================================================
// UNPACKBITS BOUNDS TESTS - encode.ts
// =============================================================================

describe('UnpackBits Bounds - evodb-2nr', () => {
  it('should handle count greater than bits available', () => {
    const bytes = new Uint8Array([0xFF]); // Only 8 bits

    // Request 100 bits
    const result = unpackBits(bytes, 100);

    expect(result).toHaveLength(100);
    // First 8 should all be true (0xFF = all 1s)
    for (let i = 0; i < 8; i++) {
      expect(result[i]).toBe(true);
    }
    // Remaining should not crash (may read beyond buffer but shouldn't throw)
  });

  it('should handle empty byte array with non-zero count', () => {
    const bytes = new Uint8Array(0);

    // Should not throw
    expect(() => unpackBits(bytes, 10)).not.toThrow();
    const result = unpackBits(bytes, 10);
    expect(result).toHaveLength(10);
  });
});

// =============================================================================
// DECODESORTEDDICT BOUNDS TESTS - snippet-format.ts
// =============================================================================

describe('DecodeSortedDict Bounds - evodb-2nr', () => {
  it('should handle data truncated mid-entry', () => {
    // Dictionary says 2 entries but data is truncated
    const data = new Uint8Array(6);
    const view = new DataView(data.buffer);
    view.setUint32(0, 2, true); // Says 2 entries
    view.setUint16(4, 100, true); // First entry length = 100 (but no data follows)

    // Should not crash when trying to read past end
    expect(() => decodeSortedDict(data)).not.toThrow();
  });

  it('should handle zero-length entries', () => {
    const data = new Uint8Array(8);
    const view = new DataView(data.buffer);
    view.setUint32(0, 2, true); // 2 entries
    view.setUint16(4, 0, true); // First entry length = 0
    view.setUint16(6, 0, true); // Second entry length = 0

    const result = decodeSortedDict(data);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('');
    expect(result[1]).toBe('');
  });

  it('should handle declared dict size larger than actual data', () => {
    const data = new Uint8Array(4);
    const view = new DataView(data.buffer);
    view.setUint32(0, 1000, true); // Claims 1000 entries but no data

    // Should not crash
    expect(() => decodeSortedDict(data)).not.toThrow();
  });
});
