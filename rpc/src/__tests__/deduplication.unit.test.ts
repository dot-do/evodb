/**
 * RPC Deduplication Tests
 *
 * TDD RED Phase - These tests verify proper CDC deduplication behavior:
 * 1. Duplicate batch detection within 5-minute window
 * 2. Duplicate entry filtering by sequence number
 * 3. Dedup window expiration (entries older than 5 min should be accepted)
 * 4. Per-source dedup tracking (different sources don't interfere)
 * 5. Memory management (dedup state doesn't grow unbounded)
 * 6. Edge cases: empty batches, single entry, max batch size
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CDCBufferManager } from '../buffer.js';
import { WalEntry } from '../types.js';

// Helper to create a WalEntry
function createEntry(
  sequence: number,
  timestamp: number = Date.now(),
  table: string = 'test_table'
): WalEntry {
  return {
    sequence,
    timestamp,
    operation: 'INSERT',
    table,
    rowId: `row-${sequence}`,
    after: { id: `row-${sequence}`, data: `value-${sequence}` },
  };
}

// =============================================================================
// 1. DUPLICATE BATCH DETECTION WITHIN 5-MINUTE WINDOW
// =============================================================================

describe('Duplicate Batch Detection', () => {
  let buffer: CDCBufferManager;

  beforeEach(() => {
    buffer = new CDCBufferManager({
      enableDeduplication: true,
      deduplicationWindowMs: 5 * 60 * 1000, // 5 minutes
      maxBufferSize: 10 * 1024 * 1024, // 10MB
    });
  });

  it('should reject duplicate batch with same source and sequence number', () => {
    const sourceId = 'source-do-1';
    const entries = [createEntry(1), createEntry(2)];

    // First batch should be added
    const result1 = buffer.addBatch(sourceId, entries, 100);
    expect(result1.added).toBe(true);
    expect(result1.isDuplicate).toBe(false);
    expect(result1.batchId).toBeTruthy();

    // Duplicate batch (same source, same sequence) should be rejected
    const result2 = buffer.addBatch(sourceId, entries, 100);
    expect(result2.added).toBe(false);
    expect(result2.isDuplicate).toBe(true);
    expect(result2.batchId).toBeNull();
  });

  it('should accept different sequence numbers from same source', () => {
    const sourceId = 'source-do-1';
    const entries1 = [createEntry(1)];
    const entries2 = [createEntry(2)];

    const result1 = buffer.addBatch(sourceId, entries1, 100);
    expect(result1.added).toBe(true);

    const result2 = buffer.addBatch(sourceId, entries2, 101);
    expect(result2.added).toBe(true);
    expect(result2.isDuplicate).toBe(false);
  });

  it('should accept same sequence number from different sources', () => {
    const entries = [createEntry(1)];

    const result1 = buffer.addBatch('source-1', entries, 100);
    expect(result1.added).toBe(true);

    const result2 = buffer.addBatch('source-2', entries, 100);
    expect(result2.added).toBe(true);
    expect(result2.isDuplicate).toBe(false);
  });

  it('should track multiple sequence numbers per source', () => {
    const sourceId = 'source-do-1';

    // Add multiple batches
    for (let seq = 1; seq <= 10; seq++) {
      const result = buffer.addBatch(sourceId, [createEntry(seq)], seq);
      expect(result.added).toBe(true);
    }

    // All should be detected as duplicates
    for (let seq = 1; seq <= 10; seq++) {
      const result = buffer.addBatch(sourceId, [createEntry(seq)], seq);
      expect(result.isDuplicate).toBe(true);
    }
  });
});

// =============================================================================
// 2. DUPLICATE ENTRY FILTERING BY SEQUENCE NUMBER
// =============================================================================

describe('Entry-Level Deduplication', () => {
  let buffer: CDCBufferManager;

  beforeEach(() => {
    buffer = new CDCBufferManager({
      enableDeduplication: true,
      deduplicationWindowMs: 5 * 60 * 1000,
      maxBufferSize: 10 * 1024 * 1024,
    });
  });

  it('should filter duplicate entries within a batch', () => {
    const sourceId = 'source-do-1';

    // First add entries 1-5
    const batch1 = [createEntry(1), createEntry(2), createEntry(3), createEntry(4), createEntry(5)];
    buffer.addBatch(sourceId, batch1, 100);

    // Now add a batch with some overlapping entries (3-7)
    // Entries 3, 4, 5 should be filtered, 6, 7 should be kept
    const batch2 = [createEntry(3), createEntry(4), createEntry(5), createEntry(6), createEntry(7)];
    const result = buffer.addBatchWithEntryDedup(sourceId, batch2, 101);

    expect(result.added).toBe(true);
    expect(result.entriesAdded).toBe(2); // Only 6 and 7
    expect(result.entriesFiltered).toBe(3); // 3, 4, 5 were duplicates
  });

  it('should track per-source entry sequences independently', () => {
    // Add entry with sequence 1 from source A
    buffer.addBatch('source-A', [createEntry(1)], 100);

    // Same entry sequence from source B should NOT be filtered
    const result = buffer.addBatchWithEntryDedup('source-B', [createEntry(1)], 100);
    expect(result.entriesAdded).toBe(1);
    expect(result.entriesFiltered).toBe(0);
  });

  it('should handle mixed new and duplicate entries', () => {
    const sourceId = 'source-do-1';

    buffer.addBatch(sourceId, [createEntry(1), createEntry(3), createEntry(5)], 100);

    // Batch with interleaved new and duplicate entries
    const batch = [createEntry(1), createEntry(2), createEntry(3), createEntry(4), createEntry(5), createEntry(6)];
    const result = buffer.addBatchWithEntryDedup(sourceId, batch, 101);

    expect(result.entriesAdded).toBe(3); // 2, 4, 6 are new
    expect(result.entriesFiltered).toBe(3); // 1, 3, 5 are duplicates
  });
});

// =============================================================================
// 3. DEDUP WINDOW EXPIRATION (5-MINUTE WINDOW)
// =============================================================================

describe('Deduplication Window Expiration', () => {
  let buffer: CDCBufferManager;

  beforeEach(() => {
    vi.useFakeTimers();
    buffer = new CDCBufferManager({
      enableDeduplication: true,
      deduplicationWindowMs: 5 * 60 * 1000, // 5 minutes
      maxBufferSize: 10 * 1024 * 1024,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should accept previously seen batch after 5-minute window expires', () => {
    const sourceId = 'source-do-1';
    const entries = [createEntry(1)];

    // Add batch at t=0
    const result1 = buffer.addBatch(sourceId, entries, 100);
    expect(result1.added).toBe(true);

    // Duplicate at t=2min should be rejected
    vi.advanceTimersByTime(2 * 60 * 1000);
    const result2 = buffer.addBatch(sourceId, entries, 100);
    expect(result2.isDuplicate).toBe(true);

    // After 5 minutes total, the entry should be expired
    vi.advanceTimersByTime(3 * 60 * 1000 + 1); // 5 min + 1ms
    buffer.cleanupExpiredDedup(); // Explicit cleanup

    // Same sequence should now be accepted
    const result3 = buffer.addBatch(sourceId, entries, 100);
    expect(result3.added).toBe(true);
    expect(result3.isDuplicate).toBe(false);
  });

  it('should expire entries based on when they were first seen', () => {
    const sourceId = 'source-do-1';

    // Add batch 1 at t=0
    buffer.addBatch(sourceId, [createEntry(1)], 100);

    // Add batch 2 at t=2min
    vi.advanceTimersByTime(2 * 60 * 1000);
    buffer.addBatch(sourceId, [createEntry(2)], 101);

    // Add batch 3 at t=4min
    vi.advanceTimersByTime(2 * 60 * 1000);
    buffer.addBatch(sourceId, [createEntry(3)], 102);

    // At t=5min+1ms, batch 1 should be expired but 2 and 3 should not
    vi.advanceTimersByTime(1 * 60 * 1000 + 1);
    buffer.cleanupExpiredDedup();

    // Batch 1 (seq 100) should be accepted again
    const result1 = buffer.addBatch(sourceId, [createEntry(1)], 100);
    expect(result1.added).toBe(true);

    // Batches 2 and 3 should still be duplicates
    const result2 = buffer.addBatch(sourceId, [createEntry(2)], 101);
    expect(result2.isDuplicate).toBe(true);

    const result3 = buffer.addBatch(sourceId, [createEntry(3)], 102);
    expect(result3.isDuplicate).toBe(true);
  });

  it('should automatically cleanup expired entries on add', () => {
    const sourceId = 'source-do-1';

    // Add 100 batches
    for (let i = 0; i < 100; i++) {
      buffer.addBatch(sourceId, [createEntry(i)], i);
    }

    // Advance past expiration window
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);

    // Next add should trigger cleanup and allow old sequences
    const result = buffer.addBatch(sourceId, [createEntry(0)], 0);
    expect(result.added).toBe(true);
    expect(result.isDuplicate).toBe(false);
  });

  it('should handle entries added right at the window boundary', () => {
    const sourceId = 'source-do-1';

    buffer.addBatch(sourceId, [createEntry(1)], 100);

    // Advance to exactly 5 minutes (should still be valid)
    vi.advanceTimersByTime(5 * 60 * 1000);

    const result1 = buffer.addBatch(sourceId, [createEntry(1)], 100);
    expect(result1.isDuplicate).toBe(true);

    // Advance 1 more millisecond (should be expired)
    vi.advanceTimersByTime(1);
    buffer.cleanupExpiredDedup();

    const result2 = buffer.addBatch(sourceId, [createEntry(1)], 100);
    expect(result2.added).toBe(true);
  });
});

// =============================================================================
// 4. PER-SOURCE DEDUP TRACKING
// =============================================================================

describe('Per-Source Dedup Tracking', () => {
  let buffer: CDCBufferManager;

  beforeEach(() => {
    buffer = new CDCBufferManager({
      enableDeduplication: true,
      deduplicationWindowMs: 5 * 60 * 1000,
      maxBufferSize: 10 * 1024 * 1024,
    });
  });

  it('should maintain separate dedup state per source', () => {
    // Add same sequence from 3 different sources
    expect(buffer.addBatch('source-A', [createEntry(1)], 1).added).toBe(true);
    expect(buffer.addBatch('source-B', [createEntry(1)], 1).added).toBe(true);
    expect(buffer.addBatch('source-C', [createEntry(1)], 1).added).toBe(true);

    // Duplicates should only affect their own source
    expect(buffer.addBatch('source-A', [createEntry(1)], 1).isDuplicate).toBe(true);
    expect(buffer.addBatch('source-B', [createEntry(1)], 1).isDuplicate).toBe(true);
    expect(buffer.addBatch('source-C', [createEntry(1)], 1).isDuplicate).toBe(true);

    // Different sequences should still work
    expect(buffer.addBatch('source-A', [createEntry(2)], 2).added).toBe(true);
    expect(buffer.addBatch('source-B', [createEntry(2)], 2).added).toBe(true);
  });

  it('should handle source removal without affecting other sources', () => {
    buffer.addBatch('source-A', [createEntry(1)], 100);
    buffer.addBatch('source-B', [createEntry(1)], 100);

    // Remove source A
    buffer.removeChild('source-A');

    // Source A's sequence should now be accepted
    expect(buffer.addBatch('source-A', [createEntry(1)], 100).added).toBe(true);

    // Source B should still reject duplicates
    expect(buffer.addBatch('source-B', [createEntry(1)], 100).isDuplicate).toBe(true);
  });

  it('should handle many sources without cross-contamination', () => {
    const sourceCount = 50;
    const sequencesPerSource = 20;

    // Add batches from many sources
    for (let s = 0; s < sourceCount; s++) {
      for (let seq = 0; seq < sequencesPerSource; seq++) {
        const result = buffer.addBatch(`source-${s}`, [createEntry(seq)], seq);
        expect(result.added).toBe(true);
      }
    }

    // All should be duplicates
    for (let s = 0; s < sourceCount; s++) {
      for (let seq = 0; seq < sequencesPerSource; seq++) {
        const result = buffer.addBatch(`source-${s}`, [createEntry(seq)], seq);
        expect(result.isDuplicate).toBe(true);
      }
    }
  });
});

// =============================================================================
// 5. MEMORY MANAGEMENT (BOUNDED DEDUP STATE)
// =============================================================================

describe('Memory Management', () => {
  let buffer: CDCBufferManager;

  beforeEach(() => {
    buffer = new CDCBufferManager({
      enableDeduplication: true,
      deduplicationWindowMs: 5 * 60 * 1000,
      maxBufferSize: 10 * 1024 * 1024,
      maxDedupEntriesPerSource: 1000, // Limit per source
      maxDedupSources: 100, // Limit total sources
    });
  });

  it('should limit dedup entries per source', () => {
    const sourceId = 'source-do-1';

    // Add more than the max limit
    for (let seq = 0; seq < 1500; seq++) {
      buffer.addBatch(sourceId, [createEntry(seq)], seq);
    }

    // Get dedup stats
    const stats = buffer.getDedupStats();
    expect(stats.entriesPerSource.get(sourceId)).toBeLessThanOrEqual(1000);
  });

  it('should evict oldest entries when limit is reached', () => {
    const sourceId = 'source-do-1';

    // Fill to limit
    for (let seq = 0; seq < 1000; seq++) {
      buffer.addBatch(sourceId, [createEntry(seq)], seq);
    }

    // Old sequences should all be tracked
    expect(buffer.addBatch(sourceId, [createEntry(0)], 0).isDuplicate).toBe(true);
    expect(buffer.addBatch(sourceId, [createEntry(999)], 999).isDuplicate).toBe(true);

    // Add more to trigger eviction
    for (let seq = 1000; seq < 1500; seq++) {
      buffer.addBatch(sourceId, [createEntry(seq)], seq);
    }

    // Oldest sequences should have been evicted
    expect(buffer.addBatch(sourceId, [createEntry(0)], 0).added).toBe(true);
    expect(buffer.addBatch(sourceId, [createEntry(100)], 100).added).toBe(true);

    // Newer sequences should still be tracked
    expect(buffer.addBatch(sourceId, [createEntry(1400)], 1400).isDuplicate).toBe(true);
  });

  it('should limit total tracked sources', () => {
    // Add from many sources
    for (let s = 0; s < 150; s++) {
      buffer.addBatch(`source-${s}`, [createEntry(1)], 1);
    }

    const stats = buffer.getDedupStats();
    expect(stats.sourceCount).toBeLessThanOrEqual(100);
  });

  it('should provide accurate dedup statistics', () => {
    buffer.addBatch('source-A', [createEntry(1)], 1);
    buffer.addBatch('source-A', [createEntry(2)], 2);
    buffer.addBatch('source-B', [createEntry(1)], 1);

    const stats = buffer.getDedupStats();
    expect(stats.sourceCount).toBe(2);
    expect(stats.totalEntries).toBe(3);
    expect(stats.entriesPerSource.get('source-A')).toBe(2);
    expect(stats.entriesPerSource.get('source-B')).toBe(1);
  });

  it('should release memory when sources are removed', () => {
    for (let s = 0; s < 50; s++) {
      for (let seq = 0; seq < 100; seq++) {
        buffer.addBatch(`source-${s}`, [createEntry(seq)], seq);
      }
    }

    const statsBefore = buffer.getDedupStats();
    expect(statsBefore.totalEntries).toBe(5000);

    // Remove half the sources
    for (let s = 0; s < 25; s++) {
      buffer.removeChild(`source-${s}`);
    }

    const statsAfter = buffer.getDedupStats();
    expect(statsAfter.totalEntries).toBe(2500);
    expect(statsAfter.sourceCount).toBe(25);
  });
});

// =============================================================================
// 6. EDGE CASES
// =============================================================================

describe('Edge Cases', () => {
  let buffer: CDCBufferManager;

  beforeEach(() => {
    buffer = new CDCBufferManager({
      enableDeduplication: true,
      deduplicationWindowMs: 5 * 60 * 1000,
      maxBufferSize: 10 * 1024 * 1024,
    });
  });

  it('should handle empty batch', () => {
    const result = buffer.addBatch('source-1', [], 100);
    expect(result.added).toBe(true);
    expect(result.isDuplicate).toBe(false);

    // Empty batch with same sequence should still be duplicate
    const result2 = buffer.addBatch('source-1', [], 100);
    expect(result2.isDuplicate).toBe(true);
  });

  it('should handle single entry batch', () => {
    const result1 = buffer.addBatch('source-1', [createEntry(1)], 100);
    expect(result1.added).toBe(true);

    const result2 = buffer.addBatch('source-1', [createEntry(1)], 100);
    expect(result2.isDuplicate).toBe(true);
  });

  it('should handle very large batch', () => {
    const largeEntries = Array.from({ length: 10000 }, (_, i) => createEntry(i));
    const result = buffer.addBatch('source-1', largeEntries, 100);
    expect(result.added).toBe(true);

    const result2 = buffer.addBatch('source-1', largeEntries, 100);
    expect(result2.isDuplicate).toBe(true);
  });

  it('should handle sequence number 0', () => {
    const result1 = buffer.addBatch('source-1', [createEntry(0)], 0);
    expect(result1.added).toBe(true);

    const result2 = buffer.addBatch('source-1', [createEntry(0)], 0);
    expect(result2.isDuplicate).toBe(true);
  });

  it('should handle negative sequence numbers', () => {
    const result1 = buffer.addBatch('source-1', [createEntry(-1)], -1);
    expect(result1.added).toBe(true);

    const result2 = buffer.addBatch('source-1', [createEntry(-1)], -1);
    expect(result2.isDuplicate).toBe(true);
  });

  it('should handle very large sequence numbers', () => {
    const bigSeq = Number.MAX_SAFE_INTEGER;
    const result1 = buffer.addBatch('source-1', [createEntry(1)], bigSeq);
    expect(result1.added).toBe(true);

    const result2 = buffer.addBatch('source-1', [createEntry(1)], bigSeq);
    expect(result2.isDuplicate).toBe(true);
  });

  it('should handle special characters in source ID', () => {
    const weirdSourceId = 'source:with/special\\chars!@#$%^&*()';
    const result1 = buffer.addBatch(weirdSourceId, [createEntry(1)], 100);
    expect(result1.added).toBe(true);

    const result2 = buffer.addBatch(weirdSourceId, [createEntry(1)], 100);
    expect(result2.isDuplicate).toBe(true);
  });

  it('should handle unicode in source ID', () => {
    const unicodeSourceId = 'source-\u4e2d\u6587-\u{1F600}';
    const result1 = buffer.addBatch(unicodeSourceId, [createEntry(1)], 100);
    expect(result1.added).toBe(true);

    const result2 = buffer.addBatch(unicodeSourceId, [createEntry(1)], 100);
    expect(result2.isDuplicate).toBe(true);
  });

  it('should work when deduplication is disabled', () => {
    const noDedup = new CDCBufferManager({
      enableDeduplication: false,
      maxBufferSize: 10 * 1024 * 1024,
    });

    const result1 = noDedup.addBatch('source-1', [createEntry(1)], 100);
    expect(result1.added).toBe(true);

    // Should NOT be detected as duplicate when disabled
    const result2 = noDedup.addBatch('source-1', [createEntry(1)], 100);
    expect(result2.added).toBe(true);
    expect(result2.isDuplicate).toBe(false);
  });

  it('should handle concurrent-like batch additions', () => {
    // Simulate rapid additions that might happen concurrently
    const results: Array<{ added: boolean; isDuplicate: boolean }> = [];
    const sourceId = 'source-1';

    for (let i = 0; i < 100; i++) {
      // Alternate between new and duplicate
      const seq = i % 10;
      results.push(buffer.addBatch(sourceId, [createEntry(seq)], seq));
    }

    // First 10 should be added
    for (let i = 0; i < 10; i++) {
      expect(results[i].added).toBe(true);
      expect(results[i].isDuplicate).toBe(false);
    }

    // Rest should be duplicates
    for (let i = 10; i < 100; i++) {
      expect(results[i].isDuplicate).toBe(true);
    }
  });
});

// =============================================================================
// 7. DEDUPLICATION WITH BUFFER OPERATIONS
// =============================================================================

describe('Dedup Integration with Buffer', () => {
  let buffer: CDCBufferManager;

  beforeEach(() => {
    vi.useFakeTimers();
    buffer = new CDCBufferManager({
      enableDeduplication: true,
      deduplicationWindowMs: 5 * 60 * 1000,
      maxBufferSize: 10 * 1024 * 1024,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should maintain dedup state after buffer flush', () => {
    buffer.addBatch('source-1', [createEntry(1)], 100);
    buffer.addBatch('source-1', [createEntry(2)], 101);

    // Simulate flush
    const batches = buffer.getBatchesForFlush();
    buffer.markPersisted(batches.map(b => b.batchId));
    buffer.clearPersisted();

    // Dedup state should still be maintained
    expect(buffer.addBatch('source-1', [createEntry(1)], 100).isDuplicate).toBe(true);
    expect(buffer.addBatch('source-1', [createEntry(2)], 101).isDuplicate).toBe(true);
  });

  it('should maintain dedup state through serialization/restore', () => {
    buffer.addBatch('source-1', [createEntry(1)], 100);
    buffer.addBatch('source-2', [createEntry(1)], 100);

    // Serialize and restore
    const snapshot = buffer.serialize();
    const restored = CDCBufferManager.restore(snapshot, {
      enableDeduplication: true,
      deduplicationWindowMs: 5 * 60 * 1000,
    });

    // Dedup state should be preserved
    expect(restored.addBatch('source-1', [createEntry(1)], 100).isDuplicate).toBe(true);
    expect(restored.addBatch('source-2', [createEntry(1)], 100).isDuplicate).toBe(true);
  });

  it('should handle clear() resetting dedup state', () => {
    buffer.addBatch('source-1', [createEntry(1)], 100);
    expect(buffer.addBatch('source-1', [createEntry(1)], 100).isDuplicate).toBe(true);

    buffer.clear();

    // After clear, should accept again
    expect(buffer.addBatch('source-1', [createEntry(1)], 100).added).toBe(true);
  });
});
