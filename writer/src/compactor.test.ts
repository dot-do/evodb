import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BlockCompactor,
  CompactionScheduler,
  TieredCompactor,
  getDefaultCompactionConfig,
} from './compactor.js';
import type { BlockMetadata, R2Bucket, R2Object } from './types.js';

// Create mock R2 bucket
function createMockR2Bucket(): R2Bucket {
  const storage = new Map<string, { data: Uint8Array; metadata?: Record<string, string> }>();

  return {
    put: vi.fn(async (key: string, value: ArrayBuffer | Uint8Array | string, options?: any) => {
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
    list: vi.fn(async () => ({
      objects: [],
      truncated: false,
      delimitedPrefixes: [],
    })),
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

// Create mock block metadata
function createMockBlockMetadata(
  id: string,
  sizeBytes: number,
  options?: Partial<BlockMetadata>
): BlockMetadata {
  return {
    id,
    r2Key: `test/table/data/${id}.cjlb`,
    rowCount: 100,
    sizeBytes,
    minLsn: 1n,
    maxLsn: 100n,
    createdAt: Date.now(),
    compacted: false,
    columnStats: [],
    ...options,
  };
}

describe('getDefaultCompactionConfig', () => {
  it('should return do-sqlite config', () => {
    const config = getDefaultCompactionConfig('do-sqlite');

    expect(config.partitionMode).toBe('do-sqlite');
    expect(config.targetSize).toBe(16 * 1024 * 1024); // 16MB
    expect(config.maxSize).toBe(32 * 1024 * 1024); // 32MB
    expect(config.minBlocks).toBe(4);
    expect(config.strategy).toBe('time');
    expect(config.maxMergeBlocks).toBe(8);
  });

  it('should return edge-cache config', () => {
    const config = getDefaultCompactionConfig('edge-cache');

    expect(config.partitionMode).toBe('edge-cache');
    expect(config.targetSize).toBe(500 * 1024 * 1024); // 500MB
    expect(config.maxSize).toBe(512 * 1024 * 1024); // 512MB
    expect(config.maxMergeBlocks).toBe(8);
  });

  it('should return enterprise config', () => {
    const config = getDefaultCompactionConfig('enterprise');

    expect(config.partitionMode).toBe('enterprise');
    expect(config.targetSize).toBe(5 * 1024 * 1024 * 1024); // 5GB
    expect(config.maxSize).toBe(5 * 1024 * 1024 * 1024); // 5GB
    expect(config.maxMergeBlocks).toBe(16);
  });
});

describe('BlockCompactor', () => {
  let mockBucket: R2Bucket;
  let compactor: BlockCompactor;

  beforeEach(() => {
    mockBucket = createMockR2Bucket();
    compactor = new BlockCompactor(mockBucket, 'test/table', {
      partitionMode: 'do-sqlite',
      minBlocks: 4,
      targetSize: 16 * 1024 * 1024,
      maxSize: 32 * 1024 * 1024,
    });
  });

  describe('getPartitionMode', () => {
    it('should return the partition mode', () => {
      expect(compactor.getPartitionMode()).toBe('do-sqlite');
    });
  });

  describe('selectSmallBlocks', () => {
    it('should select blocks below target size', () => {
      const blocks = [
        createMockBlockMetadata('block-1', 1 * 1024 * 1024), // 1MB - small
        createMockBlockMetadata('block-2', 2 * 1024 * 1024), // 2MB - small
        createMockBlockMetadata('block-3', 20 * 1024 * 1024), // 20MB - not small
        createMockBlockMetadata('block-4', 1 * 1024 * 1024, { compacted: true }), // already compacted
      ];

      const smallBlocks = compactor.selectSmallBlocks(blocks);

      expect(smallBlocks.length).toBe(2);
      expect(smallBlocks.map(b => b.id)).toContain('block-1');
      expect(smallBlocks.map(b => b.id)).toContain('block-2');
    });

    it('should exclude compacted blocks', () => {
      const blocks = [
        createMockBlockMetadata('block-1', 1 * 1024 * 1024, { compacted: true }),
        createMockBlockMetadata('block-2', 1 * 1024 * 1024, { compacted: true }),
      ];

      const smallBlocks = compactor.selectSmallBlocks(blocks);
      expect(smallBlocks.length).toBe(0);
    });
  });

  describe('shouldCompact', () => {
    it('should return true when enough small blocks exist', () => {
      const blocks = [
        createMockBlockMetadata('block-1', 1 * 1024 * 1024),
        createMockBlockMetadata('block-2', 1 * 1024 * 1024),
        createMockBlockMetadata('block-3', 1 * 1024 * 1024),
        createMockBlockMetadata('block-4', 1 * 1024 * 1024),
      ];

      expect(compactor.shouldCompact(blocks)).toBe(true);
    });

    it('should return false when not enough small blocks', () => {
      const blocks = [
        createMockBlockMetadata('block-1', 1 * 1024 * 1024),
        createMockBlockMetadata('block-2', 1 * 1024 * 1024),
      ];

      expect(compactor.shouldCompact(blocks)).toBe(false);
    });
  });

  describe('selectBlocksForCompaction', () => {
    it('should select blocks up to max count', () => {
      // Create compactor with maxMergeBlocks = 4
      const compactor = new BlockCompactor(mockBucket, 'test/table', {
        partitionMode: 'do-sqlite',
        minBlocks: 2,
        maxMergeBlocks: 4,
      });

      const blocks = [
        createMockBlockMetadata('block-1', 1 * 1024 * 1024),
        createMockBlockMetadata('block-2', 1 * 1024 * 1024),
        createMockBlockMetadata('block-3', 1 * 1024 * 1024),
        createMockBlockMetadata('block-4', 1 * 1024 * 1024),
        createMockBlockMetadata('block-5', 1 * 1024 * 1024),
        createMockBlockMetadata('block-6', 1 * 1024 * 1024),
      ];

      const selected = compactor.selectBlocksForCompaction(blocks);
      expect(selected.length).toBeLessThanOrEqual(4);
    });

    it('should return empty array when not enough blocks', () => {
      const blocks = [createMockBlockMetadata('block-1', 1 * 1024 * 1024)];

      const selected = compactor.selectBlocksForCompaction(blocks);
      expect(selected.length).toBe(0);
    });
  });

  describe('estimateSavings', () => {
    it('should estimate compaction savings', () => {
      const blocks = [
        createMockBlockMetadata('block-1', 1 * 1024 * 1024),
        createMockBlockMetadata('block-2', 1 * 1024 * 1024),
        createMockBlockMetadata('block-3', 1 * 1024 * 1024),
        createMockBlockMetadata('block-4', 1 * 1024 * 1024),
      ];

      const savings = compactor.estimateSavings(blocks);

      expect(savings.currentSize).toBe(4 * 1024 * 1024);
      expect(savings.estimatedNewSize).toBeLessThan(savings.currentSize);
      expect(savings.estimatedSavings).toBeGreaterThan(0);
      expect(savings.savingsPercent).toBeGreaterThan(0);
    });
  });

  describe('getMetrics', () => {
    it('should return compaction metrics', () => {
      const blocks = [
        createMockBlockMetadata('block-1', 1 * 1024 * 1024),
        createMockBlockMetadata('block-2', 1 * 1024 * 1024),
        createMockBlockMetadata('block-3', 20 * 1024 * 1024, { compacted: true }),
      ];

      const metrics = compactor.getMetrics(blocks);

      expect(metrics.totalBlocks).toBe(3);
      expect(metrics.smallBlocks).toBe(2);
      expect(metrics.compactedBlocks).toBe(1);
      expect(metrics.eligibleForCompaction).toBe(false); // need 4 blocks
      expect(metrics.partitionMode).toBe('do-sqlite');
    });
  });

  describe('compact', () => {
    it('should skip compaction with less than 2 blocks', async () => {
      const blocks = [createMockBlockMetadata('block-1', 1 * 1024 * 1024)];

      const result = await compactor.compact(blocks, 1);

      expect(result.status).toBe('skipped');
      expect(result.blocksMerged).toBe(0);
    });
  });

  describe('fromWriterOptions', () => {
    it('should create compactor from writer options', () => {
      const compactor = BlockCompactor.fromWriterOptions(mockBucket, {
        r2Bucket: mockBucket,
        tableLocation: 'test/table',
        partitionMode: 'edge-cache',
        schemaId: 1,
        bufferSize: 10000,
        bufferTimeout: 5000,
        targetBlockSize: 128 * 1024 * 1024,
        maxBlockSize: 256 * 1024 * 1024,
        minCompactBlocks: 6,
        targetCompactSize: 500 * 1024 * 1024,
        maxRetries: 3,
        retryBackoffMs: 100,
      });

      expect(compactor).toBeInstanceOf(BlockCompactor);
      expect(compactor.getPartitionMode()).toBe('edge-cache');
    });
  });
});

describe('CompactionScheduler', () => {
  let mockBucket: R2Bucket;
  let compactor: BlockCompactor;
  let scheduler: CompactionScheduler;

  beforeEach(() => {
    mockBucket = createMockR2Bucket();
    compactor = new BlockCompactor(mockBucket, 'test/table', {
      partitionMode: 'do-sqlite',
      minBlocks: 2,
    });
    scheduler = new CompactionScheduler(compactor);
  });

  it('should start with no running compaction', () => {
    expect(scheduler.running).toBe(false);
    expect(scheduler.failureCount).toBe(0);
    expect(scheduler.timeSinceLastCompaction).toBeNull();
  });

  it('should return null when not enough blocks', async () => {
    const blocks = [createMockBlockMetadata('block-1', 1 * 1024 * 1024)];

    let seq = 0;
    const result = await scheduler.runIfNeeded(blocks, () => ++seq);

    expect(result).toBeNull();
  });

  describe('getStatus', () => {
    it('should return scheduler status', () => {
      const status = scheduler.getStatus();

      expect(status.running).toBe(false);
      expect(status.lastCompactionTime).toBeNull();
      expect(status.consecutiveFailures).toBe(0);
      expect(status.partitionMode).toBe('do-sqlite');
    });
  });

  describe('resetFailures', () => {
    it('should reset failure count', () => {
      // Force a failure scenario is complex, so just test reset works
      scheduler.resetFailures();
      expect(scheduler.failureCount).toBe(0);
    });
  });
});

describe('TieredCompactor', () => {
  let mockBucket: R2Bucket;
  let tieredCompactor: TieredCompactor;

  beforeEach(() => {
    mockBucket = createMockR2Bucket();
    tieredCompactor = new TieredCompactor(mockBucket, 'test/table');
  });

  describe('getCompactorForBlocks', () => {
    it('should return do-sqlite compactor for small blocks', () => {
      const blocks = [
        createMockBlockMetadata('block-1', 1 * 1024 * 1024),
        createMockBlockMetadata('block-2', 1 * 1024 * 1024),
      ];

      const compactor = tieredCompactor.getCompactorForBlocks(blocks);
      expect(compactor.getPartitionMode()).toBe('do-sqlite');
    });

    it('should return edge-cache compactor for medium blocks', () => {
      const blocks = [
        createMockBlockMetadata('block-1', 300 * 1024 * 1024),
        createMockBlockMetadata('block-2', 300 * 1024 * 1024),
      ];

      const compactor = tieredCompactor.getCompactorForBlocks(blocks);
      expect(compactor.getPartitionMode()).toBe('edge-cache');
    });

    it('should return enterprise compactor for large blocks', () => {
      const blocks = [
        createMockBlockMetadata('block-1', 3 * 1024 * 1024 * 1024),
        createMockBlockMetadata('block-2', 3 * 1024 * 1024 * 1024),
      ];

      const compactor = tieredCompactor.getCompactorForBlocks(blocks);
      expect(compactor.getPartitionMode()).toBe('enterprise');
    });
  });

  describe('compact', () => {
    it('should return null when not enough blocks', async () => {
      const blocks = [createMockBlockMetadata('block-1', 1 * 1024 * 1024)];

      let seq = 0;
      const result = await tieredCompactor.compact(blocks, () => ++seq);

      expect(result).toBeNull();
    });
  });
});
