import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SizeBasedBufferStrategy,
  TimeBasedBufferStrategy,
  HybridBufferStrategy,
  createBufferStrategy,
  createBufferStrategyOfType,
} from './buffer-strategy.js';
import {
  R2BlockWriterAdapter,
  InMemoryBlockWriter,
  createBlockWriter,
} from './block-writer.js';
import {
  SizeBasedCompaction,
  TimeBasedCompaction,
  LsnBasedCompaction,
  NoOpCompaction,
  createCompactionStrategy,
  createCompactionStrategyOfType,
} from './compaction-strategy.js';
import type { WalEntry, R2Bucket, R2Object, R2PutOptions, ResolvedWriterOptions, BlockMetadata } from '../types.js';

// Create mock WAL entries
function createMockWalEntry(lsn: number, data: string = 'test'): WalEntry {
  const encoder = new TextEncoder();
  return {
    lsn: BigInt(lsn),
    timestamp: BigInt(Date.now()),
    op: 1,
    flags: 0,
    data: encoder.encode(data),
    checksum: 12345,
  };
}

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

// Create mock resolved options
function createMockResolvedOptions(): ResolvedWriterOptions {
  return {
    r2Bucket: createMockR2Bucket(),
    tableLocation: 'test/table',
    schemaId: 0,
    partitionMode: 'do-sqlite',
    bufferSize: 100,
    bufferTimeout: 5000,
    targetBlockSize: 2 * 1024 * 1024,
    maxBlockSize: 4 * 1024 * 1024,
    minCompactBlocks: 4,
    targetCompactSize: 16 * 1024 * 1024,
    maxRetries: 3,
    retryBackoffMs: 100,
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

// =============================================================================
// Buffer Strategy Tests
// =============================================================================

describe('SizeBasedBufferStrategy', () => {
  it('should create from writer options', () => {
    const options = createMockResolvedOptions();
    const strategy = SizeBasedBufferStrategy.fromWriterOptions(options);
    expect(strategy).toBeInstanceOf(SizeBasedBufferStrategy);
  });

  it('should append entries and track size', () => {
    const strategy = new SizeBasedBufferStrategy(1024, 2048);
    const entries = [createMockWalEntry(1), createMockWalEntry(2)];

    strategy.append('source-1', entries);

    const stats = strategy.stats();
    expect(stats.entryCount).toBe(2);
    expect(stats.estimatedSize).toBeGreaterThan(0);
  });

  it('should return true when target size reached', () => {
    const strategy = new SizeBasedBufferStrategy(50, 100);
    const entries = [createMockWalEntry(1, 'x'.repeat(100))];

    const shouldFlush = strategy.append('source-1', entries);

    expect(shouldFlush).toBe(true);
  });

  it('should clear buffer on clear()', () => {
    const strategy = new SizeBasedBufferStrategy(1024, 2048);
    strategy.append('source-1', [createMockWalEntry(1)]);

    strategy.clear();

    expect(strategy.isEmpty()).toBe(true);
    expect(strategy.stats().entryCount).toBe(0);
  });

  it('should drain buffer correctly', () => {
    const strategy = new SizeBasedBufferStrategy(1024, 2048);
    const entries = [createMockWalEntry(1), createMockWalEntry(2)];
    strategy.append('source-1', entries);

    const { entries: drained, state } = strategy.flush();

    expect(drained.length).toBe(2);
    expect(state.minLsn).toBe(1n);
    expect(state.maxLsn).toBe(2n);
    expect(strategy.isEmpty()).toBe(true);
  });
});

describe('TimeBasedBufferStrategy', () => {
  it('should create from writer options', () => {
    const options = createMockResolvedOptions();
    const strategy = TimeBasedBufferStrategy.fromWriterOptions(options);
    expect(strategy).toBeInstanceOf(TimeBasedBufferStrategy);
  });

  it('should track entries', () => {
    const strategy = new TimeBasedBufferStrategy(5000);
    strategy.append('source-1', [createMockWalEntry(1)]);

    expect(strategy.stats().entryCount).toBe(1);
  });

  it('should return time to flush', () => {
    const strategy = new TimeBasedBufferStrategy(5000);
    strategy.append('source-1', [createMockWalEntry(1)]);

    const time = strategy.getTimeToFlush();
    expect(time).not.toBeNull();
    expect(time!).toBeGreaterThan(0);
    expect(time!).toBeLessThanOrEqual(5000);
  });

  it('should return null time for empty buffer', () => {
    const strategy = new TimeBasedBufferStrategy(5000);
    expect(strategy.getTimeToFlush()).toBeNull();
  });
});

describe('HybridBufferStrategy', () => {
  it('should create from writer options', () => {
    const options = createMockResolvedOptions();
    const strategy = HybridBufferStrategy.fromWriterOptions(options);
    expect(strategy).toBeInstanceOf(HybridBufferStrategy);
  });

  it('should flush when entry count threshold reached', () => {
    const strategy = new HybridBufferStrategy({
      maxEntries: 2,
      maxAgeMs: 60000,
      targetSizeBytes: 10 * 1024 * 1024,
    });

    strategy.append('source-1', [createMockWalEntry(1)]);
    expect(strategy.shouldFlush()).toBe(false);

    strategy.append('source-1', [createMockWalEntry(2)]);
    expect(strategy.shouldFlush()).toBe(true);
  });

  it('should track source cursors', () => {
    const strategy = new HybridBufferStrategy({
      maxEntries: 100,
      maxAgeMs: 60000,
      targetSizeBytes: 10 * 1024 * 1024,
    });

    strategy.append('source-1', [createMockWalEntry(5)]);
    strategy.append('source-2', [createMockWalEntry(10)]);

    const cursors = strategy.getSourceCursors();
    expect(cursors.get('source-1')).toBe(5n);
    expect(cursors.get('source-2')).toBe(10n);
  });
});

describe('createBufferStrategyOfType', () => {
  it('should create size-based strategy', () => {
    const options = createMockResolvedOptions();
    const strategy = createBufferStrategyOfType('size', options);
    expect(strategy).toBeInstanceOf(SizeBasedBufferStrategy);
  });

  it('should create time-based strategy', () => {
    const options = createMockResolvedOptions();
    const strategy = createBufferStrategyOfType('time', options);
    expect(strategy).toBeInstanceOf(TimeBasedBufferStrategy);
  });

  it('should create hybrid strategy', () => {
    const options = createMockResolvedOptions();
    const strategy = createBufferStrategyOfType('hybrid', options);
    expect(strategy).toBeInstanceOf(HybridBufferStrategy);
  });

  it('should default to hybrid', () => {
    const options = createMockResolvedOptions();
    const strategy = createBufferStrategy(options);
    expect(strategy).toBeInstanceOf(HybridBufferStrategy);
  });
});

// =============================================================================
// Block Writer Tests
// =============================================================================

describe('InMemoryBlockWriter', () => {
  let writer: InMemoryBlockWriter;

  beforeEach(() => {
    writer = new InMemoryBlockWriter();
  });

  it('should write entries', async () => {
    const entries = [createMockWalEntry(1), createMockWalEntry(2)];

    const result = await writer.write(entries, 1n, 2n, 1);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.metadata.rowCount).toBe(2);
      expect(result.metadata.minLsn).toBe(1n);
      expect(result.metadata.maxLsn).toBe(2n);
    }
  });

  it('should fail on empty entries', async () => {
    const result = await writer.write([], 0n, 0n, 1);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('No entries to write');
    }
  });

  it('should read written blocks', async () => {
    const entries = [createMockWalEntry(1)];
    const writeResult = await writer.write(entries, 1n, 1n, 1);

    expect(writeResult.success).toBe(true);
    if (writeResult.success) {
      const data = await writer.read(writeResult.metadata.r2Key);
      expect(data).not.toBeNull();
    }
  });

  it('should delete blocks', async () => {
    const entries = [createMockWalEntry(1)];
    const writeResult = await writer.write(entries, 1n, 1n, 1);

    if (writeResult.success) {
      await writer.delete([writeResult.metadata.r2Key]);
      const exists = await writer.exists(writeResult.metadata.r2Key);
      expect(exists).toBe(false);
    }
  });

  it('should check existence', async () => {
    const entries = [createMockWalEntry(1)];
    const writeResult = await writer.write(entries, 1n, 1n, 1);

    if (writeResult.success) {
      const exists = await writer.exists(writeResult.metadata.r2Key);
      expect(exists).toBe(true);

      const notExists = await writer.exists('non-existent-key');
      expect(notExists).toBe(false);
    }
  });

  it('should clear all storage', async () => {
    await writer.write([createMockWalEntry(1)], 1n, 1n, 1);
    await writer.write([createMockWalEntry(2)], 2n, 2n, 2);

    writer.clear();

    const blocks = writer.getAllBlocks();
    expect(blocks.size).toBe(0);
  });
});

describe('R2BlockWriterAdapter', () => {
  it('should create from writer options', () => {
    const options = createMockResolvedOptions();
    const adapter = R2BlockWriterAdapter.fromWriterOptions(options.r2Bucket, options);
    expect(adapter).toBeInstanceOf(R2BlockWriterAdapter);
  });

  it('should provide access to underlying R2 writer', () => {
    const options = createMockResolvedOptions();
    const adapter = R2BlockWriterAdapter.fromWriterOptions(options.r2Bucket, options);
    expect(adapter.getR2Writer()).toBeDefined();
  });
});

// =============================================================================
// Compaction Strategy Tests
// =============================================================================

describe('SizeBasedCompaction', () => {
  let mockBucket: R2Bucket;

  beforeEach(() => {
    mockBucket = createMockR2Bucket();
  });

  it('should create from writer options', () => {
    const options = createMockResolvedOptions();
    const strategy = SizeBasedCompaction.fromWriterOptions(mockBucket, options);
    expect(strategy).toBeInstanceOf(SizeBasedCompaction);
  });

  it('should check if compaction needed', () => {
    const strategy = new SizeBasedCompaction(mockBucket, 'test/table', {
      minBlocks: 4,
      partitionMode: 'do-sqlite',
    });

    const fewBlocks = [
      createMockBlockMetadata('block-1', 1024),
      createMockBlockMetadata('block-2', 1024),
    ];

    const manyBlocks = [
      createMockBlockMetadata('block-1', 1024),
      createMockBlockMetadata('block-2', 1024),
      createMockBlockMetadata('block-3', 1024),
      createMockBlockMetadata('block-4', 1024),
    ];

    expect(strategy.shouldCompact(fewBlocks)).toBe(false);
    expect(strategy.shouldCompact(manyBlocks)).toBe(true);
  });

  it('should return partition mode', () => {
    const strategy = new SizeBasedCompaction(mockBucket, 'test/table', {
      partitionMode: 'edge-cache',
    });

    expect(strategy.getPartitionMode()).toBe('edge-cache');
  });

  it('should return compaction metrics', () => {
    const strategy = new SizeBasedCompaction(mockBucket, 'test/table', {
      minBlocks: 4,
      partitionMode: 'do-sqlite',
    });

    const blocks = [
      createMockBlockMetadata('block-1', 1024),
      createMockBlockMetadata('block-2', 1024),
      createMockBlockMetadata('block-3', 20 * 1024 * 1024, { compacted: true }),
    ];

    const metrics = strategy.getMetrics(blocks);

    expect(metrics.totalBlocks).toBe(3);
    expect(metrics.smallBlocks).toBe(2);
    expect(metrics.compactedBlocks).toBe(1);
    expect(metrics.eligibleForCompaction).toBe(false);
  });
});

describe('TimeBasedCompaction', () => {
  let mockBucket: R2Bucket;

  beforeEach(() => {
    mockBucket = createMockR2Bucket();
  });

  it('should create from writer options', () => {
    const options = createMockResolvedOptions();
    const strategy = TimeBasedCompaction.fromWriterOptions(mockBucket, options);
    expect(strategy).toBeInstanceOf(TimeBasedCompaction);
  });

  it('should expose underlying compactor', () => {
    const strategy = new TimeBasedCompaction(mockBucket, 'test/table');
    expect(strategy.getCompactor()).toBeDefined();
  });
});

describe('LsnBasedCompaction', () => {
  let mockBucket: R2Bucket;

  beforeEach(() => {
    mockBucket = createMockR2Bucket();
  });

  it('should create from writer options', () => {
    const options = createMockResolvedOptions();
    const strategy = LsnBasedCompaction.fromWriterOptions(mockBucket, options);
    expect(strategy).toBeInstanceOf(LsnBasedCompaction);
  });
});

describe('NoOpCompaction', () => {
  it('should never trigger compaction', () => {
    const strategy = new NoOpCompaction();

    const blocks = Array.from({ length: 100 }, (_, i) =>
      createMockBlockMetadata(`block-${i}`, 1024)
    );

    expect(strategy.shouldCompact(blocks)).toBe(false);
  });

  it('should return empty block selection', () => {
    const strategy = new NoOpCompaction();

    const blocks = [
      createMockBlockMetadata('block-1', 1024),
      createMockBlockMetadata('block-2', 1024),
    ];

    expect(strategy.selectBlocks(blocks)).toEqual([]);
  });

  it('should return skipped result on compact', async () => {
    const strategy = new NoOpCompaction();

    const result = await strategy.compact([], 1);

    expect(result.status).toBe('skipped');
    expect(result.error).toBe('Compaction disabled');
  });

  it('should return metrics', () => {
    const strategy = new NoOpCompaction({ targetSize: 1024 });

    const blocks = [
      createMockBlockMetadata('block-1', 100),
      createMockBlockMetadata('block-2', 2000, { compacted: true }),
    ];

    const metrics = strategy.getMetrics(blocks);

    expect(metrics.totalBlocks).toBe(2);
    expect(metrics.smallBlocks).toBe(1);
    expect(metrics.compactedBlocks).toBe(1);
    expect(metrics.eligibleForCompaction).toBe(false);
  });
});

describe('createCompactionStrategyOfType', () => {
  let mockBucket: R2Bucket;

  beforeEach(() => {
    mockBucket = createMockR2Bucket();
  });

  it('should create size-based compaction', () => {
    const options = createMockResolvedOptions();
    const strategy = createCompactionStrategyOfType('size', mockBucket, options);
    expect(strategy).toBeInstanceOf(SizeBasedCompaction);
  });

  it('should create time-based compaction', () => {
    const options = createMockResolvedOptions();
    const strategy = createCompactionStrategyOfType('time', mockBucket, options);
    expect(strategy).toBeInstanceOf(TimeBasedCompaction);
  });

  it('should create lsn-based compaction', () => {
    const options = createMockResolvedOptions();
    const strategy = createCompactionStrategyOfType('lsn', mockBucket, options);
    expect(strategy).toBeInstanceOf(LsnBasedCompaction);
  });

  it('should create no-op compaction', () => {
    const options = createMockResolvedOptions();
    const strategy = createCompactionStrategyOfType('none', mockBucket, options);
    expect(strategy).toBeInstanceOf(NoOpCompaction);
  });

  it('should default to time-based', () => {
    const options = createMockResolvedOptions();
    const strategy = createCompactionStrategy(mockBucket, options);
    expect(strategy).toBeInstanceOf(TimeBasedCompaction);
  });
});

// =============================================================================
// LakehouseWriter with Strategy DI Tests
// =============================================================================

describe('LakehouseWriter with custom strategies', () => {
  it('should accept custom buffer strategy', async () => {
    const { LakehouseWriter } = await import('../writer.js');

    const mockBucket = createMockR2Bucket();
    const customBuffer = new HybridBufferStrategy({
      maxEntries: 5,
      maxAgeMs: 1000,
      targetSizeBytes: 1024,
    });

    const writer = LakehouseWriter.withStrategies(
      { r2Bucket: mockBucket, tableLocation: 'test/table' },
      { bufferStrategy: customBuffer }
    );

    expect(writer.getBufferStrategy()).toBe(customBuffer);
  });

  it('should accept custom block writer', async () => {
    const { LakehouseWriter } = await import('../writer.js');

    const mockBucket = createMockR2Bucket();
    const customWriter = new InMemoryBlockWriter();

    const writer = LakehouseWriter.withStrategies(
      { r2Bucket: mockBucket, tableLocation: 'test/table' },
      { blockWriter: customWriter }
    );

    expect(writer.getBlockWriter()).toBe(customWriter);
  });

  it('should accept custom compaction strategy', async () => {
    const { LakehouseWriter } = await import('../writer.js');

    const mockBucket = createMockR2Bucket();
    const noOpCompaction = new NoOpCompaction();

    const writer = LakehouseWriter.withStrategies(
      { r2Bucket: mockBucket, tableLocation: 'test/table' },
      { compactionStrategy: noOpCompaction }
    );

    expect(writer.getCompactionStrategy()).toBe(noOpCompaction);
  });

  it('should use default strategies when not injected', async () => {
    const { LakehouseWriter } = await import('../writer.js');

    const mockBucket = createMockR2Bucket();

    const writer = new LakehouseWriter({
      r2Bucket: mockBucket,
      tableLocation: 'test/table',
    });

    expect(writer.getBufferStrategy()).toBeInstanceOf(HybridBufferStrategy);
    expect(writer.getBlockWriter()).toBeInstanceOf(R2BlockWriterAdapter);
    expect(writer.getCompactionStrategy()).toBeInstanceOf(TimeBasedCompaction);
  });
});
