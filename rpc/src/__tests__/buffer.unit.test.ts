/**
 * Buffer Manager Tests
 *
 * Tests for CDCBufferManager and BackpressureController.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  CDCBufferManager,
  BackpressureController,
  DEFAULT_DEDUP_CONFIG,
} from '../buffer.js';
import type { WalEntry } from '../types.js';

// =============================================================================
// Helper Functions
// =============================================================================

function createWalEntry(
  sequence: number,
  table: string = 'test_table'
): WalEntry {
  return {
    sequence,
    timestamp: Date.now(),
    operation: 'INSERT',
    table,
    rowId: `row-${sequence}`,
    after: { id: `row-${sequence}` },
  };
}

// =============================================================================
// BACKPRESSURE CONTROLLER
// =============================================================================

describe('BackpressureController', () => {
  it('should calculate utilization correctly', () => {
    const controller = new BackpressureController({
      maxBufferSize: 1000,
      highWaterMark: 0.8,
      lowWaterMark: 0.2,
    });

    expect(controller.utilization).toBe(0);
    controller.addBytes(500);
    expect(controller.utilization).toBe(0.5);
  });

  it('should track current size', () => {
    const controller = new BackpressureController({
      maxBufferSize: 1000,
      highWaterMark: 0.8,
      lowWaterMark: 0.2,
    });

    controller.addBytes(100);
    expect(controller.currentSize).toBe(100);
    controller.removeBytes(30);
    expect(controller.currentSize).toBe(70);
  });

  it('should detect high water mark', () => {
    const controller = new BackpressureController({
      maxBufferSize: 1000,
      highWaterMark: 0.8,
      lowWaterMark: 0.2,
    });

    expect(controller.isHighWater).toBe(false);
    controller.addBytes(800);
    expect(controller.isHighWater).toBe(true);
  });

  it('should throw when buffer would overflow', () => {
    const controller = new BackpressureController({
      maxBufferSize: 100,
      highWaterMark: 0.8,
      lowWaterMark: 0.2,
    });

    controller.addBytes(90);
    expect(() => controller.addBytes(20)).toThrow(/buffer.*full/i);
  });

  it('should reset controller state', () => {
    const controller = new BackpressureController({
      maxBufferSize: 1000,
      highWaterMark: 0.8,
      lowWaterMark: 0.2,
    });

    controller.addBytes(900);
    controller.reset();
    expect(controller.currentSize).toBe(0);
    expect(controller.isHighWater).toBe(false);
  });
});

// =============================================================================
// CDC BUFFER MANAGER - BATCH MANAGEMENT
// =============================================================================

describe('CDCBufferManager', () => {
  let buffer: CDCBufferManager;

  beforeEach(() => {
    buffer = new CDCBufferManager({
      enableDeduplication: true,
      deduplicationWindowMs: 5 * 60 * 1000,
      maxBufferSize: 10 * 1024 * 1024,
    });
  });

  describe('batch management', () => {
    it('should add batches to buffer', () => {
      const entries = [createWalEntry(1), createWalEntry(2)];
      const result = buffer.addBatch('source-1', entries, 1);

      expect(result.added).toBe(true);
      expect(result.batchId).toBeTruthy();
      expect(result.isDuplicate).toBe(false);
    });

    it('should track buffer statistics', () => {
      buffer.addBatch('source-1', [createWalEntry(1), createWalEntry(2)], 1);
      buffer.addBatch('source-1', [createWalEntry(3)], 2);

      const stats = buffer.getStats();
      expect(stats.batchCount).toBe(2);
      expect(stats.entryCount).toBe(3);
    });

    it('should get batches for flush', () => {
      buffer.addBatch('source-1', [createWalEntry(1)], 1);
      buffer.addBatch('source-1', [createWalEntry(2)], 2);

      const batches = buffer.getBatchesForFlush();
      expect(batches).toHaveLength(2);
    });

    it('should mark batches as persisted', () => {
      const result1 = buffer.addBatch('source-1', [createWalEntry(1)], 1);
      const result2 = buffer.addBatch('source-1', [createWalEntry(2)], 2);

      buffer.markPersisted([result1.batchId!]);
      const batches = buffer.getBatchesForFlush();
      expect(batches).toHaveLength(1);
    });
  });

  describe('entry retrieval', () => {
    it('should get all entries sorted by timestamp', () => {
      buffer.addBatch('source-1', [createWalEntry(1)], 1);
      buffer.addBatch('source-2', [createWalEntry(2)], 1);

      const entries = buffer.getAllEntriesSorted();
      expect(entries).toHaveLength(2);
    });

    it('should get entries grouped by source', () => {
      buffer.addBatch('source-1', [createWalEntry(1), createWalEntry(2)], 1);
      buffer.addBatch('source-2', [createWalEntry(3)], 1);

      const bySource = buffer.getEntriesBySource();
      expect(bySource.size).toBe(2);
    });

    it('should get entries grouped by table', () => {
      buffer.addBatch('source-1', [createWalEntry(1, 'users')], 1);
      buffer.addBatch('source-1', [createWalEntry(2, 'orders')], 2);

      const byTable = buffer.getEntriesByTable();
      expect(byTable.size).toBe(2);
    });
  });

  describe('flush triggers', () => {
    it('should trigger flush on entry count threshold', () => {
      const smallBuffer = new CDCBufferManager({
        flushThresholdEntries: 5,
        maxBufferSize: 10 * 1024 * 1024,
      });

      for (let i = 0; i < 5; i++) {
        smallBuffer.addBatch('source-1', [createWalEntry(i)], i);
      }

      expect(smallBuffer.shouldFlush()).toBe('threshold_entries');
    });

    it('should return null when no trigger', () => {
      expect(buffer.shouldFlush()).toBeNull();
    });
  });

  describe('child connection state', () => {
    it('should track child connection state', () => {
      buffer.addBatch('child-1', [createWalEntry(1)], 1);

      const state = buffer.getChildState('child-1');
      expect(state).toBeDefined();
      expect(state?.childDoId).toBe('child-1');
    });

    it('should get all child states', () => {
      buffer.addBatch('child-1', [createWalEntry(1)], 1);
      buffer.addBatch('child-2', [createWalEntry(1)], 1);

      const states = buffer.getChildStates();
      expect(states.size).toBe(2);
    });
  });

  describe('serialization', () => {
    it('should serialize buffer state', () => {
      buffer.addBatch('source-1', [createWalEntry(1)], 1);
      const snapshot = buffer.serialize();

      expect(snapshot.batches).toHaveLength(1);
      expect(snapshot.childStates).toHaveLength(1);
    });

    it('should restore buffer from snapshot', () => {
      buffer.addBatch('source-1', [createWalEntry(1)], 1);
      const snapshot = buffer.serialize();
      const restored = CDCBufferManager.restore(snapshot);

      expect(restored.getStats().batchCount).toBe(1);
    });
  });

  describe('clear', () => {
    it('should clear all buffer state', () => {
      buffer.addBatch('source-1', [createWalEntry(1)], 1);
      buffer.clear();

      expect(buffer.getStats().batchCount).toBe(0);
      expect(buffer.getChildStates().size).toBe(0);
    });
  });
});

// =============================================================================
// DEFAULT CONFIG VALUES
// =============================================================================

describe('Default Config', () => {
  it('should have sensible dedup defaults', () => {
    expect(DEFAULT_DEDUP_CONFIG.windowMs).toBe(5 * 60 * 1000);
    expect(DEFAULT_DEDUP_CONFIG.maxEntriesPerSource).toBe(10000);
    expect(DEFAULT_DEDUP_CONFIG.maxSources).toBe(1000);
  });
});
