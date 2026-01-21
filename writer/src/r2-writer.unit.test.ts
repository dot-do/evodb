import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeR2BlockKey, parseR2BlockKey, generateBlockId, R2BlockWriter, BatchR2Writer, R2WriterWithManifest } from './r2-writer.js';
import type { R2Bucket, R2Object, R2PutOptions, R2ListOptions } from './types.js';

// Create mock R2 bucket
function createMockR2Bucket(): R2Bucket {
  const storage = new Map<string, { data: Uint8Array; metadata?: Record<string, string> }>();

  return {
    put: vi.fn(async (key: string, value: ArrayBuffer | Uint8Array | string, options?: R2PutOptions) => {
      const data = value instanceof Uint8Array ? value : new Uint8Array(value as ArrayBuffer);
      storage.set(key, { data, metadata: options?.customMetadata });
      return {
        key,
        version: '1',
        size: data.length,
        etag: 'mock-etag',
        httpEtag: '"mock-etag"',
        checksums: {},
        uploaded: new Date(),
      } as R2Object;
    }),
    get: vi.fn(async (key: string) => {
      const item = storage.get(key);
      if (!item) return null;
      return {
        key,
        version: '1',
        size: item.data.length,
        etag: 'mock-etag',
        httpEtag: '"mock-etag"',
        checksums: {},
        uploaded: new Date(),
        customMetadata: item.metadata,
        body: new ReadableStream(),
        bodyUsed: false,
        arrayBuffer: async () => item.data.buffer,
        text: async () => new TextDecoder().decode(item.data),
        json: async () => JSON.parse(new TextDecoder().decode(item.data)),
        blob: async () => new Blob([item.data]),
      };
    }),
    delete: vi.fn(async (keys: string | string[]) => {
      const keyList = Array.isArray(keys) ? keys : [keys];
      for (const key of keyList) {
        storage.delete(key);
      }
    }),
    list: vi.fn(async (options?: R2ListOptions) => {
      const prefix = options?.prefix ?? '';
      const objects: R2Object[] = [];
      for (const [key, item] of storage) {
        if (key.startsWith(prefix)) {
          objects.push({
            key,
            version: '1',
            size: item.data.length,
            etag: 'mock-etag',
            httpEtag: '"mock-etag"',
            checksums: {},
            uploaded: new Date(),
            customMetadata: item.metadata,
          });
        }
      }
      return {
        objects,
        truncated: false,
        delimitedPrefixes: [],
      };
    }),
    head: vi.fn(async (key: string) => {
      const item = storage.get(key);
      if (!item) return null;
      return {
        key,
        version: '1',
        size: item.data.length,
        etag: 'mock-etag',
        httpEtag: '"mock-etag"',
        checksums: {},
        uploaded: new Date(),
        customMetadata: item.metadata,
      };
    }),
  };
}

describe('R2 Key Utilities', () => {
  describe('makeR2BlockKey', () => {
    it('should create valid R2 key', () => {
      const timestamp = 1700000000000;
      const seq = 1;
      const tableLocation = 'com/example/users';

      const key = makeR2BlockKey(tableLocation, timestamp, seq);

      expect(key).toContain(tableLocation);
      expect(key).toContain('/data/');
      expect(key.endsWith('.cjlb')).toBe(true);
    });

    it('should create unique keys for different timestamps', () => {
      const tableLocation = 'com/example/users';
      const key1 = makeR2BlockKey(tableLocation, 1700000000000, 1);
      const key2 = makeR2BlockKey(tableLocation, 1700000001000, 1);

      expect(key1).not.toBe(key2);
    });

    it('should create unique keys for different sequences', () => {
      const tableLocation = 'com/example/users';
      const timestamp = 1700000000000;
      const key1 = makeR2BlockKey(tableLocation, timestamp, 1);
      const key2 = makeR2BlockKey(tableLocation, timestamp, 2);

      expect(key1).not.toBe(key2);
    });
  });

  describe('parseR2BlockKey', () => {
    it('should parse valid R2 key', () => {
      const tableLocation = 'com/example/users';
      const timestamp = 1700000000000;
      const seq = 5;

      const key = makeR2BlockKey(tableLocation, timestamp, seq);
      const parsed = parseR2BlockKey(key);

      expect(parsed).not.toBeNull();
      expect(parsed!.tableLocation).toBe(tableLocation);
      expect(parsed!.timestamp).toBe(timestamp);
      expect(parsed!.seq).toBe(seq);
    });

    it('should return null for invalid key', () => {
      expect(parseR2BlockKey('invalid-key')).toBeNull();
      expect(parseR2BlockKey('com/example/users/data/invalid')).toBeNull();
      expect(parseR2BlockKey('com/example/users/other/abc-def.cjlb')).toBeNull();
    });

    it('should handle nested table locations', () => {
      const tableLocation = 'com/example/api/v2/users';
      const timestamp = 1700000000000;
      const seq = 1;

      const key = makeR2BlockKey(tableLocation, timestamp, seq);
      const parsed = parseR2BlockKey(key);

      expect(parsed).not.toBeNull();
      expect(parsed!.tableLocation).toBe(tableLocation);
    });
  });

  describe('roundtrip', () => {
    it('should roundtrip key generation and parsing', () => {
      const testCases = [
        { tableLocation: 'users', timestamp: 1700000000000, seq: 0 },
        { tableLocation: 'com/example/users', timestamp: Date.now(), seq: 999 },
        { tableLocation: 'a/b/c/d/e', timestamp: 1, seq: 1 },
      ];

      for (const tc of testCases) {
        const key = makeR2BlockKey(tc.tableLocation, tc.timestamp, tc.seq);
        const parsed = parseR2BlockKey(key);

        expect(parsed).not.toBeNull();
        expect(parsed!.tableLocation).toBe(tc.tableLocation);
        expect(parsed!.timestamp).toBe(tc.timestamp);
        expect(parsed!.seq).toBe(tc.seq);
      }
    });
  });
});

describe('generateBlockId', () => {
  it('should generate unique IDs', () => {
    const id1 = generateBlockId(Date.now(), 1);
    const id2 = generateBlockId(Date.now(), 2);

    expect(id1).not.toBe(id2);
  });

  it('should include timestamp and sequence', () => {
    const timestamp = 1700000000000;
    const seq = 42;
    const id = generateBlockId(timestamp, seq);

    expect(id).toContain(timestamp.toString(36));
    expect(id).toContain(seq.toString(36));
  });
});

describe('R2BlockWriter', () => {
  let mockBucket: R2Bucket;
  let writer: R2BlockWriter;

  beforeEach(() => {
    mockBucket = createMockR2Bucket();
    writer = new R2BlockWriter(mockBucket, {
      tableLocation: 'test/table',
      maxRetries: 3,
      retryBackoffMs: 10,
      schemaId: 1,
      partitionMode: 'do-sqlite',
    });
  });

  describe('writeRawBlock', () => {
    it('should write raw block data', async () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const r2Key = 'test/table/data/test-block.cjlb';

      await writer.writeRawBlock(r2Key, data, {
        rowCount: 10,
        compacted: false,
      });

      expect(mockBucket.put).toHaveBeenCalled();
    });

    it('should include metadata', async () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const r2Key = 'test/table/data/test-block.cjlb';

      await writer.writeRawBlock(r2Key, data, {
        rowCount: 10,
        compacted: true,
        mergedCount: 3,
      });

      expect(mockBucket.put).toHaveBeenCalledWith(
        r2Key,
        data,
        expect.objectContaining({
          customMetadata: expect.objectContaining({
            'x-row-count': '10',
            'x-compacted': 'true',
            'x-merged-count': '3',
          }),
        })
      );
    });
  });

  describe('deleteBlock', () => {
    it('should delete a single block', async () => {
      await writer.deleteBlock('test-key');
      expect(mockBucket.delete).toHaveBeenCalledWith('test-key');
    });
  });

  describe('deleteBlocks', () => {
    it('should delete multiple blocks', async () => {
      await writer.deleteBlocks(['key1', 'key2', 'key3']);
      expect(mockBucket.delete).toHaveBeenCalledWith(['key1', 'key2', 'key3']);
    });

    it('should handle empty array', async () => {
      await writer.deleteBlocks([]);
      expect(mockBucket.delete).not.toHaveBeenCalled();
    });
  });

  describe('listBlocks', () => {
    it('should list blocks with prefix', async () => {
      const result = await writer.listBlocks();

      expect(mockBucket.list).toHaveBeenCalledWith(
        expect.objectContaining({
          prefix: 'test/table/data/',
        })
      );
    });

    it('should pass options', async () => {
      await writer.listBlocks({ limit: 10, cursor: 'abc' });

      expect(mockBucket.list).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 10,
          cursor: 'abc',
        })
      );
    });
  });

  describe('readBlock', () => {
    it('should read block data', async () => {
      // First write a block
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      await writer.writeRawBlock('test-key', data, { rowCount: 1, compacted: false });

      const result = await writer.readBlock('test-key');

      expect(result).not.toBeNull();
    });

    it('should return null for non-existent block', async () => {
      const result = await writer.readBlock('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('blockExists', () => {
    it('should return true for existing block', async () => {
      await writer.writeRawBlock('test-key', new Uint8Array([1, 2, 3]), { rowCount: 1, compacted: false });

      const exists = await writer.blockExists('test-key');
      expect(exists).toBe(true);
    });

    it('should return false for non-existent block', async () => {
      const exists = await writer.blockExists('non-existent');
      expect(exists).toBe(false);
    });
  });

  describe('getBlockMetadata', () => {
    it('should return metadata for existing block', async () => {
      await writer.writeRawBlock('test-key', new Uint8Array([1, 2, 3]), {
        rowCount: 10,
        compacted: true,
      });

      const metadata = await writer.getBlockMetadata('test-key');

      expect(metadata).not.toBeNull();
      expect(metadata!.size).toBe(3);
      expect(metadata!.rowCount).toBe(10);
      expect(metadata!.compacted).toBe(true);
    });

    it('should return null for non-existent block', async () => {
      const metadata = await writer.getBlockMetadata('non-existent');
      expect(metadata).toBeNull();
    });
  });

  describe('fromWriterOptions', () => {
    it('should create writer from options', () => {
      const writer = R2BlockWriter.fromWriterOptions(mockBucket, {
        r2Bucket: mockBucket,
        tableLocation: 'test/location',
        partitionMode: 'edge-cache',
        schemaId: 2,
        bufferSize: 1000,
        bufferTimeout: 5000,
        targetBlockSize: 128 * 1024 * 1024,
        maxBlockSize: 256 * 1024 * 1024,
        minCompactBlocks: 4,
        targetCompactSize: 500 * 1024 * 1024,
        maxRetries: 5,
        retryBackoffMs: 200,
      });

      expect(writer).toBeInstanceOf(R2BlockWriter);
    });
  });
});

describe('BatchR2Writer', () => {
  let mockBucket: R2Bucket;
  let batchWriter: BatchR2Writer;

  beforeEach(() => {
    mockBucket = createMockR2Bucket();
    const writer = new R2BlockWriter(mockBucket, {
      tableLocation: 'test/table',
      maxRetries: 1,
      retryBackoffMs: 10,
    });
    batchWriter = new BatchR2Writer(writer);
  });

  it('should track pending writes', () => {
    // We can't easily test queueWrite without proper WAL entries
    // But we can verify the pending count starts at 0
    expect(batchWriter.pendingCount).toBe(0);
  });
});

describe('R2WriterWithManifest', () => {
  let mockBucket: R2Bucket;
  let writer: R2WriterWithManifest;

  beforeEach(() => {
    mockBucket = createMockR2Bucket();
    writer = new R2WriterWithManifest(mockBucket, {
      tableLocation: 'test/table',
      maxRetries: 3,
      retryBackoffMs: 10,
    });
  });

  it('should track blocks for manifest updates', () => {
    expect(writer.hasPendingManifestUpdates()).toBe(false);

    writer.trackBlock({
      id: 'block-1',
      r2Key: 'test/table/data/block-1.cjlb',
      rowCount: 100,
      sizeBytes: 1024,
      minLsn: 1n,
      maxLsn: 100n,
      createdAt: Date.now(),
      compacted: false,
      columnStats: [],
    });

    expect(writer.hasPendingManifestUpdates()).toBe(true);
  });

  it('should drain manifest updates', () => {
    writer.trackBlock({
      id: 'block-1',
      r2Key: 'test/table/data/block-1.cjlb',
      rowCount: 100,
      sizeBytes: 1024,
      minLsn: 1n,
      maxLsn: 100n,
      createdAt: Date.now(),
      compacted: false,
      columnStats: [],
    });

    const updates = writer.drainManifestUpdates();

    expect(updates.length).toBe(1);
    expect(updates[0].blockId).toBe('block-1');
    expect(writer.hasPendingManifestUpdates()).toBe(false);
  });
});
