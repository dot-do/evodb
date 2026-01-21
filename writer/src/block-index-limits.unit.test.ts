/**
 * Block Index Limits Tests
 *
 * Tests for enforcing limits on the block index size to prevent
 * unbounded memory growth in the LakehouseWriter.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LakehouseWriter } from './writer.js';
import type { R2Bucket, R2Object, WalEntry, BlockMetadata } from './types.js';
import type { DOStorage } from './writer.js';
import {
  createMockR2Bucket as createGenericMockR2Bucket,
  createMockDOStorage as createGenericMockDOStorage,
  generateWalEntry,
} from '@evodb/test-utils';

// Import errors (these should be created)
import { BlockIndexLimitError } from './errors.js';

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

// Helper to create a mock block metadata
function createMockBlockMetadata(id: string, seq: number): BlockMetadata {
  return {
    id,
    r2Key: `test/table/blocks/${id}.bin`,
    rowCount: 100,
    sizeBytes: 1024,
    minLsn: BigInt(seq * 100),
    maxLsn: BigInt(seq * 100 + 99),
    createdAt: Date.now() - (1000 - seq) * 1000, // Older blocks have earlier timestamps
    compacted: false,
  };
}

describe('Block Index Limits', () => {
  let mockBucket: R2Bucket;

  beforeEach(() => {
    mockBucket = createMockR2Bucket();
  });

  describe('maxBlockIndexSize option', () => {
    it('should accept maxBlockIndexSize option in constructor', () => {
      const writer = new LakehouseWriter({
        r2Bucket: mockBucket,
        tableLocation: 'test/table',
        maxBlockIndexSize: 1000,
      });

      expect(writer).toBeDefined();
    });

    it('should have a sensible default limit of 100,000 entries', () => {
      const writer = new LakehouseWriter({
        r2Bucket: mockBucket,
        tableLocation: 'test/table',
      });

      // Access the resolved options to check default
      const stats = writer.getStats();
      expect(stats.blocks.maxBlockIndexSize).toBe(100_000);
    });

    it('should allow configuring a custom limit', () => {
      const writer = new LakehouseWriter({
        r2Bucket: mockBucket,
        tableLocation: 'test/table',
        maxBlockIndexSize: 500,
      });

      const stats = writer.getStats();
      expect(stats.blocks.maxBlockIndexSize).toBe(500);
    });
  });

  describe('BlockIndexLimitError', () => {
    it('should throw BlockIndexLimitError when limit is exceeded without eviction', async () => {
      const writer = new LakehouseWriter({
        r2Bucket: mockBucket,
        tableLocation: 'test/table',
        maxBlockIndexSize: 5,
        blockIndexEvictionPolicy: 'none', // No eviction, just error
        bufferSize: 10,
        bufferTimeout: 100000,
      });

      // Manually add blocks to the index to simulate growth
      // This requires internal access or many flush operations
      for (let i = 0; i < 5; i++) {
        const entries = Array.from({ length: 10 }, (_, j) =>
          createMockWalEntry(i * 10 + j)
        );
        await writer.receiveCDC('source-1', entries);
        await writer.flush();
      }

      // The 6th block should trigger the error
      const entries = Array.from({ length: 10 }, (_, j) =>
        createMockWalEntry(50 + j)
      );
      await writer.receiveCDC('source-1', entries);

      await expect(writer.flush()).rejects.toThrow(BlockIndexLimitError);
    });

    it('should include current size and limit in error message', async () => {
      const writer = new LakehouseWriter({
        r2Bucket: mockBucket,
        tableLocation: 'test/table',
        maxBlockIndexSize: 3,
        blockIndexEvictionPolicy: 'none',
        bufferSize: 10,
        bufferTimeout: 100000,
      });

      // Fill up the index
      for (let i = 0; i < 3; i++) {
        const entries = Array.from({ length: 10 }, (_, j) =>
          createMockWalEntry(i * 10 + j)
        );
        await writer.receiveCDC('source-1', entries);
        await writer.flush();
      }

      // Trigger the error
      const entries = Array.from({ length: 10 }, (_, j) =>
        createMockWalEntry(30 + j)
      );
      await writer.receiveCDC('source-1', entries);

      try {
        await writer.flush();
        expect.fail('Should have thrown BlockIndexLimitError');
      } catch (error) {
        expect(error).toBeInstanceOf(BlockIndexLimitError);
        expect((error as BlockIndexLimitError).currentSize).toBe(3);
        expect((error as BlockIndexLimitError).limit).toBe(3);
        expect((error as BlockIndexLimitError).message).toContain('3');
      }
    });
  });

  describe('LRU eviction policy', () => {
    it('should evict oldest entries when limit is reached with lru policy', async () => {
      const writer = new LakehouseWriter({
        r2Bucket: mockBucket,
        tableLocation: 'test/table',
        maxBlockIndexSize: 5,
        blockIndexEvictionPolicy: 'lru', // LRU eviction enabled
        bufferSize: 10,
        bufferTimeout: 100000,
      });

      // Add 5 blocks
      for (let i = 0; i < 5; i++) {
        const entries = Array.from({ length: 10 }, (_, j) =>
          createMockWalEntry(i * 10 + j)
        );
        await writer.receiveCDC('source-1', entries);
        await writer.flush();
      }

      // Verify we have 5 blocks
      expect(writer.getBlockIndex().length).toBe(5);

      // Add 6th block - should evict oldest
      const entries = Array.from({ length: 10 }, (_, j) =>
        createMockWalEntry(50 + j)
      );
      await writer.receiveCDC('source-1', entries);
      await writer.flush();

      // Should still have 5 blocks (oldest was evicted)
      expect(writer.getBlockIndex().length).toBe(5);

      // The oldest block should have been evicted
      const blockIndex = writer.getBlockIndex();
      const minLsns = blockIndex.map(b => Number(b.minLsn));
      expect(Math.min(...minLsns)).toBeGreaterThanOrEqual(10); // First block (lsn 0-9) was evicted
    });

    it('should track eviction count in statistics', async () => {
      const writer = new LakehouseWriter({
        r2Bucket: mockBucket,
        tableLocation: 'test/table',
        maxBlockIndexSize: 3,
        blockIndexEvictionPolicy: 'lru',
        bufferSize: 10,
        bufferTimeout: 100000,
      });

      // Add 5 blocks (2 should be evicted)
      for (let i = 0; i < 5; i++) {
        const entries = Array.from({ length: 10 }, (_, j) =>
          createMockWalEntry(i * 10 + j)
        );
        await writer.receiveCDC('source-1', entries);
        await writer.flush();
      }

      const stats = writer.getStats();
      expect(stats.blocks.evictedCount).toBe(2);
    });

    it('should evict multiple entries at once if needed', async () => {
      const writer = new LakehouseWriter({
        r2Bucket: mockBucket,
        tableLocation: 'test/table',
        maxBlockIndexSize: 5,
        blockIndexEvictionPolicy: 'lru',
        bufferSize: 10,
        bufferTimeout: 100000,
      });

      // Fill with 5 blocks
      for (let i = 0; i < 5; i++) {
        const entries = Array.from({ length: 10 }, (_, j) =>
          createMockWalEntry(i * 10 + j)
        );
        await writer.receiveCDC('source-1', entries);
        await writer.flush();
      }

      // Add 3 more blocks in quick succession
      for (let i = 5; i < 8; i++) {
        const entries = Array.from({ length: 10 }, (_, j) =>
          createMockWalEntry(i * 10 + j)
        );
        await writer.receiveCDC('source-1', entries);
        await writer.flush();
      }

      // Should still be at limit
      expect(writer.getBlockIndex().length).toBe(5);

      // Check that we have the 5 most recent blocks
      const blockIndex = writer.getBlockIndex();
      const minLsns = blockIndex.map(b => Number(b.minLsn)).sort((a, b) => a - b);
      expect(minLsns).toEqual([30, 40, 50, 60, 70]); // Blocks 3-7 (0-indexed)
    });
  });

  describe('eviction policy configuration', () => {
    it('should support "none" policy that throws on limit', async () => {
      const writer = new LakehouseWriter({
        r2Bucket: mockBucket,
        tableLocation: 'test/table',
        maxBlockIndexSize: 2,
        blockIndexEvictionPolicy: 'none',
        bufferSize: 10,
        bufferTimeout: 100000,
      });

      // Fill up
      for (let i = 0; i < 2; i++) {
        const entries = Array.from({ length: 10 }, (_, j) =>
          createMockWalEntry(i * 10 + j)
        );
        await writer.receiveCDC('source-1', entries);
        await writer.flush();
      }

      // Should throw
      const entries = Array.from({ length: 10 }, (_, j) =>
        createMockWalEntry(20 + j)
      );
      await writer.receiveCDC('source-1', entries);
      await expect(writer.flush()).rejects.toThrow(BlockIndexLimitError);
    });

    it('should support "lru" policy that evicts oldest', async () => {
      const writer = new LakehouseWriter({
        r2Bucket: mockBucket,
        tableLocation: 'test/table',
        maxBlockIndexSize: 2,
        blockIndexEvictionPolicy: 'lru',
        bufferSize: 10,
        bufferTimeout: 100000,
      });

      // Fill up and add more
      for (let i = 0; i < 4; i++) {
        const entries = Array.from({ length: 10 }, (_, j) =>
          createMockWalEntry(i * 10 + j)
        );
        await writer.receiveCDC('source-1', entries);
        await writer.flush();
      }

      // Should not throw, just evict
      expect(writer.getBlockIndex().length).toBe(2);
    });

    it('should default to "lru" eviction policy', () => {
      const writer = new LakehouseWriter({
        r2Bucket: mockBucket,
        tableLocation: 'test/table',
        maxBlockIndexSize: 100,
      });

      // Access stats to verify policy
      const stats = writer.getStats();
      expect(stats.blocks.evictionPolicy).toBe('lru');
    });
  });

  describe('block index with compaction', () => {
    it('should respect limit after compaction adds new block', async () => {
      const writer = new LakehouseWriter({
        r2Bucket: mockBucket,
        tableLocation: 'test/table',
        maxBlockIndexSize: 5,
        blockIndexEvictionPolicy: 'lru',
        minCompactBlocks: 2, // Low threshold for testing
        bufferSize: 10,
        bufferTimeout: 100000,
      });

      // Fill with blocks
      for (let i = 0; i < 5; i++) {
        const entries = Array.from({ length: 10 }, (_, j) =>
          createMockWalEntry(i * 10 + j)
        );
        await writer.receiveCDC('source-1', entries);
        await writer.flush();
      }

      // Compact should reduce count (merges blocks)
      await writer.compact();

      // Block index should not exceed limit
      expect(writer.getBlockIndex().length).toBeLessThanOrEqual(5);
    });
  });

  describe('state persistence with limits', () => {
    it('should persist eviction stats to DO storage', async () => {
      const mockStorage = createMockDOStorage();
      const writer = new LakehouseWriter({
        r2Bucket: mockBucket,
        tableLocation: 'test/table',
        maxBlockIndexSize: 3,
        blockIndexEvictionPolicy: 'lru',
        bufferSize: 10,
        bufferTimeout: 100000,
      });
      writer.setDOStorage(mockStorage);

      // Add enough blocks to trigger eviction
      for (let i = 0; i < 5; i++) {
        const entries = Array.from({ length: 10 }, (_, j) =>
          createMockWalEntry(i * 10 + j)
        );
        await writer.receiveCDC('source-1', entries);
        await writer.flush();
      }

      // Verify eviction stats are saved
      expect(mockStorage.put).toHaveBeenCalled();
      const lastCall = (mockStorage.put as ReturnType<typeof vi.fn>).mock.calls.slice(-1)[0];
      expect(lastCall[0]).toBe('writer:state');
      const savedState = lastCall[1] as { stats: { blockIndexEvictions: number } };
      expect(savedState.stats.blockIndexEvictions).toBe(2);
    });

    it('should restore eviction stats from DO storage', async () => {
      const mockStorage = createMockDOStorage();
      // Pre-seed state with eviction count
      await mockStorage.put('writer:state', {
        lastBlockSeq: 10,
        pendingBlocks: [],
        sourceCursors: {},
        blockIndex: [],
        lastSnapshotId: 0,
        partitionMode: 'do-sqlite',
        stats: {
          cdcEntriesReceived: 100,
          flushCount: 10,
          compactCount: 1,
          r2WriteFailures: 0,
          blockIndexEvictions: 5,
        },
      });

      const writer = new LakehouseWriter({
        r2Bucket: mockBucket,
        tableLocation: 'test/table',
        maxBlockIndexSize: 100,
        blockIndexEvictionPolicy: 'lru',
      });
      writer.setDOStorage(mockStorage);

      await writer.loadState();

      const stats = writer.getStats();
      expect(stats.blocks.evictedCount).toBe(5);
    });
  });

  describe('block index getBlockIndex behavior', () => {
    it('should return blocks in order of recency with lru tracking', async () => {
      const writer = new LakehouseWriter({
        r2Bucket: mockBucket,
        tableLocation: 'test/table',
        maxBlockIndexSize: 10,
        blockIndexEvictionPolicy: 'lru',
        bufferSize: 10,
        bufferTimeout: 100000,
      });

      // Add blocks
      for (let i = 0; i < 5; i++) {
        const entries = Array.from({ length: 10 }, (_, j) =>
          createMockWalEntry(i * 10 + j)
        );
        await writer.receiveCDC('source-1', entries);
        await writer.flush();
      }

      const blockIndex = writer.getBlockIndex();
      expect(blockIndex.length).toBe(5);

      // Verify blocks are in the expected order (newest first or sorted by LSN)
      const lsns = blockIndex.map(b => Number(b.minLsn));
      const sortedLsns = [...lsns].sort((a, b) => a - b);
      expect(lsns).toEqual(sortedLsns); // Should be sorted by LSN
    });
  });
});
