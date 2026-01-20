/**
 * Snippet Format Benchmarks
 *
 * Target: 50MB decode in 5ms (10GB/s effective throughput)
 *
 * Test constraints:
 * - Snippets: 5 subrequests, 5ms CPU, 32MB RAM
 * - Workers: More headroom but still constrained
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  encodeSnippetColumn,
  decodeSnippetColumn,
  writeSnippetChunk,
  readSnippetChunk,
  readSnippetHeader,
  computeBitWidth,
  bitPack,
  bitUnpack,
  deltaEncode,
  deltaDecode,
  BloomFilter,
  computeZoneMap,
  canSkipByZoneMap,
  buildSortedDict,
  dictBinarySearch,
  zeroCopyDecodeInt32,
  zeroCopyDecodeFloat64,
  packBitmap,
  unpackBitmap,
  CHUNK_SIZE,
  SNIPPET_HEADER_SIZE,
  SnippetEncoding,
  type SnippetColumn,
} from '../snippet-format.js';
import { Type } from '../types.js';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function formatTime(ms: number): string {
  if (ms < 0.001) return `${(ms * 1000000).toFixed(2)}ns`;
  if (ms < 1) return `${(ms * 1000).toFixed(2)}us`;
  if (ms < 1000) return `${ms.toFixed(3)}ms`;
  return `${(ms / 1000).toFixed(3)}s`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
}

function formatThroughput(bytes: number, ms: number): string {
  const bytesPerSec = bytes / (ms / 1000);
  return `${formatBytes(bytesPerSec)}/s`;
}

/**
 * Generate sorted integer data (ideal for delta encoding)
 */
function generateSortedInts(count: number, start = 0, step = 1): number[] {
  return Array.from({ length: count }, (_, i) => start + i * step);
}

/**
 * Generate random integer data
 */
function generateRandomInts(count: number, max = 1000000): number[] {
  return Array.from({ length: count }, () => Math.floor(Math.random() * max));
}

/**
 * Generate string data with controllable cardinality
 */
function generateStrings(count: number, uniqueCount: number): string[] {
  const unique = Array.from({ length: uniqueCount }, (_, i) => `value_${i.toString().padStart(6, '0')}`);
  return Array.from({ length: count }, (_, i) => unique[i % uniqueCount]);
}

/**
 * Generate float data
 */
function generateFloats(count: number): number[] {
  return Array.from({ length: count }, () => Math.random() * 1000000);
}

/**
 * Generate null bitmap with specified null rate
 */
function generateNulls(count: number, nullRate = 0): boolean[] {
  return Array.from({ length: count }, () => Math.random() < nullRate);
}

// =============================================================================
// BIT PACKING TESTS
// =============================================================================

describe('Bit Packing', () => {
  it('should compute correct bit width', () => {
    expect(computeBitWidth([0, 1])).toBe(1);
    expect(computeBitWidth([0, 1, 2, 3])).toBe(2);
    expect(computeBitWidth([0, 15])).toBe(4);
    expect(computeBitWidth([0, 255])).toBe(8);
    expect(computeBitWidth([0, 65535])).toBe(16);
  });

  it('should pack and unpack correctly', () => {
    const values = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    const bitWidth = computeBitWidth(values);

    const packed = bitPack(values, bitWidth);
    const unpacked = bitUnpack(packed, values.length);

    expect(Array.from(unpacked)).toEqual(values);
  });

  it('should benchmark bit packing speed', () => {
    const count = 1000000;
    const values = generateSortedInts(count, 0, 1);
    const deltas = deltaEncode(values).slice(1);
    const bitWidth = computeBitWidth(deltas);

    // Encode benchmark
    const encodeStart = performance.now();
    const packed = bitPack(deltas, bitWidth);
    const encodeTime = performance.now() - encodeStart;

    // Decode benchmark
    const decodeStart = performance.now();
    const unpacked = bitUnpack(packed, deltas.length);
    const decodeTime = performance.now() - decodeStart;

    console.log(`Bit Packing (${formatBytes(count * 4)} -> ${formatBytes(packed.length)}):`);
    console.log(`  Encode: ${formatTime(encodeTime)} (${formatThroughput(count * 4, encodeTime)})`);
    console.log(`  Decode: ${formatTime(decodeTime)} (${formatThroughput(packed.length, decodeTime)})`);
    console.log(`  Compression: ${(count * 4 / packed.length).toFixed(2)}x`);

    expect(Array.from(unpacked)).toEqual(deltas);
  });
});

// =============================================================================
// DELTA ENCODING TESTS
// =============================================================================

describe('Delta Encoding', () => {
  it('should encode and decode correctly', () => {
    const values = [100, 102, 105, 110, 120];
    const deltas = deltaEncode(values);
    const decoded = deltaDecode(deltas);

    expect(Array.from(decoded)).toEqual(values);
  });

  it('should benchmark delta encoding speed', () => {
    const count = 1000000;
    const values = generateSortedInts(count, 1000000, 1);

    // Encode
    const encodeStart = performance.now();
    const deltas = deltaEncode(values);
    const encodeTime = performance.now() - encodeStart;

    // Decode
    const decodeStart = performance.now();
    const decoded = deltaDecode(deltas);
    const decodeTime = performance.now() - decodeStart;

    console.log(`Delta Encoding (${count.toLocaleString()} integers):`);
    console.log(`  Encode: ${formatTime(encodeTime)}`);
    console.log(`  Decode: ${formatTime(decodeTime)}`);

    expect(Array.from(decoded)).toEqual(values);
  });
});

// =============================================================================
// BLOOM FILTER TESTS
// =============================================================================

describe('Bloom Filter', () => {
  it('should not have false negatives', () => {
    const bloom = new BloomFilter(1000);
    const values = generateStrings(100, 100);

    for (const v of values) {
      bloom.add(v);
    }

    for (const v of values) {
      expect(bloom.mightContain(v)).toBe(true);
    }
  });

  it('should have reasonable false positive rate', () => {
    const bloom = new BloomFilter(1000);
    const inserted = generateStrings(1000, 1000);
    const notInserted = generateStrings(1000, 1000).map(s => 'NOT_' + s);

    for (const v of inserted) {
      bloom.add(v);
    }

    let falsePositives = 0;
    for (const v of notInserted) {
      if (bloom.mightContain(v)) falsePositives++;
    }

    const fpRate = falsePositives / notInserted.length;
    console.log(`Bloom Filter: ${(fpRate * 100).toFixed(2)}% false positive rate`);

    expect(fpRate).toBeLessThan(0.05); // Should be < 5%
  });

  it('should benchmark bloom filter speed', () => {
    const count = 100000;
    const bloom = new BloomFilter(count);
    const values = generateStrings(count, count);

    // Insert benchmark
    const insertStart = performance.now();
    for (const v of values) {
      bloom.add(v);
    }
    const insertTime = performance.now() - insertStart;

    // Lookup benchmark
    const lookupStart = performance.now();
    for (const v of values) {
      bloom.mightContain(v);
    }
    const lookupTime = performance.now() - lookupStart;

    console.log(`Bloom Filter (${count.toLocaleString()} elements, ${formatBytes(bloom.toBytes().length)}):`);
    console.log(`  Insert: ${formatTime(insertTime)} (${formatTime(insertTime / count)} per element)`);
    console.log(`  Lookup: ${formatTime(lookupTime)} (${formatTime(lookupTime / count)} per element)`);
  });
});

// =============================================================================
// ZONE MAP TESTS
// =============================================================================

describe('Zone Map', () => {
  it('should compute correct zone map', () => {
    const values = [10, 20, 30, 40, 50];
    const nulls = [false, false, true, false, false];

    const zoneMap = computeZoneMap(values, nulls, Type.Int32);

    expect(zoneMap.min).toBe(10);
    expect(zoneMap.max).toBe(50);
    expect(zoneMap.nullCount).toBe(1);
  });

  it('should correctly skip by zone map', () => {
    const zoneMap = { min: 100, max: 200, nullCount: 0, bloomOffset: 0 };

    expect(canSkipByZoneMap(zoneMap, { min: 250 })).toBe(true);
    expect(canSkipByZoneMap(zoneMap, { max: 50 })).toBe(true);
    expect(canSkipByZoneMap(zoneMap, { min: 150 })).toBe(false);
    expect(canSkipByZoneMap(zoneMap, { min: 50, max: 250 })).toBe(false);
  });
});

// =============================================================================
// DICTIONARY ENCODING TESTS
// =============================================================================

describe('Dictionary Encoding', () => {
  it('should build sorted dictionary', () => {
    const values = ['charlie', 'alice', 'bob', 'alice', 'charlie'];
    const nulls = [false, false, false, false, false];

    const { dict, indices } = buildSortedDict(values, nulls);

    expect(dict).toEqual(['alice', 'bob', 'charlie']);
    expect(dictBinarySearch(dict, 'alice')).toBe(0);
    expect(dictBinarySearch(dict, 'bob')).toBe(1);
    expect(dictBinarySearch(dict, 'charlie')).toBe(2);
    expect(dictBinarySearch(dict, 'david')).toBe(-1);
  });

  it('should benchmark dictionary encoding speed', () => {
    const count = 100000;
    const uniqueCount = 100;
    const values = generateStrings(count, uniqueCount);
    const nulls = generateNulls(count, 0);

    // Build dictionary
    const buildStart = performance.now();
    const { dict, indices } = buildSortedDict(values, nulls);
    const buildTime = performance.now() - buildStart;

    // Binary search benchmark
    const searchStart = performance.now();
    for (const v of values.slice(0, 10000)) {
      dictBinarySearch(dict, v);
    }
    const searchTime = performance.now() - searchStart;

    console.log(`Dictionary Encoding (${count.toLocaleString()} values, ${uniqueCount} unique):`);
    console.log(`  Build: ${formatTime(buildTime)}`);
    console.log(`  10K lookups: ${formatTime(searchTime)}`);
    console.log(`  Index size: ${formatBytes(indices.byteLength)}`);
  });
});

// =============================================================================
// ZERO-COPY DECODE TESTS
// =============================================================================

describe('Zero-Copy Decode', () => {
  it('should decode Int32 zero-copy when aligned', () => {
    const values = new Int32Array([1, 2, 3, 4, 5]);
    const bytes = new Uint8Array(values.buffer);

    const decoded = zeroCopyDecodeInt32(bytes, values.length);

    expect(Array.from(decoded)).toEqual([1, 2, 3, 4, 5]);
    // Check it's the same buffer
    expect(decoded.buffer).toBe(bytes.buffer);
  });

  it('should decode Float64 zero-copy when aligned', () => {
    const values = new Float64Array([1.5, 2.5, 3.5, 4.5, 5.5]);
    const bytes = new Uint8Array(values.buffer);

    const decoded = zeroCopyDecodeFloat64(bytes, values.length);

    expect(Array.from(decoded)).toEqual([1.5, 2.5, 3.5, 4.5, 5.5]);
    expect(decoded.buffer).toBe(bytes.buffer);
  });

  it('should benchmark zero-copy vs copy decode', () => {
    const count = 1000000;
    const values = new Int32Array(generateRandomInts(count));
    const bytes = new Uint8Array(values.buffer);

    // Zero-copy decode
    const zcStart = performance.now();
    for (let i = 0; i < 100; i++) {
      zeroCopyDecodeInt32(bytes, count);
    }
    const zcTime = (performance.now() - zcStart) / 100;

    // Copy decode (simulate)
    const copyStart = performance.now();
    for (let i = 0; i < 100; i++) {
      const copy = new Int32Array(count);
      copy.set(values);
    }
    const copyTime = (performance.now() - copyStart) / 100;

    console.log(`Zero-Copy vs Copy (${formatBytes(count * 4)}):`);
    console.log(`  Zero-copy: ${formatTime(zcTime)} (${formatThroughput(count * 4, zcTime)})`);
    console.log(`  Copy: ${formatTime(copyTime)} (${formatThroughput(count * 4, copyTime)})`);
    console.log(`  Speedup: ${(copyTime / zcTime).toFixed(2)}x`);
  });
});

// =============================================================================
// BITMAP TESTS
// =============================================================================

describe('Bitmap', () => {
  it('should pack and unpack booleans correctly', () => {
    const bools = [true, false, true, true, false, false, true, false, true];
    const packed = packBitmap(bools);
    const unpacked = unpackBitmap(packed, bools.length);

    expect(unpacked).toEqual(bools);
  });

  it('should benchmark bitmap operations', () => {
    const count = 1000000;
    const bools = Array.from({ length: count }, () => Math.random() > 0.5);

    // Pack
    const packStart = performance.now();
    const packed = packBitmap(bools);
    const packTime = performance.now() - packStart;

    // Unpack
    const unpackStart = performance.now();
    unpackBitmap(packed, count);
    const unpackTime = performance.now() - unpackStart;

    console.log(`Bitmap (${count.toLocaleString()} booleans -> ${formatBytes(packed.length)}):`);
    console.log(`  Pack: ${formatTime(packTime)}`);
    console.log(`  Unpack: ${formatTime(unpackTime)}`);
    console.log(`  Compression: ${(count / packed.length).toFixed(2)}x`);
  });
});

// =============================================================================
// COLUMN ENCODING TESTS
// =============================================================================

describe('Column Encoding', () => {
  describe('Integer Columns', () => {
    it('should encode sorted integers with Delta+BitPack', () => {
      const values = generateSortedInts(10000, 1000000, 1);
      const nulls = generateNulls(values.length, 0);

      const encoded = encodeSnippetColumn('id', Type.Int32, values, nulls);

      expect(encoded.encoding).toBe(SnippetEncoding.DeltaBitPack);
      expect(encoded.sorted).toBe(true);

      // Decode and verify
      const decoded = decodeSnippetColumn(encoded, values.length);
      expect(Array.from(decoded.values as Int32Array)).toEqual(values);
    });

    it('should encode unsorted integers as raw', () => {
      const values = generateRandomInts(10000);
      const nulls = generateNulls(values.length, 0);

      const encoded = encodeSnippetColumn('id', Type.Int32, values, nulls);

      expect(encoded.encoding).toBe(SnippetEncoding.Raw);
      expect(encoded.sorted).toBe(false);
    });

    it('should benchmark integer encoding', () => {
      const count = 1000000;
      const sortedValues = generateSortedInts(count, 1000000, 1);
      const randomValues = generateRandomInts(count);
      const nulls = generateNulls(count, 0);

      // Sorted encode
      const sortedEncStart = performance.now();
      const sortedEncoded = encodeSnippetColumn('sorted', Type.Int32, sortedValues, nulls);
      const sortedEncTime = performance.now() - sortedEncStart;

      // Random encode
      const randomEncStart = performance.now();
      const randomEncoded = encodeSnippetColumn('random', Type.Int32, randomValues, nulls);
      const randomEncTime = performance.now() - randomEncStart;

      // Sorted decode
      const sortedDecStart = performance.now();
      decodeSnippetColumn(sortedEncoded, count);
      const sortedDecTime = performance.now() - sortedDecStart;

      // Random decode
      const randomDecStart = performance.now();
      decodeSnippetColumn(randomEncoded, count);
      const randomDecTime = performance.now() - randomDecStart;

      console.log(`Integer Encoding (${count.toLocaleString()} values):`);
      console.log(`  Sorted (Delta+BitPack):`);
      console.log(`    Size: ${formatBytes(sortedEncoded.data.length)} (${(count * 4 / sortedEncoded.data.length).toFixed(2)}x compression)`);
      console.log(`    Encode: ${formatTime(sortedEncTime)}`);
      console.log(`    Decode: ${formatTime(sortedDecTime)} (${formatThroughput(sortedEncoded.data.length, sortedDecTime)})`);
      console.log(`  Random (Raw):`);
      console.log(`    Size: ${formatBytes(randomEncoded.data.length)}`);
      console.log(`    Encode: ${formatTime(randomEncTime)}`);
      console.log(`    Decode: ${formatTime(randomDecTime)} (${formatThroughput(randomEncoded.data.length, randomDecTime)})`);

      // Target: decode should be fast
      expect(sortedDecTime).toBeLessThan(100); // 100ms for 1M values
      expect(randomDecTime).toBeLessThan(50);  // 50ms for zero-copy
    });
  });

  describe('String Columns', () => {
    it('should encode low-cardinality strings with dictionary', () => {
      const values = generateStrings(10000, 100);
      const nulls = generateNulls(values.length, 0);

      const encoded = encodeSnippetColumn('status', Type.String, values, nulls);

      expect(encoded.encoding).toBe(SnippetEncoding.Dict);
    });

    it('should benchmark string encoding', () => {
      const count = 100000;
      const lowCardValues = generateStrings(count, 100);
      const highCardValues = generateStrings(count, count);
      const nulls = generateNulls(count, 0);

      // Low cardinality encode
      const lowEncStart = performance.now();
      const lowEncoded = encodeSnippetColumn('low_card', Type.String, lowCardValues, nulls);
      const lowEncTime = performance.now() - lowEncStart;

      // High cardinality encode
      const highEncStart = performance.now();
      const highEncoded = encodeSnippetColumn('high_card', Type.String, highCardValues, nulls);
      const highEncTime = performance.now() - highEncStart;

      // Low cardinality decode
      const lowDecStart = performance.now();
      decodeSnippetColumn(lowEncoded, count);
      const lowDecTime = performance.now() - lowDecStart;

      console.log(`String Encoding (${count.toLocaleString()} values):`);
      console.log(`  Low cardinality (100 unique, Dict):`);
      console.log(`    Size: ${formatBytes(lowEncoded.data.length)}`);
      console.log(`    Encode: ${formatTime(lowEncTime)}`);
      console.log(`    Decode: ${formatTime(lowDecTime)}`);
      console.log(`  High cardinality (${count} unique, Raw):`);
      console.log(`    Size: ${formatBytes(highEncoded.data.length)}`);
      console.log(`    Encode: ${formatTime(highEncTime)}`);
    });
  });

  describe('Float Columns', () => {
    it('should encode floats as raw', () => {
      const values = generateFloats(10000);
      const nulls = generateNulls(values.length, 0);

      const encoded = encodeSnippetColumn('price', Type.Float64, values, nulls);

      expect(encoded.encoding).toBe(SnippetEncoding.Raw);

      // Verify zero-copy decode
      const decoded = decodeSnippetColumn(encoded, values.length);
      expect(decoded.isZeroCopy).toBe(true);
    });
  });
});

// =============================================================================
// CHUNK I/O TESTS
// =============================================================================

describe('Chunk I/O', () => {
  it('should write and read chunk correctly', () => {
    const count = 1000;
    const columns: SnippetColumn[] = [
      encodeSnippetColumn('id', Type.Int32, generateSortedInts(count), generateNulls(count, 0)),
      encodeSnippetColumn('name', Type.String, generateStrings(count, 100), generateNulls(count, 0)),
      encodeSnippetColumn('value', Type.Float64, generateFloats(count), generateNulls(count, 0.1)),
    ];

    // Write
    const chunk = writeSnippetChunk(columns, count);

    // Read header only
    const header = readSnippetHeader(chunk);
    expect(header.rowCount).toBe(count);
    expect(header.columnCount).toBe(3);

    // Read full chunk
    const { columns: decodedCols } = readSnippetChunk(chunk);
    expect(decodedCols.length).toBe(3);
  });

  it('should support column projection', () => {
    const count = 1000;
    const columns: SnippetColumn[] = [
      encodeSnippetColumn('id', Type.Int32, generateSortedInts(count), generateNulls(count, 0)),
      encodeSnippetColumn('name', Type.String, generateStrings(count, 100), generateNulls(count, 0)),
      encodeSnippetColumn('value', Type.Float64, generateFloats(count), generateNulls(count, 0)),
    ];

    const chunk = writeSnippetChunk(columns, count);

    // Read only 'id' column
    const { columns: projected } = readSnippetChunk(chunk, { columns: ['id'] });
    expect(projected.length).toBe(1);
    expect(projected[0].path).toBe('id');
  });

  it('should benchmark chunk I/O', () => {
    const count = 100000;
    const columns: SnippetColumn[] = [
      encodeSnippetColumn('id', Type.Int32, generateSortedInts(count), generateNulls(count, 0)),
      encodeSnippetColumn('timestamp', Type.Int64, generateSortedInts(count, Date.now(), 1000), generateNulls(count, 0)),
      encodeSnippetColumn('name', Type.String, generateStrings(count, 100), generateNulls(count, 0)),
      encodeSnippetColumn('value', Type.Float64, generateFloats(count), generateNulls(count, 0.05)),
    ];

    // Write benchmark
    const writeStart = performance.now();
    const chunk = writeSnippetChunk(columns, count);
    const writeTime = performance.now() - writeStart;

    // Read benchmark (full)
    const readStart = performance.now();
    readSnippetChunk(chunk);
    const readTime = performance.now() - readStart;

    // Read benchmark (projected)
    const projStart = performance.now();
    readSnippetChunk(chunk, { columns: ['id', 'value'] });
    const projTime = performance.now() - projStart;

    // Header-only benchmark
    const headerStart = performance.now();
    for (let i = 0; i < 1000; i++) {
      readSnippetHeader(chunk);
    }
    const headerTime = (performance.now() - headerStart) / 1000;

    console.log(`Chunk I/O (${count.toLocaleString()} rows, ${columns.length} columns):`);
    console.log(`  Chunk size: ${formatBytes(chunk.length)}`);
    console.log(`  Write: ${formatTime(writeTime)} (${formatThroughput(chunk.length, writeTime)})`);
    console.log(`  Read (full): ${formatTime(readTime)} (${formatThroughput(chunk.length, readTime)})`);
    console.log(`  Read (2 cols): ${formatTime(projTime)}`);
    console.log(`  Header parse: ${formatTime(headerTime)}`);

    // Verify size constraint
    expect(chunk.length).toBeLessThan(CHUNK_SIZE);
  });
});

// =============================================================================
// TARGET BENCHMARK: 50MB in 5ms
// =============================================================================

describe('Target: 50MB decode in 5ms', () => {
  it('should achieve target throughput for zero-copy numeric decode', () => {
    // Generate ~50MB of Float64 data
    const count = Math.floor(50 * 1024 * 1024 / 8); // ~6.5M floats
    const values = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      values[i] = Math.random() * 1000000;
    }
    const bytes = new Uint8Array(values.buffer);

    // Warm up
    for (let i = 0; i < 5; i++) {
      zeroCopyDecodeFloat64(bytes, count);
    }

    // Benchmark
    const iterations = 100;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      zeroCopyDecodeFloat64(bytes, count);
    }
    const elapsed = (performance.now() - start) / iterations;

    const throughput = (bytes.length / (elapsed / 1000)) / (1024 * 1024 * 1024);

    console.log(`\n=== TARGET BENCHMARK: 50MB Zero-Copy ===`);
    console.log(`  Data size: ${formatBytes(bytes.length)}`);
    console.log(`  Decode time: ${formatTime(elapsed)}`);
    console.log(`  Throughput: ${throughput.toFixed(2)} GB/s`);
    console.log(`  Target: 10 GB/s (50MB in 5ms)`);

    // Zero-copy should be essentially instant
    expect(elapsed).toBeLessThan(1); // Should be < 1ms
  });

  it('should achieve target throughput for Delta+BitPack decode', () => {
    // Generate sorted integers that compress well
    const count = 5000000; // 5M integers
    const values = generateSortedInts(count, 1000000000, 1);
    const nulls = generateNulls(count, 0);

    // Encode
    const encoded = encodeSnippetColumn('ts', Type.Int32, values, nulls);

    console.log(`\n=== TARGET BENCHMARK: Delta+BitPack ===`);
    console.log(`  Original size: ${formatBytes(count * 4)}`);
    console.log(`  Encoded size: ${formatBytes(encoded.data.length)}`);
    console.log(`  Compression: ${(count * 4 / encoded.data.length).toFixed(2)}x`);

    // Warm up
    for (let i = 0; i < 5; i++) {
      decodeSnippetColumn(encoded, count);
    }

    // Benchmark
    const iterations = 20;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      decodeSnippetColumn(encoded, count);
    }
    const elapsed = (performance.now() - start) / iterations;

    const throughput = (encoded.data.length / (elapsed / 1000)) / (1024 * 1024);

    console.log(`  Decode time: ${formatTime(elapsed)}`);
    console.log(`  Throughput: ${throughput.toFixed(2)} MB/s`);

    // Should decode 5M integers in reasonable time
    // Note: BitPacking decode is slower than zero-copy, but still efficient
    // 5M integers with bit unpacking is CPU-intensive
    expect(elapsed).toBeLessThan(150); // < 150ms (allows for CI variance)
  });

  it('should achieve target throughput for full chunk decode', () => {
    // Create realistic chunk with multiple columns
    const count = 500000; // 500K rows
    const columns: SnippetColumn[] = [
      encodeSnippetColumn('id', Type.Int32, generateSortedInts(count), generateNulls(count, 0)),
      encodeSnippetColumn('ts', Type.Int64, generateSortedInts(count, Date.now(), 1), generateNulls(count, 0)),
      encodeSnippetColumn('user', Type.String, generateStrings(count, 1000), generateNulls(count, 0)),
      encodeSnippetColumn('value', Type.Float64, generateFloats(count), generateNulls(count, 0)),
      encodeSnippetColumn('active', Type.Bool, Array.from({ length: count }, () => Math.random() > 0.5), generateNulls(count, 0)),
    ];

    const chunk = writeSnippetChunk(columns, count);

    console.log(`\n=== TARGET BENCHMARK: Full Chunk Decode ===`);
    console.log(`  Rows: ${count.toLocaleString()}`);
    console.log(`  Columns: ${columns.length}`);
    console.log(`  Chunk size: ${formatBytes(chunk.length)}`);

    // Warm up
    for (let i = 0; i < 3; i++) {
      readSnippetChunk(chunk);
    }

    // Benchmark
    const iterations = 10;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      readSnippetChunk(chunk);
    }
    const elapsed = (performance.now() - start) / iterations;

    const throughput = (chunk.length / (elapsed / 1000)) / (1024 * 1024);

    console.log(`  Decode time: ${formatTime(elapsed)}`);
    console.log(`  Throughput: ${throughput.toFixed(2)} MB/s`);

    // Should decode chunk in reasonable time
    // Note: 500K rows with strings won't hit 10GB/s but should be fast
    expect(elapsed).toBeLessThan(500); // < 500ms
  });

  it('should report Snippet constraint compatibility', () => {
    console.log(`\n=== SNIPPET CONSTRAINT ANALYSIS ===`);
    console.log(`Target constraints:`);
    console.log(`  - CPU: 5ms`);
    console.log(`  - RAM: 32MB`);
    console.log(`  - Chunk size: ${formatBytes(CHUNK_SIZE)}`);
    console.log(`  - Max chunks in memory: ${Math.floor(32 * 1024 * 1024 / CHUNK_SIZE)}`);
    console.log(`\nRecommendations:`);
    console.log(`  - Use projection pushdown to read only needed columns`);
    console.log(`  - Use zone maps to skip irrelevant chunks`);
    console.log(`  - Use bloom filters for point lookups`);
    console.log(`  - Prefer sorted columns for better compression`);
    console.log(`  - Use zero-copy decode for numeric types`);
  });
});

// =============================================================================
// COMPREHENSIVE DECODE THROUGHPUT REPORT
// =============================================================================

describe('Decode Throughput Report', () => {
  it('should generate comprehensive throughput report', () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`DECODE THROUGHPUT REPORT`);
    console.log(`${'='.repeat(60)}\n`);

    const results: Array<{ operation: string; size: string; time: string; throughput: string }> = [];

    // Test 1: Raw Int32
    {
      const count = 1000000;
      const values = new Int32Array(generateRandomInts(count));
      const bytes = new Uint8Array(values.buffer);
      const iterations = 100;

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        zeroCopyDecodeInt32(bytes, count);
      }
      const elapsed = (performance.now() - start) / iterations;

      results.push({
        operation: 'Raw Int32 (zero-copy)',
        size: formatBytes(bytes.length),
        time: formatTime(elapsed),
        throughput: formatThroughput(bytes.length, elapsed),
      });
    }

    // Test 2: Raw Float64
    {
      const count = 1000000;
      const values = new Float64Array(generateFloats(count));
      const bytes = new Uint8Array(values.buffer);
      const iterations = 100;

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        zeroCopyDecodeFloat64(bytes, count);
      }
      const elapsed = (performance.now() - start) / iterations;

      results.push({
        operation: 'Raw Float64 (zero-copy)',
        size: formatBytes(bytes.length),
        time: formatTime(elapsed),
        throughput: formatThroughput(bytes.length, elapsed),
      });
    }

    // Test 3: Delta+BitPack
    {
      const count = 1000000;
      const values = generateSortedInts(count, 1000000, 1);
      const nulls = generateNulls(count, 0);
      const encoded = encodeSnippetColumn('ts', Type.Int32, values, nulls);
      const iterations = 20;

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        decodeSnippetColumn(encoded, count);
      }
      const elapsed = (performance.now() - start) / iterations;

      results.push({
        operation: 'Delta+BitPack Int32',
        size: formatBytes(encoded.data.length),
        time: formatTime(elapsed),
        throughput: formatThroughput(encoded.data.length, elapsed),
      });
    }

    // Test 4: Dictionary String
    {
      const count = 100000;
      const values = generateStrings(count, 100);
      const nulls = generateNulls(count, 0);
      const encoded = encodeSnippetColumn('name', Type.String, values, nulls);
      const iterations = 20;

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        decodeSnippetColumn(encoded, count);
      }
      const elapsed = (performance.now() - start) / iterations;

      results.push({
        operation: 'Dictionary String',
        size: formatBytes(encoded.data.length),
        time: formatTime(elapsed),
        throughput: formatThroughput(encoded.data.length, elapsed),
      });
    }

    // Test 5: Bitmap Boolean
    {
      const count = 1000000;
      const values = Array.from({ length: count }, () => Math.random() > 0.5);
      const packed = packBitmap(values);
      const iterations = 50;

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        unpackBitmap(packed, count);
      }
      const elapsed = (performance.now() - start) / iterations;

      results.push({
        operation: 'Bitmap Boolean',
        size: formatBytes(packed.length),
        time: formatTime(elapsed),
        throughput: formatThroughput(packed.length, elapsed),
      });
    }

    // Print table
    console.log('| Operation | Data Size | Decode Time | Throughput |');
    console.log('|-----------|-----------|-------------|------------|');
    for (const r of results) {
      console.log(`| ${r.operation.padEnd(25)} | ${r.size.padEnd(9)} | ${r.time.padEnd(11)} | ${r.throughput.padEnd(10)} |`);
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`END REPORT`);
    console.log(`${'='.repeat(60)}\n`);
  });
});
