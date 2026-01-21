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

  describe('constructor validation', () => {
    it('should throw error when bufferSize is negative', () => {
      expect(() => new CDCBuffer({
        bufferSize: -1,
        bufferTimeout: 1000,
        targetBlockSize: 10000,
      })).toThrow('bufferSize must be positive');
    });

    it('should throw error when bufferSize is zero', () => {
      expect(() => new CDCBuffer({
        bufferSize: 0,
        bufferTimeout: 1000,
        targetBlockSize: 10000,
      })).toThrow('bufferSize must be positive');
    });

    it('should throw error when bufferSize is NaN', () => {
      expect(() => new CDCBuffer({
        bufferSize: NaN,
        bufferTimeout: 1000,
        targetBlockSize: 10000,
      })).toThrow('bufferSize must be positive');
    });

    it('should throw error when bufferTimeout is negative', () => {
      expect(() => new CDCBuffer({
        bufferSize: 100,
        bufferTimeout: -1,
        targetBlockSize: 10000,
      })).toThrow('bufferTimeout must be positive');
    });

    it('should throw error when bufferTimeout is zero', () => {
      expect(() => new CDCBuffer({
        bufferSize: 100,
        bufferTimeout: 0,
        targetBlockSize: 10000,
      })).toThrow('bufferTimeout must be positive');
    });

    it('should throw error when bufferTimeout is NaN', () => {
      expect(() => new CDCBuffer({
        bufferSize: 100,
        bufferTimeout: NaN,
        targetBlockSize: 10000,
      })).toThrow('bufferTimeout must be positive');
    });

    it('should throw error when targetBlockSize is negative', () => {
      expect(() => new CDCBuffer({
        bufferSize: 100,
        bufferTimeout: 1000,
        targetBlockSize: -1,
      })).toThrow('targetBlockSize must be positive');
    });

    it('should throw error when targetBlockSize is zero', () => {
      expect(() => new CDCBuffer({
        bufferSize: 100,
        bufferTimeout: 1000,
        targetBlockSize: 0,
      })).toThrow('targetBlockSize must be positive');
    });

    it('should throw error when targetBlockSize is NaN', () => {
      expect(() => new CDCBuffer({
        bufferSize: 100,
        bufferTimeout: 1000,
        targetBlockSize: NaN,
      })).toThrow('targetBlockSize must be positive');
    });

    it('should accept valid positive values', () => {
      expect(() => new CDCBuffer({
        bufferSize: 1,
        bufferTimeout: 1,
        targetBlockSize: 1,
      })).not.toThrow();
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

    it('should correctly track minLsn for values larger than MAX_SAFE_INTEGER', () => {
      // LSN values can be 64-bit integers, which exceed Number.MAX_SAFE_INTEGER
      // The buffer should correctly track min/max for these large values
      const largeLsn = 9007199254740992n; // Number.MAX_SAFE_INTEGER + 1
      const largerLsn = 9223372036854775807n; // Max signed 64-bit integer

      const encoder = new TextEncoder();
      const entries: WalEntry[] = [
        {
          lsn: largerLsn,
          timestamp: BigInt(Date.now()),
          op: 1,
          flags: 0,
          data: encoder.encode('test'),
          checksum: 12345,
        },
        {
          lsn: largeLsn,
          timestamp: BigInt(Date.now()),
          op: 1,
          flags: 0,
          data: encoder.encode('test'),
          checksum: 12345,
        },
      ];

      buffer.add('source-1', entries);

      const range = buffer.getLsnRange();
      expect(range).not.toBeNull();
      // The smaller of the two large LSNs should be the min
      expect(range!.min).toBe(largeLsn);
      expect(range!.max).toBe(largerLsn);
    });

    it('should correctly reset minLsn after drain for subsequent large LSN values', () => {
      // First add and drain some entries
      buffer.add('source-1', [createMockWalEntry(100)]);
      buffer.drain();

      // After drain, add entries with LSN larger than MAX_SAFE_INTEGER
      const largeLsn = 9007199254740992n; // Number.MAX_SAFE_INTEGER + 1

      const encoder = new TextEncoder();
      const entries: WalEntry[] = [
        {
          lsn: largeLsn,
          timestamp: BigInt(Date.now()),
          op: 1,
          flags: 0,
          data: encoder.encode('test'),
          checksum: 12345,
        },
      ];

      buffer.add('source-1', entries);

      const range = buffer.getLsnRange();
      expect(range).not.toBeNull();
      // The minLsn should be the large LSN, not the initial MAX_SAFE_INTEGER value
      expect(range!.min).toBe(largeLsn);
      expect(range!.max).toBe(largeLsn);
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

describe('CDCBuffer buffer overflow protection', () => {
  // Helper to create mock WAL entries
  function createMockEntry(lsn: number, data: string = 'test'): WalEntry {
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

  describe('maxBufferSize configuration', () => {
    it('should accept maxBufferSize option', () => {
      const buffer = new CDCBuffer({
        bufferSize: 100,
        bufferTimeout: 1000,
        targetBlockSize: 10000,
        maxBufferSize: 50000, // 50KB hard limit
      });

      expect(buffer).toBeInstanceOf(CDCBuffer);
    });

    it('should throw error when maxBufferSize is negative', () => {
      expect(() => new CDCBuffer({
        bufferSize: 100,
        bufferTimeout: 1000,
        targetBlockSize: 10000,
        maxBufferSize: -1,
      })).toThrow('maxBufferSize must be positive');
    });

    it('should throw error when maxBufferSize is zero', () => {
      expect(() => new CDCBuffer({
        bufferSize: 100,
        bufferTimeout: 1000,
        targetBlockSize: 10000,
        maxBufferSize: 0,
      })).toThrow('maxBufferSize must be positive');
    });

    it('should throw error when maxBufferSize is NaN', () => {
      expect(() => new CDCBuffer({
        bufferSize: 100,
        bufferTimeout: 1000,
        targetBlockSize: 10000,
        maxBufferSize: NaN,
      })).toThrow('maxBufferSize must be positive');
    });

    it('should use default maxBufferSize when not specified', () => {
      const buffer = new CDCBuffer({
        bufferSize: 100,
        bufferTimeout: 1000,
        targetBlockSize: 10000,
      });

      // Default should be a reasonable value (e.g., 128MB)
      // Buffer should work normally without explicit maxBufferSize
      const entries = Array.from({ length: 10 }, (_, i) => createMockEntry(i));
      buffer.add('source-1', entries);
      expect(buffer.size()).toBe(10);
    });
  });

  describe('BufferOverflowError', () => {
    it('should throw BufferOverflowError when adding entries would exceed maxBufferSize', () => {
      const buffer = new CDCBuffer({
        bufferSize: 1000, // High entry count threshold
        bufferTimeout: 10000, // Long timeout
        targetBlockSize: 1000000, // Large block size
        maxBufferSize: 500, // Very small max buffer (500 bytes)
      });

      // Each entry is approximately 24 + data.length + 4 = ~32 bytes for 'test' data
      // So ~15 entries should exceed 500 bytes
      const entries = Array.from({ length: 5 }, (_, i) => createMockEntry(i));
      buffer.add('source-1', entries);

      // Adding more entries should throw BufferOverflowError
      const moreEntries = Array.from({ length: 15 }, (_, i) => createMockEntry(i + 5));

      expect(() => buffer.add('source-1', moreEntries)).toThrow('BufferOverflowError');
    });

    it('should include buffer size details in BufferOverflowError message', () => {
      const buffer = new CDCBuffer({
        bufferSize: 1000,
        bufferTimeout: 10000,
        targetBlockSize: 1000000,
        maxBufferSize: 500,
      });

      const entries = Array.from({ length: 20 }, (_, i) => createMockEntry(i));

      try {
        buffer.add('source-1', entries);
        fail('Expected BufferOverflowError to be thrown');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(Error);
        const err = error as Error;
        expect(err.message).toContain('BufferOverflowError');
        expect(err.message).toContain('500'); // maxBufferSize
      }
    });

    it('should export BufferOverflowError class for instanceof checks', async () => {
      const { BufferOverflowError } = await import('./buffer.js');

      expect(BufferOverflowError).toBeDefined();

      const buffer = new CDCBuffer({
        bufferSize: 1000,
        bufferTimeout: 10000,
        targetBlockSize: 1000000,
        maxBufferSize: 500,
      });

      const entries = Array.from({ length: 20 }, (_, i) => createMockEntry(i));

      try {
        buffer.add('source-1', entries);
        fail('Expected BufferOverflowError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(BufferOverflowError);
      }
    });

    it('should provide current size and max size in error', async () => {
      const { BufferOverflowError } = await import('./buffer.js');

      const buffer = new CDCBuffer({
        bufferSize: 1000,
        bufferTimeout: 10000,
        targetBlockSize: 1000000,
        maxBufferSize: 500,
      });

      const entries = Array.from({ length: 20 }, (_, i) => createMockEntry(i));

      try {
        buffer.add('source-1', entries);
        fail('Expected BufferOverflowError to be thrown');
      } catch (error) {
        if (error instanceof BufferOverflowError) {
          expect(error.currentSize).toBeGreaterThan(0);
          expect(error.maxSize).toBe(500);
        } else {
          fail('Expected BufferOverflowError instance');
        }
      }
    });
  });

  describe('buffer limit behavior', () => {
    it('should allow adding entries up to but not exceeding maxBufferSize', () => {
      const buffer = new CDCBuffer({
        bufferSize: 1000,
        bufferTimeout: 10000,
        targetBlockSize: 1000000,
        maxBufferSize: 1000, // 1KB limit
      });

      // Add entries that fit within limit
      const smallEntries = Array.from({ length: 5 }, (_, i) => createMockEntry(i));
      expect(() => buffer.add('source-1', smallEntries)).not.toThrow();

      // More small additions should work
      const moreSmallEntries = Array.from({ length: 5 }, (_, i) => createMockEntry(i + 5));
      expect(() => buffer.add('source-1', moreSmallEntries)).not.toThrow();
    });

    it('should reset size tracking after drain', () => {
      const buffer = new CDCBuffer({
        bufferSize: 1000,
        bufferTimeout: 10000,
        targetBlockSize: 1000000,
        maxBufferSize: 1000,
      });

      // Fill buffer close to limit
      const entries = Array.from({ length: 15 }, (_, i) => createMockEntry(i));
      buffer.add('source-1', entries);

      // Drain the buffer
      buffer.drain();

      // Should be able to add entries again
      const newEntries = Array.from({ length: 15 }, (_, i) => createMockEntry(i + 100));
      expect(() => buffer.add('source-1', newEntries)).not.toThrow();
    });

    it('should track size correctly with large data payloads', () => {
      const buffer = new CDCBuffer({
        bufferSize: 1000,
        bufferTimeout: 10000,
        targetBlockSize: 1000000,
        maxBufferSize: 1000,
      });

      // Create entry with large data payload (500+ bytes)
      const largeDataEntry = createMockEntry(1, 'x'.repeat(600));
      buffer.add('source-1', [largeDataEntry]);

      // Next large entry should trigger overflow
      const anotherLargeEntry = createMockEntry(2, 'y'.repeat(600));
      expect(() => buffer.add('source-1', [anotherLargeEntry])).toThrow('BufferOverflowError');
    });
  });

  describe('integration with fromWriterOptions', () => {
    it('should support maxBufferSize in ResolvedWriterOptions', () => {
      // This test verifies that maxBufferSize can be passed through writer options
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
        maxBufferSize: 64 * 1024 * 1024, // 64MB
      });

      expect(buffer).toBeInstanceOf(CDCBuffer);
    });
  });
});

describe('CDCBuffer atomic LSN updates', () => {
  // Tests for atomic compare-and-swap (CAS) LSN tracking
  // Issue evodb-505: Ensure concurrent LSN updates don't cause race conditions

  function createEntry(lsn: number, data: string = 'test'): WalEntry {
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

  it('should atomically update cursor with compare-and-swap semantics', () => {
    const buffer = new CDCBuffer({
      bufferSize: 10000,
      bufferTimeout: 10000,
      targetBlockSize: 1000000,
    });

    const sourceId = 'source-1';

    // First update should succeed (no existing cursor)
    buffer.add(sourceId, [createEntry(100)]);
    expect(buffer.getSourceCursors().get(sourceId)).toBe(100n);

    // Update with higher LSN should succeed
    buffer.add(sourceId, [createEntry(200)]);
    expect(buffer.getSourceCursors().get(sourceId)).toBe(200n);

    // Update with lower LSN should NOT change cursor (CAS semantics)
    buffer.add(sourceId, [createEntry(150)]);
    expect(buffer.getSourceCursors().get(sourceId)).toBe(200n);

    // Update with equal LSN should NOT change cursor
    buffer.add(sourceId, [createEntry(200)]);
    expect(buffer.getSourceCursors().get(sourceId)).toBe(200n);
  });

  it('should track cursor update attempts via logging callback', () => {
    const logEntries: Array<{
      sourceDoId: string;
      previousLsn: bigint | undefined;
      newLsn: bigint;
      updated: boolean;
    }> = [];

    const buffer = new CDCBuffer({
      bufferSize: 10000,
      bufferTimeout: 10000,
      targetBlockSize: 1000000,
    });

    // Set up logging callback
    buffer.setLsnUpdateLogger((sourceDoId, previousLsn, newLsn, updated) => {
      logEntries.push({ sourceDoId, previousLsn, newLsn, updated });
    });

    const sourceId = 'source-1';

    // First add - should log update from undefined to 100
    buffer.add(sourceId, [createEntry(100)]);
    expect(logEntries.length).toBe(1);
    expect(logEntries[0]).toEqual({
      sourceDoId: sourceId,
      previousLsn: undefined,
      newLsn: 100n,
      updated: true,
    });

    // Second add with higher LSN - should log update from 100 to 200
    buffer.add(sourceId, [createEntry(200)]);
    expect(logEntries.length).toBe(2);
    expect(logEntries[1]).toEqual({
      sourceDoId: sourceId,
      previousLsn: 100n,
      newLsn: 200n,
      updated: true,
    });

    // Third add with lower LSN - should log rejected update
    buffer.add(sourceId, [createEntry(150)]);
    expect(logEntries.length).toBe(3);
    expect(logEntries[2]).toEqual({
      sourceDoId: sourceId,
      previousLsn: 200n,
      newLsn: 150n,
      updated: false,
    });
  });

  it('should provide getLastCursorUpdate for debugging', () => {
    const buffer = new CDCBuffer({
      bufferSize: 10000,
      bufferTimeout: 10000,
      targetBlockSize: 1000000,
    });

    // Initially no updates
    expect(buffer.getLastCursorUpdate('source-1')).toBeUndefined();

    buffer.add('source-1', [createEntry(100)]);

    const lastUpdate = buffer.getLastCursorUpdate('source-1');
    expect(lastUpdate).toBeDefined();
    expect(lastUpdate!.previousLsn).toBeUndefined();
    expect(lastUpdate!.newLsn).toBe(100n);
    expect(lastUpdate!.updated).toBe(true);
    expect(lastUpdate!.timestamp).toBeGreaterThan(0);

    buffer.add('source-1', [createEntry(200)]);

    const secondUpdate = buffer.getLastCursorUpdate('source-1');
    expect(secondUpdate!.previousLsn).toBe(100n);
    expect(secondUpdate!.newLsn).toBe(200n);
    expect(secondUpdate!.updated).toBe(true);
  });

  it('should handle concurrent updates to same source with proper ordering', async () => {
    const buffer = new CDCBuffer({
      bufferSize: 100000,
      bufferTimeout: 10000,
      targetBlockSize: 10000000,
    });

    const updateLog: Array<{ lsn: bigint; updated: boolean }> = [];

    buffer.setLsnUpdateLogger((_sourceDoId, _previousLsn, newLsn, updated) => {
      updateLog.push({ lsn: newLsn, updated });
    });

    const sourceId = 'source-1';

    // Simulate rapid concurrent updates with varying LSNs
    // In a race condition scenario, the final cursor might not be the max
    const lsns = [100, 500, 200, 800, 300, 1000, 400, 900, 600, 700];

    await Promise.all(
      lsns.map(lsn =>
        Promise.resolve().then(() => buffer.add(sourceId, [createEntry(lsn)]))
      )
    );

    // Final cursor should be the maximum LSN (1000)
    expect(buffer.getSourceCursors().get(sourceId)).toBe(1000n);

    // Verify logging captured all attempts
    expect(updateLog.length).toBe(lsns.length);

    // Count successful updates - only monotonically increasing LSNs should succeed
    const successfulUpdates = updateLog.filter(u => u.updated);
    expect(successfulUpdates.length).toBeGreaterThan(0);
  });

  it('should maintain cursor monotonicity under simulated async interleaving', async () => {
    const buffer = new CDCBuffer({
      bufferSize: 100000,
      bufferTimeout: 10000,
      targetBlockSize: 10000000,
    });

    const sourceId = 'source-1';
    const iterations = 100;
    const maxLsn = 10000n;

    // Generate random LSNs
    const randomLsns = Array.from(
      { length: iterations },
      () => BigInt(Math.floor(Math.random() * Number(maxLsn)))
    );

    // Execute with simulated async interleaving
    await Promise.all(
      randomLsns.map((lsn) =>
        new Promise<void>(resolve => {
          // Random delay to simulate async behavior
          setTimeout(() => {
            buffer.add(sourceId, [createEntry(Number(lsn))]);
            resolve();
          }, Math.random() * 10);
        })
      )
    );

    // Cursor should be the maximum of all LSNs
    const expectedMax = randomLsns.reduce((max, lsn) => lsn > max ? lsn : max, 0n);
    expect(buffer.getSourceCursors().get(sourceId)).toBe(expectedMax);
  });

  it('should log warning when cursor update is rejected due to lower LSN', () => {
    const warnings: string[] = [];
    const buffer = new CDCBuffer({
      bufferSize: 10000,
      bufferTimeout: 10000,
      targetBlockSize: 1000000,
    });

    buffer.setLsnUpdateLogger((sourceDoId, previousLsn, newLsn, updated) => {
      if (!updated && previousLsn !== undefined) {
        warnings.push(
          `Rejected cursor update for ${sourceDoId}: ${newLsn} <= ${previousLsn}`
        );
      }
    });

    buffer.add('source-1', [createEntry(100)]);
    buffer.add('source-1', [createEntry(50)]); // Should be rejected

    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain('Rejected');
    expect(warnings[0]).toContain('50');
    expect(warnings[0]).toContain('100');
  });

  it('should provide atomic compareAndSetCursor for external use', () => {
    const buffer = new CDCBuffer({
      bufferSize: 10000,
      bufferTimeout: 10000,
      targetBlockSize: 1000000,
    });

    const sourceId = 'source-1';

    // CAS on non-existent cursor (expected undefined)
    const result1 = buffer.compareAndSetCursor(sourceId, undefined, 100n);
    expect(result1).toBe(true);
    expect(buffer.getSourceCursors().get(sourceId)).toBe(100n);

    // CAS with correct expected value
    const result2 = buffer.compareAndSetCursor(sourceId, 100n, 200n);
    expect(result2).toBe(true);
    expect(buffer.getSourceCursors().get(sourceId)).toBe(200n);

    // CAS with incorrect expected value (should fail)
    const result3 = buffer.compareAndSetCursor(sourceId, 100n, 300n);
    expect(result3).toBe(false);
    expect(buffer.getSourceCursors().get(sourceId)).toBe(200n); // Unchanged

    // CAS with new value less than current (should fail even if expected matches)
    const result4 = buffer.compareAndSetCursor(sourceId, 200n, 150n);
    expect(result4).toBe(false);
    expect(buffer.getSourceCursors().get(sourceId)).toBe(200n); // Unchanged
  });
});

describe('CDCBuffer concurrent access', () => {
  // Helper to create mock WAL entries with specific LSN
  function createEntry(lsn: number, data: string = 'test'): WalEntry {
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

  it('should handle concurrent adds from multiple sources correctly', async () => {
    const buffer = new CDCBuffer({
      bufferSize: 10000,
      bufferTimeout: 10000,
      targetBlockSize: 1000000,
    });

    // Simulate concurrent adds from multiple sources
    const sourceCount = 10;
    const entriesPerSource = 100;

    const addPromises: Promise<void>[] = [];

    for (let sourceIndex = 0; sourceIndex < sourceCount; sourceIndex++) {
      const sourceId = `source-${sourceIndex}`;

      // Each source adds multiple batches concurrently
      for (let batch = 0; batch < 10; batch++) {
        addPromises.push(
          Promise.resolve().then(() => {
            const entries = Array.from(
              { length: entriesPerSource / 10 },
              (_, i) => createEntry(batch * 1000 + i + 1)
            );
            buffer.add(sourceId, entries);
          })
        );
      }
    }

    await Promise.all(addPromises);

    // Verify all entries were added
    const stats = buffer.getStats();
    expect(stats.entryCount).toBe(sourceCount * entriesPerSource);
    expect(stats.sourceCount).toBe(sourceCount);

    // Verify each source cursor is set to the maximum LSN for that source
    const cursors = buffer.getSourceCursors();
    expect(cursors.size).toBe(sourceCount);

    for (let sourceIndex = 0; sourceIndex < sourceCount; sourceIndex++) {
      const sourceId = `source-${sourceIndex}`;
      const cursor = cursors.get(sourceId);
      // The max LSN should be from batch 9: 9 * 1000 + 10 = 9010
      expect(cursor).toBe(9010n);
    }
  });

  it('should maintain cursor monotonicity even with out-of-order concurrent adds', async () => {
    const buffer = new CDCBuffer({
      bufferSize: 10000,
      bufferTimeout: 10000,
      targetBlockSize: 1000000,
    });

    const sourceId = 'source-1';

    // Simulate concurrent adds with out-of-order LSNs
    // This tests that cursor is only updated if new LSN > current cursor
    const addPromises = [
      Promise.resolve().then(() => buffer.add(sourceId, [createEntry(100)])),
      Promise.resolve().then(() => buffer.add(sourceId, [createEntry(50)])),  // Lower LSN
      Promise.resolve().then(() => buffer.add(sourceId, [createEntry(200)])),
      Promise.resolve().then(() => buffer.add(sourceId, [createEntry(75)])),  // Lower LSN
      Promise.resolve().then(() => buffer.add(sourceId, [createEntry(150)])), // Lower than 200
    ];

    await Promise.all(addPromises);

    // Cursor should be the maximum LSN (200), not the last one processed
    const cursors = buffer.getSourceCursors();
    expect(cursors.get(sourceId)).toBe(200n);

    // All entries should be in the buffer
    expect(buffer.size()).toBe(5);
  });

  it('should handle interleaved adds across same source from different callers', async () => {
    const buffer = new CDCBuffer({
      bufferSize: 10000,
      bufferTimeout: 10000,
      targetBlockSize: 1000000,
    });

    const sourceId = 'shared-source';
    const results: bigint[] = [];

    // Multiple callers adding to the same source simultaneously
    // This simulates the race condition where multiple DO requests
    // arrive at the same time for the same source
    const caller1 = async () => {
      for (let i = 0; i < 50; i++) {
        buffer.add(sourceId, [createEntry(i * 2 + 1)]); // Odd LSNs: 1, 3, 5, ...
        // Small delay to allow interleaving
        await new Promise(r => setTimeout(r, 0));
      }
    };

    const caller2 = async () => {
      for (let i = 0; i < 50; i++) {
        buffer.add(sourceId, [createEntry(i * 2 + 2)]); // Even LSNs: 2, 4, 6, ...
        await new Promise(r => setTimeout(r, 0));
      }
    };

    await Promise.all([caller1(), caller2()]);

    // Should have all 100 entries
    expect(buffer.size()).toBe(100);

    // Cursor should be max(99, 100) = 100
    const cursor = buffer.getSourceCursors().get(sourceId);
    expect(cursor).toBe(100n);
  });

  it('should correctly track source cursors during high-contention scenario', async () => {
    const buffer = new CDCBuffer({
      bufferSize: 100000,
      bufferTimeout: 10000,
      targetBlockSize: 10000000,
    });

    // High contention: many sources, many concurrent operations
    const sourceCount = 50;
    const iterationsPerSource = 20;

    const operations: Promise<void>[] = [];
    const expectedMaxLsn = new Map<string, bigint>();

    for (let s = 0; s < sourceCount; s++) {
      const sourceId = `source-${s}`;
      let maxLsn = 0n;

      for (let i = 0; i < iterationsPerSource; i++) {
        const lsn = BigInt(s * 10000 + i * 100 + Math.floor(Math.random() * 100));
        if (lsn > maxLsn) maxLsn = lsn;

        operations.push(
          Promise.resolve().then(() => {
            buffer.add(sourceId, [createEntry(Number(lsn))]);
          })
        );
      }

      expectedMaxLsn.set(sourceId, maxLsn);
    }

    await Promise.all(operations);

    // Verify cursor for each source matches expected max
    const cursors = buffer.getSourceCursors();
    expect(cursors.size).toBe(sourceCount);

    for (const [sourceId, expectedMax] of expectedMaxLsn) {
      const actualCursor = cursors.get(sourceId);
      expect(actualCursor).toBe(expectedMax);
    }
  });

  it('should use max LSN from batch, not last LSN, for cursor update', async () => {
    const buffer = new CDCBuffer({
      bufferSize: 10000,
      bufferTimeout: 10000,
      targetBlockSize: 1000000,
    });

    const sourceId = 'source-1';

    // Add a batch where the max LSN is not the last entry
    // The cursor should be set to max(100, 50, 75) = 100
    buffer.add(sourceId, [
      createEntry(100),
      createEntry(50),
      createEntry(75),
    ]);

    expect(buffer.getSourceCursors().get(sourceId)).toBe(100n);

    // Now add another batch with max LSN < current cursor
    // Cursor should remain at 100
    buffer.add(sourceId, [
      createEntry(80),
      createEntry(90),
      createEntry(60),
    ]);

    expect(buffer.getSourceCursors().get(sourceId)).toBe(100n);

    // Add batch with max LSN > current cursor
    // Cursor should advance to 150
    buffer.add(sourceId, [
      createEntry(120),
      createEntry(150),
      createEntry(130),
    ]);

    expect(buffer.getSourceCursors().get(sourceId)).toBe(150n);
  });
});
