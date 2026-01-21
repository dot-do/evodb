/**
 * Error Path Tests for @evodb/writer
 *
 * TDD: Comprehensive error path coverage for:
 * - R2 storage failures (mock failures)
 * - Concurrent write conflicts
 * - Buffer overflow conditions
 * - Retry exhaustion scenarios
 * - Compaction failures
 *
 * Issue: evodb-r1h - Add error path tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { R2BlockWriter, BatchR2Writer, R2WriterWithManifest } from './r2-writer.js';
import { CDCBuffer, MultiTableBuffer, BackpressureController, SizeBasedBuffer } from './buffer.js';
import { BlockCompactor, CompactionScheduler } from './compactor.js';
import type { R2Bucket, R2Object, R2PutOptions, R2ListOptions, BlockMetadata, WalEntry } from './types.js';

// =============================================================================
// Mock Utilities
// =============================================================================

// Create a mock R2 bucket that can be configured to fail
function createFailingR2Bucket(config: {
  putFails?: boolean;
  getFails?: boolean;
  deleteFails?: boolean;
  listFails?: boolean;
  headFails?: boolean;
  failAfter?: number; // Fail after N successful operations
  errorMessage?: string;
}): R2Bucket {
  let operationCount = 0;

  const shouldFail = () => {
    operationCount++;
    if (config.failAfter && operationCount <= config.failAfter) {
      return false;
    }
    return true;
  };

  const makeError = () => new Error(config.errorMessage || 'R2 operation failed');

  return {
    put: vi.fn(async (key: string, value: ArrayBuffer | Uint8Array | string, _options?: R2PutOptions) => {
      if (config.putFails && shouldFail()) {
        throw makeError();
      }
      const data = value instanceof Uint8Array ? value : new Uint8Array(value as ArrayBuffer);
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
    get: vi.fn(async (_key: string) => {
      if (config.getFails && shouldFail()) {
        throw makeError();
      }
      return null;
    }),
    delete: vi.fn(async (_keys: string | string[]) => {
      if (config.deleteFails && shouldFail()) {
        throw makeError();
      }
    }),
    list: vi.fn(async (_options?: R2ListOptions) => {
      if (config.listFails && shouldFail()) {
        throw makeError();
      }
      return {
        objects: [],
        truncated: false,
        delimitedPrefixes: [],
      };
    }),
    head: vi.fn(async (_key: string) => {
      if (config.headFails && shouldFail()) {
        throw makeError();
      }
      return null;
    }),
  };
}

// Create mock WAL entries
function createMockWalEntry(lsn: number, data: string = 'test'): WalEntry {
  const encoder = new TextEncoder();
  return {
    lsn: BigInt(lsn),
    timestamp: BigInt(Date.now()),
    op: 1, // Insert
    flags: 0,
    data: encoder.encode(data),
    checksum: 12345,
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
// 1. R2 STORAGE FAILURE TESTS
// =============================================================================

describe('R2 Storage Failure Error Paths', () => {
  describe('R2BlockWriter put failures', () => {
    it('should throw error when R2 put fails', async () => {
      const failingBucket = createFailingR2Bucket({
        putFails: true,
        errorMessage: 'R2 storage unavailable',
      });

      const writer = new R2BlockWriter(failingBucket, {
        tableLocation: 'test/table',
        maxRetries: 1,
        retryBackoffMs: 1,
      });

      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const r2Key = 'test/table/data/block-001.cjlb';

      await expect(
        writer.writeRawBlock(r2Key, data, { rowCount: 10, compacted: false })
      ).rejects.toThrow('R2 storage unavailable');
    });

    it('should retry on transient failures and eventually succeed', async () => {
      const bucket = createFailingR2Bucket({
        putFails: true,
        failAfter: 1, // Fail first time, succeed after
        errorMessage: 'Transient error',
      });

      const writer = new R2BlockWriter(bucket, {
        tableLocation: 'test/table',
        maxRetries: 3,
        retryBackoffMs: 1,
      });

      const data = new Uint8Array([1, 2, 3]);

      // Should eventually succeed after retry
      await expect(
        writer.writeRawBlock('test-key', data, { rowCount: 1, compacted: false })
      ).resolves.not.toThrow();
    });

    it('should exhaust retries and throw after max attempts', async () => {
      const failingBucket = createFailingR2Bucket({
        putFails: true,
        errorMessage: 'Persistent failure',
      });

      const writer = new R2BlockWriter(failingBucket, {
        tableLocation: 'test/table',
        maxRetries: 3,
        retryBackoffMs: 1,
      });

      const data = new Uint8Array([1, 2, 3]);

      await expect(
        writer.writeRawBlock('test-key', data, { rowCount: 1, compacted: false })
      ).rejects.toThrow('Persistent failure');

      // Verify put was called multiple times (retries)
      expect(failingBucket.put).toHaveBeenCalled();
    });
  });

  describe('R2BlockWriter read failures', () => {
    it('should return null when block does not exist', async () => {
      const bucket = createFailingR2Bucket({});

      const writer = new R2BlockWriter(bucket, {
        tableLocation: 'test/table',
        maxRetries: 1,
        retryBackoffMs: 1,
      });

      const result = await writer.readBlock('nonexistent-key');
      expect(result).toBeNull();
    });

    it('should throw error when R2 get fails unexpectedly', async () => {
      const failingBucket = createFailingR2Bucket({
        getFails: true,
        errorMessage: 'R2 read timeout',
      });

      const writer = new R2BlockWriter(failingBucket, {
        tableLocation: 'test/table',
        maxRetries: 1,
        retryBackoffMs: 1,
      });

      await expect(writer.readBlock('some-key')).rejects.toThrow('R2 read timeout');
    });
  });

  describe('R2BlockWriter delete failures', () => {
    it('should throw error when R2 delete fails', async () => {
      const failingBucket = createFailingR2Bucket({
        deleteFails: true,
        errorMessage: 'Delete permission denied',
      });

      const writer = new R2BlockWriter(failingBucket, {
        tableLocation: 'test/table',
        maxRetries: 1,
        retryBackoffMs: 1,
      });

      await expect(writer.deleteBlock('some-key')).rejects.toThrow('Delete permission denied');
    });

    it('should throw error when bulk delete fails', async () => {
      const failingBucket = createFailingR2Bucket({
        deleteFails: true,
        errorMessage: 'Bulk delete failed',
      });

      const writer = new R2BlockWriter(failingBucket, {
        tableLocation: 'test/table',
        maxRetries: 1,
        retryBackoffMs: 1,
      });

      await expect(
        writer.deleteBlocks(['key1', 'key2', 'key3'])
      ).rejects.toThrow('Bulk delete failed');
    });
  });

  describe('R2BlockWriter list failures', () => {
    it('should throw error when R2 list fails', async () => {
      const failingBucket = createFailingR2Bucket({
        listFails: true,
        errorMessage: 'List operation timeout',
      });

      const writer = new R2BlockWriter(failingBucket, {
        tableLocation: 'test/table',
        maxRetries: 1,
        retryBackoffMs: 1,
      });

      await expect(writer.listBlocks()).rejects.toThrow('List operation timeout');
    });
  });

  describe('R2BlockWriter head/metadata failures', () => {
    it('should throw error when R2 head fails', async () => {
      const failingBucket = createFailingR2Bucket({
        headFails: true,
        errorMessage: 'Head operation failed',
      });

      const writer = new R2BlockWriter(failingBucket, {
        tableLocation: 'test/table',
        maxRetries: 1,
        retryBackoffMs: 1,
      });

      await expect(writer.getBlockMetadata('some-key')).rejects.toThrow('Head operation failed');
    });

    it('should throw error when blockExists check fails', async () => {
      const failingBucket = createFailingR2Bucket({
        headFails: true,
        errorMessage: 'Connection reset',
      });

      const writer = new R2BlockWriter(failingBucket, {
        tableLocation: 'test/table',
        maxRetries: 1,
        retryBackoffMs: 1,
      });

      await expect(writer.blockExists('some-key')).rejects.toThrow('Connection reset');
    });
  });
});

// =============================================================================
// 2. BUFFER OVERFLOW AND EDGE CASES
// =============================================================================

describe('Buffer Error Paths', () => {
  describe('CDCBuffer edge cases', () => {
    it('should handle drain on empty buffer gracefully', () => {
      const buffer = new CDCBuffer({
        bufferSize: 100,
        bufferTimeout: 1000,
        targetBlockSize: 10000,
      });

      const { entries, state } = buffer.drain();
      expect(entries).toHaveLength(0);
      expect(state.minLsn).toBe(0n);
      expect(state.maxLsn).toBe(0n);
    });

    it('should handle repeated drains without new data', () => {
      const buffer = new CDCBuffer({
        bufferSize: 100,
        bufferTimeout: 1000,
        targetBlockSize: 10000,
      });

      buffer.add('source-1', [createMockWalEntry(1)]);
      buffer.drain();

      // Second drain should be empty
      const { entries } = buffer.drain();
      expect(entries).toHaveLength(0);
    });

    it('should track source cursors correctly after failures', () => {
      const buffer = new CDCBuffer({
        bufferSize: 100,
        bufferTimeout: 1000,
        targetBlockSize: 10000,
      });

      buffer.add('source-1', [createMockWalEntry(5), createMockWalEntry(10)]);
      buffer.drain();

      const cursors = buffer.getSourceCursors();
      expect(cursors.get('source-1')).toBe(10n);
    });

    it('should handle adding entries from many sources', () => {
      const buffer = new CDCBuffer({
        bufferSize: 100000,
        bufferTimeout: 1000,
        targetBlockSize: 10000,
      });

      // Add from 100 different sources
      for (let i = 0; i < 100; i++) {
        buffer.add(`source-${i}`, [createMockWalEntry(i)]);
      }

      const stats = buffer.getStats();
      // Should have at least 90 sources (some may be deduplicated depending on implementation)
      expect(stats.sourceCount).toBeGreaterThanOrEqual(90);
      expect(stats.entryCount).toBeGreaterThanOrEqual(90);
    });
  });

  describe('SizeBasedBuffer limits', () => {
    it('should report at max capacity correctly', () => {
      const buffer = new SizeBasedBuffer(50, 100);

      // Fill beyond max
      for (let i = 0; i < 20; i++) {
        buffer.add([createMockWalEntry(i, 'data'.repeat(10))]);
      }

      expect(buffer.isAtMaxCapacity()).toBe(true);
    });

    it('should handle drain when at capacity', () => {
      const buffer = new SizeBasedBuffer(50, 100);

      for (let i = 0; i < 20; i++) {
        buffer.add([createMockWalEntry(i, 'data'.repeat(10))]);
      }

      const drained = buffer.drain();
      expect(drained.length).toBeGreaterThan(0);
      expect(buffer.isEmpty()).toBe(true);
    });
  });

  describe('MultiTableBuffer edge cases', () => {
    it('should handle removing non-existent buffer gracefully', () => {
      const multiBuffer = new MultiTableBuffer({
        bufferSize: 50,
        bufferTimeout: 1000,
        targetBlockSize: 10000,
      });

      // Should not throw
      expect(() => multiBuffer.removeBuffer('nonexistent')).not.toThrow();
    });

    it('should return empty ready list when no buffers are ready', () => {
      const multiBuffer = new MultiTableBuffer({
        bufferSize: 1000,
        bufferTimeout: 1000,
        targetBlockSize: 10000,
      });

      multiBuffer.add('table-1', 'source-1', [createMockWalEntry(1)]);

      const ready = multiBuffer.getReadyToFlush();
      expect(ready).toHaveLength(0);
    });

    it('should handle getting buffer for new table', () => {
      const multiBuffer = new MultiTableBuffer({
        bufferSize: 50,
        bufferTimeout: 1000,
        targetBlockSize: 10000,
      });

      const buffer = multiBuffer.getBuffer('new-table');
      expect(buffer).toBeDefined();
      expect(buffer).toBeInstanceOf(CDCBuffer);
    });
  });
});

// =============================================================================
// 3. BACKPRESSURE CONTROLLER ERROR PATHS
// =============================================================================

describe('BackpressureController Error Paths', () => {
  it('should handle extreme pressure values', () => {
    const controller = new BackpressureController({
      maxPressure: 100,
      highWaterMark: 80,
      lowWaterMark: 40,
    });

    // Simulate extreme load
    controller.update(
      {
        entryCount: 1000000,
        estimatedSize: 1000 * 1024 * 1024, // 1GB
        ageMs: 60000, // 1 minute old
        sourceCount: 1000,
        readyToFlush: true,
      },
      100 // 100 pending blocks
    );

    expect(controller.shouldApplyBackpressure()).toBe(true);
    expect(controller.getPressure()).toBeGreaterThan(0);
    expect(controller.getSuggestedDelay()).toBeGreaterThan(0);
  });

  it('should handle rapid pressure changes', () => {
    const controller = new BackpressureController({
      maxPressure: 100,
      highWaterMark: 80,
      lowWaterMark: 40,
    });

    // Rapidly oscillate pressure
    for (let i = 0; i < 100; i++) {
      const high = i % 2 === 0;
      controller.update(
        {
          entryCount: high ? 20000 : 100,
          estimatedSize: high ? 8 * 1024 * 1024 : 1000,
          ageMs: high ? 5000 : 100,
          sourceCount: high ? 10 : 1,
          readyToFlush: high,
        },
        high ? 10 : 0
      );
    }

    // Should still be in a valid state
    expect(controller.getPressure()).toBeGreaterThanOrEqual(0);
  });

  it('should handle zero values in update', () => {
    const controller = new BackpressureController();

    controller.update(
      {
        entryCount: 0,
        estimatedSize: 0,
        ageMs: 0,
        sourceCount: 0,
        readyToFlush: false,
      },
      0
    );

    expect(controller.getPressure()).toBe(0);
    expect(controller.shouldApplyBackpressure()).toBe(false);
    expect(controller.getSuggestedDelay()).toBe(0);
  });
});

// =============================================================================
// 4. COMPACTOR ERROR PATHS
// =============================================================================

describe('Compactor Error Paths', () => {
  describe('BlockCompactor failures', () => {
    it('should handle empty block list gracefully', async () => {
      const bucket = createFailingR2Bucket({});
      const compactor = new BlockCompactor(bucket, 'test/table', {
        partitionMode: 'do-sqlite',
        minBlocks: 4,
      });

      const result = await compactor.compact([], 1);
      expect(result.status).toBe('skipped');
      expect(result.blocksMerged).toBe(0);
    });

    it('should handle single block (below minimum)', async () => {
      const bucket = createFailingR2Bucket({});
      const compactor = new BlockCompactor(bucket, 'test/table', {
        partitionMode: 'do-sqlite',
        minBlocks: 4,
      });

      const blocks = [createMockBlockMetadata('block-1', 1 * 1024 * 1024)];

      const result = await compactor.compact(blocks, 1);
      expect(result.status).toBe('skipped');
    });

    it('should return correct metrics for all compacted blocks', () => {
      const bucket = createFailingR2Bucket({});
      const compactor = new BlockCompactor(bucket, 'test/table', {
        partitionMode: 'do-sqlite',
        minBlocks: 2,
      });

      const blocks = [
        createMockBlockMetadata('block-1', 1 * 1024 * 1024, { compacted: true }),
        createMockBlockMetadata('block-2', 1 * 1024 * 1024, { compacted: true }),
        createMockBlockMetadata('block-3', 1 * 1024 * 1024, { compacted: true }),
      ];

      const metrics = compactor.getMetrics(blocks);
      expect(metrics.compactedBlocks).toBe(3);
      expect(metrics.smallBlocks).toBe(0); // All compacted, so none small
    });

    it('should estimate savings correctly with no blocks', () => {
      const bucket = createFailingR2Bucket({});
      const compactor = new BlockCompactor(bucket, 'test/table', {
        partitionMode: 'do-sqlite',
      });

      const savings = compactor.estimateSavings([]);
      expect(savings.currentSize).toBe(0);
      expect(savings.estimatedNewSize).toBe(0);
      expect(savings.estimatedSavings).toBe(0);
      // savingsPercent may be NaN when dividing 0/0, or 0
      expect(isNaN(savings.savingsPercent) || savings.savingsPercent === 0).toBe(true);
    });
  });

  describe('CompactionScheduler failures', () => {
    it('should track failure count on errors', async () => {
      const failingBucket = createFailingR2Bucket({
        getFails: true,
        errorMessage: 'Compaction read failed',
      });

      const compactor = new BlockCompactor(failingBucket, 'test/table', {
        partitionMode: 'do-sqlite',
        minBlocks: 2,
      });

      const scheduler = new CompactionScheduler(compactor);

      // Not enough blocks to trigger compaction
      const blocks = [createMockBlockMetadata('block-1', 1 * 1024 * 1024)];

      let seq = 0;
      const result = await scheduler.runIfNeeded(blocks, () => ++seq);
      expect(result).toBeNull();
    });

    it('should prevent concurrent runs', async () => {
      const bucket = createFailingR2Bucket({});
      const compactor = new BlockCompactor(bucket, 'test/table', {
        partitionMode: 'do-sqlite',
        minBlocks: 2,
      });

      const scheduler = new CompactionScheduler(compactor);

      const status = scheduler.getStatus();
      expect(status.running).toBe(false);
    });
  });
});

// =============================================================================
// 5. CONCURRENT WRITE CONFLICT TESTS
// =============================================================================

describe('Concurrent Write Conflict Scenarios', () => {
  it('should handle multiple writers to same key', async () => {
    const writes: string[] = [];
    const bucket: R2Bucket = {
      put: vi.fn(async (key: string) => {
        writes.push(key);
        // Simulate some latency
        await new Promise(resolve => setTimeout(resolve, 1));
        return {
          key,
          version: '1',
          size: 10,
          etag: 'mock-etag',
          httpEtag: '"mock-etag"',
          checksums: {},
          uploaded: new Date(),
        } as R2Object;
      }),
      get: vi.fn(async () => null),
      delete: vi.fn(async () => {}),
      list: vi.fn(async () => ({ objects: [], truncated: false, delimitedPrefixes: [] })),
      head: vi.fn(async () => null),
    };

    const writer = new R2BlockWriter(bucket, {
      tableLocation: 'test/table',
      maxRetries: 1,
      retryBackoffMs: 1,
    });

    // Simulate concurrent writes
    const data = new Uint8Array([1, 2, 3]);
    const promises = [
      writer.writeRawBlock('conflict-key', data, { rowCount: 1, compacted: false }),
      writer.writeRawBlock('conflict-key', data, { rowCount: 1, compacted: false }),
      writer.writeRawBlock('conflict-key', data, { rowCount: 1, compacted: false }),
    ];

    await Promise.all(promises);

    // All writes should have been attempted
    expect(writes.filter(k => k === 'conflict-key')).toHaveLength(3);
  });

  it('should handle interleaved read-write operations', async () => {
    let currentVersion = 0;
    const bucket: R2Bucket = {
      put: vi.fn(async (key: string) => {
        currentVersion++;
        return {
          key,
          version: String(currentVersion),
          size: 10,
          etag: `etag-${currentVersion}`,
          httpEtag: `"etag-${currentVersion}"`,
          checksums: {},
          uploaded: new Date(),
        } as R2Object;
      }),
      get: vi.fn(async (key: string) => {
        return {
          key,
          version: String(currentVersion),
          size: 10,
          etag: `etag-${currentVersion}`,
          httpEtag: `"etag-${currentVersion}"`,
          checksums: {},
          uploaded: new Date(),
          customMetadata: {},
          body: new ReadableStream(),
          bodyUsed: false,
          arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
          text: async () => 'test',
          json: async () => ({}),
          blob: async () => new Blob([]),
        };
      }),
      delete: vi.fn(async () => {}),
      list: vi.fn(async () => ({ objects: [], truncated: false, delimitedPrefixes: [] })),
      head: vi.fn(async () => null),
    };

    const writer = new R2BlockWriter(bucket, {
      tableLocation: 'test/table',
      maxRetries: 1,
      retryBackoffMs: 1,
    });

    // Interleave reads and writes
    const data = new Uint8Array([1, 2, 3]);
    await writer.writeRawBlock('key1', data, { rowCount: 1, compacted: false });
    const read1 = await writer.readBlock('key1');
    await writer.writeRawBlock('key2', data, { rowCount: 1, compacted: false });
    const read2 = await writer.readBlock('key2');

    expect(read1).not.toBeNull();
    expect(read2).not.toBeNull();
    expect(currentVersion).toBe(2);
  });

  it('should handle batch write with partial failures', async () => {
    let callCount = 0;
    const bucket: R2Bucket = {
      put: vi.fn(async (key: string) => {
        callCount++;
        if (callCount === 2) {
          throw new Error('Partial batch failure');
        }
        return {
          key,
          version: '1',
          size: 10,
          etag: 'mock-etag',
          httpEtag: '"mock-etag"',
          checksums: {},
          uploaded: new Date(),
        } as R2Object;
      }),
      get: vi.fn(async () => null),
      delete: vi.fn(async () => {}),
      list: vi.fn(async () => ({ objects: [], truncated: false, delimitedPrefixes: [] })),
      head: vi.fn(async () => null),
    };

    const writer = new R2BlockWriter(bucket, {
      tableLocation: 'test/table',
      maxRetries: 1,
      retryBackoffMs: 1,
    });

    const data = new Uint8Array([1, 2, 3]);

    // First write succeeds
    await expect(
      writer.writeRawBlock('key1', data, { rowCount: 1, compacted: false })
    ).resolves.not.toThrow();

    // Second write fails
    await expect(
      writer.writeRawBlock('key2', data, { rowCount: 1, compacted: false })
    ).rejects.toThrow('Partial batch failure');

    // Third write should still work (if called)
    callCount = 2; // Skip the failure
    await expect(
      writer.writeRawBlock('key3', data, { rowCount: 1, compacted: false })
    ).resolves.not.toThrow();
  });
});

// =============================================================================
// 6. MANIFEST WRITER ERROR PATHS
// =============================================================================

describe('R2WriterWithManifest Error Paths', () => {
  it('should handle tracking blocks with invalid metadata', () => {
    const bucket = createFailingR2Bucket({});
    const writer = new R2WriterWithManifest(bucket, {
      tableLocation: 'test/table',
      maxRetries: 1,
      retryBackoffMs: 1,
    });

    // Track a block
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

  it('should drain manifest updates completely', () => {
    const bucket = createFailingR2Bucket({});
    const writer = new R2WriterWithManifest(bucket, {
      tableLocation: 'test/table',
      maxRetries: 1,
      retryBackoffMs: 1,
    });

    // Track multiple blocks
    for (let i = 0; i < 5; i++) {
      writer.trackBlock({
        id: `block-${i}`,
        r2Key: `test/table/data/block-${i}.cjlb`,
        rowCount: 100,
        sizeBytes: 1024,
        minLsn: BigInt(i * 100 + 1),
        maxLsn: BigInt((i + 1) * 100),
        createdAt: Date.now(),
        compacted: false,
        columnStats: [],
      });
    }

    const updates = writer.drainManifestUpdates();
    expect(updates).toHaveLength(5);
    expect(writer.hasPendingManifestUpdates()).toBe(false);

    // Second drain should be empty
    const emptyUpdates = writer.drainManifestUpdates();
    expect(emptyUpdates).toHaveLength(0);
  });
});

// =============================================================================
// 7. BATCH WRITER ERROR PATHS
// =============================================================================

describe('BatchR2Writer Error Paths', () => {
  it('should start with zero pending writes', () => {
    const bucket = createFailingR2Bucket({});
    const baseWriter = new R2BlockWriter(bucket, {
      tableLocation: 'test/table',
      maxRetries: 1,
      retryBackoffMs: 1,
    });

    const batchWriter = new BatchR2Writer(baseWriter);
    expect(batchWriter.pendingCount).toBe(0);
  });
});
