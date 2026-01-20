import { describe, it, expect, beforeEach } from 'vitest';
import { CDCBuffer, MultiTableBuffer, BackpressureController, SizeBasedBuffer } from './buffer.js';
import type { WalEntry } from '@evodb/core';
import type { R2Bucket } from './types.js';

// Helper to create mock WAL entries
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

describe('CDCBuffer', () => {
  let buffer: CDCBuffer;

  beforeEach(() => {
    buffer = new CDCBuffer({
      bufferSize: 100,
      bufferTimeout: 1000,
      targetBlockSize: 10000,
    });
  });

  describe('add', () => {
    it('should add entries to buffer', () => {
      const entries = [createMockWalEntry(1), createMockWalEntry(2)];
      buffer.add('source-1', entries);

      const stats = buffer.getStats();
      expect(stats.entryCount).toBe(2);
      expect(stats.sourceCount).toBe(1);
    });

    it('should track multiple sources', () => {
      buffer.add('source-1', [createMockWalEntry(1)]);
      buffer.add('source-2', [createMockWalEntry(2)]);

      const stats = buffer.getStats();
      expect(stats.entryCount).toBe(2);
      expect(stats.sourceCount).toBe(2);
    });

    it('should track LSN range', () => {
      buffer.add('source-1', [createMockWalEntry(10), createMockWalEntry(5), createMockWalEntry(15)]);

      const state = buffer.getState();
      expect(state.minLsn).toBe(5n);
      expect(state.maxLsn).toBe(15n);
    });

    it('should not modify buffer on empty add', () => {
      buffer.add('source-1', []);

      const stats = buffer.getStats();
      expect(stats.entryCount).toBe(0);
      expect(stats.sourceCount).toBe(0);
    });

    it('should update estimated size', () => {
      const entry = createMockWalEntry(1, 'hello world');
      buffer.add('source-1', [entry]);

      expect(buffer.getEstimatedSize()).toBeGreaterThan(0);
    });
  });

  describe('shouldFlush', () => {
    it('should return false for empty buffer', () => {
      expect(buffer.shouldFlush()).toBe(false);
    });

    it('should return true when entry count threshold reached', () => {
      const entries = Array.from({ length: 100 }, (_, i) => createMockWalEntry(i));
      buffer.add('source-1', entries);

      expect(buffer.shouldFlush()).toBe(true);
    });

    it('should return false when below threshold', () => {
      const entries = Array.from({ length: 50 }, (_, i) => createMockWalEntry(i));
      buffer.add('source-1', entries);

      expect(buffer.shouldFlush()).toBe(false);
    });

    it('should return true when size threshold reached', () => {
      // Create a buffer with small target size
      const smallBuffer = new CDCBuffer({
        bufferSize: 10000,
        bufferTimeout: 10000,
        targetBlockSize: 100,
      });

      // Add entries that exceed target size
      const entries = Array.from({ length: 10 }, (_, i) => createMockWalEntry(i, 'data'.repeat(10)));
      smallBuffer.add('source-1', entries);

      expect(smallBuffer.shouldFlush()).toBe(true);
    });
  });

  describe('drain', () => {
    it('should return all entries and clear buffer', () => {
      const entries = [createMockWalEntry(1), createMockWalEntry(2)];
      buffer.add('source-1', entries);

      const { entries: drained, state } = buffer.drain();

      expect(drained.length).toBe(2);
      expect(state.minLsn).toBe(1n);
      expect(state.maxLsn).toBe(2n);
      expect(buffer.isEmpty()).toBe(true);
    });

    it('should preserve source cursors after drain', () => {
      buffer.add('source-1', [createMockWalEntry(5)]);
      buffer.drain();

      const cursors = buffer.getSourceCursors();
      expect(cursors.get('source-1')).toBe(5n);
    });

    it('should reset estimated size after drain', () => {
      buffer.add('source-1', [createMockWalEntry(1)]);
      expect(buffer.getEstimatedSize()).toBeGreaterThan(0);

      buffer.drain();
      expect(buffer.getEstimatedSize()).toBe(0);
    });
  });

  describe('getTimeToFlush', () => {
    it('should return null for empty buffer', () => {
      expect(buffer.getTimeToFlush()).toBeNull();
    });

    it('should return remaining time until timeout', () => {
      buffer.add('source-1', [createMockWalEntry(1)]);

      const timeToFlush = buffer.getTimeToFlush();
      expect(timeToFlush).not.toBeNull();
      expect(timeToFlush!).toBeGreaterThan(0);
      expect(timeToFlush!).toBeLessThanOrEqual(1000);
    });
  });

  describe('getLsnRange', () => {
    it('should return null for empty buffer', () => {
      expect(buffer.getLsnRange()).toBeNull();
    });

    it('should return correct LSN range', () => {
      buffer.add('source-1', [createMockWalEntry(5), createMockWalEntry(10)]);

      const range = buffer.getLsnRange();
      expect(range).not.toBeNull();
      expect(range!.min).toBe(5n);
      expect(range!.max).toBe(10n);
    });
  });

  describe('size', () => {
    it('should return 0 for empty buffer', () => {
      expect(buffer.size()).toBe(0);
    });

    it('should return correct count', () => {
      buffer.add('source-1', [createMockWalEntry(1), createMockWalEntry(2)]);
      expect(buffer.size()).toBe(2);
    });
  });

  describe('fromWriterOptions', () => {
    it('should create buffer from writer options', () => {
      const buffer = CDCBuffer.fromWriterOptions({
        r2Bucket: {} as unknown as R2Bucket,
        tableLocation: 'test',
        partitionMode: 'do-sqlite',
        bufferSize: 5000,
        bufferTimeout: 2000,
        targetBlockSize: 2 * 1024 * 1024,
        maxBlockSize: 4 * 1024 * 1024,
        minCompactBlocks: 4,
        targetCompactSize: 16 * 1024 * 1024,
        maxRetries: 3,
        retryBackoffMs: 100,
      });

      expect(buffer).toBeInstanceOf(CDCBuffer);
    });
  });
});

describe('MultiTableBuffer', () => {
  let multiBuffer: MultiTableBuffer;

  beforeEach(() => {
    multiBuffer = new MultiTableBuffer({
      bufferSize: 50,
      bufferTimeout: 1000,
      targetBlockSize: 10000,
    });
  });

  it('should create separate buffers per table', () => {
    multiBuffer.add('table-1', 'source-1', [createMockWalEntry(1)]);
    multiBuffer.add('table-2', 'source-1', [createMockWalEntry(2)]);

    const stats = multiBuffer.getAllStats();
    expect(stats.size).toBe(2);
    expect(stats.get('table-1')?.entryCount).toBe(1);
    expect(stats.get('table-2')?.entryCount).toBe(1);
  });

  it('should report tables ready to flush', () => {
    // Fill table-1 to threshold
    const entries = Array.from({ length: 50 }, (_, i) => createMockWalEntry(i));
    multiBuffer.add('table-1', 'source-1', entries);

    // table-2 below threshold
    multiBuffer.add('table-2', 'source-1', [createMockWalEntry(1)]);

    const ready = multiBuffer.getReadyToFlush();
    expect(ready).toContain('table-1');
    expect(ready).not.toContain('table-2');
  });

  it('should get buffer for table', () => {
    const buffer = multiBuffer.getBuffer('table-1');
    expect(buffer).toBeInstanceOf(CDCBuffer);
  });

  it('should remove buffer', () => {
    multiBuffer.add('table-1', 'source-1', [createMockWalEntry(1)]);
    expect(multiBuffer.hasData()).toBe(true);

    multiBuffer.removeBuffer('table-1');
    expect(multiBuffer.hasData()).toBe(false);
  });

  it('should calculate total entry count', () => {
    multiBuffer.add('table-1', 'source-1', [createMockWalEntry(1), createMockWalEntry(2)]);
    multiBuffer.add('table-2', 'source-1', [createMockWalEntry(3)]);

    expect(multiBuffer.getTotalEntryCount()).toBe(3);
  });

  it('should calculate total estimated size', () => {
    multiBuffer.add('table-1', 'source-1', [createMockWalEntry(1)]);
    multiBuffer.add('table-2', 'source-1', [createMockWalEntry(2)]);

    expect(multiBuffer.getTotalEstimatedSize()).toBeGreaterThan(0);
  });

  it('should get minimum time to flush across all buffers', () => {
    // Empty should return null
    expect(multiBuffer.getMinTimeToFlush()).toBeNull();

    multiBuffer.add('table-1', 'source-1', [createMockWalEntry(1)]);
    const time = multiBuffer.getMinTimeToFlush();
    expect(time).not.toBeNull();
    expect(time!).toBeGreaterThan(0);
  });
});

describe('BackpressureController', () => {
  let controller: BackpressureController;

  beforeEach(() => {
    controller = new BackpressureController({
      maxPressure: 100,
      highWaterMark: 80,
      lowWaterMark: 40,
    });
  });

  it('should start with no backpressure', () => {
    expect(controller.shouldApplyBackpressure()).toBe(false);
    expect(controller.getPressure()).toBe(0);
  });

  it('should apply backpressure when thresholds exceeded', () => {
    // Simulate high buffer usage
    controller.update(
      {
        entryCount: 15000,
        estimatedSize: 6 * 1024 * 1024,
        ageMs: 1000,
        sourceCount: 5,
        readyToFlush: true,
      },
      5 // pending blocks
    );

    expect(controller.shouldApplyBackpressure()).toBe(true);
  });

  it('should suggest delay based on pressure', () => {
    // Simulate very high pressure
    controller.update(
      {
        entryCount: 20000,
        estimatedSize: 8 * 1024 * 1024,
        ageMs: 10000,
        sourceCount: 10,
        readyToFlush: true,
      },
      15
    );

    const delay = controller.getSuggestedDelay();
    expect(delay).toBeGreaterThan(0);
    expect(delay).toBeLessThanOrEqual(1000);
  });

  it('should return 0 delay when below threshold', () => {
    controller.update(
      {
        entryCount: 100,
        estimatedSize: 10000,
        ageMs: 100,
        sourceCount: 1,
        readyToFlush: false,
      },
      0
    );

    expect(controller.getSuggestedDelay()).toBe(0);
  });

  it('should release backpressure when below low water mark', () => {
    // First apply pressure
    controller.update(
      {
        entryCount: 15000,
        estimatedSize: 6 * 1024 * 1024,
        ageMs: 1000,
        sourceCount: 5,
        readyToFlush: true,
      },
      5
    );

    expect(controller.shouldApplyBackpressure()).toBe(true);

    // Then reduce
    controller.update(
      {
        entryCount: 100,
        estimatedSize: 10000,
        ageMs: 100,
        sourceCount: 1,
        readyToFlush: false,
      },
      0
    );

    expect(controller.canReleaseBackpressure()).toBe(true);
  });

  it('should reset pressure', () => {
    controller.update(
      {
        entryCount: 15000,
        estimatedSize: 6 * 1024 * 1024,
        ageMs: 1000,
        sourceCount: 5,
        readyToFlush: true,
      },
      5
    );

    expect(controller.getPressure()).toBeGreaterThan(0);

    controller.reset();
    expect(controller.getPressure()).toBe(0);
  });

  it('should use default options', () => {
    const defaultController = new BackpressureController();
    expect(defaultController.getPressure()).toBe(0);
    expect(defaultController.shouldApplyBackpressure()).toBe(false);
  });
});

describe('SizeBasedBuffer', () => {
  it('should track size correctly', () => {
    const buffer = new SizeBasedBuffer(1000, 2000);

    expect(buffer.isEmpty()).toBe(true);
    expect(buffer.getSize()).toBe(0);

    const entries = [createMockWalEntry(1), createMockWalEntry(2)];
    buffer.add(entries);

    expect(buffer.isEmpty()).toBe(false);
    expect(buffer.getSize()).toBeGreaterThan(0);
    expect(buffer.getEntryCount()).toBe(2);
  });

  it('should indicate when to flush at target size', () => {
    const buffer = new SizeBasedBuffer(100, 200);

    // Add entries until target size reached
    let shouldFlush = false;
    for (let i = 0; i < 10; i++) {
      shouldFlush = buffer.add([createMockWalEntry(i, 'data'.repeat(5))]);
      if (shouldFlush) break;
    }

    expect(shouldFlush).toBe(true);
  });

  it('should indicate when at max capacity', () => {
    const buffer = new SizeBasedBuffer(100, 200);

    // Add entries until max capacity
    for (let i = 0; i < 20; i++) {
      buffer.add([createMockWalEntry(i, 'data'.repeat(5))]);
    }

    expect(buffer.isAtMaxCapacity()).toBe(true);
  });

  it('should drain correctly', () => {
    const buffer = new SizeBasedBuffer(1000, 2000);

    buffer.add([createMockWalEntry(1), createMockWalEntry(2)]);

    const drained = buffer.drain();
    expect(drained.length).toBe(2);
    expect(buffer.isEmpty()).toBe(true);
    expect(buffer.getSize()).toBe(0);
  });
});
