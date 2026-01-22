/**
 * @evodb/e2e - CDC Pipeline End-to-End Tests
 *
 * Complete end-to-end tests for the CDC (Change Data Capture) pipeline:
 * 1. Child DO sends mutations to Parent DO
 * 2. Parent DO buffers and flushes to R2
 * 3. Reconnection preserves CDC ordering
 * 4. Multiple children sync correctly
 *
 * These tests simulate the full child->parent->R2 flow using mock infrastructure
 * since real Durable Objects require the Cloudflare runtime.
 *
 * Issues: evodb-0pgc, evodb-5hqd
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockR2Bucket } from './mock-r2.js';
import {
  CDCBufferManager,
  ProtocolCodec,
  type CDCBatchMessage,
  type AckMessage,
  type WalEntry,
  WalOperationCode,
  generateBatchId,
  generateCorrelationId,
} from '@evodb/rpc';

// =============================================================================
// Test Harness: Mock Child DO
// =============================================================================

/**
 * Mock Child DO that simulates sending CDC mutations to a parent
 */
class MockChildDO {
  readonly doId: string;
  readonly shardName: string;
  private sequenceNumber: number = 0;
  private lastAckedSequence: number = 0;
  private pendingBatches: Map<string, { entries: WalEntry[]; sentAt: number }> = new Map();
  private codec: ProtocolCodec;

  constructor(doId: string, shardName: string) {
    this.doId = doId;
    this.shardName = shardName;
    this.codec = new ProtocolCodec();
  }

  /**
   * Create WAL entries from mutation data
   */
  createWalEntries(
    table: string,
    mutations: Array<{ op: 'INSERT' | 'UPDATE' | 'DELETE'; data: unknown; rowId?: string }>
  ): WalEntry[] {
    return mutations.map((mut, i) => ({
      sequence: this.sequenceNumber + i + 1,
      timestamp: Date.now(),
      operation: mut.op,
      table,
      rowId: mut.rowId ?? `row-${Date.now()}-${i}`,
      before: mut.op === 'UPDATE' || mut.op === 'DELETE' ? mut.data : undefined,
      after: mut.op === 'INSERT' || mut.op === 'UPDATE' ? mut.data : undefined,
    }));
  }

  /**
   * Send a batch of mutations to the parent
   */
  sendBatch(entries: WalEntry[]): CDCBatchMessage {
    this.sequenceNumber++;
    const correlationId = generateCorrelationId();
    const batchId = generateBatchId(this.doId, this.sequenceNumber);

    const message: CDCBatchMessage = {
      type: 'cdc_batch',
      timestamp: Date.now(),
      correlationId,
      sourceDoId: this.doId,
      sourceShardName: this.shardName,
      entries,
      sequenceNumber: this.sequenceNumber,
      firstEntrySequence: entries.length > 0 ? entries[0].sequence : 0,
      lastEntrySequence: entries.length > 0 ? entries[entries.length - 1].sequence : 0,
      sizeBytes: JSON.stringify(entries).length,
      isRetry: false,
      retryCount: 0,
    };

    this.pendingBatches.set(correlationId, { entries, sentAt: Date.now() });
    return message;
  }

  /**
   * Process an acknowledgment from the parent
   */
  receiveAck(ack: AckMessage): void {
    if (ack.correlationId) {
      this.pendingBatches.delete(ack.correlationId);
    }
    this.lastAckedSequence = Math.max(this.lastAckedSequence, ack.sequenceNumber);
  }

  /**
   * Get the resume sequence for reconnection
   */
  getResumeSequence(): number {
    return this.lastAckedSequence;
  }

  /**
   * Get pending batches for retry
   */
  getPendingBatches(): Map<string, { entries: WalEntry[]; sentAt: number }> {
    return new Map(this.pendingBatches);
  }

  /**
   * Encode a message using the binary protocol
   */
  encodeMessage(message: CDCBatchMessage): ArrayBuffer {
    return this.codec.encodeCDCBatch(message);
  }
}

// =============================================================================
// Test Harness: Mock Parent DO
// =============================================================================

/**
 * Mock Parent DO that buffers CDC from children and flushes to R2
 */
class MockParentDO {
  private buffer: CDCBufferManager;
  private r2Bucket: MockR2Bucket;
  private codec: ProtocolCodec;
  private flushCount: number = 0;
  private tableLocation: string;

  constructor(r2Bucket: MockR2Bucket, tableLocation: string = 'data/cdc') {
    this.r2Bucket = r2Bucket;
    this.tableLocation = tableLocation;
    this.codec = new ProtocolCodec();
    this.buffer = new CDCBufferManager({
      maxBufferSize: 1024 * 1024, // 1MB
      flushThresholdEntries: 100,
      flushThresholdBytes: 50000,
      flushThresholdMs: 5000,
      enableDeduplication: true,
    });
  }

  /**
   * Receive a CDC batch from a child
   */
  receiveBatch(message: CDCBatchMessage): AckMessage {
    const result = this.buffer.addBatch(
      message.sourceDoId,
      message.entries,
      message.sequenceNumber,
      message.sourceShardName
    );

    const ack: AckMessage = {
      type: 'ack',
      timestamp: Date.now(),
      correlationId: message.correlationId,
      sequenceNumber: message.sequenceNumber,
      status: result.isDuplicate ? 'duplicate' : result.added ? 'buffered' : 'ok',
      details: {
        entriesProcessed: message.entries.length,
        bufferUtilization: this.buffer.getStats().utilization,
      },
    };

    return ack;
  }

  /**
   * Receive a binary-encoded message
   */
  receiveBinaryMessage(data: ArrayBuffer): AckMessage {
    const message = this.codec.decode(data) as CDCBatchMessage;
    return this.receiveBatch(message);
  }

  /**
   * Flush buffer to R2
   */
  async flush(): Promise<{
    success: boolean;
    entriesFlushed: number;
    path: string;
  }> {
    const batches = this.buffer.getBatchesForFlush();
    if (batches.length === 0) {
      return { success: true, entriesFlushed: 0, path: '' };
    }

    // Collect all entries
    const allEntries = this.buffer.getAllEntriesSorted();
    if (allEntries.length === 0) {
      return { success: true, entriesFlushed: 0, path: '' };
    }

    // Convert entries to columnar format for storage
    const columnarData = this.entriesToColumnar(allEntries);
    const path = `${this.tableLocation}/block-${++this.flushCount}.json`;

    // Write to R2
    await this.r2Bucket.put(path, JSON.stringify(columnarData));

    // Mark batches as persisted
    const batchIds = batches.map(b => b.batchId);
    this.buffer.markPersisted(batchIds);
    this.buffer.clearPersisted();

    return { success: true, entriesFlushed: allEntries.length, path };
  }

  /**
   * Convert WAL entries to columnar format
   */
  private entriesToColumnar(entries: WalEntry[]): Record<string, unknown[]> {
    const columns: Record<string, unknown[]> = {
      sequence: [],
      timestamp: [],
      operation: [],
      table: [],
      rowId: [],
      data: [],
    };

    for (const entry of entries) {
      columns.sequence.push(entry.sequence);
      columns.timestamp.push(entry.timestamp);
      columns.operation.push(entry.operation);
      columns.table.push(entry.table);
      columns.rowId.push(entry.rowId);
      columns.data.push(entry.after ?? entry.before);
    }

    return columns;
  }

  /**
   * Get buffer statistics
   */
  getBufferStats() {
    return this.buffer.getStats();
  }

  /**
   * Get child connection states
   */
  getChildStates() {
    return this.buffer.getChildStates();
  }

  /**
   * Check if flush should be triggered
   */
  shouldFlush(): boolean {
    return this.buffer.shouldFlush() !== null;
  }

  /**
   * Get entries grouped by source
   */
  getEntriesBySource() {
    return this.buffer.getEntriesBySource();
  }

  /**
   * Get entries grouped by table
   */
  getEntriesByTable() {
    return this.buffer.getEntriesByTable();
  }
}

// =============================================================================
// Test Harness: CDC Pipeline Simulator
// =============================================================================

/**
 * Simulates the complete CDC pipeline for testing
 */
class CDCPipelineSimulator {
  readonly parent: MockParentDO;
  readonly children: Map<string, MockChildDO> = new Map();
  readonly r2Bucket: MockR2Bucket;
  private messageLog: Array<{ from: string; to: string; message: unknown }> = [];

  constructor() {
    this.r2Bucket = new MockR2Bucket();
    this.parent = new MockParentDO(this.r2Bucket);
  }

  /**
   * Add a child DO to the simulation
   */
  addChild(doId: string, shardName: string): MockChildDO {
    const child = new MockChildDO(doId, shardName);
    this.children.set(doId, child);
    return child;
  }

  /**
   * Send a mutation from child to parent
   */
  sendMutation(
    childId: string,
    table: string,
    mutations: Array<{ op: 'INSERT' | 'UPDATE' | 'DELETE'; data: unknown; rowId?: string }>
  ): AckMessage {
    const child = this.children.get(childId);
    if (!child) throw new Error(`Child ${childId} not found`);

    const entries = child.createWalEntries(table, mutations);
    const batch = child.sendBatch(entries);

    this.messageLog.push({ from: childId, to: 'parent', message: batch });

    const ack = this.parent.receiveBatch(batch);

    this.messageLog.push({ from: 'parent', to: childId, message: ack });

    child.receiveAck(ack);

    return ack;
  }

  /**
   * Send mutations using binary protocol
   */
  sendMutationBinary(
    childId: string,
    table: string,
    mutations: Array<{ op: 'INSERT' | 'UPDATE' | 'DELETE'; data: unknown; rowId?: string }>
  ): AckMessage {
    const child = this.children.get(childId);
    if (!child) throw new Error(`Child ${childId} not found`);

    const entries = child.createWalEntries(table, mutations);
    const batch = child.sendBatch(entries);
    const binary = child.encodeMessage(batch);

    this.messageLog.push({ from: childId, to: 'parent', message: `[binary: ${binary.byteLength} bytes]` });

    const ack = this.parent.receiveBinaryMessage(binary);

    this.messageLog.push({ from: 'parent', to: childId, message: ack });

    child.receiveAck(ack);

    return ack;
  }

  /**
   * Flush parent buffer to R2
   */
  async flushToR2() {
    return this.parent.flush();
  }

  /**
   * Get message log for debugging
   */
  getMessageLog() {
    return [...this.messageLog];
  }

  /**
   * Clear R2 bucket
   */
  clearR2() {
    this.r2Bucket.clear();
  }
}

// =============================================================================
// CDC Pipeline E2E Tests
// =============================================================================

describe('CDC Pipeline E2E', () => {
  let simulator: CDCPipelineSimulator;

  beforeEach(() => {
    simulator = new CDCPipelineSimulator();
  });

  afterEach(() => {
    simulator.clearR2();
  });

  // ===========================================================================
  // Test 1: Child DO sends mutations to Parent DO
  // ===========================================================================

  describe('child DO sends mutations to parent DO', () => {
    it('should send single INSERT mutation and receive ACK', () => {
      const child = simulator.addChild('child-1', 'shard-1');

      const ack = simulator.sendMutation('child-1', 'users', [
        { op: 'INSERT', data: { id: 1, name: 'Alice', email: 'alice@test.com' } },
      ]);

      expect(ack.type).toBe('ack');
      expect(ack.status).toBe('buffered');
      expect(ack.sequenceNumber).toBe(1);
      expect(ack.details?.entriesProcessed).toBe(1);
    });

    it('should send UPDATE mutation with before/after data', () => {
      simulator.addChild('child-1', 'shard-1');

      // First insert
      simulator.sendMutation('child-1', 'users', [
        { op: 'INSERT', data: { id: 1, name: 'Alice' }, rowId: 'user-1' },
      ]);

      // Then update
      const ack = simulator.sendMutation('child-1', 'users', [
        { op: 'UPDATE', data: { id: 1, name: 'Alice Smith' }, rowId: 'user-1' },
      ]);

      expect(ack.status).toBe('buffered');

      const stats = simulator.parent.getBufferStats();
      expect(stats.entryCount).toBe(2);
    });

    it('should send DELETE mutation', () => {
      simulator.addChild('child-1', 'shard-1');

      // Insert then delete
      simulator.sendMutation('child-1', 'users', [
        { op: 'INSERT', data: { id: 1, name: 'Alice' }, rowId: 'user-1' },
      ]);

      const ack = simulator.sendMutation('child-1', 'users', [
        { op: 'DELETE', data: { id: 1, name: 'Alice' }, rowId: 'user-1' },
      ]);

      expect(ack.status).toBe('buffered');
    });

    it('should send batch of multiple mutations', () => {
      simulator.addChild('child-1', 'shard-1');

      const ack = simulator.sendMutation('child-1', 'orders', [
        { op: 'INSERT', data: { id: 1, product: 'Widget', qty: 5 } },
        { op: 'INSERT', data: { id: 2, product: 'Gadget', qty: 3 } },
        { op: 'INSERT', data: { id: 3, product: 'Gizmo', qty: 10 } },
      ]);

      expect(ack.details?.entriesProcessed).toBe(3);

      const stats = simulator.parent.getBufferStats();
      expect(stats.entryCount).toBe(3);
    });

    it('should use binary protocol for efficient encoding', () => {
      simulator.addChild('child-1', 'shard-1');

      const ack = simulator.sendMutationBinary('child-1', 'events', [
        { op: 'INSERT', data: { type: 'click', target: 'button-1' } },
      ]);

      expect(ack.type).toBe('ack');
      expect(ack.status).toBe('buffered');
    });

    it('should detect duplicate batches', () => {
      const child = simulator.addChild('child-1', 'shard-1');

      // Send first batch
      const entries = child.createWalEntries('users', [
        { op: 'INSERT', data: { id: 1 } },
      ]);
      const batch = child.sendBatch(entries);
      const ack1 = simulator.parent.receiveBatch(batch);

      // Send same batch again (simulate retry)
      const ack2 = simulator.parent.receiveBatch(batch);

      expect(ack1.status).toBe('buffered');
      expect(ack2.status).toBe('duplicate');
    });
  });

  // ===========================================================================
  // Test 2: Parent DO buffers and flushes to R2
  // ===========================================================================

  describe('parent DO buffers and flushes to R2', () => {
    it('should buffer entries until flush', async () => {
      simulator.addChild('child-1', 'shard-1');

      // Send multiple batches
      for (let i = 0; i < 5; i++) {
        simulator.sendMutation('child-1', 'logs', [
          { op: 'INSERT', data: { id: i, message: `Log entry ${i}` } },
        ]);
      }

      const stats = simulator.parent.getBufferStats();
      expect(stats.batchCount).toBe(5);
      expect(stats.entryCount).toBe(5);

      // R2 should be empty before flush
      expect(simulator.r2Bucket.size).toBe(0);
    });

    it('should flush buffer to R2 as columnar data', async () => {
      simulator.addChild('child-1', 'shard-1');

      // Send some mutations
      simulator.sendMutation('child-1', 'users', [
        { op: 'INSERT', data: { id: 1, name: 'Alice' } },
        { op: 'INSERT', data: { id: 2, name: 'Bob' } },
      ]);

      // Flush to R2
      const result = await simulator.flushToR2();

      expect(result.success).toBe(true);
      expect(result.entriesFlushed).toBe(2);
      expect(result.path).toMatch(/^data\/cdc\/block-\d+\.json$/);

      // Verify R2 has the data
      expect(simulator.r2Bucket.size).toBe(1);

      const obj = await simulator.r2Bucket.get(result.path);
      expect(obj).not.toBeNull();

      const data = await obj!.json<Record<string, unknown[]>>();
      expect(data.sequence).toHaveLength(2);
      expect(data.table).toEqual(['users', 'users']);
    });

    it('should clear buffer after successful flush', async () => {
      simulator.addChild('child-1', 'shard-1');

      simulator.sendMutation('child-1', 'events', [
        { op: 'INSERT', data: { type: 'click' } },
      ]);

      await simulator.flushToR2();

      const stats = simulator.parent.getBufferStats();
      expect(stats.batchCount).toBe(0);
      expect(stats.entryCount).toBe(0);
    });

    it('should handle multiple flushes', async () => {
      simulator.addChild('child-1', 'shard-1');

      // First batch of data
      simulator.sendMutation('child-1', 'logs', [
        { op: 'INSERT', data: { id: 1 } },
      ]);
      const result1 = await simulator.flushToR2();
      expect(result1.path).toBe('data/cdc/block-1.json');

      // Second batch of data
      simulator.sendMutation('child-1', 'logs', [
        { op: 'INSERT', data: { id: 2 } },
      ]);
      const result2 = await simulator.flushToR2();
      expect(result2.path).toBe('data/cdc/block-2.json');

      // Both files should exist in R2
      expect(simulator.r2Bucket.size).toBe(2);
    });

    it('should preserve data integrity through pipeline', async () => {
      simulator.addChild('child-1', 'shard-1');

      const originalData = { id: 42, name: 'Test User', balance: 100.50 };
      simulator.sendMutation('child-1', 'accounts', [
        { op: 'INSERT', data: originalData, rowId: 'acc-42' },
      ]);

      const { path } = await simulator.flushToR2();

      const obj = await simulator.r2Bucket.get(path);
      const columnar = await obj!.json<Record<string, unknown[]>>();

      // Verify data was preserved
      expect(columnar.data[0]).toEqual(originalData);
      expect(columnar.rowId[0]).toBe('acc-42');
      expect(columnar.operation[0]).toBe('INSERT');
    });

    it('should handle empty flush gracefully', async () => {
      const result = await simulator.flushToR2();

      expect(result.success).toBe(true);
      expect(result.entriesFlushed).toBe(0);
      expect(result.path).toBe('');
    });
  });

  // ===========================================================================
  // Test 3: Reconnection preserves CDC ordering
  // ===========================================================================

  describe('reconnection preserves CDC ordering', () => {
    it('should track last acknowledged sequence', () => {
      const child = simulator.addChild('child-1', 'shard-1');

      // Send batches
      simulator.sendMutation('child-1', 'logs', [{ op: 'INSERT', data: { id: 1 } }]);
      simulator.sendMutation('child-1', 'logs', [{ op: 'INSERT', data: { id: 2 } }]);
      simulator.sendMutation('child-1', 'logs', [{ op: 'INSERT', data: { id: 3 } }]);

      expect(child.getResumeSequence()).toBe(3);
    });

    it('should track pending batches for retry', () => {
      const child = simulator.addChild('child-1', 'shard-1');

      // Send batch but don't process ack
      const entries = child.createWalEntries('logs', [{ op: 'INSERT', data: { id: 1 } }]);
      const batch = child.sendBatch(entries);

      // Pending should have 1 batch
      expect(child.getPendingBatches().size).toBe(1);

      // Process ack
      const ack = simulator.parent.receiveBatch(batch);
      child.receiveAck(ack);

      // Pending should be empty
      expect(child.getPendingBatches().size).toBe(0);
    });

    it('should preserve ordering after simulated reconnect', async () => {
      const child = simulator.addChild('child-1', 'shard-1');

      // Send initial batch
      simulator.sendMutation('child-1', 'events', [
        { op: 'INSERT', data: { seq: 1, type: 'first' } },
      ]);

      // Simulate disconnect/reconnect by tracking resume sequence
      const resumeSeq = child.getResumeSequence();
      expect(resumeSeq).toBe(1);

      // Send more batches after "reconnect"
      simulator.sendMutation('child-1', 'events', [
        { op: 'INSERT', data: { seq: 2, type: 'second' } },
      ]);
      simulator.sendMutation('child-1', 'events', [
        { op: 'INSERT', data: { seq: 3, type: 'third' } },
      ]);

      // Flush and verify ordering
      const { path } = await simulator.flushToR2();
      const obj = await simulator.r2Bucket.get(path);
      const data = await obj!.json<Record<string, unknown[]>>();

      // Entries should be in sequence order
      expect(data.sequence).toEqual([1, 2, 3]);
    });

    it('should maintain per-child ordering', async () => {
      simulator.addChild('child-1', 'shard-1');
      simulator.addChild('child-2', 'shard-2');

      // Interleave mutations from different children
      simulator.sendMutation('child-1', 'logs', [{ op: 'INSERT', data: { child: 1, seq: 1 } }]);
      simulator.sendMutation('child-2', 'logs', [{ op: 'INSERT', data: { child: 2, seq: 1 } }]);
      simulator.sendMutation('child-1', 'logs', [{ op: 'INSERT', data: { child: 1, seq: 2 } }]);
      simulator.sendMutation('child-2', 'logs', [{ op: 'INSERT', data: { child: 2, seq: 2 } }]);

      // Get entries by source
      const bySource = simulator.parent.getEntriesBySource();

      // Child 1 entries should be in order
      const child1Entries = bySource.get('child-1')!;
      expect(child1Entries.map(e => (e.after as { seq: number }).seq)).toEqual([1, 2]);

      // Child 2 entries should be in order
      const child2Entries = bySource.get('child-2')!;
      expect(child2Entries.map(e => (e.after as { seq: number }).seq)).toEqual([1, 2]);
    });

    it('should handle child state tracking', () => {
      simulator.addChild('child-1', 'shard-1');
      simulator.addChild('child-2', 'shard-2');

      simulator.sendMutation('child-1', 'logs', [{ op: 'INSERT', data: { id: 1 } }]);
      simulator.sendMutation('child-2', 'logs', [{ op: 'INSERT', data: { id: 1 } }]);

      const childStates = simulator.parent.getChildStates();

      expect(childStates.size).toBe(2);
      expect(childStates.get('child-1')?.batchesReceived).toBe(1);
      expect(childStates.get('child-2')?.batchesReceived).toBe(1);
    });
  });

  // ===========================================================================
  // Test 4: Multiple children sync correctly
  // ===========================================================================

  describe('multiple children sync correctly', () => {
    it('should accept data from multiple children', () => {
      simulator.addChild('child-1', 'shard-1');
      simulator.addChild('child-2', 'shard-2');
      simulator.addChild('child-3', 'shard-3');

      simulator.sendMutation('child-1', 'users', [{ op: 'INSERT', data: { id: 1 } }]);
      simulator.sendMutation('child-2', 'users', [{ op: 'INSERT', data: { id: 2 } }]);
      simulator.sendMutation('child-3', 'users', [{ op: 'INSERT', data: { id: 3 } }]);

      const stats = simulator.parent.getBufferStats();
      expect(stats.batchCount).toBe(3);
      expect(stats.entryCount).toBe(3);
    });

    it('should handle different tables from different children', async () => {
      simulator.addChild('child-users', 'users-shard');
      simulator.addChild('child-orders', 'orders-shard');
      simulator.addChild('child-events', 'events-shard');

      simulator.sendMutation('child-users', 'users', [
        { op: 'INSERT', data: { name: 'Alice' } },
      ]);
      simulator.sendMutation('child-orders', 'orders', [
        { op: 'INSERT', data: { product: 'Widget' } },
      ]);
      simulator.sendMutation('child-events', 'events', [
        { op: 'INSERT', data: { type: 'click' } },
      ]);

      const byTable = simulator.parent.getEntriesByTable();

      expect(byTable.size).toBe(3);
      expect(byTable.has('users')).toBe(true);
      expect(byTable.has('orders')).toBe(true);
      expect(byTable.has('events')).toBe(true);
    });

    it('should maintain independent sequences for each child', () => {
      const child1 = simulator.addChild('child-1', 'shard-1');
      const child2 = simulator.addChild('child-2', 'shard-2');

      // Send multiple batches from each child
      for (let i = 0; i < 3; i++) {
        simulator.sendMutation('child-1', 'logs', [{ op: 'INSERT', data: { i } }]);
        simulator.sendMutation('child-2', 'logs', [{ op: 'INSERT', data: { i } }]);
      }

      // Each child should have their own sequence counter
      expect(child1.getResumeSequence()).toBe(3);
      expect(child2.getResumeSequence()).toBe(3);
    });

    it('should aggregate all children into single R2 flush', async () => {
      simulator.addChild('child-1', 'shard-1');
      simulator.addChild('child-2', 'shard-2');
      simulator.addChild('child-3', 'shard-3');

      // Each child sends data
      simulator.sendMutation('child-1', 'data', [{ op: 'INSERT', data: { from: 1 } }]);
      simulator.sendMutation('child-2', 'data', [{ op: 'INSERT', data: { from: 2 } }]);
      simulator.sendMutation('child-3', 'data', [{ op: 'INSERT', data: { from: 3 } }]);

      // Single flush should contain all data
      const { entriesFlushed } = await simulator.flushToR2();
      expect(entriesFlushed).toBe(3);

      // Only one R2 file
      expect(simulator.r2Bucket.size).toBe(1);
    });

    it('should handle high-frequency writes from multiple children', async () => {
      const childCount = 5;
      const batchesPerChild = 10;

      // Create children
      for (let c = 0; c < childCount; c++) {
        simulator.addChild(`child-${c}`, `shard-${c}`);
      }

      // Send batches from all children
      for (let b = 0; b < batchesPerChild; b++) {
        for (let c = 0; c < childCount; c++) {
          simulator.sendMutation(`child-${c}`, 'metrics', [
            { op: 'INSERT', data: { child: c, batch: b, value: Math.random() } },
          ]);
        }
      }

      const stats = simulator.parent.getBufferStats();
      expect(stats.batchCount).toBe(childCount * batchesPerChild);
      expect(stats.entryCount).toBe(childCount * batchesPerChild);

      // Flush and verify
      const { entriesFlushed } = await simulator.flushToR2();
      expect(entriesFlushed).toBe(childCount * batchesPerChild);
    });

    it('should correctly deduplicate across children', () => {
      simulator.addChild('child-1', 'shard-1');
      simulator.addChild('child-2', 'shard-2');

      // Same sequence numbers from different children are NOT duplicates
      const child1 = simulator.children.get('child-1')!;
      const child2 = simulator.children.get('child-2')!;

      const entries1 = child1.createWalEntries('logs', [{ op: 'INSERT', data: { id: 1 } }]);
      const batch1 = child1.sendBatch(entries1);

      const entries2 = child2.createWalEntries('logs', [{ op: 'INSERT', data: { id: 1 } }]);
      const batch2 = child2.sendBatch(entries2);

      const ack1 = simulator.parent.receiveBatch(batch1);
      const ack2 = simulator.parent.receiveBatch(batch2);

      // Both should be accepted (different sources)
      expect(ack1.status).toBe('buffered');
      expect(ack2.status).toBe('buffered');

      const stats = simulator.parent.getBufferStats();
      expect(stats.entryCount).toBe(2);
    });
  });

  // ===========================================================================
  // Performance Assertions (REFACTOR phase)
  // ===========================================================================

  describe('performance assertions', () => {
    it('should process batches within acceptable time', () => {
      simulator.addChild('child-1', 'shard-1');

      const start = performance.now();

      // Send 100 batches
      for (let i = 0; i < 100; i++) {
        simulator.sendMutation('child-1', 'perf_test', [
          { op: 'INSERT', data: { id: i, payload: 'x'.repeat(100) } },
        ]);
      }

      const elapsed = performance.now() - start;

      // Should process 100 batches in under 100ms
      expect(elapsed).toBeLessThan(100);
    });

    it('should flush to R2 within acceptable time', async () => {
      simulator.addChild('child-1', 'shard-1');

      // Add 1000 entries
      for (let i = 0; i < 100; i++) {
        simulator.sendMutation('child-1', 'perf_test', [
          { op: 'INSERT', data: { id: i * 10 + 0 } },
          { op: 'INSERT', data: { id: i * 10 + 1 } },
          { op: 'INSERT', data: { id: i * 10 + 2 } },
          { op: 'INSERT', data: { id: i * 10 + 3 } },
          { op: 'INSERT', data: { id: i * 10 + 4 } },
          { op: 'INSERT', data: { id: i * 10 + 5 } },
          { op: 'INSERT', data: { id: i * 10 + 6 } },
          { op: 'INSERT', data: { id: i * 10 + 7 } },
          { op: 'INSERT', data: { id: i * 10 + 8 } },
          { op: 'INSERT', data: { id: i * 10 + 9 } },
        ]);
      }

      const start = performance.now();
      const { entriesFlushed } = await simulator.flushToR2();
      const elapsed = performance.now() - start;

      expect(entriesFlushed).toBe(1000);
      // Should flush 1000 entries in under 50ms
      expect(elapsed).toBeLessThan(50);
    });

    it('should have low memory overhead per entry', () => {
      simulator.addChild('child-1', 'shard-1');

      // Send 1000 entries
      for (let i = 0; i < 1000; i++) {
        simulator.sendMutation('child-1', 'mem_test', [
          { op: 'INSERT', data: { id: i } },
        ]);
      }

      const stats = simulator.parent.getBufferStats();

      // Buffer utilization should be reasonable (not exceeding max)
      expect(stats.utilization).toBeLessThan(1);
      expect(stats.entryCount).toBe(1000);
    });

    it('should handle binary protocol efficiently', () => {
      simulator.addChild('child-1', 'shard-1');
      const codec = new ProtocolCodec();

      const entries: WalEntry[] = Array.from({ length: 100 }, (_, i) => ({
        sequence: i + 1,
        timestamp: Date.now(),
        operation: 'INSERT' as const,
        table: 'efficiency_test',
        rowId: `row-${i}`,
        after: { id: i, name: `Item ${i}`, value: i * 10 },
      }));

      const batch: CDCBatchMessage = {
        type: 'cdc_batch',
        timestamp: Date.now(),
        sourceDoId: 'child-1',
        entries,
        sequenceNumber: 1,
        firstEntrySequence: 1,
        lastEntrySequence: 100,
        sizeBytes: JSON.stringify(entries).length,
        isRetry: false,
        retryCount: 0,
      };

      const start = performance.now();
      const binary = codec.encodeCDCBatch(batch);
      const decoded = codec.decode(binary);
      const elapsed = performance.now() - start;

      // Encoding + decoding should be under 10ms for 100 entries
      expect(elapsed).toBeLessThan(10);
      expect(decoded.entries.length).toBe(100);

      // Binary should be smaller than JSON for most cases
      const jsonSize = JSON.stringify(batch).length;
      // Binary may not always be smaller due to metadata overhead,
      // but it should be comparable (within 2x)
      expect(binary.byteLength).toBeLessThan(jsonSize * 2);
    });
  });
});
