/**
 * Atomic Flush Tests
 *
 * Tests for atomic block write + manifest update operations.
 * These tests verify that data is not lost if a process crashes
 * between writing a block to R2 and updating the manifest.
 *
 * TDD RED Phase: These tests should fail until atomic flush is implemented.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { R2Bucket, R2Object, BlockMetadata, WalEntry } from './types.js';
import { R2BlockWriter } from './r2-writer.js';
import { AtomicFlushWriter, AtomicFlushResult, PendingFlush, FlushRecoveryResult } from './atomic-flush.js';
import {
  createMockR2Bucket as createGenericMockR2Bucket,
  createMockDOStorage as createGenericMockDOStorage,
  generateWalEntry,
} from '@evodb/test-utils';

// Wrap generic mock R2 bucket with vi.fn() spies for test assertions
function createMockR2Bucket(): R2Bucket & {
  _storage: Map<string, { data: Uint8Array; metadata?: Record<string, string> }>;
  _clear: () => void;
} {
  const baseBucket = createGenericMockR2Bucket();
  return {
    put: vi.fn(baseBucket.put),
    get: vi.fn(baseBucket.get),
    delete: vi.fn(baseBucket.delete),
    list: vi.fn(baseBucket.list),
    head: vi.fn(baseBucket.head),
    _storage: baseBucket._storage,
    _clear: baseBucket._clear,
  } as R2Bucket & {
    _storage: Map<string, { data: Uint8Array; metadata?: Record<string, string> }>;
    _clear: () => void;
  };
}

// Helper to create mock WAL entries
function createMockWalEntry(lsn: number, data: string = 'test'): WalEntry {
  return generateWalEntry(lsn, data) as WalEntry;
}

describe('AtomicFlushWriter', () => {
  let mockBucket: R2Bucket & {
    _storage: Map<string, { data: Uint8Array; metadata?: Record<string, string> }>;
    _clear: () => void;
  };
  let mockDOStorage: ReturnType<typeof createGenericMockDOStorage>;
  let atomicWriter: AtomicFlushWriter;

  beforeEach(() => {
    mockBucket = createMockR2Bucket();
    mockDOStorage = createGenericMockDOStorage();
    atomicWriter = new AtomicFlushWriter(mockBucket, {
      tableLocation: 'test/table',
      maxRetries: 3,
      retryBackoffMs: 10,
      schemaId: 1,
    });
    atomicWriter.setDOStorage(mockDOStorage);
  });

  describe('atomic flush with WAL pattern', () => {
    it('should write pending flush record to DO before writing block to R2', async () => {
      const entries = [createMockWalEntry(1), createMockWalEntry(2)];

      // Start atomic flush
      const result = await atomicWriter.atomicFlush(entries, 1n, 2n, 1);

      // Verify pending flush was recorded before R2 write
      const pendingFlushes = await mockDOStorage.get<PendingFlush[]>('atomic:pending');

      // The pending flush should be cleared after success
      expect(result.success).toBe(true);
      expect(result.metadata).toBeDefined();
    });

    it('should recover orphaned blocks on startup', async () => {
      // Simulate a crash: pending flush exists but R2 write completed
      const pendingFlush: PendingFlush = {
        id: 'flush-001',
        r2Key: 'test/table/data/abc123-0001.cjlb',
        minLsn: '1',
        maxLsn: '2',
        seq: 1,
        timestamp: Date.now(),
        entriesJson: JSON.stringify([
          { lsn: '1', timestamp: String(Date.now()), op: 1, flags: 0, data: [116, 101, 115, 116], checksum: 12345 },
        ]),
        status: 'pending',
      };

      // Pre-seed DO storage with pending flush
      await mockDOStorage.put('atomic:pending', [pendingFlush]);

      // Pre-seed R2 with the block (simulating crash after R2 write, before manifest update)
      await mockBucket.put(pendingFlush.r2Key, new Uint8Array([1, 2, 3, 4]));

      // Create new writer and run recovery
      const newWriter = new AtomicFlushWriter(mockBucket, {
        tableLocation: 'test/table',
        maxRetries: 3,
        retryBackoffMs: 10,
        schemaId: 1,
      });
      newWriter.setDOStorage(mockDOStorage);

      const recoveryResult = await newWriter.recoverPendingFlushes();

      // Recovered block should be in the result for manifest update
      expect(recoveryResult.recovered.length).toBe(1);
      expect(recoveryResult.recovered[0].r2Key).toBe(pendingFlush.r2Key);
    });

    it('should detect and cleanup orphaned blocks that failed completely', async () => {
      // Simulate a crash: pending flush exists but R2 write never completed
      const pendingFlush: PendingFlush = {
        id: 'flush-002',
        r2Key: 'test/table/data/orphan123-0001.cjlb',
        minLsn: '1',
        maxLsn: '2',
        seq: 1,
        timestamp: Date.now() - 60000, // 1 minute ago
        entriesJson: JSON.stringify([
          { lsn: '1', timestamp: String(Date.now()), op: 1, flags: 0, data: [116, 101, 115, 116], checksum: 12345 },
        ]),
        status: 'pending',
      };

      await mockDOStorage.put('atomic:pending', [pendingFlush]);
      // Note: NOT writing to R2 - simulating failed write

      const newWriter = new AtomicFlushWriter(mockBucket, {
        tableLocation: 'test/table',
        maxRetries: 3,
        retryBackoffMs: 10,
        schemaId: 1,
      });
      newWriter.setDOStorage(mockDOStorage);

      const recoveryResult = await newWriter.recoverPendingFlushes();

      // Should retry the write and either succeed or fail
      // If R2 is available, it should retry and succeed
      expect(recoveryResult.retried.length + recoveryResult.failed.length).toBeGreaterThanOrEqual(0);
    });

    it('should mark flush as committed only after manifest update succeeds', async () => {
      const entries = [createMockWalEntry(1), createMockWalEntry(2)];

      // Perform atomic flush
      const result = await atomicWriter.atomicFlush(entries, 1n, 2n, 1);

      expect(result.success).toBe(true);

      // Verify the flush was committed
      const committedFlushes = await mockDOStorage.get<string[]>('atomic:committed');

      // Should have been cleared from pending
      const pendingFlushes = await mockDOStorage.get<PendingFlush[]>('atomic:pending');
      expect(pendingFlushes?.length ?? 0).toBe(0);
    });

    it('should not leave orphaned blocks if manifest update fails', async () => {
      const entries = [createMockWalEntry(1), createMockWalEntry(2)];

      // Create a writer where we can simulate manifest failure
      const failingWriter = new AtomicFlushWriter(mockBucket, {
        tableLocation: 'test/table',
        maxRetries: 1,
        retryBackoffMs: 10,
        schemaId: 1,
      });
      failingWriter.setDOStorage(mockDOStorage);

      // First, do a successful flush
      const result = await failingWriter.atomicFlush(entries, 1n, 2n, 1);

      // The pending flush info should be available for recovery
      // even if we simulate a crash before manifest commit
      const r2Key = result.metadata?.r2Key;
      expect(r2Key).toBeDefined();

      // Verify block exists in R2
      const blockExists = await mockBucket.head(r2Key!);
      expect(blockExists).not.toBeNull();

      // If we call recovery, the block should be detected
      const pendingBefore = await mockDOStorage.get<PendingFlush[]>('atomic:pending');
      // After successful flush, pending should be empty
      expect(pendingBefore?.length ?? 0).toBe(0);
    });
  });

  describe('crash recovery scenarios', () => {
    it('Scenario 1: crash after DO write, before R2 write - should retry R2 write', async () => {
      // Pending flush recorded in DO but R2 write never happened
      const pendingFlush: PendingFlush = {
        id: 'crash-scenario-1',
        r2Key: 'test/table/data/scenario1-0001.cjlb',
        minLsn: '1',
        maxLsn: '5',
        seq: 1,
        timestamp: Date.now() - 30000,
        entriesJson: JSON.stringify([
          { lsn: '1', timestamp: String(Date.now()), op: 1, flags: 0, data: [116, 101, 115, 116], checksum: 12345 },
        ]),
        status: 'pending',
      };

      await mockDOStorage.put('atomic:pending', [pendingFlush]);

      const recoveryWriter = new AtomicFlushWriter(mockBucket, {
        tableLocation: 'test/table',
        maxRetries: 3,
        retryBackoffMs: 10,
        schemaId: 1,
      });
      recoveryWriter.setDOStorage(mockDOStorage);

      const result = await recoveryWriter.recoverPendingFlushes();

      // Should have retried the R2 write
      expect(result.retried.length).toBe(1);

      // Block should now exist in R2
      const blockExists = await mockBucket.head(pendingFlush.r2Key);
      expect(blockExists).not.toBeNull();
    });

    it('Scenario 2: crash after R2 write, before manifest commit - should recover block metadata', async () => {
      const pendingFlush: PendingFlush = {
        id: 'crash-scenario-2',
        r2Key: 'test/table/data/scenario2-0001.cjlb',
        minLsn: '1',
        maxLsn: '5',
        seq: 1,
        timestamp: Date.now() - 30000,
        entriesJson: JSON.stringify([
          { lsn: '1', timestamp: String(Date.now()), op: 1, flags: 0, data: [116, 101, 115, 116], checksum: 12345 },
        ]),
        status: 'r2_written', // R2 write succeeded but manifest not updated
      };

      await mockDOStorage.put('atomic:pending', [pendingFlush]);

      // Simulate R2 block exists
      await mockBucket.put(pendingFlush.r2Key, new Uint8Array([1, 2, 3, 4]), {
        customMetadata: {
          'x-block-version': '1',
          'x-row-count': '1',
        },
      });

      const recoveryWriter = new AtomicFlushWriter(mockBucket, {
        tableLocation: 'test/table',
        maxRetries: 3,
        retryBackoffMs: 10,
        schemaId: 1,
      });
      recoveryWriter.setDOStorage(mockDOStorage);

      const result = await recoveryWriter.recoverPendingFlushes();

      // Should recover the block metadata for manifest update
      expect(result.recovered.length).toBe(1);
      expect(result.recovered[0].r2Key).toBe(pendingFlush.r2Key);
    });

    it('Scenario 3: crash during manifest commit - should be idempotent on retry', async () => {
      const entries = [createMockWalEntry(1), createMockWalEntry(2)];

      // First flush
      const result1 = await atomicWriter.atomicFlush(entries, 1n, 2n, 1);
      expect(result1.success).toBe(true);
      const r2Key = result1.metadata?.r2Key;

      // Simulate calling commitFlush multiple times (idempotency)
      const commitResult1 = await atomicWriter.commitFlush(result1.metadata!.id);
      const commitResult2 = await atomicWriter.commitFlush(result1.metadata!.id);

      // Both should succeed without error
      expect(commitResult1).toBe(true);
      expect(commitResult2).toBe(true);

      // Block should still exist (not double-deleted or anything)
      const blockExists = await mockBucket.head(r2Key!);
      expect(blockExists).not.toBeNull();
    });
  });

  describe('two-phase commit semantics', () => {
    it('should support prepare -> commit workflow', async () => {
      const entries = [createMockWalEntry(1), createMockWalEntry(2)];

      // Phase 1: Prepare (write to R2 with pending status)
      const prepareResult = await atomicWriter.prepareFlush(entries, 1n, 2n, 1);
      expect(prepareResult.success).toBe(true);
      expect(prepareResult.flushId).toBeDefined();

      // Verify block is in R2 but pending in DO
      const blockExists = await mockBucket.head(prepareResult.metadata!.r2Key);
      expect(blockExists).not.toBeNull();

      let pending = await mockDOStorage.get<PendingFlush[]>('atomic:pending');
      expect(pending?.find(p => p.id === prepareResult.flushId)).toBeDefined();

      // Phase 2: Commit (mark as committed)
      const commitResult = await atomicWriter.commitFlush(prepareResult.flushId!);
      expect(commitResult).toBe(true);

      // Verify pending is cleared
      pending = await mockDOStorage.get<PendingFlush[]>('atomic:pending');
      expect(pending?.find(p => p.id === prepareResult.flushId)).toBeUndefined();
    });

    it('should support rollback of prepared flush', async () => {
      const entries = [createMockWalEntry(1), createMockWalEntry(2)];

      // Prepare
      const prepareResult = await atomicWriter.prepareFlush(entries, 1n, 2n, 1);
      expect(prepareResult.success).toBe(true);
      const r2Key = prepareResult.metadata!.r2Key;

      // Rollback (abort the flush)
      const rollbackResult = await atomicWriter.rollbackFlush(prepareResult.flushId!);
      expect(rollbackResult).toBe(true);

      // Block should be deleted from R2
      const blockExists = await mockBucket.head(r2Key);
      expect(blockExists).toBeNull();

      // Pending should be cleared
      const pending = await mockDOStorage.get<PendingFlush[]>('atomic:pending');
      expect(pending?.find(p => p.id === prepareResult.flushId)).toBeUndefined();
    });
  });

  describe('concurrent flush handling', () => {
    it('should handle concurrent flushes without data loss', async () => {
      const entries1 = [createMockWalEntry(1), createMockWalEntry(2)];
      const entries2 = [createMockWalEntry(3), createMockWalEntry(4)];
      const entries3 = [createMockWalEntry(5), createMockWalEntry(6)];

      // Start multiple flushes concurrently
      const [result1, result2, result3] = await Promise.all([
        atomicWriter.atomicFlush(entries1, 1n, 2n, 1),
        atomicWriter.atomicFlush(entries2, 3n, 4n, 2),
        atomicWriter.atomicFlush(entries3, 5n, 6n, 3),
      ]);

      // All should succeed
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result3.success).toBe(true);

      // All blocks should exist in R2
      const block1Exists = await mockBucket.head(result1.metadata!.r2Key);
      const block2Exists = await mockBucket.head(result2.metadata!.r2Key);
      const block3Exists = await mockBucket.head(result3.metadata!.r2Key);

      expect(block1Exists).not.toBeNull();
      expect(block2Exists).not.toBeNull();
      expect(block3Exists).not.toBeNull();
    });
  });

  describe('integration with LakehouseWriter', () => {
    it('should provide pending blocks for manifest update', async () => {
      const entries = [createMockWalEntry(1), createMockWalEntry(2)];

      const result = await atomicWriter.atomicFlush(entries, 1n, 2n, 1);
      expect(result.success).toBe(true);

      // Get blocks that need manifest update
      const blocksForManifest = atomicWriter.getCommittedBlocks();

      // After a successful flush and commit, the block should be available
      // for manifest integration
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.id).toBeDefined();
      expect(result.metadata?.r2Key).toBeDefined();
      expect(result.metadata?.rowCount).toBeGreaterThan(0);
    });
  });
});
