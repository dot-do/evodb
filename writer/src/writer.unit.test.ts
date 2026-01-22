import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LakehouseWriter } from './writer.js';
import type { R2Bucket, R2Object, WalEntry, PartitionMode } from './types.js';
import type { DOStorage } from './writer.js';
import {
  createMockR2Bucket as createGenericMockR2Bucket,
  createMockDOStorage as createGenericMockDOStorage,
  generateWalEntry,
} from '@evodb/test-utils';

// Wrap generic mock R2 bucket with vi.fn() spies for test assertions
function createMockR2Bucket(): R2Bucket {
  const baseBucket = createGenericMockR2Bucket();
  return {
    put: vi.fn(baseBucket.put),
    get: vi.fn(baseBucket.get),
    delete: vi.fn(baseBucket.delete),
    list: vi.fn(baseBucket.list),
    head: vi.fn(baseBucket.head),
  } as R2Bucket;
}

// Wrap generic mock DO storage with vi.fn() spies for test assertions
function createMockDOStorage(): DOStorage {
  const baseStorage = createGenericMockDOStorage();
  return {
    get: vi.fn(baseStorage.get),
    put: vi.fn(baseStorage.put),
    delete: vi.fn(baseStorage.delete),
    list: vi.fn(baseStorage.list),
  };
}

// Helper to create mock WAL entries using test-utils
function createMockWalEntry(lsn: number, data: string = 'test'): WalEntry {
  return generateWalEntry(lsn, data) as WalEntry;
}

describe('LakehouseWriter', () => {
  let mockBucket: R2Bucket;
  let writer: LakehouseWriter;

  beforeEach(() => {
    mockBucket = createMockR2Bucket();
    writer = new LakehouseWriter({
      r2Bucket: mockBucket,
      tableLocation: 'test/table',
      partitionMode: 'do-sqlite',
      bufferSize: 100,
      bufferTimeout: 1000,
    });
  });

  describe('constructor', () => {
    it('should create writer with default options', () => {
      const writer = new LakehouseWriter({
        r2Bucket: mockBucket,
        tableLocation: 'test/table',
      });

      expect(writer.getPartitionMode()).toBe('do-sqlite');
    });

    it('should create writer with edge-cache mode', () => {
      const writer = new LakehouseWriter({
        r2Bucket: mockBucket,
        tableLocation: 'test/table',
        partitionMode: 'edge-cache',
      });

      expect(writer.getPartitionMode()).toBe('edge-cache');
    });

    it('should create writer with enterprise mode', () => {
      const writer = new LakehouseWriter({
        r2Bucket: mockBucket,
        tableLocation: 'test/table',
        partitionMode: 'enterprise',
      });

      expect(writer.getPartitionMode()).toBe('enterprise');
    });
  });

  describe('receiveCDC', () => {
    it('should buffer CDC entries', async () => {
      const entries = [createMockWalEntry(1), createMockWalEntry(2)];

      await writer.receiveCDC('source-1', entries);

      const stats = writer.getStats();
      expect(stats.buffer.entryCount).toBe(2);
      expect(stats.operations.cdcEntriesReceived).toBe(2);
    });

    it('should track source statistics', async () => {
      await writer.receiveCDC('source-1', [createMockWalEntry(1)]);
      await writer.receiveCDC('source-2', [createMockWalEntry(2)]);

      const stats = writer.getStats();
      expect(stats.sources.size).toBe(2);

      const source1Stats = writer.getSourceStats('source-1');
      expect(source1Stats).toBeDefined();
      expect(source1Stats!.entriesReceived).toBe(1);
    });

    it('should ignore empty entries', async () => {
      await writer.receiveCDC('source-1', []);

      const stats = writer.getStats();
      expect(stats.buffer.entryCount).toBe(0);
      expect(stats.operations.cdcEntriesReceived).toBe(0);
    });
  });

  describe('shouldFlush', () => {
    it('should return false for empty buffer', () => {
      expect(writer.shouldFlush()).toBe(false);
    });

    it('should return true when buffer is full', async () => {
      const entries = Array.from({ length: 100 }, (_, i) => createMockWalEntry(i));
      await writer.receiveCDC('source-1', entries);

      expect(writer.shouldFlush()).toBe(true);
    });
  });

  describe('flush', () => {
    it('should return empty result for empty buffer', async () => {
      const result = await writer.flush();

      expect(result.status).toBe('empty');
      expect(result.entryCount).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return comprehensive stats', async () => {
      await writer.receiveCDC('source-1', [createMockWalEntry(1)]);

      const stats = writer.getStats();

      expect(stats.buffer).toBeDefined();
      expect(stats.partitionMode).toBe('do-sqlite');
      expect(stats.blocks).toBeDefined();
      expect(stats.operations).toBeDefined();
      expect(stats.timing).toBeDefined();
      expect(stats.sources).toBeDefined();
    });
  });

  describe('getTimeToFlush', () => {
    it('should return null for empty buffer', () => {
      expect(writer.getTimeToFlush()).toBeNull();
    });

    it('should return time for non-empty buffer', async () => {
      await writer.receiveCDC('source-1', [createMockWalEntry(1)]);

      const time = writer.getTimeToFlush();
      expect(time).not.toBeNull();
      expect(time!).toBeGreaterThan(0);
    });
  });

  describe('backpressure', () => {
    it('should not apply backpressure initially', () => {
      expect(writer.shouldApplyBackpressure()).toBe(false);
      expect(writer.getBackpressureDelay()).toBe(0);
    });
  });

  describe('source management', () => {
    it('should track connected sources', async () => {
      await writer.receiveCDC('source-1', [createMockWalEntry(1)]);
      await writer.receiveCDC('source-2', [createMockWalEntry(2)]);

      const connected = writer.getConnectedSources();
      expect(connected).toContain('source-1');
      expect(connected).toContain('source-2');
    });

    it('should mark source as disconnected', async () => {
      await writer.receiveCDC('source-1', [createMockWalEntry(1)]);
      writer.markSourceDisconnected('source-1');

      const connected = writer.getConnectedSources();
      expect(connected).not.toContain('source-1');
    });
  });

  describe('block index', () => {
    it('should start with empty block index', () => {
      const blocks = writer.getBlockIndex();
      expect(blocks.length).toBe(0);
    });
  });

  describe('pending blocks', () => {
    it('should start with no pending blocks', () => {
      expect(writer.getPendingBlockCount()).toBe(0);
    });
  });

  describe('next alarm time', () => {
    it('should return null for idle writer', () => {
      expect(writer.getNextAlarmTime()).toBeNull();
    });

    it('should return time for non-empty buffer', async () => {
      await writer.receiveCDC('source-1', [createMockWalEntry(1)]);

      const alarmTime = writer.getNextAlarmTime();
      expect(alarmTime).not.toBeNull();
      expect(alarmTime!).toBeGreaterThan(Date.now());
    });
  });

  describe('component access', () => {
    it('should provide R2 writer access', () => {
      const r2Writer = writer.getR2Writer();
      expect(r2Writer).toBeDefined();
    });

    it('should provide compactor access', () => {
      const compactor = writer.getCompactor();
      expect(compactor).toBeDefined();
    });
  });

  describe('compaction metrics', () => {
    it('should return compaction metrics', () => {
      const metrics = writer.getCompactionMetrics();

      expect(metrics.totalBlocks).toBe(0);
      expect(metrics.smallBlocks).toBe(0);
      expect(metrics.compactedBlocks).toBe(0);
      expect(metrics.partitionMode).toBe('do-sqlite');
    });
  });

  describe('compaction scheduler status', () => {
    it('should return scheduler status', () => {
      const status = writer.getCompactionSchedulerStatus();

      expect(status.running).toBe(false);
      expect(status.lastCompactionTime).toBeNull();
      expect(status.consecutiveFailures).toBe(0);
      expect(status.partitionMode).toBe('do-sqlite');
    });
  });

  describe('DO storage integration', () => {
    it('should set DO storage', () => {
      const mockStorage = createMockDOStorage();
      writer.setDOStorage(mockStorage);

      // No error means success
      expect(true).toBe(true);
    });

    it('should load state from DO storage', async () => {
      const mockStorage = createMockDOStorage();
      writer.setDOStorage(mockStorage);

      await writer.loadState();

      expect(mockStorage.get).toHaveBeenCalledWith('writer:state');
    });

    it('should save state to DO storage', async () => {
      const mockStorage = createMockDOStorage();
      writer.setDOStorage(mockStorage);

      await writer.saveState();

      expect(mockStorage.put).toHaveBeenCalled();
    });
  });

  describe('partition modes', () => {
    it.each([
      ['do-sqlite' as PartitionMode, 2 * 1024 * 1024],
      ['edge-cache' as PartitionMode, 128 * 1024 * 1024],
      ['enterprise' as PartitionMode, 1024 * 1024 * 1024],
    ])('should configure %s mode correctly', (mode, expectedBlockSize) => {
      const writer = new LakehouseWriter({
        r2Bucket: mockBucket,
        tableLocation: 'test/table',
        partitionMode: mode,
      });

      expect(writer.getPartitionMode()).toBe(mode);
    });
  });
});

describe('LakehouseWriter retry behavior', () => {
  let failingBucket: R2Bucket;

  beforeEach(() => {
    let callCount = 0;
    failingBucket = {
      put: vi.fn(async () => {
        callCount++;
        if (callCount < 3) {
          throw new Error('Simulated R2 failure');
        }
        return {
          key: 'test',
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
  });

  it('should fallback to DO storage on R2 failure', async () => {
    const mockStorage = createMockDOStorage();
    const alwaysFailingBucket: R2Bucket = {
      put: vi.fn(async () => { throw new Error('R2 always fails'); }),
      get: vi.fn(async () => null),
      delete: vi.fn(async () => {}),
      list: vi.fn(async () => ({ objects: [], truncated: false, delimitedPrefixes: [] })),
      head: vi.fn(async () => null),
    };

    const writer = new LakehouseWriter({
      r2Bucket: alwaysFailingBucket,
      tableLocation: 'test/table',
      maxRetries: 1,
      retryBackoffMs: 1,
    });
    writer.setDOStorage(mockStorage);

    await writer.receiveCDC('source-1', [createMockWalEntry(1), createMockWalEntry(2)]);

    const result = await writer.flush();

    // Should fail R2 and fallback to DO
    expect(result.status).toBe('buffered');
    expect(result.location).toBe('do');
    expect(result.retryScheduled).toBe(true);
    expect(result.error).toBeDefined();

    // Should have pending blocks
    expect(writer.getPendingBlockCount()).toBe(1);
  });
});

describe('LakehouseWriter defensive null checks', () => {
  let mockBucket: R2Bucket;

  beforeEach(() => {
    mockBucket = createMockR2Bucket();
  });

  describe('receiveCDC validation', () => {
    it('should throw error when sourceDoId is null', async () => {
      const writer = new LakehouseWriter({
        r2Bucket: mockBucket,
        tableLocation: 'test/table',
      });

      const entries = [createMockWalEntry(1)];

      await expect(writer.receiveCDC(null as unknown as string, entries)).rejects.toThrow('Invalid sourceDoId');
    });

    it('should throw error when sourceDoId is undefined', async () => {
      const writer = new LakehouseWriter({
        r2Bucket: mockBucket,
        tableLocation: 'test/table',
      });

      const entries = [createMockWalEntry(1)];

      await expect(writer.receiveCDC(undefined as unknown as string, entries)).rejects.toThrow('Invalid sourceDoId');
    });

    it('should throw error when sourceDoId is empty string', async () => {
      const writer = new LakehouseWriter({
        r2Bucket: mockBucket,
        tableLocation: 'test/table',
      });

      const entries = [createMockWalEntry(1)];

      await expect(writer.receiveCDC('', entries)).rejects.toThrow('Invalid sourceDoId');
    });

    it('should handle null entries array gracefully', async () => {
      const writer = new LakehouseWriter({
        r2Bucket: mockBucket,
        tableLocation: 'test/table',
      });

      // Should not throw, just return early
      await writer.receiveCDC('source-1', null as unknown as WalEntry[]);

      const stats = writer.getStats();
      expect(stats.buffer.entryCount).toBe(0);
    });

    it('should throw error when last entry has null LSN', async () => {
      const writer = new LakehouseWriter({
        r2Bucket: mockBucket,
        tableLocation: 'test/table',
      });

      const entryWithNullLsn = {
        lsn: null as unknown as bigint,
        timestamp: BigInt(Date.now()),
        op: 1,
        flags: 0,
        data: new Uint8Array([1, 2, 3]),
        checksum: 12345,
      };

      await expect(writer.receiveCDC('source-1', [entryWithNullLsn])).rejects.toThrow('Invalid WAL entry');
    });
  });

  describe('loadState with corrupted data', () => {
    it('should handle corrupted state gracefully', async () => {
      const writer = new LakehouseWriter({
        r2Bucket: mockBucket,
        tableLocation: 'test/table',
      });

      const mockStorage: DOStorage = {
        get: vi.fn(async () => ({
          // Partially corrupted state - missing required fields
          lastBlockSeq: null,
          pendingBlocks: null,
          blockIndex: null,
          sourceCursors: null,
          stats: null,
        })),
        put: vi.fn(async () => {}),
        delete: vi.fn(async () => true),
        list: vi.fn(async () => new Map()),
      };

      writer.setDOStorage(mockStorage);

      // Should not throw, but handle gracefully with defaults
      await writer.loadState();

      const stats = writer.getStats();
      expect(stats.blocks.r2BlockCount).toBe(0);
    });

    it('should handle invalid BigInt in source cursors', async () => {
      const writer = new LakehouseWriter({
        r2Bucket: mockBucket,
        tableLocation: 'test/table',
      });

      const mockStorage: DOStorage = {
        get: vi.fn(async () => ({
          lastBlockSeq: 5,
          pendingBlocks: [],
          blockIndex: [],
          lastSnapshotId: 0,
          partitionMode: 'do-sqlite',
          sourceCursors: {
            'source-1': 'not-a-valid-bigint',  // Invalid BigInt string
            'source-2': '12345',  // Valid
          },
          stats: {
            cdcEntriesReceived: 10,
            flushCount: 2,
            compactCount: 0,
            r2WriteFailures: 0,
          },
        })),
        put: vi.fn(async () => {}),
        delete: vi.fn(async () => true),
        list: vi.fn(async () => new Map()),
      };

      writer.setDOStorage(mockStorage);

      // Should not throw, skip invalid entries
      await writer.loadState();

      // source-1 should be skipped, source-2 should be loaded
      const source2Stats = writer.getSourceStats('source-2');
      expect(source2Stats).toBeDefined();
      expect(source2Stats!.lastLsn).toBe(12345n);

      // source-1 should not exist due to invalid BigInt
      const source1Stats = writer.getSourceStats('source-1');
      expect(source1Stats).toBeUndefined();
    });
  });

  describe('saveState error handling', () => {
    it('should throw error with message when DO storage fails', async () => {
      const writer = new LakehouseWriter({
        r2Bucket: mockBucket,
        tableLocation: 'test/table',
      });

      const mockStorage: DOStorage = {
        get: vi.fn(async () => undefined),
        put: vi.fn(async () => { throw new Error('Storage write failed'); }),
        delete: vi.fn(async () => true),
        list: vi.fn(async () => new Map()),
      };

      writer.setDOStorage(mockStorage);

      await expect(writer.saveState()).rejects.toThrow('State persistence failed');
      await expect(writer.saveState()).rejects.toThrow('Storage write failed');
    });
  });

  describe('source stats with null values', () => {
    it('should skip source with null lastLsn when saving state', async () => {
      const writer = new LakehouseWriter({
        r2Bucket: mockBucket,
        tableLocation: 'test/table',
      });

      // Receive valid CDC to create source stats
      await writer.receiveCDC('source-1', [createMockWalEntry(100)]);

      let capturedState: Record<string, unknown> | null = null;
      const mockStorage: DOStorage = {
        get: vi.fn(async () => undefined),
        put: vi.fn(async (_key: string, value: unknown) => {
          capturedState = value as Record<string, unknown>;
        }),
        delete: vi.fn(async () => true),
        list: vi.fn(async () => new Map()),
      };

      writer.setDOStorage(mockStorage);
      await writer.saveState();

      // Verify source cursor was saved
      expect(capturedState).not.toBeNull();
      const sourceCursors = capturedState!.sourceCursors as Record<string, string>;
      expect(sourceCursors['source-1']).toBe('100');
    });
  });
});
