/**
 * @evodb/test-utils - Chaos Testing Exports Tests
 * Issue: evodb-6zh - Move chaos-testing.ts to test-utils package
 *
 * Tests to verify that chaos-testing exports are available from @evodb/test-utils
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  // Chaos wrappers
  ChaosR2Bucket,
  ChaosStorage,
  DelayInjector,
  PartialWriteSimulator,
  ConcurrencyConflictSimulator,
  MemoryPressureSimulator,
  ClockSkewSimulator,
  // Seeded random for reproducibility
  SeededRandom,
  // Error classes
  ChaosNetworkError,
  PartialWriteError,
  CorruptionDetectedError,
  MemoryPressureError,
  ConflictError,
  ETagMismatchError,
  TimeoutError,
  // Factory function
  createChaosStack,
  // Types
  type ChaosConfig,
  type FailureMode,
  type AffectedOperation,
  type CorruptionMode,
  type DelayMode,
  type ConflictMode,
  type ChaosR2BucketOptions,
  type ChaosStorageOptions,
  type DelayInjectorOptions,
  type PartialWriteSimulatorOptions,
  type ConcurrencyConflictSimulatorOptions,
  type MemoryPressureSimulatorOptions,
  type ClockSkewSimulatorOptions,
} from '../index.js';

import { MemoryStorage } from '@evodb/core';
import type { R2BucketLike } from '@evodb/core';

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
// Export Verification Tests
// =============================================================================

describe('Chaos Testing Exports from @evodb/test-utils', () => {
  describe('ChaosR2Bucket', () => {
    it('should be exported and functional', async () => {
      const baseBucket = createMockR2Bucket();
      const chaosBucket = new ChaosR2Bucket(baseBucket, {
        failureProbability: 0,
        failureMode: 'network',
      });

      await baseBucket.put('test-key', new Uint8Array([1, 2, 3]));
      const result = await chaosBucket.get('test-key');
      expect(result).not.toBeNull();
    });

    it('should inject failures based on probability', async () => {
      const baseBucket = createMockR2Bucket();
      const chaosBucket = new ChaosR2Bucket(baseBucket, {
        failureProbability: 1.0,
        failureMode: 'network',
      });

      await expect(chaosBucket.get('test-key')).rejects.toThrow(ChaosNetworkError);
    });
  });

  describe('ChaosStorage', () => {
    it('should be exported and functional', async () => {
      const baseStorage = new MemoryStorage();
      const chaosStorage = new ChaosStorage(baseStorage, {
        failureProbability: 0,
        failureMode: 'network',
      });

      await chaosStorage.write('test.bin', new Uint8Array([1, 2, 3]));
      const result = await chaosStorage.read('test.bin');
      expect(result).toEqual(new Uint8Array([1, 2, 3]));
    });

    it('should inject failures based on probability', async () => {
      const baseStorage = new MemoryStorage();
      const chaosStorage = new ChaosStorage(baseStorage, {
        failureProbability: 1.0,
        failureMode: 'timeout',
      });

      await expect(chaosStorage.read('test.bin')).rejects.toThrow(ChaosNetworkError);
    });
  });

  describe('DelayInjector', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should be exported and functional', async () => {
      const baseStorage = new MemoryStorage();
      const delayInjector = new DelayInjector(baseStorage, {
        delayMs: 100,
        delayMode: 'fixed',
      });

      await baseStorage.write('test.bin', new Uint8Array([1, 2, 3]));

      const readPromise = delayInjector.read('test.bin');
      await vi.advanceTimersByTimeAsync(100);

      const result = await readPromise;
      expect(result).toEqual(new Uint8Array([1, 2, 3]));
    });

    it('should throw TimeoutError when delay exceeds timeout', async () => {
      const baseStorage = new MemoryStorage();
      const delayInjector = new DelayInjector(baseStorage, {
        delayMs: 5000,
        delayMode: 'fixed',
        timeoutMs: 1000,
      });

      await baseStorage.write('test.bin', new Uint8Array([1, 2, 3]));

      const readPromise = delayInjector.read('test.bin');
      await vi.advanceTimersByTimeAsync(1001);

      await expect(readPromise).rejects.toThrow(TimeoutError);
    });
  });

  describe('PartialWriteSimulator', () => {
    it('should be exported and functional', async () => {
      const baseStorage = new MemoryStorage();
      const partialWriter = new PartialWriteSimulator(baseStorage, {
        writeRatio: 0.5,
        failAfterPartialWrite: true,
      });

      const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

      await expect(partialWriter.write('test.bin', data)).rejects.toThrow(PartialWriteError);

      const written = await baseStorage.read('test.bin');
      expect(written).not.toBeNull();
      expect(written!.length).toBe(4);
    });
  });

  describe('ConcurrencyConflictSimulator', () => {
    it('should be exported and functional', async () => {
      const baseStorage = new MemoryStorage();
      const conflictSimulator = new ConcurrencyConflictSimulator(baseStorage, {
        conflictProbability: 1.0,
        conflictMode: 'write_write',
      });

      await baseStorage.write('shared.bin', new Uint8Array([1, 2, 3]));

      const write1 = conflictSimulator.write('shared.bin', new Uint8Array([4, 5, 6]));
      const write2 = conflictSimulator.write('shared.bin', new Uint8Array([7, 8, 9]));

      const results = await Promise.allSettled([write1, write2]);
      const rejected = results.filter(r => r.status === 'rejected');
      expect(rejected.length).toBeGreaterThanOrEqual(1);
    });

    it('should throw ETagMismatchError on optimistic locking failure', async () => {
      const baseStorage = new MemoryStorage();
      const conflictSimulator = new ConcurrencyConflictSimulator(baseStorage, {
        useOptimisticLocking: true,
      });

      const etag1 = await conflictSimulator.writeWithEtag('data.bin', new Uint8Array([1, 2, 3]));
      await conflictSimulator.writeWithEtag('data.bin', new Uint8Array([4, 5, 6]));

      await expect(
        conflictSimulator.conditionalWrite('data.bin', new Uint8Array([7, 8, 9]), etag1)
      ).rejects.toThrow(ETagMismatchError);
    });
  });

  describe('MemoryPressureSimulator', () => {
    it('should be exported and functional', async () => {
      const baseStorage = new MemoryStorage();
      const memorySimulator = new MemoryPressureSimulator(baseStorage, {
        maxMemoryBytes: 100,
        rejectOnPressure: true,
      });

      await memorySimulator.write('small.bin', new Uint8Array(50));

      await expect(
        memorySimulator.write('large.bin', new Uint8Array(60))
      ).rejects.toThrow(MemoryPressureError);
    });
  });

  describe('ClockSkewSimulator', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should be exported and functional', async () => {
      const baseStorage = new MemoryStorage();
      const clockSimulator = new ClockSkewSimulator(baseStorage, {
        skewMs: 60000,
        skewDirection: 'forward',
      });

      const beforeSkew = clockSimulator.now();
      clockSimulator.applySkeW();
      const afterSkew = clockSimulator.now();

      expect(afterSkew - beforeSkew).toBeGreaterThanOrEqual(60000);
    });
  });

  describe('SeededRandom', () => {
    it('should be exported and produce reproducible results', () => {
      const random1 = new SeededRandom(12345);
      const random2 = new SeededRandom(12345);

      const results1 = Array.from({ length: 10 }, () => random1.next());
      const results2 = Array.from({ length: 10 }, () => random2.next());

      expect(results1).toEqual(results2);
    });
  });

  describe('Error classes', () => {
    it('ChaosNetworkError should be exported', () => {
      const error = new ChaosNetworkError('network');
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('ChaosNetworkError');
      expect(error.failureMode).toBe('network');
    });

    it('PartialWriteError should be exported', () => {
      const error = new PartialWriteError(50, 100);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('PartialWriteError');
      expect(error.bytesWritten).toBe(50);
      expect(error.totalBytes).toBe(100);
    });

    it('CorruptionDetectedError should be exported', () => {
      const error = new CorruptionDetectedError('abc123', 'xyz789');
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('CorruptionDetectedError');
      expect(error.expectedHash).toBe('abc123');
      expect(error.actualHash).toBe('xyz789');
    });

    it('MemoryPressureError should be exported', () => {
      const error = new MemoryPressureError(1000, 500);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('MemoryPressureError');
      expect(error.requestedBytes).toBe(1000);
      expect(error.availableBytes).toBe(500);
    });

    it('ConflictError should be exported', () => {
      const error = new ConflictError('write_write');
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('ConflictError');
      expect(error.conflictMode).toBe('write_write');
    });

    it('ETagMismatchError should be exported', () => {
      const error = new ETagMismatchError('"etag1"', '"etag2"');
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('ETagMismatchError');
      expect(error.expectedEtag).toBe('"etag1"');
      expect(error.actualEtag).toBe('"etag2"');
    });

    it('TimeoutError should be exported', () => {
      const error = new TimeoutError(5000);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('TimeoutError');
      expect(error.timeoutMs).toBe(5000);
    });
  });

  describe('createChaosStack factory function', () => {
    it('should be exported and create a chaos stack', async () => {
      const baseStorage = new MemoryStorage();
      const config: ChaosConfig = {
        network: {
          failureProbability: 0,
          failureMode: 'network',
        },
        seed: 12345,
      };

      const chaosStack = createChaosStack(baseStorage, config);

      await chaosStack.write('test.bin', new Uint8Array([1, 2, 3]));
      const result = await chaosStack.read('test.bin');
      expect(result).toEqual(new Uint8Array([1, 2, 3]));
    });
  });

  describe('Type exports', () => {
    it('should export all necessary types', () => {
      // These are compile-time checks - if the test compiles, types are exported
      const failureMode: FailureMode = 'network';
      const affectedOp: AffectedOperation = 'read';
      const corruptionMode: CorruptionMode = 'truncate';
      const delayMode: DelayMode = 'fixed';
      const conflictMode: ConflictMode = 'write_write';

      const chaosConfig: ChaosConfig = {
        network: { failureProbability: 0.1, failureMode: 'network' },
        seed: 42,
      };

      const r2Options: ChaosR2BucketOptions = {
        failureProbability: 0.1,
        failureMode: 'network',
      };

      const storageOptions: ChaosStorageOptions = {
        failureProbability: 0.1,
        failureMode: 'network',
      };

      const delayOptions: DelayInjectorOptions = {
        delayMs: 100,
        delayMode: 'fixed',
      };

      const partialOptions: PartialWriteSimulatorOptions = {
        writeRatio: 0.5,
      };

      const concurrencyOptions: ConcurrencyConflictSimulatorOptions = {
        conflictProbability: 0.5,
      };

      const memoryOptions: MemoryPressureSimulatorOptions = {
        maxMemoryBytes: 1000,
      };

      const clockOptions: ClockSkewSimulatorOptions = {
        skewMs: 1000,
      };

      // If we get here, all types are properly exported
      expect(failureMode).toBe('network');
      expect(affectedOp).toBe('read');
      expect(corruptionMode).toBe('truncate');
      expect(delayMode).toBe('fixed');
      expect(conflictMode).toBe('write_write');
      expect(chaosConfig.seed).toBe(42);
      expect(r2Options.failureProbability).toBe(0.1);
      expect(storageOptions.failureProbability).toBe(0.1);
      expect(delayOptions.delayMs).toBe(100);
      expect(partialOptions.writeRatio).toBe(0.5);
      expect(concurrencyOptions.conflictProbability).toBe(0.5);
      expect(memoryOptions.maxMemoryBytes).toBe(1000);
      expect(clockOptions.skewMs).toBe(1000);
    });
  });
});
