/**
 * Circuit Breaker Tests for R2 Operations
 * Issue: evodb-9t6 - TDD: Add R2 circuit breakers
 *
 * Circuit breaker pattern implementation for resilient R2 storage operations.
 * Protects against cascading failures by opening the circuit after a threshold
 * of consecutive failures, then entering half-open state to probe for recovery.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Circuit tripped, requests fail fast without calling backend
 * - HALF_OPEN: Probing for recovery, limited requests allowed
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  CircuitBreaker,
  CircuitBreakerStorage,
  CircuitState,
  CircuitBreakerError,
  type CircuitBreakerOptions,
  createCircuitBreakerStorage,
} from '../circuit-breaker.ts';
import { MemoryStorage, type Storage } from '../storage.ts';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    vi.useFakeTimers();
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 5000,
      halfOpenMaxAttempts: 1,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('should start in CLOSED state', () => {
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should have zero failure count initially', () => {
      expect(breaker.getFailureCount()).toBe(0);
    });
  });

  describe('CLOSED state', () => {
    it('should allow operations to pass through', async () => {
      const result = await breaker.execute(() => Promise.resolve('success'));
      expect(result).toBe('success');
    });

    it('should track failures', async () => {
      try {
        await breaker.execute(() => Promise.reject(new Error('fail')));
      } catch {
        // expected
      }
      expect(breaker.getFailureCount()).toBe(1);
    });

    it('should reset failure count on success', async () => {
      // Cause some failures (but not enough to trip)
      try {
        await breaker.execute(() => Promise.reject(new Error('fail')));
      } catch {
        // expected
      }
      try {
        await breaker.execute(() => Promise.reject(new Error('fail')));
      } catch {
        // expected
      }
      expect(breaker.getFailureCount()).toBe(2);

      // Now succeed
      await breaker.execute(() => Promise.resolve('success'));
      expect(breaker.getFailureCount()).toBe(0);
    });

    it('should remain in CLOSED state below threshold', async () => {
      // 2 failures with threshold of 3
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(() => Promise.reject(new Error('fail')));
        } catch {
          // expected
        }
      }
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should transition to OPEN after reaching failure threshold', async () => {
      // 3 consecutive failures
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(() => Promise.reject(new Error('fail')));
        } catch {
          // expected
        }
      }
      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should propagate original error while in CLOSED state', async () => {
      const originalError = new Error('original failure');
      await expect(breaker.execute(() => Promise.reject(originalError))).rejects.toThrow(
        'original failure'
      );
    });
  });

  describe('OPEN state', () => {
    beforeEach(async () => {
      // Trip the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(() => Promise.reject(new Error('fail')));
        } catch {
          // expected
        }
      }
    });

    it('should reject operations immediately with CircuitBreakerError', async () => {
      await expect(breaker.execute(() => Promise.resolve('should not run'))).rejects.toThrow(
        CircuitBreakerError
      );
    });

    it('should not call the operation when open', async () => {
      const operation = vi.fn(() => Promise.resolve('result'));

      try {
        await breaker.execute(operation);
      } catch {
        // expected
      }

      expect(operation).not.toHaveBeenCalled();
    });

    it('should include circuit state in error message', async () => {
      try {
        await breaker.execute(() => Promise.resolve(''));
      } catch (error) {
        expect((error as CircuitBreakerError).message).toContain('open');
      }
    });

    it('should transition to HALF_OPEN after reset timeout', async () => {
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Advance time past reset timeout
      vi.advanceTimersByTime(5001);

      // Next call should attempt execution (half-open)
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
    });
  });

  describe('HALF_OPEN state', () => {
    beforeEach(async () => {
      // Trip the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(() => Promise.reject(new Error('fail')));
        } catch {
          // expected
        }
      }

      // Move to half-open state
      vi.advanceTimersByTime(5001);
    });

    it('should be in HALF_OPEN state', () => {
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
    });

    it('should allow limited probe requests', async () => {
      const operation = vi.fn(() => Promise.resolve('probe success'));
      const result = await breaker.execute(operation);

      expect(operation).toHaveBeenCalledOnce();
      expect(result).toBe('probe success');
    });

    it('should transition to CLOSED on successful probe', async () => {
      await breaker.execute(() => Promise.resolve('success'));
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should reset failure count on successful recovery', async () => {
      expect(breaker.getFailureCount()).toBe(3);
      await breaker.execute(() => Promise.resolve('success'));
      expect(breaker.getFailureCount()).toBe(0);
    });

    it('should transition back to OPEN on failed probe', async () => {
      try {
        await breaker.execute(() => Promise.reject(new Error('probe fail')));
      } catch {
        // expected
      }
      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should reset the open timestamp on failed probe', async () => {
      // First time in HALF_OPEN
      try {
        await breaker.execute(() => Promise.reject(new Error('probe fail')));
      } catch {
        // expected
      }

      // Should be OPEN again
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Need to wait full timeout again
      vi.advanceTimersByTime(4000);
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      vi.advanceTimersByTime(1001);
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
    });
  });

  describe('configuration options', () => {
    it('should use custom failure threshold', async () => {
      const customBreaker = new CircuitBreaker({
        failureThreshold: 5,
        resetTimeoutMs: 1000,
      });

      // 4 failures should not trip
      for (let i = 0; i < 4; i++) {
        try {
          await customBreaker.execute(() => Promise.reject(new Error('fail')));
        } catch {
          // expected
        }
      }
      expect(customBreaker.getState()).toBe(CircuitState.CLOSED);

      // 5th failure trips it
      try {
        await customBreaker.execute(() => Promise.reject(new Error('fail')));
      } catch {
        // expected
      }
      expect(customBreaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should use custom reset timeout', async () => {
      const customBreaker = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 10000,
      });

      // Trip the circuit
      try {
        await customBreaker.execute(() => Promise.reject(new Error('fail')));
      } catch {
        // expected
      }
      expect(customBreaker.getState()).toBe(CircuitState.OPEN);

      // 5 seconds should not be enough
      vi.advanceTimersByTime(5000);
      expect(customBreaker.getState()).toBe(CircuitState.OPEN);

      // 10+ seconds should trigger half-open
      vi.advanceTimersByTime(5001);
      expect(customBreaker.getState()).toBe(CircuitState.HALF_OPEN);
    });

    it('should use default options when not specified', () => {
      const defaultBreaker = new CircuitBreaker();
      // Default threshold is 5
      expect(defaultBreaker.getFailureCount()).toBe(0);
    });
  });

  describe('manual controls', () => {
    it('should allow manual reset', async () => {
      // Trip the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(() => Promise.reject(new Error('fail')));
        } catch {
          // expected
        }
      }
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Manual reset
      breaker.reset();

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      expect(breaker.getFailureCount()).toBe(0);
    });

    it('should allow manual trip', () => {
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      breaker.trip();
      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('error handling', () => {
    it('should not count non-Error rejections as failures by default', async () => {
      // String rejection
      try {
        await breaker.execute(() => Promise.reject('string error'));
      } catch {
        // expected
      }
      expect(breaker.getFailureCount()).toBe(1);
    });

    it('should support custom failure predicate', async () => {
      const selectiveBreaker = new CircuitBreaker({
        failureThreshold: 2,
        resetTimeoutMs: 5000,
        isFailure: (error) => {
          // Only count network errors as failures
          return error instanceof Error && error.message.includes('network');
        },
      });

      // Business logic error - should not count
      try {
        await selectiveBreaker.execute(() =>
          Promise.reject(new Error('validation failed'))
        );
      } catch {
        // expected
      }
      expect(selectiveBreaker.getFailureCount()).toBe(0);

      // Network error - should count
      try {
        await selectiveBreaker.execute(() =>
          Promise.reject(new Error('network timeout'))
        );
      } catch {
        // expected
      }
      expect(selectiveBreaker.getFailureCount()).toBe(1);
    });
  });

  describe('statistics', () => {
    it('should track total success count', async () => {
      await breaker.execute(() => Promise.resolve('a'));
      await breaker.execute(() => Promise.resolve('b'));

      expect(breaker.getStats().successCount).toBe(2);
    });

    it('should track total failure count', async () => {
      try {
        await breaker.execute(() => Promise.reject(new Error('fail')));
      } catch {
        // expected
      }
      try {
        await breaker.execute(() => Promise.reject(new Error('fail')));
      } catch {
        // expected
      }

      expect(breaker.getStats().totalFailureCount).toBe(2);
    });

    it('should track rejected count when open', async () => {
      // Trip circuit
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(() => Promise.reject(new Error('fail')));
        } catch {
          // expected
        }
      }

      // These should be rejected immediately
      for (let i = 0; i < 5; i++) {
        try {
          await breaker.execute(() => Promise.resolve('ignored'));
        } catch {
          // expected
        }
      }

      expect(breaker.getStats().rejectedCount).toBe(5);
    });
  });
});

describe('CircuitBreakerStorage', () => {
  let baseStorage: MemoryStorage;
  let storage: CircuitBreakerStorage;

  beforeEach(() => {
    vi.useFakeTimers();
    baseStorage = new MemoryStorage();
    storage = new CircuitBreakerStorage(baseStorage, {
      failureThreshold: 2,
      resetTimeoutMs: 3000,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('normal operations (circuit closed)', () => {
    it('should pass through read operations', async () => {
      await baseStorage.write('test.bin', new Uint8Array([1, 2, 3]));

      const result = await storage.read('test.bin');
      expect(result).toEqual(new Uint8Array([1, 2, 3]));
    });

    it('should pass through write operations', async () => {
      await storage.write('test.bin', new Uint8Array([4, 5, 6]));

      const result = await baseStorage.read('test.bin');
      expect(result).toEqual(new Uint8Array([4, 5, 6]));
    });

    it('should pass through list operations', async () => {
      await baseStorage.write('data/a.bin', new Uint8Array([1]));
      await baseStorage.write('data/b.bin', new Uint8Array([2]));

      const result = await storage.list('data/');
      expect(result.paths).toEqual(['data/a.bin', 'data/b.bin']);
    });

    it('should pass through delete operations', async () => {
      await baseStorage.write('to-delete.bin', new Uint8Array([1]));

      await storage.delete('to-delete.bin');

      expect(await baseStorage.exists('to-delete.bin')).toBe(false);
    });

    it('should pass through exists operations', async () => {
      await baseStorage.write('exists.bin', new Uint8Array([1]));

      expect(await storage.exists('exists.bin')).toBe(true);
      expect(await storage.exists('nonexistent.bin')).toBe(false);
    });

    it('should pass through head operations', async () => {
      await baseStorage.write('file.bin', new Uint8Array([1, 2, 3, 4, 5]));

      const meta = await storage.head('file.bin');
      expect(meta?.size).toBe(5);
    });

    it('should pass through readRange operations', async () => {
      await baseStorage.write('range.bin', new Uint8Array([0, 1, 2, 3, 4, 5]));

      const range = await storage.readRange('range.bin', 2, 3);
      expect(range).toEqual(new Uint8Array([2, 3, 4]));
    });
  });

  describe('failure tracking', () => {
    it('should track failures on read errors', async () => {
      // Create a failing storage
      const failingStorage: Storage = {
        async read() {
          throw new Error('R2 unavailable');
        },
        async write() {},
        async list() {
          return { paths: [] };
        },
        async delete() {},
      };
      const cbStorage = new CircuitBreakerStorage(failingStorage, {
        failureThreshold: 2,
        resetTimeoutMs: 3000,
      });

      try {
        await cbStorage.read('test.bin');
      } catch {
        // expected
      }

      expect(cbStorage.getCircuitState()).toBe(CircuitState.CLOSED);
      expect(cbStorage.getFailureCount()).toBe(1);
    });

    it('should trip circuit after threshold failures', async () => {
      const failingStorage: Storage = {
        async read() {
          throw new Error('R2 unavailable');
        },
        async write() {
          throw new Error('R2 unavailable');
        },
        async list() {
          return { paths: [] };
        },
        async delete() {},
      };
      const cbStorage = new CircuitBreakerStorage(failingStorage, {
        failureThreshold: 2,
        resetTimeoutMs: 3000,
      });

      // First failure
      try {
        await cbStorage.read('test.bin');
      } catch {
        // expected
      }

      // Second failure trips circuit
      try {
        await cbStorage.write('test.bin', new Uint8Array([1]));
      } catch {
        // expected
      }

      expect(cbStorage.getCircuitState()).toBe(CircuitState.OPEN);
    });
  });

  describe('circuit open behavior', () => {
    let cbStorage: CircuitBreakerStorage;
    let operationCalled: boolean;

    beforeEach(async () => {
      operationCalled = false;
      const failingStorage: Storage = {
        async read() {
          operationCalled = true;
          throw new Error('R2 unavailable');
        },
        async write() {
          operationCalled = true;
          throw new Error('R2 unavailable');
        },
        async list() {
          operationCalled = true;
          return { paths: [] };
        },
        async delete() {
          operationCalled = true;
        },
      };
      cbStorage = new CircuitBreakerStorage(failingStorage, {
        failureThreshold: 2,
        resetTimeoutMs: 3000,
      });

      // Trip the circuit
      try {
        await cbStorage.read('test.bin');
      } catch {
        // expected
      }
      try {
        await cbStorage.read('test.bin');
      } catch {
        // expected
      }

      expect(cbStorage.getCircuitState()).toBe(CircuitState.OPEN);
      operationCalled = false;
    });

    it('should fail fast on read without calling backend', async () => {
      await expect(cbStorage.read('test.bin')).rejects.toThrow(CircuitBreakerError);
      expect(operationCalled).toBe(false);
    });

    it('should fail fast on write without calling backend', async () => {
      await expect(cbStorage.write('test.bin', new Uint8Array([1]))).rejects.toThrow(
        CircuitBreakerError
      );
      expect(operationCalled).toBe(false);
    });

    it('should fail fast on list without calling backend', async () => {
      await expect(cbStorage.list('prefix/')).rejects.toThrow(CircuitBreakerError);
      expect(operationCalled).toBe(false);
    });

    it('should fail fast on delete without calling backend', async () => {
      await expect(cbStorage.delete('test.bin')).rejects.toThrow(CircuitBreakerError);
      expect(operationCalled).toBe(false);
    });
  });

  describe('recovery (half-open state)', () => {
    it('should recover after successful probe', async () => {
      let shouldFail = true;
      const conditionalStorage: Storage = {
        async read() {
          if (shouldFail) throw new Error('R2 unavailable');
          return new Uint8Array([1, 2, 3]);
        },
        async write() {},
        async list() {
          return { paths: [] };
        },
        async delete() {},
      };
      const cbStorage = new CircuitBreakerStorage(conditionalStorage, {
        failureThreshold: 2,
        resetTimeoutMs: 3000,
      });

      // Trip the circuit
      try {
        await cbStorage.read('test.bin');
      } catch {
        // expected
      }
      try {
        await cbStorage.read('test.bin');
      } catch {
        // expected
      }
      expect(cbStorage.getCircuitState()).toBe(CircuitState.OPEN);

      // Advance time to half-open
      vi.advanceTimersByTime(3001);
      expect(cbStorage.getCircuitState()).toBe(CircuitState.HALF_OPEN);

      // Fix the backend
      shouldFail = false;

      // Successful probe should close circuit
      const result = await cbStorage.read('test.bin');
      expect(result).toEqual(new Uint8Array([1, 2, 3]));
      expect(cbStorage.getCircuitState()).toBe(CircuitState.CLOSED);
    });

    it('should return to OPEN on failed probe', async () => {
      const failingStorage: Storage = {
        async read() {
          throw new Error('still failing');
        },
        async write() {},
        async list() {
          return { paths: [] };
        },
        async delete() {},
      };
      const cbStorage = new CircuitBreakerStorage(failingStorage, {
        failureThreshold: 1,
        resetTimeoutMs: 3000,
      });

      // Trip the circuit
      try {
        await cbStorage.read('test.bin');
      } catch {
        // expected
      }
      expect(cbStorage.getCircuitState()).toBe(CircuitState.OPEN);

      // Advance time to half-open
      vi.advanceTimersByTime(3001);
      expect(cbStorage.getCircuitState()).toBe(CircuitState.HALF_OPEN);

      // Failed probe
      try {
        await cbStorage.read('test.bin');
      } catch {
        // expected
      }

      expect(cbStorage.getCircuitState()).toBe(CircuitState.OPEN);
    });
  });

  describe('factory function', () => {
    it('should create CircuitBreakerStorage with createCircuitBreakerStorage', async () => {
      const storage = createCircuitBreakerStorage(baseStorage, {
        failureThreshold: 3,
        resetTimeoutMs: 5000,
      });

      expect(storage).toBeInstanceOf(CircuitBreakerStorage);

      // Should work normally
      await storage.write('test.bin', new Uint8Array([1]));
      const result = await storage.read('test.bin');
      expect(result).toEqual(new Uint8Array([1]));
    });

    it('should use default options when not specified', () => {
      const storage = createCircuitBreakerStorage(baseStorage);
      expect(storage).toBeInstanceOf(CircuitBreakerStorage);
    });
  });

  describe('integration with Storage interface', () => {
    it('should implement Storage interface correctly', () => {
      // Type check - CircuitBreakerStorage should be assignable to Storage
      const storageInterface: Storage = storage;

      expect(typeof storageInterface.read).toBe('function');
      expect(typeof storageInterface.write).toBe('function');
      expect(typeof storageInterface.list).toBe('function');
      expect(typeof storageInterface.delete).toBe('function');
      expect(typeof storageInterface.exists).toBe('function');
      expect(typeof storageInterface.head).toBe('function');
      expect(typeof storageInterface.readRange).toBe('function');
    });

    it('should be usable as a drop-in replacement', async () => {
      // Function that expects Storage interface
      async function writeAndRead(s: Storage, path: string, data: Uint8Array) {
        await s.write(path, data);
        return s.read(path);
      }

      // Should work with CircuitBreakerStorage
      const result = await writeAndRead(storage, 'test.bin', new Uint8Array([1, 2, 3]));
      expect(result).toEqual(new Uint8Array([1, 2, 3]));
    });
  });
});
