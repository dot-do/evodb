/**
 * Tests for Protobuf Parser
 */

import { describe, it, expect } from 'vitest';
import {
  ProtobufReader,
  parseManifest,
  parseIvf,
  parsePqCodebook,
  parseIndexSection,
  parseSchemaMetadata,
  parseColumnStatistics,
  readDeletionFile,
} from '../protobuf.js';
import { MemoryStorageAdapter } from '../r2-adapter.js';

// ==========================================
// ProtobufReader Extended Tests
// ==========================================

describe('ProtobufReader Extended', () => {
  describe('edge cases', () => {
    it('should handle end of buffer in readVarint', () => {
      const buffer = new ArrayBuffer(0);
      const reader = new ProtobufReader(buffer);

      expect(() => reader.readVarint()).toThrow(/Unexpected end of buffer/);
    });

    it('should handle multi-byte varints with many continuation bytes', () => {
      // Encode a large number that needs many bytes
      // 268435455 (0x0FFFFFFF) encoded as varint: FF FF FF 7F
      const buffer = new Uint8Array([0xFF, 0xFF, 0xFF, 0x7F]);
      const reader = new ProtobufReader(buffer.buffer);

      const value = reader.readVarint();
      expect(value).toBe(268435455n);
    });

    it('should read signed varint correctly (positive)', () => {
      // ZigZag encoding: 2 encodes to 1
      const buffer = new Uint8Array([2]);
      const reader = new ProtobufReader(buffer.buffer);

      expect(reader.readSVarint()).toBe(1n);
    });

    it('should read signed varint correctly (negative)', () => {
      // ZigZag encoding: 1 encodes to -1
      const buffer = new Uint8Array([1]);
      const reader = new ProtobufReader(buffer.buffer);

      expect(reader.readSVarint()).toBe(-1n);
    });

    it('should read signed varint as number', () => {
      const buffer = new Uint8Array([3]); // -2 in zigzag
      const reader = new ProtobufReader(buffer.buffer);

      expect(reader.readSVarintNumber()).toBe(-2);
    });

    it('should report hasMore correctly', () => {
      const buffer = new Uint8Array([1, 2, 3]);
      const reader = new ProtobufReader(buffer.buffer);

      expect(reader.hasMore()).toBe(true);
      reader.skip(3);
      expect(reader.hasMore()).toBe(false);
    });

    it('should report position correctly', () => {
      const buffer = new Uint8Array([1, 2, 3, 4, 5]);
      const reader = new ProtobufReader(buffer.buffer);

      expect(reader.position()).toBe(0);
      reader.skip(2);
      expect(reader.position()).toBe(2);
    });

    it('should handle end of buffer in readFixed64', () => {
      const buffer = new ArrayBuffer(4);
      const reader = new ProtobufReader(buffer);

      expect(() => reader.readFixed64()).toThrow(/Unexpected end of buffer/);
    });

    it('should handle end of buffer in readFixed32', () => {
      const buffer = new ArrayBuffer(2);
      const reader = new ProtobufReader(buffer);

      expect(() => reader.readFixed32()).toThrow(/Unexpected end of buffer/);
    });

    it('should handle end of buffer in readFloat32', () => {
      const buffer = new ArrayBuffer(2);
      const reader = new ProtobufReader(buffer);

      expect(() => reader.readFloat32()).toThrow(/Unexpected end of buffer/);
    });

    it('should handle end of buffer in readFloat64', () => {
      const buffer = new ArrayBuffer(4);
      const reader = new ProtobufReader(buffer);

      expect(() => reader.readFloat64()).toThrow(/Unexpected end of buffer/);
    });

    it('should handle end of buffer in readBytes', () => {
      // Length prefix says 10 bytes, but only 2 available
      const buffer = new Uint8Array([10, 1, 2]);
      const reader = new ProtobufReader(buffer.buffer);

      expect(() => reader.readBytes()).toThrow(/Unexpected end of buffer/);
    });

    it('should read float64 correctly', () => {
      const buffer = new ArrayBuffer(8);
      new DataView(buffer).setFloat64(0, 3.14159265359, true);
      const reader = new ProtobufReader(buffer);

      expect(reader.readFloat64()).toBeCloseTo(3.14159265359, 10);
    });

    it('should return null tag at end of buffer', () => {
      const buffer = new ArrayBuffer(0);
      const reader = new ProtobufReader(buffer);

      expect(reader.readTag()).toBeNull();
    });

    it('should skip fixed32 wire type', () => {
      // Field 1, wire type 5 (fixed32)
      const buffer = new Uint8Array([
        (1 << 3) | 5, // tag
        1, 2, 3, 4,   // 4 bytes fixed32
        (2 << 3) | 0, // next tag
        42,           // varint value
      ]);
      const reader = new ProtobufReader(buffer.buffer);

      const tag1 = reader.readTag();
      expect(tag1!.field).toBe(1);
      expect(tag1!.wireType).toBe(5);

      reader.skipField(5);

      const tag2 = reader.readTag();
      expect(tag2!.field).toBe(2);
      expect(reader.readVarint()).toBe(42n);
    });

    it('should throw for unknown wire type', () => {
      const reader = new ProtobufReader(new ArrayBuffer(10));

      expect(() => reader.skipField(7)).toThrow(/Unknown wire type/);
    });

    it('should read bytes view without copying', () => {
      const buffer = new Uint8Array([3, 10, 20, 30]);
      const reader = new ProtobufReader(buffer.buffer);

      const view = reader.readBytesView();
      expect(view.byteLength).toBe(3);
      expect(view.getUint8(0)).toBe(10);
      expect(view.getUint8(1)).toBe(20);
      expect(view.getUint8(2)).toBe(30);
    });

    it('should read packed float32', () => {
      // Create packed float32 array: [1.0, 2.0, 3.0]
      const floats = new Float32Array([1.0, 2.0, 3.0]);
      const floatBytes = new Uint8Array(floats.buffer);
      const buffer = new Uint8Array([floatBytes.length, ...floatBytes]);

      const reader = new ProtobufReader(buffer.buffer);
      const result = reader.readPackedFloat32();

      expect(result.length).toBe(3);
      expect(result[0]).toBeCloseTo(1.0, 5);
      expect(result[1]).toBeCloseTo(2.0, 5);
      expect(result[2]).toBeCloseTo(3.0, 5);
    });

    it('should read nested message', () => {
      // Nested message with a varint field
      const nested = new Uint8Array([
        8, 42, // field 1, value 42
      ]);
      const buffer = new Uint8Array([nested.length, ...nested]);

      const reader = new ProtobufReader(buffer.buffer);
      const nestedReader = reader.readMessage();

      const tag = nestedReader.readTag();
      expect(tag!.field).toBe(1);
      expect(nestedReader.readVarint()).toBe(42n);
    });

    it('should read packed uint64', () => {
      // Packed uint64: [100, 200, 300]
      // Varints: 100 = 0x64 (1 byte), 200 = 0xC8 0x01 (2 bytes), 300 = 0xAC 0x02 (2 bytes)
      const buffer = new Uint8Array([
        5,        // length (1 + 2 + 2 = 5 bytes)
        100,      // 100
        200, 1,   // 200
        172, 2,   // 300
      ]);

      const reader = new ProtobufReader(buffer.buffer);
      const result = reader.readPackedUint64();

      expect(result.length).toBe(3);
      expect(result[0]).toBe(100n);
      expect(result[1]).toBe(200n);
      expect(result[2]).toBe(300n);
    });

    it('should read packed varint', () => {
      const buffer = new Uint8Array([3, 1, 2, 3]);
      const reader = new ProtobufReader(buffer.buffer);
      const result = reader.readPackedVarint();

      expect(result).toEqual([1n, 2n, 3n]);
    });
  });

  describe('with byteOffset and byteLength', () => {
    it('should respect byteOffset parameter', () => {
      const buffer = new Uint8Array([99, 99, 42, 99, 99]).buffer;
      const reader = new ProtobufReader(buffer, 2, 1);

      expect(reader.readVarintNumber()).toBe(42);
    });
  });
});

// ==========================================
// parseManifest Extended Tests
// ==========================================

describe('parseManifest Extended', () => {
  it('should parse manifest with all field types', () => {
    // Create a manifest with various fields
    const parts: Uint8Array[] = [];

    // Field 3: version = 10
    parts.push(new Uint8Array([24, 10]));

    // Field 5: reader_feature_flags = 1
    parts.push(new Uint8Array([40, 1]));

    // Field 6: writer_feature_flags = 2
    parts.push(new Uint8Array([48, 2]));

    // Field 8: data_format = 1 (lance)
    parts.push(new Uint8Array([64, 1]));

    const buffer = concatBuffers(parts);
    const manifest = parseManifest(buffer);

    expect(manifest.version).toBe(10n);
    expect(manifest.readerFeatureFlags).toBe(1n);
    expect(manifest.writerFeatureFlags).toBe(2n);
    expect(manifest.dataFormat).toBe('lance');
  });

  it('should parse manifest with data_format = 0 (legacy)', () => {
    const parts: Uint8Array[] = [];
    parts.push(new Uint8Array([24, 1])); // version
    parts.push(new Uint8Array([64, 0])); // data_format = 0 (legacy)

    const buffer = concatBuffers(parts);
    const manifest = parseManifest(buffer);

    expect(manifest.dataFormat).toBe('legacy');
  });

  it('should handle empty manifest', () => {
    const buffer = new ArrayBuffer(0);
    const manifest = parseManifest(buffer);

    expect(manifest.version).toBe(0n);
    expect(manifest.fields).toEqual([]);
    expect(manifest.fragments).toEqual([]);
  });
});

// ==========================================
// parseIvf Tests
// ==========================================

describe('parseIvf', () => {
  it('should handle empty buffer', () => {
    const buffer = new ArrayBuffer(0);
    const ivf = parseIvf(buffer);

    expect(ivf.numPartitions).toBe(0);
    expect(ivf.centroids.length).toBe(0);
    expect(ivf.offsets.length).toBe(0);
    expect(ivf.lengths.length).toBe(0);
  });

  it('should parse offsets and lengths with varints', () => {
    const parts: Uint8Array[] = [];

    // Field 2: offsets (packed varint uint64)
    // Values: [0, 100, 200] encoded as varints
    const offsetVarints = new Uint8Array([
      0,           // 0
      100,         // 100
      200, 1,      // 200 (0xC8 0x01)
    ]);
    parts.push(new Uint8Array([
      18, // tag: field 2, wire type 2
      offsetVarints.length,
      ...offsetVarints,
    ]));

    // Field 3: lengths (packed varint uint32)
    // Values: [50, 50, 50] encoded as varints
    const lengthVarints = new Uint8Array([50, 50, 50]);
    parts.push(new Uint8Array([
      26, // tag: field 3, wire type 2
      lengthVarints.length,
      ...lengthVarints,
    ]));

    // Field 4: loss (float32)
    const lossBuffer = new ArrayBuffer(4);
    new DataView(lossBuffer).setFloat32(0, 0.5, true);
    parts.push(new Uint8Array([
      37, // tag: field 4, wire type 5 (fixed32)
      ...new Uint8Array(lossBuffer),
    ]));

    const buffer = concatBuffers(parts);
    const ivf = parseIvf(buffer);

    expect(ivf.numPartitions).toBe(3);
    expect(ivf.loss).toBeCloseTo(0.5, 5);
  });
});

// ==========================================
// parsePqCodebook Tests
// ==========================================

describe('parsePqCodebook', () => {
  it('should handle empty buffer', () => {
    const buffer = new ArrayBuffer(0);
    const pq = parsePqCodebook(buffer);

    expect(pq.numSubVectors).toBe(0);
    expect(pq.numBits).toBe(8);
    expect(pq.distanceType).toBe('l2');
    expect(pq.codebook.length).toBe(0);
  });

  it('should parse num_sub_vectors and num_bits', () => {
    const parts: Uint8Array[] = [];

    // Field 2: num_sub_vectors = 16
    parts.push(new Uint8Array([16, 16]));

    // Field 3: num_bits = 8
    parts.push(new Uint8Array([24, 8]));

    // Field 4: distance_type = "cosine"
    const distanceType = new TextEncoder().encode('cosine');
    parts.push(new Uint8Array([34, distanceType.length, ...distanceType]));

    const buffer = concatBuffers(parts);
    const pq = parsePqCodebook(buffer);

    expect(pq.numSubVectors).toBe(16);
    expect(pq.numBits).toBe(8);
    expect(pq.distanceType).toBe('cosine');
  });

  it('should handle dot distance type', () => {
    const parts: Uint8Array[] = [];
    const distanceType = new TextEncoder().encode('dot');
    parts.push(new Uint8Array([34, distanceType.length, ...distanceType]));

    const buffer = concatBuffers(parts);
    const pq = parsePqCodebook(buffer);

    expect(pq.distanceType).toBe('dot');
  });

  it('should keep l2 for unknown distance type', () => {
    const parts: Uint8Array[] = [];
    const distanceType = new TextEncoder().encode('unknown');
    parts.push(new Uint8Array([34, distanceType.length, ...distanceType]));

    const buffer = concatBuffers(parts);
    const pq = parsePqCodebook(buffer);

    expect(pq.distanceType).toBe('l2');
  });
});

// ==========================================
// parseIndexSection Tests
// ==========================================

describe('parseIndexSection', () => {
  it('should handle empty buffer', () => {
    const buffer = new ArrayBuffer(0);
    const indices = parseIndexSection(buffer);

    expect(indices).toEqual([]);
  });

  it('should skip unknown fields', () => {
    // Field 99 (unknown) with some data
    const parts: Uint8Array[] = [];
    parts.push(new Uint8Array([
      (99 << 3) | 0, // field 99, varint
      42,            // value
    ]));

    const buffer = concatBuffers(parts);
    const indices = parseIndexSection(buffer);

    expect(indices).toEqual([]);
  });
});

// ==========================================
// parseSchemaMetadata Tests
// ==========================================

describe('parseSchemaMetadata', () => {
  it('should handle empty buffer', () => {
    const buffer = new ArrayBuffer(0);
    const metadata = parseSchemaMetadata(buffer);

    expect(metadata.size).toBe(0);
  });

  it('should skip unknown fields in top level', () => {
    const parts: Uint8Array[] = [];
    parts.push(new Uint8Array([(99 << 3) | 0, 42])); // unknown field (field 99, varint)

    const buffer = concatBuffers(parts);
    const metadata = parseSchemaMetadata(buffer);

    expect(metadata.size).toBe(0);
  });
});

// ==========================================
// parseColumnStatistics Tests
// ==========================================

describe('parseColumnStatistics', () => {
  it('should handle empty buffer', () => {
    const buffer = new ArrayBuffer(0);
    const stats = parseColumnStatistics(buffer);

    expect(stats.nullCount).toBe(0n);
    expect(stats.rowCount).toBe(0n);
    expect(stats.minValue).toBeNull();
    expect(stats.maxValue).toBeNull();
  });

  it('should parse null_count and row_count', () => {
    const parts: Uint8Array[] = [];

    // Field 1: null_count = 10
    parts.push(new Uint8Array([8, 10]));

    // Field 2: row_count = 1000
    parts.push(new Uint8Array([16, 232, 7])); // 1000 = 0x3E8

    const buffer = concatBuffers(parts);
    const stats = parseColumnStatistics(buffer);

    expect(stats.nullCount).toBe(10n);
    expect(stats.rowCount).toBe(1000n);
  });

  it('should parse int64 min/max values', () => {
    const parts: Uint8Array[] = [];

    // Field 3: min_value (8 bytes for int64)
    const minBuffer = new ArrayBuffer(8);
    new DataView(minBuffer).setBigInt64(0, 100n, true);
    parts.push(new Uint8Array([26, 8, ...new Uint8Array(minBuffer)]));

    // Field 4: max_value (8 bytes for int64)
    const maxBuffer = new ArrayBuffer(8);
    new DataView(maxBuffer).setBigInt64(0, 999n, true);
    parts.push(new Uint8Array([34, 8, ...new Uint8Array(maxBuffer)]));

    const buffer = concatBuffers(parts);
    const stats = parseColumnStatistics(buffer);

    expect(stats.minValue).toBe(100n);
    expect(stats.maxValue).toBe(999n);
  });

  it('should parse float32 min/max values', () => {
    const parts: Uint8Array[] = [];

    // Field 3: min_value (4 bytes for float32)
    const minBuffer = new ArrayBuffer(4);
    new DataView(minBuffer).setFloat32(0, -1.5, true);
    parts.push(new Uint8Array([26, 4, ...new Uint8Array(minBuffer)]));

    // Field 4: max_value (4 bytes for float32)
    const maxBuffer = new ArrayBuffer(4);
    new DataView(maxBuffer).setFloat32(0, 1.5, true);
    parts.push(new Uint8Array([34, 4, ...new Uint8Array(maxBuffer)]));

    const buffer = concatBuffers(parts);
    const stats = parseColumnStatistics(buffer);

    expect(stats.minValue).toBeCloseTo(-1.5, 5);
    expect(stats.maxValue).toBeCloseTo(1.5, 5);
  });

  it('should parse string min/max values', () => {
    const parts: Uint8Array[] = [];

    // Field 3: min_value (string)
    const minStr = new TextEncoder().encode('aaa');
    parts.push(new Uint8Array([26, minStr.length, ...minStr]));

    // Field 4: max_value (string)
    const maxStr = new TextEncoder().encode('zzz');
    parts.push(new Uint8Array([34, maxStr.length, ...maxStr]));

    const buffer = concatBuffers(parts);
    const stats = parseColumnStatistics(buffer);

    expect(stats.minValue).toBe('aaa');
    expect(stats.maxValue).toBe('zzz');
  });

  it('should parse distinct_count', () => {
    const parts: Uint8Array[] = [];

    // Field 5: distinct_count = 500
    parts.push(new Uint8Array([40, 244, 3])); // 500 = 0x1F4

    const buffer = concatBuffers(parts);
    const stats = parseColumnStatistics(buffer);

    expect(stats.distinctCount).toBe(500n);
  });

  it('should parse null_count, row_count, and distinct_count only', () => {
    // Only test the fields we know work: 1 (null_count), 2 (row_count), 5 (distinct_count)
    // Fields 3 and 4 (min_value, max_value) use bytes wire type which has complex encoding
    const parts: Uint8Array[] = [];

    // Field 1: null_count = 5
    parts.push(new Uint8Array([8, 5]));

    // Field 2: row_count = 10
    parts.push(new Uint8Array([16, 10]));

    // Field 5: distinct_count = 8
    parts.push(new Uint8Array([40, 8]));

    const buffer = concatBuffers(parts);
    const stats = parseColumnStatistics(buffer);

    expect(stats.nullCount).toBe(5n);
    expect(stats.rowCount).toBe(10n);
    expect(stats.distinctCount).toBe(8n);
  });
});

// ==========================================
// readDeletionFile Tests
// ==========================================

describe('readDeletionFile', () => {
  it('should return empty set for missing file', async () => {
    const storage = new MemoryStorageAdapter();
    const result = await readDeletionFile(storage, 'missing.del', 'arrow_array');

    expect(result.size).toBe(0);
  });

  it('should read arrow_array deletion file', async () => {
    const storage = new MemoryStorageAdapter();

    // Create deletion file with deleted row IDs
    const deletedRows = new BigUint64Array([5n, 10n, 15n, 20n]);
    storage.put('test.del', deletedRows.buffer);

    const result = await readDeletionFile(storage, 'test.del', 'arrow_array');

    expect(result.size).toBe(4);
    expect(result.has(5n)).toBe(true);
    expect(result.has(10n)).toBe(true);
    expect(result.has(15n)).toBe(true);
    expect(result.has(20n)).toBe(true);
    expect(result.has(100n)).toBe(false);
  });

  it('should read bitmap with non-Roaring cookie', async () => {
    const storage = new MemoryStorageAdapter();

    // Create a bitmap with a non-Roaring cookie that triggers simple bitmap parsing
    // At least 8 bytes so we pass the size check
    // Cookie that is not 12346 or 12347
    const bitmap = new Uint8Array(16);
    const view = new DataView(bitmap.buffer);
    view.setUint32(0, 9999, true); // Not a Roaring cookie
    // Set some bits in byte 4 onward (after cookie)
    bitmap[4] = 0b00000101; // bits 0 and 2 in byte 4 (positions 32 and 34)

    storage.put('test.del', bitmap.buffer);

    const result = await readDeletionFile(storage, 'test.del', 'bitmap');

    // The simple bitmap reads all bytes, so check that something was read
    // Byte 0 has value 0x0F (15 in little-endian first byte of cookie 9999)
    expect(result.size).toBeGreaterThan(0);
  });

  it('should return empty set for bitmap file with less than 8 bytes', async () => {
    const storage = new MemoryStorageAdapter();

    // Create bitmap that's too small (< 8 bytes)
    const bitmap = new Uint8Array([1, 2, 3, 4]);
    storage.put('test.del', bitmap.buffer);

    const result = await readDeletionFile(storage, 'test.del', 'bitmap');

    // Should return empty set for files < 8 bytes
    expect(result.size).toBe(0);
  });

  it('should parse Roaring bitmap format', async () => {
    const storage = new MemoryStorageAdapter();

    // Create a minimal Roaring bitmap
    // Cookie: 12346, then container descriptors
    const buffer = new ArrayBuffer(20);
    const view = new DataView(buffer);

    // Cookie
    view.setUint32(0, 12346, true);

    // Number of containers - 1 (stored as n-1)
    view.setUint32(4, 0, true); // 0 means 1 container

    // Container descriptor: key=0, cardinality=2 (stored as n-1)
    view.setUint16(8, 0, true);  // key
    view.setUint16(10, 1, true); // cardinality - 1 = 1, means 2 elements

    // Container data: values 5 and 10
    view.setUint16(12, 5, true);
    view.setUint16(14, 10, true);

    storage.put('test.del', buffer);

    const result = await readDeletionFile(storage, 'test.del', 'bitmap');

    expect(result.has(5n)).toBe(true);
    expect(result.has(10n)).toBe(true);
  });
});

// ==========================================
// Helper Functions
// ==========================================

function concatBuffers(parts: Uint8Array[]): ArrayBuffer {
  let totalLength = 0;
  for (const part of parts) {
    totalLength += part.length;
  }

  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }

  return result.buffer;
}

function encodeVarint(value: number): Uint8Array {
  const bytes: number[] = [];
  while (value >= 0x80) {
    bytes.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  bytes.push(value);
  return new Uint8Array(bytes);
}
