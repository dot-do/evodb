/**
 * Tests for Offline-First Sync Module
 *
 * TDD Issue: evodb-bjfg
 *
 * This test suite covers:
 * - Hybrid Logical Clock operations
 * - Vector Clock operations
 * - Change tracking with timestamps and versions
 * - Conflict detection and resolution strategies
 * - Offline queue management
 * - Network status detection
 * - SyncManager push/pull/sync operations
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  HybridLogicalClock,
  VectorClockImpl,
  OfflineQueue,
  NetworkStatusMonitor,
  ConflictResolverImpl,
  SyncManager,
  SyncError,
  ConflictResolution,
  NetworkStatus,
  SyncState,
  SyncMode,
  LWWRegister,
  LWWMap,
  GCounter,
  PNCounter,
  SelectiveSync,
  type HLCTimestamp,
  type TrackedChange,
  type RemoteChange,
  type SyncConflict,
  type SyncStorage,
} from '../sync.js';

// =============================================================================
// Mock Storage Implementation
// =============================================================================

class MockStorage implements SyncStorage {
  private store: Map<string, unknown> = new Map();

  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(prefix: string): Promise<string[]> {
    return Array.from(this.store.keys()).filter(k => k.startsWith(prefix));
  }

  clear(): void {
    this.store.clear();
  }
}

// =============================================================================
// Hybrid Logical Clock Tests
// =============================================================================

describe('HybridLogicalClock', () => {
  describe('now()', () => {
    it('should generate timestamps with current wall time', () => {
      const clock = new HybridLogicalClock('node-1');
      const before = Date.now();
      const ts = clock.now();
      const after = Date.now();

      expect(ts.wallTime).toBeGreaterThanOrEqual(before);
      expect(ts.wallTime).toBeLessThanOrEqual(after);
      expect(ts.nodeId).toBe('node-1');
    });

    it('should increment counter for rapid calls', () => {
      const clock = new HybridLogicalClock('node-1');
      const ts1 = clock.now();
      const ts2 = clock.now();
      const ts3 = clock.now();

      // Either wall time advances or counter increments
      expect(
        ts2.wallTime > ts1.wallTime ||
        (ts2.wallTime === ts1.wallTime && ts2.counter > ts1.counter)
      ).toBe(true);

      expect(
        ts3.wallTime > ts2.wallTime ||
        (ts3.wallTime === ts2.wallTime && ts3.counter > ts2.counter)
      ).toBe(true);
    });

    it('should produce monotonically increasing timestamps', () => {
      const clock = new HybridLogicalClock('node-1');
      const timestamps: HLCTimestamp[] = [];

      for (let i = 0; i < 100; i++) {
        timestamps.push(clock.now());
      }

      for (let i = 1; i < timestamps.length; i++) {
        expect(HybridLogicalClock.isAfter(timestamps[i], timestamps[i - 1])).toBe(true);
      }
    });
  });

  describe('receive()', () => {
    it('should update clock based on remote timestamp', () => {
      const clock = new HybridLogicalClock('node-1');
      const remote: HLCTimestamp = {
        wallTime: Date.now() + 1000, // 1 second in the future
        counter: 5,
        nodeId: 'node-2',
      };

      const result = clock.receive(remote);

      expect(result.wallTime).toBeGreaterThanOrEqual(remote.wallTime);
      expect(result.counter).toBeGreaterThan(remote.counter);
      expect(result.nodeId).toBe('node-1');
    });

    it('should handle remote timestamps from the past', () => {
      const clock = new HybridLogicalClock('node-1');
      const current = clock.now();

      const remote: HLCTimestamp = {
        wallTime: Date.now() - 10000, // 10 seconds ago
        counter: 100,
        nodeId: 'node-2',
      };

      const result = clock.receive(remote);

      // Should still be ahead of current
      expect(HybridLogicalClock.isAfter(result, current)).toBe(true);
    });

    it('should maintain causality with concurrent clocks', () => {
      const clock1 = new HybridLogicalClock('node-1');
      const clock2 = new HybridLogicalClock('node-2');

      // Generate some events on clock1
      const ts1a = clock1.now();
      const ts1b = clock1.now();

      // Clock2 receives ts1b
      const ts2a = clock2.receive(ts1b);

      // ts2a should be after ts1b
      expect(HybridLogicalClock.isAfter(ts2a, ts1b)).toBe(true);

      // Clock1 receives ts2a
      const ts1c = clock1.receive(ts2a);

      // ts1c should be after ts2a
      expect(HybridLogicalClock.isAfter(ts1c, ts2a)).toBe(true);
    });
  });

  describe('compare()', () => {
    it('should correctly order timestamps by wall time', () => {
      const earlier: HLCTimestamp = { wallTime: 1000, counter: 0, nodeId: 'a' };
      const later: HLCTimestamp = { wallTime: 2000, counter: 0, nodeId: 'a' };

      expect(HybridLogicalClock.compare(earlier, later)).toBeLessThan(0);
      expect(HybridLogicalClock.compare(later, earlier)).toBeGreaterThan(0);
    });

    it('should correctly order timestamps by counter when wall time is equal', () => {
      const earlier: HLCTimestamp = { wallTime: 1000, counter: 5, nodeId: 'a' };
      const later: HLCTimestamp = { wallTime: 1000, counter: 10, nodeId: 'a' };

      expect(HybridLogicalClock.compare(earlier, later)).toBeLessThan(0);
      expect(HybridLogicalClock.compare(later, earlier)).toBeGreaterThan(0);
    });

    it('should use node ID as tiebreaker', () => {
      const tsA: HLCTimestamp = { wallTime: 1000, counter: 5, nodeId: 'a' };
      const tsB: HLCTimestamp = { wallTime: 1000, counter: 5, nodeId: 'b' };

      expect(HybridLogicalClock.compare(tsA, tsB)).toBeLessThan(0);
      expect(HybridLogicalClock.compare(tsB, tsA)).toBeGreaterThan(0);
    });

    it('should return 0 for identical timestamps', () => {
      const ts: HLCTimestamp = { wallTime: 1000, counter: 5, nodeId: 'a' };
      expect(HybridLogicalClock.compare(ts, ts)).toBe(0);
    });
  });

  describe('serialize/deserialize', () => {
    it('should round-trip timestamps correctly', () => {
      const original: HLCTimestamp = {
        wallTime: Date.now(),
        counter: 42,
        nodeId: 'node-test-123',
      };

      const serialized = HybridLogicalClock.serialize(original);
      const deserialized = HybridLogicalClock.deserialize(serialized);

      expect(deserialized.wallTime).toBe(original.wallTime);
      expect(deserialized.counter).toBe(original.counter);
      expect(deserialized.nodeId).toBe(original.nodeId);
    });

    it('should handle node IDs with dashes', () => {
      const original: HLCTimestamp = {
        wallTime: 1234567890,
        counter: 0,
        nodeId: 'node-with-many-dashes-123',
      };

      const serialized = HybridLogicalClock.serialize(original);
      const deserialized = HybridLogicalClock.deserialize(serialized);

      expect(deserialized.nodeId).toBe(original.nodeId);
    });

    it('should throw on invalid format', () => {
      expect(() => HybridLogicalClock.deserialize('invalid')).toThrow(SyncError);
      expect(() => HybridLogicalClock.deserialize('only-one')).toThrow(SyncError);
    });
  });
});

// =============================================================================
// Vector Clock Tests
// =============================================================================

describe('VectorClockImpl', () => {
  describe('increment()', () => {
    it('should increment own counter', () => {
      const vc = new VectorClockImpl('node-1');
      const initial = vc.clocks.get('node-1') ?? 0;

      vc.increment();

      expect(vc.clocks.get('node-1')).toBe(initial + 1);
    });

    it('should return a copy of the clock', () => {
      const vc = new VectorClockImpl('node-1');
      const result = vc.increment();

      // Should be a copy, not the same reference
      expect(result.clocks).not.toBe(vc.clocks);
      expect(result.clocks.get('node-1')).toBe(vc.clocks.get('node-1'));
    });
  });

  describe('merge()', () => {
    it('should take maximum of each counter', () => {
      const vc1 = new VectorClockImpl('node-1');
      vc1.clocks.set('node-1', 5);
      vc1.clocks.set('node-2', 3);

      const vc2: { clocks: Map<string, number> } = {
        clocks: new Map([
          ['node-1', 3],
          ['node-2', 7],
          ['node-3', 2],
        ]),
      };

      vc1.merge(vc2);

      expect(vc1.clocks.get('node-1')).toBe(5); // max(5, 3)
      expect(vc1.clocks.get('node-2')).toBe(7); // max(3, 7)
      expect(vc1.clocks.get('node-3')).toBe(2); // max(0, 2)
    });
  });

  describe('isBefore()', () => {
    it('should return true when all counters are <= other', () => {
      const vc1 = new VectorClockImpl('node-1');
      vc1.clocks.set('node-1', 1);
      vc1.clocks.set('node-2', 2);

      const vc2: { clocks: Map<string, number> } = {
        clocks: new Map([
          ['node-1', 2],
          ['node-2', 3],
        ]),
      };

      expect(vc1.isBefore(vc2)).toBe(true);
    });

    it('should return false when any counter is greater', () => {
      const vc1 = new VectorClockImpl('node-1');
      vc1.clocks.set('node-1', 5);
      vc1.clocks.set('node-2', 2);

      const vc2: { clocks: Map<string, number> } = {
        clocks: new Map([
          ['node-1', 3],
          ['node-2', 4],
        ]),
      };

      expect(vc1.isBefore(vc2)).toBe(false);
    });

    it('should return false when clocks are equal', () => {
      const vc1 = new VectorClockImpl('node-1');
      vc1.clocks.set('node-1', 3);

      const vc2: { clocks: Map<string, number> } = {
        clocks: new Map([['node-1', 3]]),
      };

      expect(vc1.isBefore(vc2)).toBe(false);
    });
  });

  describe('isConcurrent()', () => {
    it('should return true for concurrent changes', () => {
      const vc1 = new VectorClockImpl('node-1');
      vc1.clocks.set('node-1', 2);
      vc1.clocks.set('node-2', 1);

      const vc2: { clocks: Map<string, number> } = {
        clocks: new Map([
          ['node-1', 1],
          ['node-2', 2],
        ]),
      };

      expect(vc1.isConcurrent(vc2)).toBe(true);
    });

    it('should return false for causally related changes', () => {
      const vc1 = new VectorClockImpl('node-1');
      vc1.clocks.set('node-1', 1);
      vc1.clocks.set('node-2', 1);

      const vc2: { clocks: Map<string, number> } = {
        clocks: new Map([
          ['node-1', 2],
          ['node-2', 2],
        ]),
      };

      expect(vc1.isConcurrent(vc2)).toBe(false);
    });
  });

  describe('serialize/deserialize', () => {
    it('should round-trip vector clocks correctly', () => {
      const vc = new VectorClockImpl('node-1');
      vc.clocks.set('node-1', 5);
      vc.clocks.set('node-2', 3);
      vc.clocks.set('node-3', 7);

      const serialized = VectorClockImpl.serialize(vc);
      const deserialized = VectorClockImpl.deserialize(serialized, 'node-1');

      expect(deserialized.clocks.get('node-1')).toBe(5);
      expect(deserialized.clocks.get('node-2')).toBe(3);
      expect(deserialized.clocks.get('node-3')).toBe(7);
    });
  });
});

// =============================================================================
// Offline Queue Tests
// =============================================================================

describe('OfflineQueue', () => {
  let queue: OfflineQueue<{ name: string }>;
  let storage: MockStorage;

  beforeEach(() => {
    storage = new MockStorage();
    queue = new OfflineQueue({ storage, storageKey: 'test:queue' });
  });

  describe('enqueue()', () => {
    it('should add changes to the queue', async () => {
      const change: TrackedChange<{ name: string }> = {
        id: 'change-1',
        table: 'users',
        key: 'user-1',
        operation: 'insert',
        after: { name: 'Alice' },
        timestamp: { wallTime: Date.now(), counter: 0, nodeId: 'node-1' },
        vectorClock: { clocks: new Map([['node-1', 1]]) },
        synced: false,
        attempts: 0,
      };

      await queue.enqueue(change);

      expect(queue.size).toBe(1);
      expect(queue.pendingCount).toBe(1);
    });

    it('should persist to storage', async () => {
      const change: TrackedChange<{ name: string }> = {
        id: 'change-1',
        table: 'users',
        key: 'user-1',
        operation: 'insert',
        after: { name: 'Alice' },
        timestamp: { wallTime: Date.now(), counter: 0, nodeId: 'node-1' },
        vectorClock: { clocks: new Map([['node-1', 1]]) },
        synced: false,
        attempts: 0,
      };

      await queue.enqueue(change);

      const stored = await storage.get<TrackedChange<{ name: string }>[]>('test:queue');
      expect(stored).toHaveLength(1);
      expect(stored![0].id).toBe('change-1');
    });
  });

  describe('getPending()', () => {
    it('should return only unsynced changes', async () => {
      const change1: TrackedChange<{ name: string }> = {
        id: 'change-1',
        table: 'users',
        key: 'user-1',
        operation: 'insert',
        after: { name: 'Alice' },
        timestamp: { wallTime: Date.now(), counter: 0, nodeId: 'node-1' },
        vectorClock: { clocks: new Map() },
        synced: false,
        attempts: 0,
      };

      const change2: TrackedChange<{ name: string }> = {
        id: 'change-2',
        table: 'users',
        key: 'user-2',
        operation: 'insert',
        after: { name: 'Bob' },
        timestamp: { wallTime: Date.now(), counter: 1, nodeId: 'node-1' },
        vectorClock: { clocks: new Map() },
        synced: true, // Already synced
        attempts: 1,
      };

      await queue.enqueue(change1);
      await queue.enqueue(change2);

      const pending = queue.getPending();
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe('change-1');
    });
  });

  describe('markSynced()', () => {
    it('should mark specific changes as synced', async () => {
      const change1: TrackedChange<{ name: string }> = {
        id: 'change-1',
        table: 'users',
        key: 'user-1',
        operation: 'insert',
        after: { name: 'Alice' },
        timestamp: { wallTime: Date.now(), counter: 0, nodeId: 'node-1' },
        vectorClock: { clocks: new Map() },
        synced: false,
        attempts: 0,
      };

      const change2: TrackedChange<{ name: string }> = {
        id: 'change-2',
        table: 'users',
        key: 'user-2',
        operation: 'insert',
        after: { name: 'Bob' },
        timestamp: { wallTime: Date.now(), counter: 1, nodeId: 'node-1' },
        vectorClock: { clocks: new Map() },
        synced: false,
        attempts: 0,
      };

      await queue.enqueue(change1);
      await queue.enqueue(change2);

      await queue.markSynced(['change-1']);

      const pending = queue.getPending();
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe('change-2');
    });
  });

  describe('compact()', () => {
    it('should remove synced changes', async () => {
      const change1: TrackedChange<{ name: string }> = {
        id: 'change-1',
        table: 'users',
        key: 'user-1',
        operation: 'insert',
        after: { name: 'Alice' },
        timestamp: { wallTime: Date.now(), counter: 0, nodeId: 'node-1' },
        vectorClock: { clocks: new Map() },
        synced: true,
        attempts: 1,
      };

      const change2: TrackedChange<{ name: string }> = {
        id: 'change-2',
        table: 'users',
        key: 'user-2',
        operation: 'insert',
        after: { name: 'Bob' },
        timestamp: { wallTime: Date.now(), counter: 1, nodeId: 'node-1' },
        vectorClock: { clocks: new Map() },
        synced: false,
        attempts: 0,
      };

      await queue.enqueue(change1);
      await queue.enqueue(change2);

      const removed = await queue.compact();

      expect(removed).toBe(1);
      expect(queue.size).toBe(1);
      expect(queue.getAll()[0].id).toBe('change-2');
    });
  });

  describe('initialize()', () => {
    it('should load queue from storage', async () => {
      const changes: TrackedChange<{ name: string }>[] = [
        {
          id: 'change-1',
          table: 'users',
          key: 'user-1',
          operation: 'insert',
          after: { name: 'Alice' },
          timestamp: { wallTime: Date.now(), counter: 0, nodeId: 'node-1' },
          vectorClock: { clocks: new Map() },
          synced: false,
          attempts: 0,
        },
      ];

      await storage.set('test:queue', changes);

      const newQueue = new OfflineQueue<{ name: string }>({ storage, storageKey: 'test:queue' });
      await newQueue.initialize();

      expect(newQueue.size).toBe(1);
      expect(newQueue.getAll()[0].id).toBe('change-1');
    });
  });

  describe('updateAttempt()', () => {
    it('should increment attempt count and set error', async () => {
      const change: TrackedChange<{ name: string }> = {
        id: 'change-1',
        table: 'users',
        key: 'user-1',
        operation: 'insert',
        after: { name: 'Alice' },
        timestamp: { wallTime: Date.now(), counter: 0, nodeId: 'node-1' },
        vectorClock: { clocks: new Map() },
        synced: false,
        attempts: 0,
      };

      await queue.enqueue(change);
      await queue.updateAttempt('change-1', 'Network error');

      const updated = queue.getAll()[0];
      expect(updated.attempts).toBe(1);
      expect(updated.lastError).toBe('Network error');
    });
  });
});

// =============================================================================
// Network Status Monitor Tests
// =============================================================================

describe('NetworkStatusMonitor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getStatus()', () => {
    it('should return current status', () => {
      const monitor = new NetworkStatusMonitor();
      const status = monitor.getStatus();

      expect([NetworkStatus.Online, NetworkStatus.Offline, NetworkStatus.Unknown]).toContain(status);
    });
  });

  describe('setStatus()', () => {
    it('should update status and notify listeners', () => {
      const monitor = new NetworkStatusMonitor();
      const listener = vi.fn();

      monitor.subscribe(listener);
      monitor.setStatus(NetworkStatus.Offline);

      expect(monitor.getStatus()).toBe(NetworkStatus.Offline);
      expect(listener).toHaveBeenCalledWith(NetworkStatus.Offline);
    });

    it('should not notify if status unchanged', () => {
      const monitor = new NetworkStatusMonitor();
      monitor.setStatus(NetworkStatus.Online);

      const listener = vi.fn();
      monitor.subscribe(listener);

      monitor.setStatus(NetworkStatus.Online);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('subscribe()', () => {
    it('should return unsubscribe function', () => {
      const monitor = new NetworkStatusMonitor();
      const listener = vi.fn();

      const unsubscribe = monitor.subscribe(listener);
      monitor.setStatus(NetworkStatus.Offline);
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      monitor.setStatus(NetworkStatus.Online);
      expect(listener).toHaveBeenCalledTimes(1); // Still 1, not called again
    });
  });

  describe('isOnline()', () => {
    it('should return true when online', () => {
      const monitor = new NetworkStatusMonitor();
      monitor.setStatus(NetworkStatus.Online);

      expect(monitor.isOnline()).toBe(true);
    });

    it('should return false when offline', () => {
      const monitor = new NetworkStatusMonitor();
      monitor.setStatus(NetworkStatus.Offline);

      expect(monitor.isOnline()).toBe(false);
    });
  });

  describe('destroy()', () => {
    it('should clean up resources', () => {
      const monitor = new NetworkStatusMonitor();
      const listener = vi.fn();

      monitor.subscribe(listener);
      monitor.destroy();

      // Should not throw and listener should be removed
      monitor.setStatus(NetworkStatus.Offline);
      expect(listener).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// Conflict Resolver Tests
// =============================================================================

describe('ConflictResolverImpl', () => {
  const createConflict = (
    localAfter: { name: string; age?: number } | undefined,
    remoteAfter: { name: string; age?: number } | undefined,
    localBefore?: { name: string; age?: number },
    localTimestamp?: HLCTimestamp,
    remoteTimestamp?: HLCTimestamp
  ): SyncConflict<{ name: string; age?: number }> => ({
    id: 'conflict-1',
    table: 'users',
    key: 'user-1',
    local: {
      id: 'local-1',
      table: 'users',
      key: 'user-1',
      operation: 'update',
      before: localBefore,
      after: localAfter,
      timestamp: localTimestamp ?? { wallTime: 1000, counter: 0, nodeId: 'node-1' },
      vectorClock: { clocks: new Map([['node-1', 1]]) },
      synced: false,
      attempts: 0,
    },
    remote: {
      id: 'remote-1',
      table: 'users',
      key: 'user-1',
      operation: 'update',
      before: localBefore,
      after: remoteAfter,
      timestamp: remoteTimestamp ?? { wallTime: 1000, counter: 0, nodeId: 'node-2' },
      vectorClock: { clocks: new Map([['node-2', 1]]) },
      version: 1,
    },
    autoResolved: false,
  });

  describe('LastWriteWins', () => {
    it('should pick local change when local timestamp is later', async () => {
      const resolver = new ConflictResolverImpl<{ name: string }>(ConflictResolution.LastWriteWins);

      const conflict = createConflict(
        { name: 'Local Alice' },
        { name: 'Remote Alice' },
        undefined,
        { wallTime: 2000, counter: 0, nodeId: 'node-1' }, // Later
        { wallTime: 1000, counter: 0, nodeId: 'node-2' }
      );

      const resolved = await resolver.resolve(conflict);
      expect(resolved).toEqual({ name: 'Local Alice' });
    });

    it('should pick remote change when remote timestamp is later', async () => {
      const resolver = new ConflictResolverImpl<{ name: string }>(ConflictResolution.LastWriteWins);

      const conflict = createConflict(
        { name: 'Local Alice' },
        { name: 'Remote Alice' },
        undefined,
        { wallTime: 1000, counter: 0, nodeId: 'node-1' },
        { wallTime: 2000, counter: 0, nodeId: 'node-2' } // Later
      );

      const resolved = await resolver.resolve(conflict);
      expect(resolved).toEqual({ name: 'Remote Alice' });
    });

    it('should use node ID as tiebreaker when timestamps equal', async () => {
      const resolver = new ConflictResolverImpl<{ name: string }>(ConflictResolution.LastWriteWins);

      const conflict = createConflict(
        { name: 'Local Alice' },
        { name: 'Remote Alice' },
        undefined,
        { wallTime: 1000, counter: 0, nodeId: 'a-node' },
        { wallTime: 1000, counter: 0, nodeId: 'b-node' }
      );

      const resolved = await resolver.resolve(conflict);
      // 'b-node' > 'a-node' alphabetically, so remote wins
      expect(resolved).toEqual({ name: 'Remote Alice' });
    });
  });

  describe('Merge', () => {
    it('should merge non-conflicting field changes', async () => {
      const resolver = new ConflictResolverImpl<{ name: string; age?: number }>(ConflictResolution.Merge);

      const conflict = createConflict(
        { name: 'Alice Updated', age: 25 }, // Local changed name
        { name: 'Alice', age: 30 },         // Remote changed age
        { name: 'Alice', age: 25 }          // Original
      );

      const resolved = await resolver.resolve(conflict);
      expect(resolved).toEqual({ name: 'Alice Updated', age: 30 });
    });

    it('should use last-write-wins for conflicting field changes', async () => {
      const resolver = new ConflictResolverImpl<{ name: string; age?: number }>(ConflictResolution.Merge);

      const conflict = createConflict(
        { name: 'Local Alice', age: 25 },   // Both changed name
        { name: 'Remote Alice', age: 25 },
        { name: 'Alice', age: 25 },
        { wallTime: 2000, counter: 0, nodeId: 'node-1' }, // Local is later
        { wallTime: 1000, counter: 0, nodeId: 'node-2' }
      );

      const resolved = await resolver.resolve(conflict);
      expect(resolved!.name).toBe('Local Alice');
    });
  });

  describe('ServerWins', () => {
    it('should always pick remote change', async () => {
      const resolver = new ConflictResolverImpl<{ name: string }>(ConflictResolution.ServerWins);

      const conflict = createConflict(
        { name: 'Local Alice' },
        { name: 'Remote Alice' },
        undefined,
        { wallTime: 9999, counter: 999, nodeId: 'node-1' }, // Even though local is much later
        { wallTime: 1000, counter: 0, nodeId: 'node-2' }
      );

      const resolved = await resolver.resolve(conflict);
      expect(resolved).toEqual({ name: 'Remote Alice' });
    });
  });

  describe('ClientWins', () => {
    it('should always pick local change', async () => {
      const resolver = new ConflictResolverImpl<{ name: string }>(ConflictResolution.ClientWins);

      const conflict = createConflict(
        { name: 'Local Alice' },
        { name: 'Remote Alice' },
        undefined,
        { wallTime: 1000, counter: 0, nodeId: 'node-1' },
        { wallTime: 9999, counter: 999, nodeId: 'node-2' } // Even though remote is much later
      );

      const resolved = await resolver.resolve(conflict);
      expect(resolved).toEqual({ name: 'Local Alice' });
    });
  });

  describe('Custom', () => {
    it('should use custom resolver function', async () => {
      const customResolver = vi.fn().mockResolvedValue({ name: 'Custom Resolved' });
      const resolver = new ConflictResolverImpl<{ name: string }>(
        ConflictResolution.Custom,
        customResolver
      );

      const conflict = createConflict({ name: 'Local' }, { name: 'Remote' });

      const resolved = await resolver.resolve(conflict);

      expect(customResolver).toHaveBeenCalledWith(conflict);
      expect(resolved).toEqual({ name: 'Custom Resolved' });
    });

    it('should throw if no custom resolver provided', async () => {
      const resolver = new ConflictResolverImpl<{ name: string }>(ConflictResolution.Custom);
      const conflict = createConflict({ name: 'Local' }, { name: 'Remote' });

      await expect(resolver.resolve(conflict)).rejects.toThrow(SyncError);
    });
  });

  describe('KeepBoth', () => {
    it('should return undefined for manual resolution', async () => {
      const resolver = new ConflictResolverImpl<{ name: string }>(ConflictResolution.KeepBoth);
      const conflict = createConflict({ name: 'Local' }, { name: 'Remote' });

      const resolved = await resolver.resolve(conflict);
      expect(resolved).toBeUndefined();
    });
  });
});

// =============================================================================
// SyncManager Tests
// =============================================================================

describe('SyncManager', () => {
  let manager: SyncManager<{ name: string; age?: number }>;
  let storage: MockStorage;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    storage = new MockStorage();
    mockFetch = vi.fn();

    manager = new SyncManager({
      nodeId: 'test-node',
      storage,
      remote: {
        url: 'https://api.example.com/sync',
        fetch: mockFetch as unknown as typeof fetch,
      },
      conflictResolution: ConflictResolution.LastWriteWins,
      retryOptions: {
        maxRetries: 0, // No retries for faster tests
      },
    });

    // Set network to online for tests
    manager['network'].setStatus(NetworkStatus.Online);
  });

  afterEach(() => {
    manager.destroy();
    vi.restoreAllMocks();
  });

  describe('trackChange()', () => {
    it('should create tracked change with HLC timestamp', async () => {
      const change = await manager.trackChange(
        'users',
        'user-1',
        { name: 'Alice' },
        'insert'
      );

      expect(change.id).toBeDefined();
      expect(change.table).toBe('users');
      expect(change.key).toBe('user-1');
      expect(change.operation).toBe('insert');
      expect(change.after).toEqual({ name: 'Alice' });
      expect(change.timestamp.nodeId).toBe('test-node');
      expect(change.synced).toBe(false);
    });

    it('should track before state for updates', async () => {
      const change = await manager.trackChange(
        'users',
        'user-1',
        { name: 'Alice Updated', age: 30 },
        'update',
        { name: 'Alice', age: 29 }
      );

      expect(change.before).toEqual({ name: 'Alice', age: 29 });
      expect(change.after).toEqual({ name: 'Alice Updated', age: 30 });
    });

    it('should add change to pending queue', async () => {
      await manager.trackChange('users', 'user-1', { name: 'Alice' }, 'insert');
      await manager.trackChange('users', 'user-2', { name: 'Bob' }, 'insert');

      expect(manager.getPendingCount()).toBe(2);
    });

    it('should generate monotonically increasing timestamps', async () => {
      const change1 = await manager.trackChange('users', 'user-1', { name: 'A' }, 'insert');
      const change2 = await manager.trackChange('users', 'user-2', { name: 'B' }, 'insert');
      const change3 = await manager.trackChange('users', 'user-3', { name: 'C' }, 'insert');

      expect(HybridLogicalClock.isAfter(change2.timestamp, change1.timestamp)).toBe(true);
      expect(HybridLogicalClock.isAfter(change3.timestamp, change2.timestamp)).toBe(true);
    });
  });

  describe('push()', () => {
    it('should push pending changes to remote', async () => {
      const change = await manager.trackChange('users', 'user-1', { name: 'Alice' }, 'insert');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ synced: [change.id], failed: [] }),
      });

      const result = await manager.push();

      expect(result.success).toBe(true);
      expect(result.pushed).toBe(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/sync/push',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('should handle push failures', async () => {
      await manager.trackChange('users', 'user-1', { name: 'Alice' }, 'insert');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      const result = await manager.push();

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should return error when offline', async () => {
      // Simulate offline
      manager['network'].setStatus(NetworkStatus.Offline);

      await manager.trackChange('users', 'user-1', { name: 'Alice' }, 'insert');

      const result = await manager.push();

      expect(result.success).toBe(false);
      expect(result.errors[0].code).toBe('OFFLINE');
    });

    it('should return error when no remote configured', async () => {
      const localManager = new SyncManager<{ name: string }>({
        nodeId: 'local-only',
      });

      await localManager.trackChange('users', 'user-1', { name: 'Alice' }, 'insert');

      const result = await localManager.push();

      expect(result.success).toBe(false);
      expect(result.errors[0].code).toBe('NO_REMOTE');

      localManager.destroy();
    });
  });

  describe('pull()', () => {
    it('should fetch changes from remote', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          changes: [
            {
              id: 'remote-1',
              table: 'users',
              key: 'user-2',
              operation: 'insert',
              after: { name: 'Remote User' },
              timestamp: HybridLogicalClock.serialize({
                wallTime: Date.now(),
                counter: 0,
                nodeId: 'server',
              }),
              vectorClock: { server: 1 },
              version: 1,
            },
          ],
        }),
      });

      const result = await manager.pull();

      expect(result.success).toBe(true);
      expect(result.pulled).toBe(1);
    });

    it('should detect conflicts with pending local changes', async () => {
      // Create a local pending change
      await manager.trackChange('users', 'user-1', { name: 'Local Alice' }, 'update', { name: 'Alice' });

      // Mock remote returns a change for the same key
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          changes: [
            {
              id: 'remote-1',
              table: 'users',
              key: 'user-1', // Same key as local
              operation: 'update',
              before: { name: 'Alice' },
              after: { name: 'Remote Alice' },
              timestamp: HybridLogicalClock.serialize({
                wallTime: Date.now(),
                counter: 0,
                nodeId: 'server',
              }),
              vectorClock: { server: 1 }, // Concurrent with local
              version: 1,
            },
          ],
        }),
      });

      const result = await manager.pull();

      expect(result.success).toBe(true);
      expect(result.conflicts.length).toBe(1);
      expect(result.conflicts[0].local.after).toEqual({ name: 'Local Alice' });
      expect(result.conflicts[0].remote.after).toEqual({ name: 'Remote Alice' });
    });

    it('should return error when offline', async () => {
      manager['network'].setStatus(NetworkStatus.Offline);

      const result = await manager.pull();

      expect(result.success).toBe(false);
      expect(result.errors[0].code).toBe('OFFLINE');
    });
  });

  describe('sync()', () => {
    it('should push then pull', async () => {
      // Push endpoint (no pending changes, so just returns empty)
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ changes: [] }),
        });

      const result = await manager.sync();

      // When there are no pending changes, push doesn't make a request
      // so only pull is called
      expect(result.success).toBe(true);
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should push pending changes then pull', async () => {
      const change = await manager.trackChange('users', 'user-1', { name: 'Alice' }, 'insert');

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ synced: [change.id], failed: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ changes: [] }),
        });

      const result = await manager.sync();

      expect(result.success).toBe(true);
      expect(result.pushed).toBe(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('state management', () => {
    it('should update state during operations', async () => {
      const states: SyncState[] = [];

      manager.onStateChange((state) => {
        states.push(state);
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ changes: [] }),
      });

      await manager.sync();

      // Should have gone through: Syncing -> Pulling -> Idle (no push if no pending)
      expect(states).toContain(SyncState.Syncing);
      expect(states[states.length - 1]).toBe(SyncState.Idle);
    });

    it('should set error state on failure', async () => {
      const change = await manager.trackChange('users', 'user-1', { name: 'Alice' }, 'insert');

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await manager.push();

      // Push catches the error and returns a result
      expect(result.success).toBe(false);
      expect(manager.getState()).toBe(SyncState.Error);
    });
  });

  describe('getCurrentTimestamp()', () => {
    it('should return current HLC timestamp', () => {
      const ts = manager.getCurrentTimestamp();

      expect(ts.nodeId).toBe('test-node');
      expect(ts.wallTime).toBeGreaterThan(0);
    });
  });

  describe('conflict listeners', () => {
    it('should notify listeners when conflicts detected', async () => {
      const conflictListener = vi.fn();
      manager.onConflict(conflictListener);

      // Create a local pending change
      await manager.trackChange('users', 'user-1', { name: 'Local' }, 'update');

      // Mock remote returns a conflicting change with concurrent vector clock
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          changes: [
            {
              id: 'remote-1',
              table: 'users',
              key: 'user-1',
              operation: 'update',
              after: { name: 'Remote' },
              timestamp: HybridLogicalClock.serialize({
                wallTime: Date.now() + 1000, // Slightly in the future
                counter: 0,
                nodeId: 'server',
              }),
              // Concurrent vector clock - different node has higher count
              vectorClock: { server: 2, 'test-node': 0 },
              version: 1,
            },
          ],
        }),
      });

      await manager.pull();

      expect(conflictListener).toHaveBeenCalled();
      expect(conflictListener.mock.calls[0][0]).toHaveLength(1);
    });
  });

  describe('queue management', () => {
    it('should compact queue', async () => {
      // Create changes and mark one as synced
      const change = await manager.trackChange('users', 'user-1', { name: 'Alice' }, 'insert');

      // Manually mark as synced (simulating successful push)
      manager['queue']['queue'][0].synced = true;

      const removed = await manager.compactQueue();

      expect(removed).toBe(1);
      expect(manager.getPendingCount()).toBe(0);
    });

    it('should clear queue', async () => {
      await manager.trackChange('users', 'user-1', { name: 'Alice' }, 'insert');
      await manager.trackChange('users', 'user-2', { name: 'Bob' }, 'insert');

      await manager.clearQueue();

      expect(manager.getPendingCount()).toBe(0);
    });
  });
});

// =============================================================================
// SyncError Tests
// =============================================================================

describe('SyncError', () => {
  it('should create error with message and code', () => {
    const error = new SyncError('Test error', 'TEST_CODE');

    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_CODE');
    expect(error.name).toBe('SyncError');
  });

  it('should include change in error', () => {
    const change: TrackedChange = {
      id: 'change-1',
      table: 'users',
      key: 'user-1',
      operation: 'insert',
      timestamp: { wallTime: 0, counter: 0, nodeId: 'n' },
      vectorClock: { clocks: new Map() },
      synced: false,
      attempts: 0,
    };

    const error = new SyncError('Test', 'TEST', {}, change);

    expect(error.change).toBe(change);
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Sync Integration', () => {
  it('should handle complete sync workflow', async () => {
    const storage = new MockStorage();
    const mockFetch = vi.fn();

    const manager = new SyncManager<{ name: string; count: number }>({
      nodeId: 'integration-test',
      storage,
      remote: {
        url: 'https://api.example.com',
        fetch: mockFetch as unknown as typeof fetch,
      },
      conflictResolution: ConflictResolution.Merge,
      retryOptions: { maxRetries: 0 },
    });

    // Set network to online
    manager['network'].setStatus(NetworkStatus.Online);

    // Track some local changes
    const change1 = await manager.trackChange('items', 'item-1', { name: 'Item 1', count: 10 }, 'insert');
    const change2 = await manager.trackChange('items', 'item-2', { name: 'Item 2', count: 5 }, 'insert');

    expect(manager.getPendingCount()).toBe(2);

    // Mock successful push
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        synced: [change1.id, change2.id],
        failed: [],
      }),
    });

    // Mock pull returns new remote changes
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        changes: [
          {
            id: 'remote-item-3',
            table: 'items',
            key: 'item-3',
            operation: 'insert',
            after: { name: 'Remote Item', count: 20 },
            timestamp: HybridLogicalClock.serialize({
              wallTime: Date.now(),
              counter: 0,
              nodeId: 'server',
            }),
            vectorClock: { server: 1 },
            version: 1,
          },
        ],
      }),
    });

    const result = await manager.sync();

    expect(result.success).toBe(true);
    expect(result.pulled).toBe(1);
    expect(result.conflicts).toHaveLength(0);

    manager.destroy();
  });

  it('should persist and restore state', async () => {
    const storage = new MockStorage();

    // Create first manager and track changes
    const manager1 = new SyncManager<{ name: string }>({
      nodeId: 'persist-test',
      storage,
    });

    await manager1.trackChange('users', 'user-1', { name: 'Alice' }, 'insert');
    manager1.destroy();

    // Create new manager with same storage
    const manager2 = new SyncManager<{ name: string }>({
      nodeId: 'persist-test',
      storage,
    });

    await manager2.initialize();

    // Should have loaded the pending change
    expect(manager2.getPendingCount()).toBe(1);
    expect(manager2.getPendingChanges()[0].after).toEqual({ name: 'Alice' });

    manager2.destroy();
  });
});

// =============================================================================
// CRDT Tests
// =============================================================================

describe('LWWRegister', () => {
  describe('get/set', () => {
    it('should store and retrieve value', () => {
      const reg = new LWWRegister('node-1', 'initial', 100);
      expect(reg.get()).toBe('initial');
      expect(reg.getTimestamp()).toBe(100);
      expect(reg.getNodeId()).toBe('node-1');
    });

    it('should update value when timestamp is newer', () => {
      const reg = new LWWRegister('node-1', 'old', 100);
      const updated = reg.set('new', 200);
      expect(updated.get()).toBe('new');
      expect(updated.getTimestamp()).toBe(200);
    });

    it('should not update when timestamp is older', () => {
      const reg = new LWWRegister('node-1', 'current', 200);
      const same = reg.set('old', 100);
      expect(same.get()).toBe('current');
      expect(same).toBe(reg);
    });

    it('should use node ID as tiebreaker', () => {
      const reg = new LWWRegister('node-a', 'value-a', 100);
      const updated = reg.set('value-b', 100, 'node-b');
      expect(updated.get()).toBe('value-b'); // 'node-b' > 'node-a'
    });
  });

  describe('merge', () => {
    it('should pick value with higher timestamp', () => {
      const reg1 = new LWWRegister('node-1', 'old', 100);
      const reg2 = new LWWRegister('node-2', 'new', 200);
      const merged = reg1.merge(reg2);
      expect(merged.get()).toBe('new');
    });

    it('should pick value with higher node ID when timestamps equal', () => {
      const reg1 = new LWWRegister('node-a', 'value-a', 100);
      const reg2 = new LWWRegister('node-b', 'value-b', 100);
      const merged = reg1.merge(reg2);
      expect(merged.get()).toBe('value-b');
    });

    it('should be idempotent', () => {
      const reg = new LWWRegister('node-1', 'value', 100);
      const merged1 = reg.merge(reg);
      const merged2 = merged1.merge(reg);
      expect(merged1.get()).toBe(reg.get());
      expect(merged2.get()).toBe(reg.get());
    });
  });

  describe('serialization', () => {
    it('should serialize and deserialize correctly', () => {
      const original = new LWWRegister('node-1', { key: 'value' }, 12345);
      const json = original.toJSON();
      const restored = LWWRegister.fromJSON(json);

      expect(restored.get()).toEqual({ key: 'value' });
      expect(restored.getTimestamp()).toBe(12345);
      expect(restored.getNodeId()).toBe('node-1');
    });
  });
});

describe('LWWMap', () => {
  describe('set/get', () => {
    it('should store and retrieve values', () => {
      const map = new LWWMap<string>('node-1');
      map.set('key1', 'value1', 100);
      expect(map.get('key1')).toBe('value1');
    });

    it('should return undefined for missing keys', () => {
      const map = new LWWMap<string>('node-1');
      expect(map.get('missing')).toBeUndefined();
    });

    it('should update value with newer timestamp', () => {
      const map = new LWWMap<string>('node-1');
      map.set('key', 'v1', 100);
      map.set('key', 'v2', 200);
      expect(map.get('key')).toBe('v2');
    });

    it('should not update with older timestamp', () => {
      const map = new LWWMap<string>('node-1');
      map.set('key', 'v1', 200);
      map.set('key', 'v2', 100);
      expect(map.get('key')).toBe('v1');
    });
  });

  describe('delete', () => {
    it('should delete key with tombstone', () => {
      const map = new LWWMap<string>('node-1');
      map.set('key', 'value', 100);
      map.delete('key', 200);
      expect(map.get('key')).toBeUndefined();
      expect(map.has('key')).toBe(false);
    });

    it('should not delete if tombstone is older', () => {
      const map = new LWWMap<string>('node-1');
      map.set('key', 'value', 200);
      map.delete('key', 100);
      expect(map.get('key')).toBe('value');
    });
  });

  describe('keys/entries/size', () => {
    it('should return non-deleted keys', () => {
      const map = new LWWMap<string>('node-1');
      map.set('a', 'va', 100);
      map.set('b', 'vb', 100);
      map.set('c', 'vc', 100);
      map.delete('b', 200);

      expect(map.keys().sort()).toEqual(['a', 'c']);
      expect(map.size).toBe(2);
    });

    it('should return entries without deleted items', () => {
      const map = new LWWMap<string>('node-1');
      map.set('a', 'va', 100);
      map.set('b', 'vb', 100);
      map.delete('a', 200);

      const entries = map.entries();
      expect(entries).toHaveLength(1);
      expect(entries[0]).toEqual(['b', 'vb']);
    });
  });

  describe('merge', () => {
    it('should merge two maps', () => {
      const map1 = new LWWMap<string>('node-1');
      map1.set('a', 'va-1', 100);
      map1.set('b', 'vb-1', 100);

      const map2 = new LWWMap<string>('node-2');
      map2.set('b', 'vb-2', 200);
      map2.set('c', 'vc-2', 100);

      const merged = map1.merge(map2);

      expect(merged.get('a')).toBe('va-1');
      expect(merged.get('b')).toBe('vb-2'); // newer timestamp
      expect(merged.get('c')).toBe('vc-2');
    });

    it('should handle conflicting deletes', () => {
      const map1 = new LWWMap<string>('node-1');
      map1.set('key', 'value', 100);

      const map2 = new LWWMap<string>('node-2');
      map2.set('key', 'value', 100);
      map2.delete('key', 200);

      const merged = map1.merge(map2);
      expect(merged.get('key')).toBeUndefined();
    });
  });

  describe('serialization', () => {
    it('should serialize and deserialize correctly', () => {
      const original = new LWWMap<string>('node-1');
      original.set('a', 'va', 100);
      original.set('b', 'vb', 200);
      original.delete('a', 300);

      const json = original.toJSON();
      const restored = LWWMap.fromJSON('node-1', json);

      expect(restored.get('a')).toBeUndefined();
      expect(restored.get('b')).toBe('vb');
    });
  });
});

describe('GCounter', () => {
  describe('increment', () => {
    it('should increment by 1 by default', () => {
      const counter = new GCounter('node-1');
      counter.increment();
      expect(counter.value()).toBe(1);
    });

    it('should increment by specified amount', () => {
      const counter = new GCounter('node-1');
      counter.increment(5);
      expect(counter.value()).toBe(5);
    });

    it('should reject negative amounts', () => {
      const counter = new GCounter('node-1');
      expect(() => counter.increment(-1)).toThrow(SyncError);
    });

    it('should accumulate increments', () => {
      const counter = new GCounter('node-1');
      counter.increment(3);
      counter.increment(2);
      counter.increment(5);
      expect(counter.value()).toBe(10);
    });
  });

  describe('merge', () => {
    it('should take maximum of each node count', () => {
      const c1 = new GCounter('node-1');
      c1.increment(5);

      const c2 = new GCounter('node-2');
      c2.increment(3);

      const merged = c1.merge(c2);
      expect(merged.value()).toBe(8); // 5 + 3
      expect(merged.getNodeCount('node-1')).toBe(5);
      expect(merged.getNodeCount('node-2')).toBe(3);
    });

    it('should handle overlapping node counts', () => {
      const c1 = new GCounter('node-1');
      c1.increment(5);

      // Simulate c2 has seen some of c1's increments
      const c2 = GCounter.fromJSON('node-2', { 'node-1': 3, 'node-2': 7 });

      const merged = c1.merge(c2);
      expect(merged.getNodeCount('node-1')).toBe(5); // max(5, 3)
      expect(merged.getNodeCount('node-2')).toBe(7);
      expect(merged.value()).toBe(12);
    });

    it('should be commutative', () => {
      const c1 = new GCounter('node-1');
      c1.increment(5);

      const c2 = new GCounter('node-2');
      c2.increment(3);

      const m1 = c1.merge(c2);
      const m2 = c2.merge(c1);

      expect(m1.value()).toBe(m2.value());
    });

    it('should be idempotent', () => {
      const counter = new GCounter('node-1');
      counter.increment(5);

      const merged1 = counter.merge(counter);
      const merged2 = merged1.merge(counter);

      expect(merged1.value()).toBe(5);
      expect(merged2.value()).toBe(5);
    });
  });

  describe('serialization', () => {
    it('should serialize and deserialize correctly', () => {
      const original = new GCounter('node-1');
      original.increment(10);

      const json = original.toJSON();
      expect(json).toEqual({ 'node-1': 10 });

      const restored = GCounter.fromJSON('node-1', json);
      expect(restored.value()).toBe(10);
    });
  });
});

describe('PNCounter', () => {
  describe('increment/decrement', () => {
    it('should support increment', () => {
      const counter = new PNCounter('node-1');
      counter.increment(10);
      expect(counter.value()).toBe(10);
    });

    it('should support decrement', () => {
      const counter = new PNCounter('node-1');
      counter.increment(10);
      counter.decrement(3);
      expect(counter.value()).toBe(7);
    });

    it('should support negative values', () => {
      const counter = new PNCounter('node-1');
      counter.decrement(5);
      expect(counter.value()).toBe(-5);
    });

    it('should reject negative amounts', () => {
      const counter = new PNCounter('node-1');
      expect(() => counter.increment(-1)).toThrow(SyncError);
      expect(() => counter.decrement(-1)).toThrow(SyncError);
    });
  });

  describe('merge', () => {
    it('should merge positive and negative counters', () => {
      const c1 = new PNCounter('node-1');
      c1.increment(10);
      c1.decrement(3);

      const c2 = new PNCounter('node-2');
      c2.increment(5);
      c2.decrement(2);

      const merged = c1.merge(c2);
      expect(merged.value()).toBe(10); // (10 + 5) - (3 + 2)
    });
  });

  describe('serialization', () => {
    it('should serialize and deserialize correctly', () => {
      const original = new PNCounter('node-1');
      original.increment(10);
      original.decrement(3);

      const json = original.toJSON();
      const restored = PNCounter.fromJSON('node-1', json);

      expect(restored.value()).toBe(7);
    });
  });
});

// =============================================================================
// Selective Sync Tests
// =============================================================================

describe('SelectiveSync', () => {
  describe('configure', () => {
    it('should configure table sync settings', () => {
      const sync = new SelectiveSync('node-1');
      sync.configure('users', { priority: 10, mode: SyncMode.Full });

      const config = sync.getConfig('users');
      expect(config.priority).toBe(10);
      expect(config.mode).toBe(SyncMode.Full);
    });

    it('should merge configurations', () => {
      const sync = new SelectiveSync('node-1');
      sync.configure('users', { priority: 10 });
      sync.configure('users', { mode: SyncMode.Filtered });

      const config = sync.getConfig('users');
      expect(config.priority).toBe(10);
      expect(config.mode).toBe(SyncMode.Filtered);
    });
  });

  describe('setFilter', () => {
    it('should filter rows during sync', () => {
      const sync = new SelectiveSync<{ tenantId: string }>('node-1');
      sync.setFilter('users', (user) => user.tenantId === 'tenant-1');

      expect(sync.shouldSyncRow('users', { tenantId: 'tenant-1' })).toBe(true);
      expect(sync.shouldSyncRow('users', { tenantId: 'tenant-2' })).toBe(false);
    });
  });

  describe('setColumns', () => {
    it('should configure columns to sync', () => {
      const sync = new SelectiveSync('node-1');
      sync.setColumns('messages', ['id', 'text', 'createdAt']);

      expect(sync.getColumnsToSync('messages')).toEqual(['id', 'text', 'createdAt']);
      expect(sync.getConfig('messages').mode).toBe(SyncMode.Columns);
    });
  });

  describe('setPriority', () => {
    it('should order tables by priority', () => {
      const sync = new SelectiveSync('node-1');
      sync.setPriority('settings', 100);
      sync.setPriority('users', 50);
      sync.setPriority('logs', 10);

      const ordered = sync.getTablesInPriorityOrder();
      expect(ordered).toEqual(['settings', 'users', 'logs']);
    });
  });

  describe('setLazy', () => {
    it('should mark tables as lazy', () => {
      const sync = new SelectiveSync('node-1');
      sync.setLazy('analytics', true);

      expect(sync.getLazyTables()).toContain('analytics');
      expect(sync.shouldSync('analytics')).toBe(false);
    });
  });

  describe('disable', () => {
    it('should disable sync for a table', () => {
      const sync = new SelectiveSync('node-1');
      sync.disable('debug_logs');

      expect(sync.shouldSync('debug_logs')).toBe(false);
      expect(sync.getConfig('debug_logs').mode).toBe(SyncMode.None);
    });
  });

  describe('shouldSync', () => {
    it('should return true for configured tables', () => {
      const sync = new SelectiveSync('node-1');
      sync.configure('users', { mode: SyncMode.Full });

      expect(sync.shouldSync('users')).toBe(true);
    });

    it('should return false for disabled tables', () => {
      const sync = new SelectiveSync('node-1');
      sync.disable('logs');

      expect(sync.shouldSync('logs')).toBe(false);
    });

    it('should return false for lazy tables', () => {
      const sync = new SelectiveSync('node-1');
      sync.setLazy('data', true);

      expect(sync.shouldSync('data')).toBe(false);
    });
  });

  describe('getTablesInPriorityOrder', () => {
    it('should exclude lazy and disabled tables', () => {
      const sync = new SelectiveSync('node-1');
      sync.configure('a', { priority: 1 });
      sync.configure('b', { priority: 2, lazy: true });
      sync.configure('c', { priority: 3, mode: SyncMode.None });
      sync.configure('d', { priority: 4 });

      const ordered = sync.getTablesInPriorityOrder();
      expect(ordered).toEqual(['d', 'a']);
    });
  });

  describe('clear', () => {
    it('should reset all configuration', () => {
      const sync = new SelectiveSync('node-1');
      sync.configure('users', { priority: 10 });
      sync.configure('posts', { priority: 5 });

      sync.clear();

      expect(sync.getTables()).toHaveLength(0);
    });
  });

  describe('serialization', () => {
    it('should serialize configuration (excluding filter functions)', () => {
      const sync = new SelectiveSync('node-1');
      sync.configure('users', { priority: 10, mode: SyncMode.Full });
      sync.setFilter('posts', () => true);

      const json = sync.toJSON();

      expect(json.tables.users.priority).toBe(10);
      expect(json.tables.users.mode).toBe(SyncMode.Full);
      // Filter function is not serialized
      expect(json.tables.posts.filter).toBeUndefined();
    });
  });

  describe('default mode', () => {
    it('should use default mode for unconfigured tables', () => {
      const sync = new SelectiveSync('node-1');
      sync.setDefaultMode(SyncMode.None);

      expect(sync.getConfig('unconfigured').mode).toBe(SyncMode.None);
    });
  });
});
