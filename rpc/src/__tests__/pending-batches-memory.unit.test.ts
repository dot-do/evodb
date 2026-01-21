/**
 * Pending Batches Memory Management Tests
 *
 * TDD RED Phase - These tests verify that pendingBatches Map doesn't grow unbounded:
 * 1. pendingBatches grows unbounded when acks are slow/missing (demonstrates the bug)
 * 2. TTL-based cleanup removes stale pending batches
 * 3. maxPendingBatches config limits Map size with eviction
 * 4. Pending batch eviction triggers proper rejection of promises
 * 5. Stats expose pending batches memory usage
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LakehouseRpcClient, EvoDBRpcClient } from '../client.js';
import type { ChildConfig } from '../types.js';

// =============================================================================
// Helper to create a mock WebSocket
// =============================================================================

function createMockWebSocket(): WebSocket {
  const ws = {
    send: vi.fn(),
    close: vi.fn(),
    readyState: 1, // OPEN
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    binaryType: 'arraybuffer' as BinaryType,
    bufferedAmount: 0,
    extensions: '',
    onclose: null,
    onerror: null,
    onmessage: null,
    onopen: null,
    protocol: '',
    url: 'ws://test',
    CLOSED: 3,
    CLOSING: 2,
    CONNECTING: 0,
    OPEN: 1,
  };
  return ws as unknown as WebSocket;
}

// =============================================================================
// 1. DEMONSTRATE THE BUG: UNBOUNDED GROWTH
// =============================================================================

describe('pendingBatches Unbounded Growth (Bug Demonstration)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should demonstrate unbounded growth when acks never arrive', async () => {
    // This test demonstrates the current bug - pendingBatches grows without limit
    // when acknowledgments are slow or never arrive

    const client = new EvoDBRpcClient({
      parentDoUrl: 'ws://parent-do/rpc',
      sourceDoId: 'leak-demo-client',
    });

    await client.connect();

    // Queue many pending batches (simulating slow acks)
    for (let i = 0; i < 1000; i++) {
      client.queuePendingBatch(
        [{ sequence: i, timestamp: Date.now(), operation: 'INSERT', table: 't', rowId: `r${i}` }],
        i
      );
    }

    // BUG: pendingBatches should be bounded, but currently it grows unbounded
    // This test will FAIL once we add bounds checking
    const pendingCount = client.getPendingBatches().size;

    // The current buggy behavior allows 1000 entries
    // After fix, this should be capped at maxPendingBatches (e.g., 100)
    expect(pendingCount).toBeLessThanOrEqual(100);
  });

  it('should show memory leak pattern with accumulating stale batches', async () => {
    const client = new EvoDBRpcClient({
      parentDoUrl: 'ws://parent-do/rpc',
      sourceDoId: 'memory-leak-client',
    });

    await client.connect();

    // Add batches over time without any acks
    for (let i = 0; i < 50; i++) {
      client.queuePendingBatch(
        [{ sequence: i, timestamp: Date.now(), operation: 'INSERT', table: 't', rowId: `r${i}` }],
        i
      );
      vi.advanceTimersByTime(1000); // 1 second between batches
    }

    // After 50 seconds, all 50 batches should still be pending
    // This is the bug - old batches should be cleaned up based on TTL
    const pendingBatches = client.getPendingBatches();

    // Batches older than 30 seconds should be cleaned up
    // With a 30s TTL, we should have at most ~30 batches
    expect(pendingBatches.size).toBeLessThanOrEqual(30);
  });
});

// =============================================================================
// 2. TTL-BASED CLEANUP TESTS
// =============================================================================

describe('TTL-Based Pending Batch Cleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should support pendingBatchTtlMs configuration', () => {
    const client = new EvoDBRpcClient({
      parentDoUrl: 'ws://parent-do/rpc',
      sourceDoId: 'ttl-config-client',
      pendingBatchTtlMs: 60000, // 60 second TTL
    });

    // Config should be accessible
    expect((client as any).config.pendingBatchTtlMs).toBe(60000);
  });

  it('should clean up pending batches older than TTL', async () => {
    const client = new EvoDBRpcClient({
      parentDoUrl: 'ws://parent-do/rpc',
      sourceDoId: 'ttl-cleanup-client',
      pendingBatchTtlMs: 30000, // 30 second TTL
    });

    await client.connect();

    // Add a batch at t=0
    client.queuePendingBatch(
      [{ sequence: 1, timestamp: Date.now(), operation: 'INSERT', table: 't', rowId: 'r1' }],
      1
    );
    expect(client.getPendingBatches().size).toBe(1);

    // Advance time by 25 seconds - batch should still be present
    vi.advanceTimersByTime(25000);
    client.cleanupExpiredPendingBatches();
    expect(client.getPendingBatches().size).toBe(1);

    // Advance time by 6 more seconds (31 total) - batch should be cleaned up
    vi.advanceTimersByTime(6000);
    client.cleanupExpiredPendingBatches();
    expect(client.getPendingBatches().size).toBe(0);
  });

  it('should reject promise for expired pending batch', async () => {
    const client = new EvoDBRpcClient({
      parentDoUrl: 'ws://parent-do/rpc',
      sourceDoId: 'ttl-reject-client',
      pendingBatchTtlMs: 10000, // 10 second TTL
    });

    await client.connect();

    // Track rejected batches
    const rejectedBatches: number[] = [];

    // Add batch with promise tracking
    const batchPromise = client.queuePendingBatchWithPromise(
      [{ sequence: 1, timestamp: Date.now(), operation: 'INSERT', table: 't', rowId: 'r1' }],
      1
    );

    batchPromise.catch((err) => {
      rejectedBatches.push(1);
      expect(err.message).toMatch(/timeout|expired|ttl/i);
    });

    // Advance time past TTL
    vi.advanceTimersByTime(15000);
    await client.cleanupExpiredPendingBatches();

    // Promise should have been rejected
    expect(rejectedBatches).toContain(1);
  });

  it('should call onPendingBatchExpired callback when batch expires', async () => {
    const onExpired = vi.fn();

    const client = new EvoDBRpcClient({
      parentDoUrl: 'ws://parent-do/rpc',
      sourceDoId: 'ttl-callback-client',
      pendingBatchTtlMs: 5000,
      onPendingBatchExpired: onExpired,
    });

    await client.connect();

    client.queuePendingBatch(
      [{ sequence: 42, timestamp: Date.now(), operation: 'INSERT', table: 't', rowId: 'r42' }],
      42
    );

    vi.advanceTimersByTime(6000);
    await client.cleanupExpiredPendingBatches();

    expect(onExpired).toHaveBeenCalledWith(
      expect.objectContaining({
        sequenceNumber: 42,
        reason: 'ttl_expired',
      })
    );
  });

  it('should automatically cleanup on interval', async () => {
    const client = new EvoDBRpcClient({
      parentDoUrl: 'ws://parent-do/rpc',
      sourceDoId: 'auto-cleanup-client',
      pendingBatchTtlMs: 5000,
      pendingBatchCleanupIntervalMs: 2000, // Cleanup every 2 seconds
    });

    await client.connect();
    client.startPendingBatchCleanup();

    // Add a batch
    client.queuePendingBatch(
      [{ sequence: 1, timestamp: Date.now(), operation: 'INSERT', table: 't', rowId: 'r1' }],
      1
    );

    // Wait for TTL + cleanup interval
    vi.advanceTimersByTime(8000);

    // Batch should have been automatically cleaned up
    expect(client.getPendingBatches().size).toBe(0);

    client.stopPendingBatchCleanup();
  });
});

// =============================================================================
// 3. MAX PENDING BATCHES SIZE LIMIT
// =============================================================================

describe('maxPendingBatches Size Limit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should support maxPendingBatches configuration', () => {
    const client = new EvoDBRpcClient({
      parentDoUrl: 'ws://parent-do/rpc',
      sourceDoId: 'max-config-client',
      maxPendingBatches: 50,
    });

    expect((client as any).config.maxPendingBatches).toBe(50);
  });

  it('should not exceed maxPendingBatches limit', async () => {
    const client = new EvoDBRpcClient({
      parentDoUrl: 'ws://parent-do/rpc',
      sourceDoId: 'max-limit-client',
      maxPendingBatches: 10,
    });

    await client.connect();

    // Try to add 50 batches
    for (let i = 0; i < 50; i++) {
      client.queuePendingBatch(
        [{ sequence: i, timestamp: Date.now(), operation: 'INSERT', table: 't', rowId: `r${i}` }],
        i
      );
    }

    // Should not exceed the limit
    expect(client.getPendingBatches().size).toBeLessThanOrEqual(10);
  });

  it('should evict oldest pending batches when limit reached', async () => {
    const client = new EvoDBRpcClient({
      parentDoUrl: 'ws://parent-do/rpc',
      sourceDoId: 'eviction-client',
      maxPendingBatches: 5,
    });

    await client.connect();

    // Add 5 batches with delays to establish ordering
    for (let i = 1; i <= 5; i++) {
      client.queuePendingBatch(
        [{ sequence: i, timestamp: Date.now(), operation: 'INSERT', table: 't', rowId: `r${i}` }],
        i
      );
      vi.advanceTimersByTime(100);
    }

    // All 5 should be present
    expect(client.getPendingBatches().has(1)).toBe(true);
    expect(client.getPendingBatches().has(5)).toBe(true);

    // Add batch 6 - should evict batch 1 (oldest)
    client.queuePendingBatch(
      [{ sequence: 6, timestamp: Date.now(), operation: 'INSERT', table: 't', rowId: 'r6' }],
      6
    );

    expect(client.getPendingBatches().size).toBe(5);
    expect(client.getPendingBatches().has(1)).toBe(false); // Evicted
    expect(client.getPendingBatches().has(6)).toBe(true); // Added
  });

  it('should reject promise for evicted pending batch', async () => {
    const client = new EvoDBRpcClient({
      parentDoUrl: 'ws://parent-do/rpc',
      sourceDoId: 'evict-reject-client',
      maxPendingBatches: 3,
    });

    await client.connect();

    const evictedBatches: number[] = [];

    // Add 3 batches with promise tracking
    const promise1 = client.queuePendingBatchWithPromise(
      [{ sequence: 1, timestamp: Date.now(), operation: 'INSERT', table: 't', rowId: 'r1' }],
      1
    );
    promise1.catch(() => evictedBatches.push(1));

    vi.advanceTimersByTime(10);
    client.queuePendingBatch(
      [{ sequence: 2, timestamp: Date.now(), operation: 'INSERT', table: 't', rowId: 'r2' }],
      2
    );

    vi.advanceTimersByTime(10);
    client.queuePendingBatch(
      [{ sequence: 3, timestamp: Date.now(), operation: 'INSERT', table: 't', rowId: 'r3' }],
      3
    );

    // Add 4th batch - should evict batch 1
    vi.advanceTimersByTime(10);
    client.queuePendingBatch(
      [{ sequence: 4, timestamp: Date.now(), operation: 'INSERT', table: 't', rowId: 'r4' }],
      4
    );

    // Wait for promise rejection to process
    await vi.runAllTimersAsync();

    expect(evictedBatches).toContain(1);
  });

  it('should call onPendingBatchEvicted callback when batch is evicted', async () => {
    const onEvicted = vi.fn();

    const client = new EvoDBRpcClient({
      parentDoUrl: 'ws://parent-do/rpc',
      sourceDoId: 'evict-callback-client',
      maxPendingBatches: 2,
      onPendingBatchEvicted: onEvicted,
    });

    await client.connect();

    client.queuePendingBatch(
      [{ sequence: 1, timestamp: Date.now(), operation: 'INSERT', table: 't', rowId: 'r1' }],
      1
    );
    client.queuePendingBatch(
      [{ sequence: 2, timestamp: Date.now(), operation: 'INSERT', table: 't', rowId: 'r2' }],
      2
    );

    // Add 3rd batch - should evict batch 1
    client.queuePendingBatch(
      [{ sequence: 3, timestamp: Date.now(), operation: 'INSERT', table: 't', rowId: 'r3' }],
      3
    );

    expect(onEvicted).toHaveBeenCalledWith(
      expect.objectContaining({
        sequenceNumber: 1,
        reason: 'max_pending_exceeded',
      })
    );
  });
});

// =============================================================================
// 4. PENDING BATCHES STATS
// =============================================================================

describe('Pending Batches Statistics', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should expose pending batches count in stats', async () => {
    const client = new EvoDBRpcClient({
      parentDoUrl: 'ws://parent-do/rpc',
      sourceDoId: 'stats-client',
    });

    await client.connect();

    client.queuePendingBatch(
      [{ sequence: 1, timestamp: Date.now(), operation: 'INSERT', table: 't', rowId: 'r1' }],
      1
    );
    client.queuePendingBatch(
      [{ sequence: 2, timestamp: Date.now(), operation: 'INSERT', table: 't', rowId: 'r2' }],
      2
    );

    const stats = client.getPendingBatchesStats();
    expect(stats.count).toBe(2);
  });

  it('should expose oldest pending batch age in stats', async () => {
    const client = new EvoDBRpcClient({
      parentDoUrl: 'ws://parent-do/rpc',
      sourceDoId: 'age-stats-client',
    });

    await client.connect();

    // Add a batch at t=0
    client.queuePendingBatch(
      [{ sequence: 1, timestamp: Date.now(), operation: 'INSERT', table: 't', rowId: 'r1' }],
      1
    );

    // Advance 10 seconds
    vi.advanceTimersByTime(10000);

    // Add another batch
    client.queuePendingBatch(
      [{ sequence: 2, timestamp: Date.now(), operation: 'INSERT', table: 't', rowId: 'r2' }],
      2
    );

    const stats = client.getPendingBatchesStats();
    expect(stats.oldestAgeMs).toBeGreaterThanOrEqual(10000);
  });

  it('should expose total pending entries in stats', async () => {
    const client = new EvoDBRpcClient({
      parentDoUrl: 'ws://parent-do/rpc',
      sourceDoId: 'entries-stats-client',
    });

    await client.connect();

    client.queuePendingBatch(
      [
        { sequence: 1, timestamp: Date.now(), operation: 'INSERT', table: 't', rowId: 'r1' },
        { sequence: 2, timestamp: Date.now(), operation: 'INSERT', table: 't', rowId: 'r2' },
      ],
      1
    );
    client.queuePendingBatch(
      [
        { sequence: 3, timestamp: Date.now(), operation: 'INSERT', table: 't', rowId: 'r3' },
      ],
      2
    );

    const stats = client.getPendingBatchesStats();
    expect(stats.totalEntries).toBe(3);
  });

  it('should expose TTL and max config in stats', async () => {
    const client = new EvoDBRpcClient({
      parentDoUrl: 'ws://parent-do/rpc',
      sourceDoId: 'config-stats-client',
      pendingBatchTtlMs: 45000,
      maxPendingBatches: 75,
    });

    const stats = client.getPendingBatchesStats();
    expect(stats.ttlMs).toBe(45000);
    expect(stats.maxBatches).toBe(75);
  });
});

// =============================================================================
// 5. INTEGRATION WITH EXISTING FUNCTIONALITY
// =============================================================================

describe('Integration with Existing Client Behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should clean up pending batches on disconnect', async () => {
    const client = new EvoDBRpcClient({
      parentDoUrl: 'ws://parent-do/rpc',
      sourceDoId: 'disconnect-cleanup-client',
    });

    await client.connect();

    client.queuePendingBatch(
      [{ sequence: 1, timestamp: Date.now(), operation: 'INSERT', table: 't', rowId: 'r1' }],
      1
    );
    client.queuePendingBatch(
      [{ sequence: 2, timestamp: Date.now(), operation: 'INSERT', table: 't', rowId: 'r2' }],
      2
    );

    expect(client.getPendingBatches().size).toBe(2);

    // Disconnect
    await client.disconnect();

    // Pending batches should be cleared on disconnect
    expect(client.getPendingBatches().size).toBe(0);
  });

  it('should respect both TTL and max limits simultaneously', async () => {
    const client = new EvoDBRpcClient({
      parentDoUrl: 'ws://parent-do/rpc',
      sourceDoId: 'combined-limits-client',
      pendingBatchTtlMs: 5000,
      maxPendingBatches: 3,
    });

    await client.connect();

    // Add 3 batches (at max)
    for (let i = 1; i <= 3; i++) {
      client.queuePendingBatch(
        [{ sequence: i, timestamp: Date.now(), operation: 'INSERT', table: 't', rowId: `r${i}` }],
        i
      );
      vi.advanceTimersByTime(1000);
    }
    expect(client.getPendingBatches().size).toBe(3);

    // Add 4th - should evict oldest due to max limit
    client.queuePendingBatch(
      [{ sequence: 4, timestamp: Date.now(), operation: 'INSERT', table: 't', rowId: 'r4' }],
      4
    );
    expect(client.getPendingBatches().size).toBe(3);
    expect(client.getPendingBatches().has(1)).toBe(false);

    // Advance time past TTL
    vi.advanceTimersByTime(10000);
    await client.cleanupExpiredPendingBatches();

    // All should be cleaned up due to TTL
    expect(client.getPendingBatches().size).toBe(0);
  });

  it('should preserve pending batches after reconnect for resend', async () => {
    const client = new EvoDBRpcClient({
      parentDoUrl: 'ws://parent-do/rpc',
      sourceDoId: 'reconnect-preserve-client',
      maxPendingBatches: 10,
      pendingBatchTtlMs: 60000, // Long TTL
      autoReconnect: true,
    });

    await client.connect();

    client.queuePendingBatch(
      [{ sequence: 1, timestamp: Date.now(), operation: 'INSERT', table: 't', rowId: 'r1' }],
      1
    );
    client.queuePendingBatch(
      [{ sequence: 2, timestamp: Date.now(), operation: 'INSERT', table: 't', rowId: 'r2' }],
      2
    );

    // Simulate connection loss (not clean close)
    client.handleClose({ code: 1006, reason: 'Network error' });

    // Pending batches should be preserved for resend after reconnect
    expect(client.getPendingBatches().size).toBe(2);
  });
});

// =============================================================================
// 6. LakehouseRpcClient (Original Implementation)
// =============================================================================

describe('LakehouseRpcClient pendingBatches Memory Management', () => {
  // Note: LakehouseRpcClient uses a different internal structure
  // These tests verify the fix is applied to both client implementations

  it('should support maxPendingBatches in ChildConfig', () => {
    // This tests that the config type is extended to include the new option
    const config: Partial<ChildConfig> = {
      parentDoUrl: 'ws://test',
      maxPendingBatches: 100,
      pendingBatchTtlMs: 30000,
    };

    expect(config.maxPendingBatches).toBe(100);
    expect(config.pendingBatchTtlMs).toBe(30000);
  });
});
