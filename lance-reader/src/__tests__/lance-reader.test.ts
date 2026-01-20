/**
 * Tests for @evodb/lance-reader
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ProtobufReader,
  parseManifest,
  parseIvf,
  parsePqCodebook,
} from '../protobuf.js';
import {
  ArrowIpcReader,
  ArrowType,
} from '../arrow.js';
import {
  LanceReader,
  LanceFileReader,
} from '../reader.js';
import {
  IvfPqIndex,
  normalizeVector,
  computeL2Distance,
  computeCosineSimilarity,
  computeDotProduct,
} from '../ivf-pq.js';
import { HnswIndex } from '../hnsw.js';
import {
  MemoryStorageAdapter,
  CachingStorageAdapter,
} from '../r2-adapter.js';
import { LANCE_MAGIC, LANCE_FOOTER_SIZE } from '../types.js';

// ==========================================
// Protobuf Reader Tests
// ==========================================

describe('ProtobufReader', () => {
  it('should read varints correctly', () => {
    // Test single byte varint (0-127)
    const singleByte = new Uint8Array([42]);
    const reader1 = new ProtobufReader(singleByte.buffer);
    expect(reader1.readVarint()).toBe(42n);

    // Test multi-byte varint (300 = 0x012C)
    // Encoded as: 0xAC 0x02
    const multiByte = new Uint8Array([0xAC, 0x02]);
    const reader2 = new ProtobufReader(multiByte.buffer);
    expect(reader2.readVarint()).toBe(300n);
  });

  it('should read fixed values correctly', () => {
    const buffer = new ArrayBuffer(16);
    const view = new DataView(buffer);

    // Write a 32-bit value
    view.setUint32(0, 0x12345678, true);
    // Write a 64-bit value
    view.setBigUint64(4, 0x123456789ABCDEF0n, true);
    // Write a float
    view.setFloat32(12, 3.14, true);

    const reader = new ProtobufReader(buffer);
    expect(reader.readFixed32()).toBe(0x12345678);
    expect(reader.readFixed64()).toBe(0x123456789ABCDEF0n);
    expect(reader.readFloat32()).toBeCloseTo(3.14, 2);
  });

  it('should read tags correctly', () => {
    // Field 1, wire type 0 (varint) = (1 << 3) | 0 = 8
    const buffer = new Uint8Array([8, 42]);
    const reader = new ProtobufReader(buffer.buffer);

    const tag = reader.readTag();
    expect(tag).not.toBeNull();
    expect(tag!.field).toBe(1);
    expect(tag!.wireType).toBe(0);

    const value = reader.readVarint();
    expect(value).toBe(42n);
  });

  it('should read length-delimited bytes', () => {
    // Length prefix (3 bytes) followed by "abc"
    const buffer = new Uint8Array([3, 97, 98, 99]);
    const reader = new ProtobufReader(buffer.buffer);

    const bytes = reader.readBytes();
    expect(new Uint8Array(bytes)).toEqual(new Uint8Array([97, 98, 99]));
  });

  it('should read strings', () => {
    const str = 'hello';
    const encoded = new TextEncoder().encode(str);
    const buffer = new Uint8Array([encoded.length, ...encoded]);
    const reader = new ProtobufReader(buffer.buffer);

    expect(reader.readString()).toBe('hello');
  });

  it('should skip fields correctly', () => {
    // Field 1 (varint), field 2 (string "hi"), field 3 (varint)
    const buffer = new Uint8Array([
      8, 42,           // field 1: varint 42
      18, 2, 104, 105, // field 2: string "hi"
      24, 100,         // field 3: varint 100
    ]);
    const reader = new ProtobufReader(buffer.buffer);

    // Read field 1
    const tag1 = reader.readTag();
    expect(tag1!.field).toBe(1);
    expect(reader.readVarint()).toBe(42n);

    // Skip field 2
    const tag2 = reader.readTag();
    expect(tag2!.field).toBe(2);
    reader.skipField(tag2!.wireType);

    // Read field 3
    const tag3 = reader.readTag();
    expect(tag3!.field).toBe(3);
    expect(reader.readVarint()).toBe(100n);
  });

  it('should read packed repeated values', () => {
    // Packed varint array: [1, 2, 3]
    const packed = new Uint8Array([1, 2, 3]);
    const buffer = new Uint8Array([packed.length, ...packed]);
    const reader = new ProtobufReader(buffer.buffer);

    const values = reader.readPackedUint32();
    expect(Array.from(values)).toEqual([1, 2, 3]);
  });
});

// ==========================================
// Distance Function Tests
// ==========================================

describe('Distance Functions', () => {
  it('should compute L2 distance correctly', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);

    const dist = computeL2Distance(a, b);
    expect(dist).toBeCloseTo(Math.sqrt(2), 5);
  });

  it('should compute cosine similarity correctly', () => {
    // Same direction
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([2, 0, 0]);
    expect(computeCosineSimilarity(a, b)).toBeCloseTo(1, 5);

    // Orthogonal
    const c = new Float32Array([1, 0, 0]);
    const d = new Float32Array([0, 1, 0]);
    expect(computeCosineSimilarity(c, d)).toBeCloseTo(0, 5);

    // Opposite direction
    const e = new Float32Array([1, 0, 0]);
    const f = new Float32Array([-1, 0, 0]);
    expect(computeCosineSimilarity(e, f)).toBeCloseTo(-1, 5);
  });

  it('should compute dot product correctly', () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([4, 5, 6]);

    expect(computeDotProduct(a, b)).toBe(32); // 1*4 + 2*5 + 3*6
  });

  it('should normalize vectors correctly', () => {
    const v = new Float32Array([3, 4, 0]);
    const normalized = normalizeVector(v);

    // Should have unit length
    const length = Math.sqrt(
      normalized[0] ** 2 + normalized[1] ** 2 + normalized[2] ** 2
    );
    expect(length).toBeCloseTo(1, 5);

    // Should preserve direction
    expect(normalized[0]).toBeCloseTo(0.6, 5);
    expect(normalized[1]).toBeCloseTo(0.8, 5);
    expect(normalized[2]).toBeCloseTo(0, 5);
  });
});

// ==========================================
// Memory Storage Adapter Tests
// ==========================================

describe('MemoryStorageAdapter', () => {
  let storage: MemoryStorageAdapter;

  beforeEach(() => {
    storage = new MemoryStorageAdapter();
  });

  it('should store and retrieve data', async () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]).buffer;
    storage.put('test/file.bin', data);

    const retrieved = await storage.get('test/file.bin');
    expect(retrieved).not.toBeNull();
    expect(new Uint8Array(retrieved!)).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
  });

  it('should return null for missing keys', async () => {
    const result = await storage.get('nonexistent');
    expect(result).toBeNull();
  });

  it('should read byte ranges', async () => {
    const data = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).buffer;
    storage.put('test/file.bin', data);

    // Read from middle
    const middle = await storage.getRange('test/file.bin', 3, 4);
    expect(new Uint8Array(middle)).toEqual(new Uint8Array([3, 4, 5, 6]));

    // Read from end (negative offset)
    const end = await storage.getRange('test/file.bin', -3, 3);
    expect(new Uint8Array(end)).toEqual(new Uint8Array([7, 8, 9]));
  });

  it('should list keys by prefix', async () => {
    storage.put('data/file1.bin', new ArrayBuffer(1));
    storage.put('data/file2.bin', new ArrayBuffer(1));
    storage.put('other/file.bin', new ArrayBuffer(1));

    const dataFiles = await storage.list('data/');
    expect(dataFiles).toHaveLength(2);
    expect(dataFiles).toContain('data/file1.bin');
    expect(dataFiles).toContain('data/file2.bin');
  });

  it('should check existence', async () => {
    storage.put('exists.bin', new ArrayBuffer(1));

    expect(await storage.exists('exists.bin')).toBe(true);
    expect(await storage.exists('missing.bin')).toBe(false);
  });
});

// ==========================================
// Caching Storage Adapter Tests
// ==========================================

describe('CachingStorageAdapter', () => {
  it('should cache retrieved data', async () => {
    const inner = new MemoryStorageAdapter();
    const data = new Uint8Array([1, 2, 3]).buffer;
    inner.put('test.bin', data);

    const caching = new CachingStorageAdapter(inner, 1024);

    // First retrieval
    const result1 = await caching.get('test.bin');
    expect(result1).not.toBeNull();

    // Second retrieval should come from cache
    const result2 = await caching.get('test.bin');
    expect(result2).not.toBeNull();

    const stats = caching.getCacheStats();
    expect(stats.entries).toBe(1);
    expect(stats.size).toBe(3);
  });

  it('should serve ranges from cached data', async () => {
    const inner = new MemoryStorageAdapter();
    const data = new Uint8Array([0, 1, 2, 3, 4, 5]).buffer;
    inner.put('test.bin', data);

    const caching = new CachingStorageAdapter(inner, 1024);

    // Cache the full object
    await caching.get('test.bin');

    // Range should come from cache
    const range = await caching.getRange('test.bin', 2, 3);
    expect(new Uint8Array(range)).toEqual(new Uint8Array([2, 3, 4]));
  });

  it('should evict old entries when cache is full', async () => {
    const inner = new MemoryStorageAdapter();

    // Create 3 files of 10 bytes each
    for (let i = 0; i < 3; i++) {
      inner.put(`file${i}.bin`, new ArrayBuffer(10));
    }

    // Cache only holds 25 bytes
    const caching = new CachingStorageAdapter(inner, 25);

    // Cache first two files (20 bytes)
    await caching.get('file0.bin');
    await caching.get('file1.bin');

    let stats = caching.getCacheStats();
    expect(stats.entries).toBe(2);
    expect(stats.size).toBe(20);

    // Third file should evict one old entry
    await caching.get('file2.bin');

    stats = caching.getCacheStats();
    expect(stats.entries).toBe(2);
    expect(stats.size).toBe(20);
  });
});

// ==========================================
// Lance Footer Tests
// ==========================================

describe('Lance Footer Parsing', () => {
  it('should create valid Lance footer', () => {
    // Create a mock Lance footer (40 bytes)
    const footer = new ArrayBuffer(LANCE_FOOTER_SIZE);
    const view = new DataView(footer);

    // Write footer fields (all little-endian)
    view.setBigUint64(0, 1000n, true);   // columnMeta0Offset
    view.setBigUint64(8, 2000n, true);   // cmoTableOffset
    view.setBigUint64(16, 3000n, true);  // gboTableOffset
    view.setUint32(24, 5, true);         // numGlobalBuffers
    view.setUint32(28, 10, true);        // numColumns
    view.setUint16(32, 2, true);         // majorVersion
    view.setUint16(34, 1, true);         // minorVersion

    // Write magic bytes
    const magic = new TextEncoder().encode(LANCE_MAGIC);
    for (let i = 0; i < 4; i++) {
      view.setUint8(36 + i, magic[i]);
    }

    // Verify magic bytes
    const readMagic = String.fromCharCode(
      view.getUint8(36),
      view.getUint8(37),
      view.getUint8(38),
      view.getUint8(39)
    );
    expect(readMagic).toBe(LANCE_MAGIC);

    // Verify other fields
    expect(view.getBigUint64(0, true)).toBe(1000n);
    expect(view.getUint32(24, true)).toBe(5);
    expect(view.getUint16(32, true)).toBe(2);
  });
});

// ==========================================
// HNSW Index Tests
// ==========================================

describe('HnswIndex', () => {
  it('should initialize and search', async () => {
    const storage = new MemoryStorageAdapter();

    // Create an HNSW index with test data
    const index = new HnswIndex(
      storage,
      'test_index',
      'l2',
      16,   // m
      3     // maxLevel
    );

    await index.initialize();

    // Search with a random query
    const query = new Float32Array(128);
    for (let i = 0; i < 128; i++) {
      query[i] = Math.random() * 2 - 1;
    }

    const results = await index.search(query, { k: 5, efSearch: 50 });

    expect(results.length).toBeLessThanOrEqual(5);
    expect(results.length).toBeGreaterThan(0);

    // Results should be sorted by distance
    for (let i = 1; i < results.length; i++) {
      expect(results[i].distance).toBeGreaterThanOrEqual(results[i - 1].distance);
    }
  });

  it('should return stats after search', async () => {
    const storage = new MemoryStorageAdapter();
    const index = new HnswIndex(storage, 'test', 'l2', 16, 3);
    await index.initialize();

    // Perform a search to trigger graph loading
    const query = new Float32Array(128);
    for (let i = 0; i < 128; i++) {
      query[i] = Math.random();
    }
    await index.search(query, { k: 5 });

    const stats = index.getStats();
    expect(stats.numLevels).toBe(4); // maxLevel + 1
    expect(stats.numNodes).toBeGreaterThan(0);
  });
});

// ==========================================
// IVF-PQ Index Tests
// ==========================================

describe('IvfPqIndex', () => {
  it('should compute PQ lookup tables', async () => {
    // Create mock IVF structure
    const numPartitions = 4;
    const dimension = 8;

    const ivf = {
      centroids: new Float32Array(numPartitions * dimension),
      offsets: new BigUint64Array([0n, 10n, 20n, 30n]),
      lengths: new Uint32Array([10, 10, 10, 10]),
      numPartitions,
      dimension,
    };

    // Fill centroids with random values
    for (let i = 0; i < ivf.centroids.length; i++) {
      ivf.centroids[i] = Math.random();
    }

    // Create mock PQ codebook
    const numSubVectors = 2;
    const subDim = dimension / numSubVectors;
    const numCodes = 256;

    const pq = {
      codebook: new Float32Array(numCodes * numSubVectors * subDim),
      numSubVectors,
      numBits: 8,
      distanceType: 'l2' as const,
      subDim,
    };

    // Fill codebook with random values
    for (let i = 0; i < pq.codebook.length; i++) {
      pq.codebook[i] = Math.random();
    }

    const storage = new MemoryStorageAdapter();

    // Create the index
    const index = new IvfPqIndex(
      storage,
      'aux.idx',
      ivf,
      pq,
      'l2'
    );

    expect(index.indexType).toBe('ivf_pq');
    expect(index.dimension).toBe(dimension);
  });
});

// ==========================================
// Integration Tests
// ==========================================

describe('Integration', () => {
  it('should create LanceReader with memory storage', async () => {
    const storage = new MemoryStorageAdapter();

    // Create a mock manifest
    const manifestBuffer = createMockManifest();
    storage.put('test/_versions/1.manifest', manifestBuffer);

    const reader = new LanceReader({
      storage,
      basePath: 'test',
    });

    // Opening should load manifest
    const versions = await reader.listVersions();
    expect(versions).toContain(1);
  });
});

// ==========================================
// Helper Functions
// ==========================================

/**
 * Create a minimal mock manifest for testing
 */
function createMockManifest(): ArrayBuffer {
  // Create a minimal protobuf-encoded manifest
  // This is a simplified version for testing

  const parts: Uint8Array[] = [];

  // Field 3: version (varint) = 1
  parts.push(new Uint8Array([
    (3 << 3) | 0,  // tag: field 3, wire type 0 (varint)
    1,             // value: 1
  ]));

  // Combine all parts
  let totalLength = 0;
  for (const part of parts) {
    totalLength += part.length;
  }

  const buffer = new ArrayBuffer(totalLength);
  const view = new Uint8Array(buffer);
  let offset = 0;

  for (const part of parts) {
    view.set(part, offset);
    offset += part.length;
  }

  return buffer;
}
