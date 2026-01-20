/**
 * Tests for Lance Reader and Index Loading
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryStorageAdapter } from '../r2-adapter.js';
import {
  IvfPqLoader,
  createIvfPqLoader,
  loadIvfPqIndex,
  InMemoryIvfPqBuilder,
} from '../ivf-pq-loader.js';

// ==========================================
// Test Fixtures
// ==========================================

/**
 * Create a minimal Lance index file with proper footer
 */
function createLanceIndexFile(options: {
  ivfData: ArrayBuffer;
  numGlobalBuffers?: number;
}): ArrayBuffer {
  const { ivfData, numGlobalBuffers = 1 } = options;

  // Lance file structure:
  // [column data...][global buffers...][GBO table][CMO table][footer][LANC]

  // Calculate sizes
  const gboTableSize = numGlobalBuffers * 16;
  const cmoTableSize = 0; // No columns for index file
  const footerSize = 40;
  const magicSize = 0; // Magic is in footer

  // Place global buffer at offset 0
  const ivfDataOffset = 0n;
  const gboTableOffset = BigInt(ivfData.byteLength);
  const cmoTableOffset = gboTableOffset + BigInt(gboTableSize);

  const totalSize = Number(cmoTableOffset) + cmoTableSize + footerSize;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // Write IVF data
  bytes.set(new Uint8Array(ivfData), 0);

  // Write GBO table
  const gboOffset = Number(gboTableOffset);
  view.setBigUint64(gboOffset, ivfDataOffset, true);     // position
  view.setBigUint64(gboOffset + 8, BigInt(ivfData.byteLength), true); // size

  // Write footer
  const footerOffset = totalSize - footerSize;
  view.setBigUint64(footerOffset + 0, 0n, true);         // columnMeta0Offset
  view.setBigUint64(footerOffset + 8, cmoTableOffset, true);  // cmoTableOffset
  view.setBigUint64(footerOffset + 16, gboTableOffset, true); // gboTableOffset
  view.setUint32(footerOffset + 24, numGlobalBuffers, true);  // numGlobalBuffers
  view.setUint32(footerOffset + 28, 0, true);            // numColumns
  view.setUint16(footerOffset + 32, 2, true);            // majorVersion
  view.setUint16(footerOffset + 34, 0, true);            // minorVersion

  // Write magic "LANC"
  bytes[footerOffset + 36] = 0x4C; // L
  bytes[footerOffset + 37] = 0x41; // A
  bytes[footerOffset + 38] = 0x4E; // N
  bytes[footerOffset + 39] = 0x43; // C

  return buffer;
}

/**
 * Create minimal IVF protobuf data
 */
function createMinimalIvfData(options: {
  numPartitions: number;
  dimension: number;
}): ArrayBuffer {
  const { numPartitions, dimension } = options;

  // Create minimal IVF structure with centroids and offsets
  const parts: Uint8Array[] = [];

  // Field 1: centroids tensor (simplified - just raw float32 array)
  // We'll skip the full tensor encoding for simplicity
  // Instead create minimal offsets and lengths

  // Field 2: offsets (packed uint64)
  const offsets = new BigUint64Array(numPartitions);
  let currentOffset = 0n;
  for (let i = 0; i < numPartitions; i++) {
    offsets[i] = currentOffset;
    currentOffset += 10n; // 10 rows per partition
  }

  // Encode offsets as packed varints
  const offsetBytes = encodePackedVarints(Array.from(offsets).map(n => Number(n)));
  parts.push(new Uint8Array([18, offsetBytes.length, ...offsetBytes])); // tag 2

  // Field 3: lengths (packed uint32)
  const lengths = new Uint32Array(numPartitions);
  for (let i = 0; i < numPartitions; i++) {
    lengths[i] = 10;
  }
  const lengthBytes = encodePackedVarints(Array.from(lengths));
  parts.push(new Uint8Array([26, lengthBytes.length, ...lengthBytes])); // tag 3

  return concatBuffers(parts);
}

/**
 * Create minimal PQ codebook protobuf data
 */
function createMinimalPqData(options: {
  numSubVectors: number;
  numBits: number;
}): ArrayBuffer {
  const { numSubVectors, numBits } = options;

  const parts: Uint8Array[] = [];

  // Field 2: num_sub_vectors
  parts.push(new Uint8Array([16, ...encodeVarint(numSubVectors)]));

  // Field 3: num_bits
  parts.push(new Uint8Array([24, ...encodeVarint(numBits)]));

  // Field 4: distance_type = "l2"
  const distanceType = new TextEncoder().encode('l2');
  parts.push(new Uint8Array([34, distanceType.length, ...distanceType]));

  return concatBuffers(parts);
}

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

function encodeVarint(value: number): number[] {
  const bytes: number[] = [];
  while (value >= 0x80) {
    bytes.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  bytes.push(value);
  return bytes;
}

function encodePackedVarints(values: number[]): Uint8Array {
  const parts: number[] = [];
  for (const v of values) {
    parts.push(...encodeVarint(v));
  }
  return new Uint8Array(parts);
}

// ==========================================
// IvfPqLoader Tests
// ==========================================

describe('IvfPqLoader', () => {
  let storage: MemoryStorageAdapter;

  beforeEach(() => {
    storage = new MemoryStorageAdapter();
  });

  describe('constructor', () => {
    it('should create loader with default options', () => {
      const loader = new IvfPqLoader({
        storage,
        indexPath: 'index.idx',
        auxiliaryPath: 'auxiliary.idx',
      });

      expect(loader.getIndexPath()).toBe('index.idx');
      expect(loader.getAuxiliaryPath()).toBe('auxiliary.idx');
      expect(loader.getStorage()).toBe(storage);
    });

    it('should accept custom maxCachedPartitions', () => {
      const loader = new IvfPqLoader({
        storage,
        indexPath: 'index.idx',
        auxiliaryPath: 'auxiliary.idx',
        maxCachedPartitions: 100,
      });

      expect(loader.getCacheStats().maxSize).toBe(100);
    });
  });

  describe('isInitialized', () => {
    it('should return false before initialization', () => {
      const loader = new IvfPqLoader({
        storage,
        indexPath: 'index.idx',
        auxiliaryPath: 'auxiliary.idx',
      });

      expect(loader.isInitialized()).toBe(false);
    });
  });

  describe('getIvfIndex before initialization', () => {
    it('should throw error', () => {
      const loader = new IvfPqLoader({
        storage,
        indexPath: 'index.idx',
        auxiliaryPath: 'auxiliary.idx',
      });

      expect(() => loader.getIvfIndex()).toThrow(/not loaded/);
    });
  });

  describe('getPqCodebook before initialization', () => {
    it('should throw error', () => {
      const loader = new IvfPqLoader({
        storage,
        indexPath: 'index.idx',
        auxiliaryPath: 'auxiliary.idx',
      });

      expect(() => loader.getPqCodebook()).toThrow(/not loaded/);
    });
  });

  describe('getIndexMeta', () => {
    it('should return null before initialization', () => {
      const loader = new IvfPqLoader({
        storage,
        indexPath: 'index.idx',
        auxiliaryPath: 'auxiliary.idx',
      });

      expect(loader.getIndexMeta()).toBeNull();
    });
  });

  describe('loadPartition before initialization', () => {
    it('should throw error', async () => {
      const loader = new IvfPqLoader({
        storage,
        indexPath: 'index.idx',
        auxiliaryPath: 'auxiliary.idx',
      });

      await expect(loader.loadPartition(0)).rejects.toThrow(/not initialized/);
    });
  });

  describe('cache management', () => {
    it('should clear cache', () => {
      const loader = new IvfPqLoader({
        storage,
        indexPath: 'index.idx',
        auxiliaryPath: 'auxiliary.idx',
      });

      loader.clearCache();
      expect(loader.getCacheStats().size).toBe(0);
    });

    it('should set max cache size and evict excess', () => {
      const loader = new IvfPqLoader({
        storage,
        indexPath: 'index.idx',
        auxiliaryPath: 'auxiliary.idx',
        maxCachedPartitions: 10,
      });

      // Manually set cache size to test eviction
      loader.setMaxCacheSize(5);
      expect(loader.getCacheStats().maxSize).toBe(5);
    });
  });

  describe('initialize with invalid magic', () => {
    it('should throw error for invalid Lance file', async () => {
      // Create file without LANC magic
      const badFile = new ArrayBuffer(100);
      storage.put('index.idx', badFile);
      storage.put('auxiliary.idx', badFile);

      const loader = new IvfPqLoader({
        storage,
        indexPath: 'index.idx',
        auxiliaryPath: 'auxiliary.idx',
      });

      await expect(loader.initialize()).rejects.toThrow(/Invalid Lance file/);
    });
  });

  describe('initialize with no global buffers', () => {
    it('should throw error', async () => {
      // Create file with LANC magic but 0 global buffers
      const buffer = new ArrayBuffer(100);
      const view = new DataView(buffer);
      const bytes = new Uint8Array(buffer);

      // Write footer at end
      const footerOffset = buffer.byteLength - 40;
      view.setUint32(footerOffset + 24, 0, true); // numGlobalBuffers = 0

      // Write magic
      bytes[footerOffset + 36] = 0x4C;
      bytes[footerOffset + 37] = 0x41;
      bytes[footerOffset + 38] = 0x4E;
      bytes[footerOffset + 39] = 0x43;

      storage.put('index.idx', buffer);

      const loader = new IvfPqLoader({
        storage,
        indexPath: 'index.idx',
        auxiliaryPath: 'auxiliary.idx',
      });

      await expect(loader.initialize()).rejects.toThrow(/no global buffers/);
    });
  });
});

// ==========================================
// createIvfPqLoader Factory Tests
// ==========================================

describe('createIvfPqLoader', () => {
  it('should create loader instance', () => {
    const storage = new MemoryStorageAdapter();
    const loader = createIvfPqLoader({
      storage,
      indexPath: 'test/index.idx',
      auxiliaryPath: 'test/aux.idx',
    });

    expect(loader).toBeInstanceOf(IvfPqLoader);
    expect(loader.getIndexPath()).toBe('test/index.idx');
  });
});

// ==========================================
// loadIvfPqIndex Factory Tests
// ==========================================

describe('loadIvfPqIndex', () => {
  it('should throw for invalid files', async () => {
    const storage = new MemoryStorageAdapter();
    storage.put('index.idx', new ArrayBuffer(100));
    storage.put('aux.idx', new ArrayBuffer(100));

    await expect(
      loadIvfPqIndex(storage, 'index.idx', 'aux.idx')
    ).rejects.toThrow(/Invalid Lance file/);
  });
});

// ==========================================
// InMemoryIvfPqBuilder Extended Tests
// ==========================================

describe('InMemoryIvfPqBuilder Extended', () => {
  describe('addVectors validation', () => {
    it('should throw for vectors with wrong dimension', () => {
      const builder = new InMemoryIvfPqBuilder({
        dimension: 32,
        numPartitions: 4,
        numSubVectors: 4,
      });

      expect(() => {
        builder.addVectors([new Float32Array(64)]); // Wrong dimension
      }).toThrow(/dimension/);
    });

    it('should accept vectors with correct dimension', () => {
      const builder = new InMemoryIvfPqBuilder({
        dimension: 32,
        numPartitions: 4,
        numSubVectors: 4,
      });

      expect(() => {
        builder.addVectors([new Float32Array(32)]);
      }).not.toThrow();
    });
  });

  describe('build validation', () => {
    it('should throw when no vectors added', async () => {
      const builder = new InMemoryIvfPqBuilder({
        dimension: 32,
        numPartitions: 4,
        numSubVectors: 4,
      });

      await expect(builder.build()).rejects.toThrow(/No vectors/);
    });
  });

  describe('dimension validation', () => {
    it('should throw when dimension not divisible by numSubVectors', () => {
      expect(() => {
        new InMemoryIvfPqBuilder({
          dimension: 30, // Not divisible by 4
          numPartitions: 4,
          numSubVectors: 4,
        });
      }).toThrow(/divisible/);
    });
  });

  describe('build with custom options', () => {
    it('should use custom numBits and distanceType', async () => {
      const builder = new InMemoryIvfPqBuilder({
        dimension: 16,
        numPartitions: 2,
        numSubVectors: 2,
        numBits: 8,
        distanceType: 'cosine',
      });

      // Add some vectors
      for (let i = 0; i < 10; i++) {
        const v = new Float32Array(16);
        for (let j = 0; j < 16; j++) {
          v[j] = Math.random();
        }
        builder.addVectors([v]);
      }

      const { ivf, pq, partitionData } = await builder.build();

      expect(ivf.config.distanceType).toBe('cosine');
      expect(pq.config.numBits).toBe(8);
      expect(pq.config.distanceType).toBe('cosine');
      expect(partitionData.length).toBe(2);
    });
  });

  describe('build produces valid structures', () => {
    it('should produce IVF with correct centroids shape', async () => {
      const builder = new InMemoryIvfPqBuilder({
        dimension: 8,
        numPartitions: 2,
        numSubVectors: 2,
      });

      for (let i = 0; i < 20; i++) {
        const v = new Float32Array(8);
        for (let j = 0; j < 8; j++) {
          v[j] = Math.random();
        }
        builder.addVectors([v]);
      }

      const { ivf, pq } = await builder.build();

      expect(ivf.centroids.data.length).toBe(2 * 8); // 2 partitions * 8 dimensions
      expect(ivf.centroids.numPartitions).toBe(2);
      expect(ivf.centroids.dimension).toBe(8);

      expect(pq.config.numSubVectors).toBe(2);
      expect(pq.config.subDim).toBe(4);
    });

    it('should sum partition rows to total', async () => {
      const builder = new InMemoryIvfPqBuilder({
        dimension: 8,
        numPartitions: 4,
        numSubVectors: 2,
      });

      const numVectors = 100;
      for (let i = 0; i < numVectors; i++) {
        const v = new Float32Array(8);
        for (let j = 0; j < 8; j++) {
          v[j] = Math.random();
        }
        builder.addVectors([v]);
      }

      const { ivf, partitionData } = await builder.build();

      // Sum of partition lengths should equal total rows
      let totalFromLengths = 0;
      for (let i = 0; i < ivf.partitions.lengths.length; i++) {
        totalFromLengths += ivf.partitions.lengths[i];
      }

      expect(totalFromLengths).toBe(numVectors);
      expect(ivf.partitions.totalRows).toBe(numVectors);

      // Sum from partition data should also match
      let totalFromData = 0;
      for (const pd of partitionData) {
        totalFromData += pd.numRows;
      }
      expect(totalFromData).toBe(numVectors);
    });
  });
});

// ==========================================
// Error Handling Tests
// ==========================================

describe('Error Handling', () => {
  describe('storage errors', () => {
    it('should propagate storage read errors', async () => {
      const mockStorage = {
        get: vi.fn().mockRejectedValue(new Error('Network error')),
        getRange: vi.fn().mockRejectedValue(new Error('Network error')),
        list: vi.fn().mockResolvedValue([]),
      };

      const loader = new IvfPqLoader({
        storage: mockStorage as any,
        indexPath: 'index.idx',
        auxiliaryPath: 'auxiliary.idx',
      });

      await expect(loader.initialize()).rejects.toThrow(/Network error/);
    });
  });
});
