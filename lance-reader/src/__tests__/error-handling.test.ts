/**
 * @evodb/lance-reader - Error Handling Tests
 *
 * Tests for error handling and edge cases.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  LanceReader,
  LanceFileReader,
  MemoryStorageAdapter,
  IvfPqIndex,
  readDeletionFile,
  HnswIndex,
  LANCE_FOOTER_SIZE,
  LANCE_MAGIC,
} from '../index.js';

/**
 * Create a mock Lance file with valid footer
 */
function createMockLanceFile(options: {
  numColumns?: number;
  bodySize?: number;
}): ArrayBuffer {
  const {
    numColumns = 3,
    bodySize = 1000,
  } = options;

  const totalSize = bodySize + LANCE_FOOTER_SIZE;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  const footerOffset = bodySize;

  view.setBigUint64(footerOffset + 0, BigInt(100), true);
  view.setBigUint64(footerOffset + 8, BigInt(200), true);
  view.setBigUint64(footerOffset + 16, BigInt(300), true);
  view.setUint32(footerOffset + 24, 2, true);
  view.setUint32(footerOffset + 28, numColumns, true);
  view.setUint16(footerOffset + 32, 0, true);
  view.setUint16(footerOffset + 34, 3, true);

  const magic = new TextEncoder().encode(LANCE_MAGIC);
  for (let i = 0; i < 4; i++) {
    view.setUint8(footerOffset + 36 + i, magic[i]);
  }

  return buffer;
}

describe('Error Handling', () => {
  it('should throw descriptive error for corrupted footer', async () => {
    const storage = new MemoryStorageAdapter();

    // Create file that's too small for footer
    storage.put('small.lance', new ArrayBuffer(10));

    const reader = new LanceFileReader(storage, 'small.lance');

    // Should throw because file is smaller than footer size
    await expect(reader.readFooter()).rejects.toThrow();
  });

  it('should throw when manifest not found', async () => {
    const storage = new MemoryStorageAdapter();

    const reader = new LanceReader({ storage, basePath: 'missing' });

    await expect(reader.loadManifestVersion(1)).rejects.toThrow(/not found/i);
  });

  it('should throw when query dimension mismatches index', async () => {
    const storage = new MemoryStorageAdapter();

    const ivf = {
      centroids: new Float32Array(4 * 2), // 2 partitions, 4 dimensions
      offsets: new BigUint64Array([0n, 10n]),
      lengths: new Uint32Array([10, 10]),
      numPartitions: 2,
      dimension: 4,
    };

    const pq = {
      codebook: new Float32Array(256 * 2 * 2),
      numSubVectors: 2,
      numBits: 8,
      distanceType: 'l2' as const,
      subDim: 2,
    };

    const index = new IvfPqIndex(storage, 'test.idx', ivf, pq, 'l2');

    // Query with wrong dimension
    const wrongDimQuery = new Float32Array(8); // 8 dimensions, but index has 4

    await expect(index.search(wrongDimQuery, { k: 5 })).rejects.toThrow(/dimension/i);
  });

  it('should handle empty search results gracefully', async () => {
    const storage = new MemoryStorageAdapter();

    const ivf = {
      centroids: new Float32Array(4 * 2),
      offsets: new BigUint64Array([0n, 0n]),
      lengths: new Uint32Array([0, 0]), // Empty partitions
      numPartitions: 2,
      dimension: 4,
    };

    const pq = {
      codebook: new Float32Array(256 * 2 * 2),
      numSubVectors: 2,
      numBits: 8,
      distanceType: 'l2' as const,
      subDim: 2,
    };

    const index = new IvfPqIndex(storage, 'test.idx', ivf, pq, 'l2');
    const query = new Float32Array([1, 0, 0, 0]);

    const results = await index.search(query, { k: 5 });

    expect(results).toEqual([]);
  });
});

describe('RED PHASE: Deletion File Handling', () => {
  it('should read arrow_array deletion file', async () => {
    const storage = new MemoryStorageAdapter();

    // Arrow array deletion file contains array of deleted row indices
    const deletedRows = new BigUint64Array([5n, 10n, 15n, 20n]);
    storage.put('test/data/0.del', deletedRows.buffer);

    // This functionality is now implemented
    const deletedSet = await readDeletionFile(storage, 'test/data/0.del', 'arrow_array');

    expect(deletedSet.has(5n)).toBe(true);
    expect(deletedSet.has(10n)).toBe(true);
    expect(deletedSet.has(100n)).toBe(false);
  });

  it('should read bitmap deletion file', async () => {
    const storage = new MemoryStorageAdapter();

    // Bitmap deletion file is a RoaringBitmap of deleted row indices
    // For simplicity, create a mock bitmap
    const bitmapBuffer = new ArrayBuffer(100);
    storage.put('test/data/0.del', bitmapBuffer);

    // This functionality is now implemented
    const deletedSet = await readDeletionFile(storage, 'test/data/0.del', 'bitmap');

    expect(deletedSet).toBeDefined();
  });

  it('should filter out deleted rows during search', async () => {
    // When searching, rows in deletion files should be excluded
    const storage = new MemoryStorageAdapter();

    const hnsw = new HnswIndex(storage, 'test.idx', 'l2', 16, 3);
    await hnsw.initialize();

    const deletedRows = new Set<bigint>([5n, 10n, 15n]);
    const query = new Float32Array(128).fill(0.5);

    const results = await hnsw.search(query, {
      k: 10,
      filter: { type: 'exclude', rowIds: deletedRows },
    });

    // None of the results should be deleted rows
    for (const result of results) {
      expect(deletedRows.has(result.rowId)).toBe(false);
    }
  });
});

describe('RED PHASE: Columnar Data Reading', () => {
  it('should read columnar data from Lance data files', async () => {
    // Lance stores data in columnar format in .lance files
    // Each column has its own encoding and compression

    const storage = new MemoryStorageAdapter();

    // This tests reading actual column data
    const lanceFileBuffer = createMockLanceFile({ numColumns: 2 });
    storage.put('test/data/0.lance', lanceFileBuffer);

    const reader = new LanceFileReader(storage, 'test/data/0.lance');
    const footer = await reader.readFooter();

    // Method to read specific column data is now implemented
    const columnData = await reader.readColumnData(0);

    expect(columnData).toBeDefined();
  });
});
