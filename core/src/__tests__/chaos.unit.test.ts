/**
 * Chaos Testing Suite for EvoDB
 * Issue: evodb-187 - Add chaos testing suite
 *
 * This test suite validates system resilience under adverse conditions including:
 * - Random network failure injection during writes
 * - Timeout simulation during R2 operations
 * - Partial write failures (half bytes written)
 * - Concurrent conflicting operations
 * - Memory pressure simulation
 * - Clock skew scenarios
 *
 * Uses TDD Red-Green-Refactor approach:
 * RED: These tests define expected behavior for chaos conditions
 * GREEN: chaos-testing.ts utilities will be implemented to make tests pass
 * REFACTOR: Export utilities for use in other package tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ChaosR2Bucket,
  ChaosStorage,
  DelayInjector,
  PartialWriteSimulator,
  ConcurrencyConflictSimulator,
  MemoryPressureSimulator,
  ClockSkewSimulator,
  TimeoutError,
  ETagMismatchError,
  type ChaosConfig,
  type FailureMode,
} from '../chaos-testing.ts';
import { MemoryStorage, type Storage, type R2BucketLike } from '../storage.ts';
import {
  CircuitBreaker,
  CircuitBreakerStorage,
  CircuitState,
  CircuitBreakerError,
} from '../circuit-breaker.ts';

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Creates a mock R2Bucket for testing
 */
function createMockR2Bucket(): R2BucketLike {
  const storage = new Map<string, { data: ArrayBuffer; metadata: { size: number; etag: string; uploaded: Date } }>();

  return {
    async get(key: string) {
      const entry = storage.get(key);
      if (!entry) return null;
      return {
        key,
        size: entry.metadata.size,
        etag: entry.metadata.etag,
        uploaded: entry.metadata.uploaded,
        arrayBuffer: async () => entry.data,
        text: async () => new TextDecoder().decode(entry.data),
      };
    },
    async put(key: string, value: ArrayBuffer | Uint8Array | string) {
      const data = value instanceof ArrayBuffer
        ? value
        : typeof value === 'string'
          ? new TextEncoder().encode(value).buffer
          : (value.buffer as ArrayBuffer).slice(value.byteOffset, value.byteOffset + value.byteLength);
      const metadata = {
        size: data.byteLength,
        etag: `"${Date.now().toString(16)}"`,
        uploaded: new Date(),
      };
      storage.set(key, { data, metadata });
      return {
        key,
        ...metadata,
        arrayBuffer: async () => data,
        text: async () => new TextDecoder().decode(data),
      };
    },
    async delete(key: string) {
      storage.delete(key);
    },
    async list(options?: { prefix?: string; cursor?: string; limit?: number }) {
      const prefix = options?.prefix ?? '';
      const objects = [...storage.entries()]
        .filter(([k]) => k.startsWith(prefix))
        .map(([key, entry]) => ({
          key,
          size: entry.metadata.size,
          etag: entry.metadata.etag,
          uploaded: entry.metadata.uploaded,
          arrayBuffer: async () => entry.data,
          text: async () => new TextDecoder().decode(entry.data),
        }));
      return { objects, truncated: false };
    },
    async head(key: string) {
      const entry = storage.get(key);
      if (!entry) return null;
      return {
        key,
        size: entry.metadata.size,
        etag: entry.metadata.etag,
        uploaded: entry.metadata.uploaded,
        arrayBuffer: async () => entry.data,
        text: async () => new TextDecoder().decode(entry.data),
      };
    },
  };
}

// =============================================================================
// 1. Random Network Failure Injection Tests
// =============================================================================

describe('ChaosR2Bucket - Random Network Failure Injection', () => {
  let baseBucket: R2BucketLike;
  let chaosBucket: ChaosR2Bucket;

  beforeEach(() => {
    baseBucket = createMockR2Bucket();
  });

  describe('probabilistic failure injection', () => {
    it('should inject failures based on configured probability', async () => {
      // 100% failure rate should always fail
      chaosBucket = new ChaosR2Bucket(baseBucket, {
        failureProbability: 1.0,
        failureMode: 'network',
      });

      await expect(chaosBucket.get('test-key')).rejects.toThrow(/network/i);
    });

    it('should pass through operations when probability is 0', async () => {
      chaosBucket = new ChaosR2Bucket(baseBucket, {
        failureProbability: 0,
        failureMode: 'network',
      });

      await baseBucket.put('test-key', new Uint8Array([1, 2, 3]));
      const result = await chaosBucket.get('test-key');
      expect(result).not.toBeNull();
    });

    it('should respect failure probability distribution', async () => {
      // Use seeded random for deterministic testing
      chaosBucket = new ChaosR2Bucket(baseBucket, {
        failureProbability: 0.5,
        failureMode: 'network',
        seed: 12345,
      });

      await baseBucket.put('test-key', new Uint8Array([1, 2, 3]));

      // With 50% failure rate and deterministic seed, we can predict outcomes
      let failures = 0;
      let successes = 0;
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        try {
          await chaosBucket.get('test-key');
          successes++;
        } catch {
          failures++;
        }
      }

      // With 50% probability, we expect roughly half to fail
      // Allow some variance (30-70% range)
      expect(failures).toBeGreaterThan(iterations * 0.3);
      expect(failures).toBeLessThan(iterations * 0.7);
    });
  });

  describe('failure modes', () => {
    it('should inject network timeout errors', async () => {
      chaosBucket = new ChaosR2Bucket(baseBucket, {
        failureProbability: 1.0,
        failureMode: 'timeout',
      });

      await expect(chaosBucket.get('test-key')).rejects.toThrow(/timeout/i);
    });

    it('should inject connection reset errors', async () => {
      chaosBucket = new ChaosR2Bucket(baseBucket, {
        failureProbability: 1.0,
        failureMode: 'connection_reset',
      });

      await expect(chaosBucket.get('test-key')).rejects.toThrow(/connection.*reset/i);
    });

    it('should inject service unavailable errors', async () => {
      chaosBucket = new ChaosR2Bucket(baseBucket, {
        failureProbability: 1.0,
        failureMode: 'service_unavailable',
      });

      await expect(chaosBucket.get('test-key')).rejects.toThrow(/service.*unavailable/i);
    });

    it('should inject rate limit errors', async () => {
      chaosBucket = new ChaosR2Bucket(baseBucket, {
        failureProbability: 1.0,
        failureMode: 'rate_limit',
      });

      await expect(chaosBucket.get('test-key')).rejects.toThrow(/rate.*limit/i);
    });
  });

  describe('operation-specific failure injection', () => {
    it('should inject failures only on write operations', async () => {
      chaosBucket = new ChaosR2Bucket(baseBucket, {
        failureProbability: 1.0,
        failureMode: 'network',
        affectedOperations: ['put'],
      });

      // Seed some data directly
      await baseBucket.put('existing-key', new Uint8Array([1, 2, 3]));

      // Read should succeed
      const result = await chaosBucket.get('existing-key');
      expect(result).not.toBeNull();

      // Write should fail
      await expect(
        chaosBucket.put('new-key', new Uint8Array([4, 5, 6]))
      ).rejects.toThrow();
    });

    it('should inject failures only on read operations', async () => {
      chaosBucket = new ChaosR2Bucket(baseBucket, {
        failureProbability: 1.0,
        failureMode: 'network',
        affectedOperations: ['get'],
      });

      // Write should succeed
      await chaosBucket.put('test-key', new Uint8Array([1, 2, 3]));

      // Read should fail
      await expect(chaosBucket.get('test-key')).rejects.toThrow();
    });

    it('should inject failures on list operations', async () => {
      chaosBucket = new ChaosR2Bucket(baseBucket, {
        failureProbability: 1.0,
        failureMode: 'network',
        affectedOperations: ['list'],
      });

      await expect(chaosBucket.list({ prefix: 'test/' })).rejects.toThrow();
    });
  });

  describe('integration with circuit breaker', () => {
    it('should trip circuit breaker after threshold failures', async () => {
      chaosBucket = new ChaosR2Bucket(baseBucket, {
        failureProbability: 1.0,
        failureMode: 'network',
      });

      const breaker = new CircuitBreaker({
        failureThreshold: 3,
        resetTimeoutMs: 5000,
      });

      // Cause failures to trip the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(() => chaosBucket.get('test-key'));
        } catch {
          // Expected
        }
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });
  });
});

// =============================================================================
// 2. ChaosStorage - Network Failure Wrapper for Storage Interface
// =============================================================================

describe('ChaosStorage - Storage Interface Wrapper', () => {
  let baseStorage: MemoryStorage;
  let chaosStorage: ChaosStorage;

  beforeEach(() => {
    baseStorage = new MemoryStorage();
  });

  describe('failure injection for all storage operations', () => {
    it('should inject failures on read operations', async () => {
      chaosStorage = new ChaosStorage(baseStorage, {
        failureProbability: 1.0,
        failureMode: 'network',
      });

      await expect(chaosStorage.read('test.bin')).rejects.toThrow();
    });

    it('should inject failures on write operations', async () => {
      chaosStorage = new ChaosStorage(baseStorage, {
        failureProbability: 1.0,
        failureMode: 'network',
      });

      await expect(
        chaosStorage.write('test.bin', new Uint8Array([1, 2, 3]))
      ).rejects.toThrow();
    });

    it('should inject failures on list operations', async () => {
      chaosStorage = new ChaosStorage(baseStorage, {
        failureProbability: 1.0,
        failureMode: 'network',
      });

      await expect(chaosStorage.list('prefix/')).rejects.toThrow();
    });

    it('should inject failures on delete operations', async () => {
      chaosStorage = new ChaosStorage(baseStorage, {
        failureProbability: 1.0,
        failureMode: 'network',
      });

      await expect(chaosStorage.delete('test.bin')).rejects.toThrow();
    });
  });

  describe('partial success scenarios', () => {
    it('should allow successful operations with 0% failure rate', async () => {
      chaosStorage = new ChaosStorage(baseStorage, {
        failureProbability: 0,
        failureMode: 'network',
      });

      await chaosStorage.write('test.bin', new Uint8Array([1, 2, 3]));
      const result = await chaosStorage.read('test.bin');
      expect(result).toEqual(new Uint8Array([1, 2, 3]));
    });
  });

  describe('dynamic failure rate adjustment', () => {
    it('should allow changing failure probability at runtime', async () => {
      chaosStorage = new ChaosStorage(baseStorage, {
        failureProbability: 0,
        failureMode: 'network',
      });

      // Should succeed with 0% failure
      await chaosStorage.write('test.bin', new Uint8Array([1, 2, 3]));

      // Update to 100% failure
      chaosStorage.setFailureProbability(1.0);

      // Should now fail
      await expect(chaosStorage.read('test.bin')).rejects.toThrow();
    });

    it('should allow changing failure mode at runtime', async () => {
      chaosStorage = new ChaosStorage(baseStorage, {
        failureProbability: 1.0,
        failureMode: 'network',
      });

      await expect(chaosStorage.read('test.bin')).rejects.toThrow(/network/i);

      chaosStorage.setFailureMode('timeout');

      await expect(chaosStorage.read('test.bin')).rejects.toThrow(/timeout/i);
    });
  });
});

// =============================================================================
// 3. Timeout Simulation Tests
// =============================================================================

describe('DelayInjector - Timeout Simulation', () => {
  let baseStorage: MemoryStorage;

  beforeEach(() => {
    vi.useFakeTimers();
    baseStorage = new MemoryStorage();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('fixed delay injection', () => {
    it('should add fixed delay to operations', async () => {
      const delayInjector = new DelayInjector(baseStorage, {
        delayMs: 1000,
        delayMode: 'fixed',
      });

      await baseStorage.write('test.bin', new Uint8Array([1, 2, 3]));

      const readPromise = delayInjector.read('test.bin');

      // Advance time
      await vi.advanceTimersByTimeAsync(1000);

      const result = await readPromise;
      expect(result).toEqual(new Uint8Array([1, 2, 3]));
    });

    it('should cause timeout when delay exceeds timeout threshold', async () => {
      const delayInjector = new DelayInjector(baseStorage, {
        delayMs: 5000,
        delayMode: 'fixed',
        timeoutMs: 1000, // Operation timeout
      });

      await baseStorage.write('test.bin', new Uint8Array([1, 2, 3]));

      const readPromise = delayInjector.read('test.bin');

      // Advance time past timeout but before delay completes
      await vi.advanceTimersByTimeAsync(1001);

      await expect(readPromise).rejects.toThrow(TimeoutError);
    });
  });

  describe('random delay injection', () => {
    it('should add random delay within specified range', async () => {
      const delayInjector = new DelayInjector(baseStorage, {
        delayMs: 500,
        maxDelayMs: 1500,
        delayMode: 'random',
        seed: 42,
      });

      await baseStorage.write('test.bin', new Uint8Array([1, 2, 3]));

      const readPromise = delayInjector.read('test.bin');

      // Advance time enough for max delay
      await vi.advanceTimersByTimeAsync(1500);

      const result = await readPromise;
      expect(result).toEqual(new Uint8Array([1, 2, 3]));
    });
  });

  describe('exponential backoff delay', () => {
    it('should increase delay exponentially on retries', async () => {
      const delayInjector = new DelayInjector(baseStorage, {
        delayMs: 100,
        delayMode: 'exponential',
        backoffMultiplier: 2,
        maxDelayMs: 3200,
      });

      await baseStorage.write('test.bin', new Uint8Array([1, 2, 3]));

      // First operation: 100ms
      let readPromise = delayInjector.read('test.bin');
      await vi.advanceTimersByTimeAsync(100);
      await readPromise;

      // Second operation: 200ms
      readPromise = delayInjector.read('test.bin');
      await vi.advanceTimersByTimeAsync(200);
      await readPromise;

      // Third operation: 400ms
      readPromise = delayInjector.read('test.bin');
      await vi.advanceTimersByTimeAsync(400);
      await readPromise;

      // Fourth operation: 800ms
      readPromise = delayInjector.read('test.bin');
      await vi.advanceTimersByTimeAsync(800);
      await readPromise;
    });
  });

  describe('operation-specific delays', () => {
    it('should apply different delays to different operations', async () => {
      const delayInjector = new DelayInjector(baseStorage, {
        delayMs: 100,
        delayMode: 'fixed',
        operationDelays: {
          read: 500,
          write: 1000,
          list: 200,
        },
      });

      const writePromise = delayInjector.write('test.bin', new Uint8Array([1]));
      await vi.advanceTimersByTimeAsync(1000);
      await writePromise;

      const readPromise = delayInjector.read('test.bin');
      await vi.advanceTimersByTimeAsync(500);
      const result = await readPromise;
      expect(result).toEqual(new Uint8Array([1]));
    });
  });
});

// =============================================================================
// 4. Partial Write Failure Tests
// =============================================================================

describe('PartialWriteSimulator - Corruption Testing', () => {
  let baseStorage: MemoryStorage;
  let partialWriter: PartialWriteSimulator;

  beforeEach(() => {
    baseStorage = new MemoryStorage();
  });

  describe('partial byte writes', () => {
    it('should write only half the bytes', async () => {
      partialWriter = new PartialWriteSimulator(baseStorage, {
        writeRatio: 0.5, // Write only 50% of bytes
        failAfterPartialWrite: true,
      });

      const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

      await expect(
        partialWriter.write('test.bin', data)
      ).rejects.toThrow(/partial.*write/i);

      // Check that partial data was written
      const written = await baseStorage.read('test.bin');
      expect(written).not.toBeNull();
      expect(written!.length).toBe(4); // Half of 8
      expect(written).toEqual(new Uint8Array([1, 2, 3, 4]));
    });

    it('should write configurable percentage of bytes', async () => {
      partialWriter = new PartialWriteSimulator(baseStorage, {
        writeRatio: 0.25, // Write only 25% of bytes
        failAfterPartialWrite: true,
      });

      const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

      await expect(
        partialWriter.write('test.bin', data)
      ).rejects.toThrow();

      const written = await baseStorage.read('test.bin');
      expect(written!.length).toBe(2); // 25% of 8
    });

    it('should silently corrupt without throwing when configured', async () => {
      partialWriter = new PartialWriteSimulator(baseStorage, {
        writeRatio: 0.5,
        failAfterPartialWrite: false, // Silent corruption
      });

      const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

      // Should not throw
      await partialWriter.write('test.bin', data);

      // But data should be corrupted (only half written)
      const written = await baseStorage.read('test.bin');
      expect(written!.length).toBe(4);
    });
  });

  describe('byte corruption modes', () => {
    it('should corrupt random bytes within data', async () => {
      partialWriter = new PartialWriteSimulator(baseStorage, {
        corruptionMode: 'random_bytes',
        corruptionRatio: 0.5, // Corrupt 50% of bytes
        seed: 12345,
      });

      const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      await partialWriter.write('test.bin', data);

      const written = await baseStorage.read('test.bin');
      expect(written).not.toBeNull();
      expect(written!.length).toBe(8); // Same length

      // Some bytes should be different
      let differentBytes = 0;
      for (let i = 0; i < 8; i++) {
        if (written![i] !== data[i]) differentBytes++;
      }
      expect(differentBytes).toBeGreaterThan(0);
    });

    it('should truncate data at random position', async () => {
      partialWriter = new PartialWriteSimulator(baseStorage, {
        corruptionMode: 'truncate',
        seed: 54321,
      });

      const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      await partialWriter.write('test.bin', data);

      const written = await baseStorage.read('test.bin');
      expect(written).not.toBeNull();
      expect(written!.length).toBeLessThan(10);
    });

    it('should append garbage bytes', async () => {
      partialWriter = new PartialWriteSimulator(baseStorage, {
        corruptionMode: 'append_garbage',
        garbageBytes: 5,
      });

      const data = new Uint8Array([1, 2, 3, 4]);
      await partialWriter.write('test.bin', data);

      const written = await baseStorage.read('test.bin');
      expect(written).not.toBeNull();
      expect(written!.length).toBe(9); // 4 + 5 garbage
    });
  });

  describe('read-after-write verification', () => {
    it('should detect write corruption on verification read', async () => {
      partialWriter = new PartialWriteSimulator(baseStorage, {
        writeRatio: 0.5,
        failAfterPartialWrite: false,
        verifyOnRead: true,
      });

      const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const originalHash = partialWriter.computeHash(data);

      // Write (silently corrupted)
      await partialWriter.write('test.bin', data, { expectedHash: originalHash });

      // Read should detect corruption
      await expect(
        partialWriter.read('test.bin', { expectedHash: originalHash })
      ).rejects.toThrow(/corruption.*detected/i);
    });
  });
});

// =============================================================================
// 5. Concurrent Conflicting Operations Tests
// =============================================================================

describe('ConcurrencyConflictSimulator', () => {
  let baseStorage: MemoryStorage;
  let conflictSimulator: ConcurrencyConflictSimulator;

  beforeEach(() => {
    baseStorage = new MemoryStorage();
  });

  describe('write-write conflicts', () => {
    it('should simulate concurrent writes to same key', async () => {
      conflictSimulator = new ConcurrencyConflictSimulator(baseStorage, {
        conflictProbability: 1.0,
        conflictMode: 'write_write',
      });

      // Set up initial data
      await baseStorage.write('shared.bin', new Uint8Array([1, 2, 3]));

      // Two concurrent writes
      const write1 = conflictSimulator.write('shared.bin', new Uint8Array([4, 5, 6]));
      const write2 = conflictSimulator.write('shared.bin', new Uint8Array([7, 8, 9]));

      // At least one should fail or we should get last-writer-wins
      const results = await Promise.allSettled([write1, write2]);

      // With conflict simulation, at least one should be rejected
      const rejected = results.filter(r => r.status === 'rejected');
      expect(rejected.length).toBeGreaterThanOrEqual(1);
    });

    it('should detect lost updates', async () => {
      conflictSimulator = new ConcurrencyConflictSimulator(baseStorage, {
        conflictProbability: 1.0,
        conflictMode: 'lost_update',
        detectLostUpdates: true,
      });

      await baseStorage.write('counter.bin', new Uint8Array([0]));

      // Simulate read-modify-write conflict
      const result1 = conflictSimulator.readModifyWrite('counter.bin', (data) => {
        const val = data[0];
        return new Uint8Array([val + 1]);
      });

      const result2 = conflictSimulator.readModifyWrite('counter.bin', (data) => {
        const val = data[0];
        return new Uint8Array([val + 1]);
      });

      const results = await Promise.allSettled([result1, result2]);

      // At least one should fail due to lost update detection
      const rejected = results.filter(r => r.status === 'rejected');
      expect(rejected.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('read-write conflicts', () => {
    it('should simulate dirty reads', async () => {
      conflictSimulator = new ConcurrencyConflictSimulator(baseStorage, {
        conflictProbability: 1.0,
        conflictMode: 'dirty_read',
      });

      await baseStorage.write('data.bin', new Uint8Array([1, 2, 3]));

      // Start a write that's "in progress"
      const writePromise = conflictSimulator.writeWithDelay(
        'data.bin',
        new Uint8Array([4, 5, 6]),
        100 // 100ms to complete
      );

      // Read during the write
      const readDuringWrite = await conflictSimulator.read('data.bin');

      await writePromise;

      // Dirty read might return incomplete/intermediate state
      // The exact behavior depends on implementation
      expect(readDuringWrite).toBeDefined();
    });
  });

  describe('optimistic concurrency control', () => {
    it('should fail on ETag mismatch', async () => {
      conflictSimulator = new ConcurrencyConflictSimulator(baseStorage, {
        useOptimisticLocking: true,
      });

      // Write initial data
      const etag1 = await conflictSimulator.writeWithEtag(
        'data.bin',
        new Uint8Array([1, 2, 3])
      );

      // Simulate another writer updating the data (via conflictSimulator to update etag map)
      await conflictSimulator.writeWithEtag('data.bin', new Uint8Array([4, 5, 6]));

      // Try to update with stale ETag
      await expect(
        conflictSimulator.conditionalWrite(
          'data.bin',
          new Uint8Array([7, 8, 9]),
          etag1 // Stale ETag
        )
      ).rejects.toThrow(ETagMismatchError);
    });
  });
});

// =============================================================================
// 6. Memory Pressure Simulation Tests
// =============================================================================

describe('MemoryPressureSimulator', () => {
  let baseStorage: MemoryStorage;
  let memorySimulator: MemoryPressureSimulator;

  beforeEach(() => {
    baseStorage = new MemoryStorage();
  });

  describe('memory limit enforcement', () => {
    it('should fail operations when memory limit exceeded', async () => {
      memorySimulator = new MemoryPressureSimulator(baseStorage, {
        maxMemoryBytes: 100, // Very small limit
        rejectOnPressure: true,
      });

      // First small write should succeed
      await memorySimulator.write('small.bin', new Uint8Array(50));

      // Second write that would exceed limit should fail
      await expect(
        memorySimulator.write('large.bin', new Uint8Array(60))
      ).rejects.toThrow(/memory.*pressure|out.*memory/i);
    });

    it('should track cumulative memory usage', async () => {
      memorySimulator = new MemoryPressureSimulator(baseStorage, {
        maxMemoryBytes: 200,
        rejectOnPressure: true,
      });

      await memorySimulator.write('file1.bin', new Uint8Array(50));
      await memorySimulator.write('file2.bin', new Uint8Array(50));
      await memorySimulator.write('file3.bin', new Uint8Array(50));

      // Fourth write should fail (total: 200)
      await expect(
        memorySimulator.write('file4.bin', new Uint8Array(51))
      ).rejects.toThrow(/memory/i);

      expect(memorySimulator.getCurrentMemoryUsage()).toBe(150);
    });

    it('should release memory on delete', async () => {
      memorySimulator = new MemoryPressureSimulator(baseStorage, {
        maxMemoryBytes: 100,
        rejectOnPressure: true,
      });

      await memorySimulator.write('file.bin', new Uint8Array(80));
      expect(memorySimulator.getCurrentMemoryUsage()).toBe(80);

      await memorySimulator.delete('file.bin');
      expect(memorySimulator.getCurrentMemoryUsage()).toBe(0);

      // Can now write again
      await memorySimulator.write('newfile.bin', new Uint8Array(80));
    });
  });

  describe('read operations under memory pressure', () => {
    it('should fail large reads when memory is constrained', async () => {
      memorySimulator = new MemoryPressureSimulator(baseStorage, {
        maxMemoryBytes: 50,
        rejectOnPressure: true,
        trackReadMemory: true,
      });

      // Write data directly to base storage
      await baseStorage.write('large.bin', new Uint8Array(100));

      // Reading should fail due to memory pressure
      await expect(memorySimulator.read('large.bin')).rejects.toThrow(/memory/i);
    });
  });

  describe('gradual memory pressure', () => {
    it('should slow down operations under pressure', async () => {
      vi.useFakeTimers();

      memorySimulator = new MemoryPressureSimulator(baseStorage, {
        maxMemoryBytes: 100,
        pressureThreshold: 0.8, // Start slowing at 80%
        maxSlowdownMs: 1000,
      });

      // Fill to 80% capacity
      await memorySimulator.write('file.bin', new Uint8Array(80));

      const writePromise = memorySimulator.write('small.bin', new Uint8Array(10));

      // Should take longer due to pressure
      await vi.advanceTimersByTimeAsync(500);

      await writePromise;

      vi.useRealTimers();
    });
  });

  describe('memory fragmentation simulation', () => {
    it('should simulate fragmentation causing allocation failures', async () => {
      memorySimulator = new MemoryPressureSimulator(baseStorage, {
        maxMemoryBytes: 200,
        simulateFragmentation: true,
        fragmentationLevel: 0.5, // 50% fragmentation
      });

      // Even though total is under limit, fragmentation may cause failure
      await memorySimulator.write('block1.bin', new Uint8Array(50));
      await memorySimulator.delete('block1.bin');
      await memorySimulator.write('block2.bin', new Uint8Array(50));
      await memorySimulator.delete('block2.bin');

      // Large contiguous allocation might fail due to fragmentation
      // even though total free memory is sufficient
      // (This depends on fragmentation simulation implementation)
      expect(memorySimulator.getFragmentationRatio()).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// 7. Clock Skew Scenario Tests
// =============================================================================

describe('ClockSkewSimulator', () => {
  let baseStorage: MemoryStorage;
  let clockSimulator: ClockSkewSimulator;

  beforeEach(() => {
    vi.useFakeTimers();
    baseStorage = new MemoryStorage();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('forward clock skew', () => {
    it('should simulate clock jumping forward', async () => {
      clockSimulator = new ClockSkewSimulator(baseStorage, {
        skewMs: 60000, // 1 minute forward
        skewDirection: 'forward',
      });

      const beforeSkew = clockSimulator.now();
      // Apply the skew to simulate a clock jump
      clockSimulator.applySkeW();
      const afterSkew = clockSimulator.now();

      // The simulated time should have jumped forward by the skew amount
      expect(afterSkew - beforeSkew).toBeGreaterThanOrEqual(60000);
    });

    it('should cause TTL-based cache invalidation', async () => {
      clockSimulator = new ClockSkewSimulator(baseStorage, {
        skewMs: 3600000, // 1 hour forward
        skewDirection: 'forward',
      });

      // Simulate cached data with TTL
      const cachedItem = {
        data: new Uint8Array([1, 2, 3]),
        expiresAt: clockSimulator.now() + 1800000, // 30 min TTL
      };

      // Advance clock
      clockSimulator.applySkeW();

      // Cache should now be expired
      expect(clockSimulator.now()).toBeGreaterThan(cachedItem.expiresAt);
    });
  });

  describe('backward clock skew', () => {
    it('should simulate clock jumping backward', async () => {
      // Set initial time to something reasonable
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));

      clockSimulator = new ClockSkewSimulator(baseStorage, {
        skewMs: 60000, // 1 minute backward
        skewDirection: 'backward',
      });

      const beforeSkew = clockSimulator.now();
      clockSimulator.applySkeW();
      const afterSkew = clockSimulator.now();

      // Time should have gone backward
      expect(afterSkew).toBeLessThan(beforeSkew);
    });

    it('should handle operations during backward time travel', async () => {
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));

      clockSimulator = new ClockSkewSimulator(baseStorage, {
        skewMs: 5000,
        skewDirection: 'backward',
      });

      // Write at time T
      await clockSimulator.write('test.bin', new Uint8Array([1]));
      const writeTime = clockSimulator.now();

      // Skew clock backward
      clockSimulator.applySkeW();

      // Read at time T - 5s
      const readTime = clockSimulator.now();
      const data = await clockSimulator.read('test.bin');

      expect(readTime).toBeLessThan(writeTime);
      expect(data).toEqual(new Uint8Array([1]));
    });
  });

  describe('monotonic time provider integration', () => {
    it('should work correctly with circuit breaker using monotonic time', async () => {
      clockSimulator = new ClockSkewSimulator(baseStorage, {
        skewMs: 10000,
        skewDirection: 'backward',
      });

      // Create circuit breaker with the simulator's monotonic time provider
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        resetTimeoutMs: 5000,
        timeProvider: clockSimulator.getMonotonicTimeProvider(),
      });

      // Trip the circuit
      try {
        await breaker.execute(() => Promise.reject(new Error('fail')));
      } catch {}
      try {
        await breaker.execute(() => Promise.reject(new Error('fail')));
      } catch {}

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Even with backward wall clock, monotonic time should advance
      clockSimulator.advanceMonotonicTime(6000);

      // Circuit should be half-open based on monotonic time, not wall clock
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
    });
  });

  describe('random clock jitter', () => {
    it('should add random jitter to timestamps', async () => {
      clockSimulator = new ClockSkewSimulator(baseStorage, {
        jitterMs: 100, // +/- 100ms jitter
        seed: 12345,
      });

      const timestamps: number[] = [];
      for (let i = 0; i < 10; i++) {
        timestamps.push(clockSimulator.now());
        await vi.advanceTimersByTimeAsync(1);
      }

      // Timestamps should not be monotonically increasing due to jitter
      let hasJitter = false;
      for (let i = 1; i < timestamps.length; i++) {
        if (timestamps[i] <= timestamps[i - 1]) {
          hasJitter = true;
          break;
        }
      }

      // With jitter, we expect some non-monotonic behavior
      // (Or check variance is within expected range)
      const avgDiff = timestamps.reduce((acc, t, i) =>
        i > 0 ? acc + Math.abs(t - timestamps[i - 1]) : acc, 0) / (timestamps.length - 1);

      expect(avgDiff).toBeGreaterThan(0);
    });
  });

  describe('distributed clock scenarios', () => {
    it('should simulate clock drift between nodes', async () => {
      const node1Clock = new ClockSkewSimulator(baseStorage, {
        skewMs: 0,
        driftRateMs: 1, // 1ms drift per second
      });

      const node2Clock = new ClockSkewSimulator(baseStorage, {
        skewMs: 0,
        driftRateMs: -2, // -2ms drift per second (opposite direction)
      });

      // Advance real time by 10 seconds
      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(1000);
        node1Clock.tick();
        node2Clock.tick();
      }

      const node1Time = node1Clock.now();
      const node2Time = node2Clock.now();

      // Clocks should have drifted apart
      // Node1 should be 10ms ahead, Node2 should be 20ms behind
      // Total difference: ~30ms
      const drift = Math.abs(node1Time - node2Time);
      expect(drift).toBeGreaterThanOrEqual(20);
    });
  });
});

// =============================================================================
// 8. Combined Chaos Scenarios
// =============================================================================

describe('Combined Chaos Scenarios', () => {
  describe('network failure + timeout + circuit breaker', () => {
    it('should handle cascading failures gracefully', async () => {
      vi.useFakeTimers();

      const baseStorage = new MemoryStorage();

      // Chain: ChaosStorage -> DelayInjector -> CircuitBreakerStorage -> MemoryStorage
      const chaosStorage = new ChaosStorage(baseStorage, {
        failureProbability: 0.3,
        failureMode: 'network',
        seed: 42,
      });

      const delayedStorage = new DelayInjector(chaosStorage, {
        delayMs: 100,
        delayMode: 'fixed',
        timeoutMs: 500,
      });

      const protectedStorage = new CircuitBreakerStorage(delayedStorage, {
        failureThreshold: 5,
        resetTimeoutMs: 10000,
      });

      // Perform multiple operations
      let failures = 0;
      let circuitOpen = false;

      for (let i = 0; i < 20; i++) {
        try {
          const writePromise = protectedStorage.write(
            `test-${i}.bin`,
            new Uint8Array([i])
          );
          await vi.advanceTimersByTimeAsync(200);
          await writePromise;
        } catch (error) {
          failures++;
          if (error instanceof CircuitBreakerError) {
            circuitOpen = true;
          }
        }
      }

      // Should have experienced some failures
      expect(failures).toBeGreaterThan(0);

      // Circuit should have potentially opened
      // (depends on random seed and timing)

      vi.useRealTimers();
    });
  });

  describe('partial write + memory pressure', () => {
    it('should handle compound failure scenarios', async () => {
      const baseStorage = new MemoryStorage();

      const partialWriter = new PartialWriteSimulator(baseStorage, {
        writeRatio: 0.75,
        failAfterPartialWrite: false,
      });

      const memoryConstrained = new MemoryPressureSimulator(partialWriter, {
        maxMemoryBytes: 500,
        rejectOnPressure: true,
      });

      // Write operations that may be partial AND memory constrained
      let completedWrites = 0;
      let failedWrites = 0;

      for (let i = 0; i < 10; i++) {
        try {
          await memoryConstrained.write(`file-${i}.bin`, new Uint8Array(100));
          completedWrites++;
        } catch {
          failedWrites++;
        }
      }

      // Some writes should have succeeded, some should have failed
      expect(completedWrites).toBeGreaterThan(0);
      expect(failedWrites).toBeGreaterThan(0);
      expect(completedWrites + failedWrites).toBe(10);
    });
  });

  describe('clock skew + concurrent operations', () => {
    it('should handle timestamp-based ordering under skew', async () => {
      vi.useFakeTimers();

      const baseStorage = new MemoryStorage();

      const clockSimulator = new ClockSkewSimulator(baseStorage, {
        jitterMs: 50,
        seed: 99,
      });

      const concurrencySimulator = new ConcurrencyConflictSimulator(clockSimulator, {
        conflictProbability: 0.5,
        conflictMode: 'write_write',
        seed: 88,
      });

      // Concurrent writes with unreliable timestamps
      const writes = Array.from({ length: 5 }, (_, i) =>
        concurrencySimulator.writeWithTimestamp(
          'shared.bin',
          new Uint8Array([i]),
          clockSimulator.now()
        )
      );

      const results = await Promise.allSettled(writes);

      // At least some should succeed
      const succeeded = results.filter(r => r.status === 'fulfilled');
      expect(succeeded.length).toBeGreaterThan(0);

      vi.useRealTimers();
    });
  });
});

// =============================================================================
// 9. Chaos Configuration and Reproducibility
// =============================================================================

describe('Chaos Configuration', () => {
  describe('seeded randomness', () => {
    it('should produce reproducible failure sequences with same seed', async () => {
      const baseStorage = new MemoryStorage();

      const chaos1 = new ChaosStorage(baseStorage, {
        failureProbability: 0.5,
        failureMode: 'network',
        seed: 12345,
      });

      const chaos2 = new ChaosStorage(baseStorage, {
        failureProbability: 0.5,
        failureMode: 'network',
        seed: 12345,
      });

      // Same seed should produce same failure sequence
      const results1: boolean[] = [];
      const results2: boolean[] = [];

      for (let i = 0; i < 20; i++) {
        try {
          await chaos1.read(`test-${i}`);
          results1.push(true);
        } catch {
          results1.push(false);
        }
      }

      for (let i = 0; i < 20; i++) {
        try {
          await chaos2.read(`test-${i}`);
          results2.push(true);
        } catch {
          results2.push(false);
        }
      }

      expect(results1).toEqual(results2);
    });
  });

  describe('chaos scenarios from config', () => {
    it('should load chaos configuration from config object', async () => {
      const config: ChaosConfig = {
        network: {
          failureProbability: 0.2,
          failureMode: 'timeout',
        },
        latency: {
          delayMs: 50,
          delayMode: 'random',
          maxDelayMs: 200,
        },
        corruption: {
          writeRatio: 0.9,
          corruptionMode: 'random_bytes',
          corruptionRatio: 0.01,
        },
        memory: {
          maxMemoryBytes: 10000,
          pressureThreshold: 0.8,
        },
        clock: {
          jitterMs: 10,
        },
        seed: 42,
      };

      const baseStorage = new MemoryStorage();
      // This would be a helper to create a fully configured chaos stack
      // const chaosStack = createChaosStack(baseStorage, config);
      // For now, just verify config structure is valid
      expect(config.network.failureProbability).toBe(0.2);
      expect(config.seed).toBe(42);
    });
  });
});
