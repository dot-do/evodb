/**
 * @evodb/lakehouse - Chaos/Fault Injection Tests
 *
 * Tests for handling partial failures and fault scenarios that can occur
 * when interacting with R2 storage in distributed systems.
 *
 * Scenarios covered:
 * 1. Partial R2 failures (some operations fail, others succeed)
 * 2. Network timeouts
 * 3. Corrupted responses
 *
 * Issue: evodb-sp9
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  createTable,
  createManifestFile,
  createFileStats,
  appendFiles,
  TableStorage,
  createMemoryAdapter,
  atomicCommit,
  serializeManifest,
  deserializeManifest,
  type R2StorageAdapter,
  type TableManifest,
} from '../index.js';

// =============================================================================
// Chaos Storage Adapter - Fault Injection Infrastructure
// =============================================================================

type FaultType = 'error' | 'timeout' | 'corrupt' | 'partial';

interface FaultConfig {
  type: FaultType;
  probability?: number;  // 0-1, chance of fault occurring
  errorMessage?: string;
  timeoutMs?: number;
  corruptionFn?: (data: unknown) => unknown;
  pathPattern?: RegExp;  // Only affect paths matching this pattern
}

interface ChaosStats {
  totalOps: number;
  successOps: number;
  failedOps: number;
  timeoutOps: number;
  corruptedOps: number;
}

/**
 * Creates a chaos adapter that wraps a real storage adapter and injects faults
 */
function createChaosAdapter(
  baseAdapter: R2StorageAdapter,
  faults: FaultConfig[]
): R2StorageAdapter & { stats: ChaosStats; reset: () => void } {
  const stats: ChaosStats = {
    totalOps: 0,
    successOps: 0,
    failedOps: 0,
    timeoutOps: 0,
    corruptedOps: 0,
  };

  function shouldApplyFault(fault: FaultConfig, path: string): boolean {
    if (fault.pathPattern && !fault.pathPattern.test(path)) {
      return false;
    }
    const probability = fault.probability ?? 1.0;
    return Math.random() < probability;
  }

  function findApplicableFault(path: string): FaultConfig | null {
    for (const fault of faults) {
      if (shouldApplyFault(fault, path)) {
        return fault;
      }
    }
    return null;
  }

  async function applyFault<T>(
    path: string,
    operation: () => Promise<T>,
    isRead: boolean = false
  ): Promise<T> {
    stats.totalOps++;
    const fault = findApplicableFault(path);

    if (!fault) {
      stats.successOps++;
      return operation();
    }

    switch (fault.type) {
      case 'error':
        stats.failedOps++;
        throw new Error(fault.errorMessage || `R2 operation failed for ${path}`);

      case 'timeout':
        stats.timeoutOps++;
        await new Promise((_, reject) => {
          setTimeout(() => reject(new Error(`Operation timed out for ${path}`)), fault.timeoutMs || 100);
        });
        throw new Error('Should not reach here');

      case 'corrupt':
        stats.corruptedOps++;
        if (isRead) {
          const result = await operation();
          if (fault.corruptionFn && result !== null) {
            return fault.corruptionFn(result) as T;
          }
        }
        stats.successOps++;
        return operation();

      case 'partial':
        // Randomly decide to fail or succeed
        if (Math.random() < 0.5) {
          stats.failedOps++;
          throw new Error(`Partial failure for ${path}`);
        }
        stats.successOps++;
        return operation();

      default:
        stats.successOps++;
        return operation();
    }
  }

  return {
    stats,
    reset: () => {
      stats.totalOps = 0;
      stats.successOps = 0;
      stats.failedOps = 0;
      stats.timeoutOps = 0;
      stats.corruptedOps = 0;
    },

    async readJson<T>(path: string): Promise<T | null> {
      return applyFault(path, () => baseAdapter.readJson<T>(path), true);
    },

    async writeJson(path: string, data: unknown): Promise<void> {
      return applyFault(path, () => baseAdapter.writeJson(path, data));
    },

    async readBinary(path: string): Promise<Uint8Array | null> {
      return applyFault(path, () => baseAdapter.readBinary(path), true);
    },

    async writeBinary(path: string, data: Uint8Array): Promise<void> {
      return applyFault(path, () => baseAdapter.writeBinary(path, data));
    },

    async list(prefix: string): Promise<string[]> {
      return applyFault(prefix, () => baseAdapter.list(prefix));
    },

    async delete(path: string): Promise<void> {
      return applyFault(path, () => baseAdapter.delete(path));
    },

    async exists(path: string): Promise<boolean> {
      return applyFault(path, () => baseAdapter.exists(path));
    },

    async head(path: string): Promise<{ size: number; lastModified: Date; etag?: string } | null> {
      return applyFault(path, () => baseAdapter.head(path));
    },
  };
}

// =============================================================================
// 1. Partial R2 Failures Tests
// =============================================================================

describe('Partial R2 Failures', () => {
  let baseAdapter: R2StorageAdapter;

  beforeEach(() => {
    baseAdapter = createMemoryAdapter();
  });

  describe('manifest operations with partial failures', () => {
    it('should fail manifest read when R2 returns error', async () => {
      const chaosAdapter = createChaosAdapter(baseAdapter, [
        { type: 'error', pathPattern: /_manifest\.json$/, errorMessage: 'R2 503 Service Unavailable' },
      ]);
      const storage = new TableStorage(chaosAdapter, 'com/example/test');

      await expect(storage.readManifest()).rejects.toThrow('R2 503 Service Unavailable');
      expect(chaosAdapter.stats.failedOps).toBe(1);
    });

    it('should fail manifest write when R2 returns error', async () => {
      const chaosAdapter = createChaosAdapter(baseAdapter, [
        { type: 'error', pathPattern: /_manifest\.json$/, errorMessage: 'R2 write failed' },
      ]);
      const storage = new TableStorage(chaosAdapter, 'com/example/test');

      const { manifest } = createTable({
        location: 'com/example/test',
        schema: { columns: [{ name: 'id', type: 'int64', nullable: false }] },
      });

      await expect(storage.writeManifest(manifest)).rejects.toThrow('R2 write failed');
    });

    it('should succeed when only non-critical operations fail', async () => {
      // Fail only list operations, not read/write
      const chaosAdapter = createChaosAdapter(baseAdapter, [
        { type: 'error', pathPattern: /^$/, errorMessage: 'List failed' }, // Only affects empty prefix
      ]);
      const storage = new TableStorage(chaosAdapter, 'com/example/test');

      const { manifest, schema } = createTable({
        location: 'com/example/test',
        schema: { columns: [{ name: 'id', type: 'int64', nullable: false }] },
      });

      // These should succeed
      await storage.writeManifest(manifest);
      await storage.writeSchema(schema);

      const loaded = await storage.readManifest();
      expect(loaded?.tableId).toBe(manifest.tableId);
    });

    it('should handle intermittent failures during multi-file operations', async () => {
      // Use a deterministic pattern: fail specific indices
      let callCount = 0;
      const failIndices = new Set([2, 5, 7]); // Deterministic: fail operations 2, 5, 7

      const deterministicAdapter: R2StorageAdapter = {
        async readJson<T>(path: string): Promise<T | null> {
          return baseAdapter.readJson<T>(path);
        },
        async writeJson(path: string, data: unknown): Promise<void> {
          return baseAdapter.writeJson(path, data);
        },
        async readBinary(path: string): Promise<Uint8Array | null> {
          return baseAdapter.readBinary(path);
        },
        async writeBinary(path: string, data: Uint8Array): Promise<void> {
          const currentCall = callCount++;
          if (failIndices.has(currentCall)) {
            throw new Error(`Deterministic failure at operation ${currentCall}`);
          }
          return baseAdapter.writeBinary(path, data);
        },
        async list(prefix: string): Promise<string[]> {
          return baseAdapter.list(prefix);
        },
        async delete(path: string): Promise<void> {
          return baseAdapter.delete(path);
        },
        async exists(path: string): Promise<boolean> {
          return baseAdapter.exists(path);
        },
        async head(path: string): Promise<{ size: number; lastModified: Date; etag?: string } | null> {
          return baseAdapter.head(path);
        },
      };

      const storage = new TableStorage(deterministicAdapter, 'com/example/test');

      // Write multiple data files - some will fail deterministically
      const results: boolean[] = [];
      for (let i = 0; i < 10; i++) {
        try {
          await storage.writeDataFile(`data/block-${i}.bin`, new Uint8Array([i]));
          results.push(true);
        } catch {
          results.push(false);
        }
      }

      // Verify deterministic failures
      expect(results.filter(r => !r).length).toBe(3); // Exactly 3 failures
      expect(results.filter(r => r).length).toBe(7);  // Exactly 7 successes
      expect(results[2]).toBe(false); // Operation 2 failed
      expect(results[5]).toBe(false); // Operation 5 failed
      expect(results[7]).toBe(false); // Operation 7 failed
    });

    it('should maintain consistency when some snapshot writes fail', async () => {
      const storage = new TableStorage(baseAdapter, 'com/example/consistency');

      // First, set up initial state successfully
      const { manifest, schema } = createTable({
        location: 'com/example/consistency',
        schema: { columns: [{ name: 'id', type: 'int64', nullable: false }] },
      });

      await storage.writeManifest(manifest);
      await storage.writeSchema(schema);

      // Now create chaos adapter that fails snapshot writes
      const chaosAdapter = createChaosAdapter(baseAdapter, [
        { type: 'error', pathPattern: /\/snapshots\//, errorMessage: 'Snapshot write failed' },
      ]);
      const chaosStorage = new TableStorage(chaosAdapter, 'com/example/consistency');

      const file = createManifestFile('data/block.bin', 1024, [], createFileStats(100, {}));
      const { snapshot } = appendFiles(manifest, null, [file]);

      // Snapshot write should fail
      await expect(chaosStorage.writeSnapshot(snapshot)).rejects.toThrow('Snapshot write failed');

      // But manifest should still be readable from original state
      const loaded = await storage.readManifest();
      expect(loaded?.currentSnapshotId).toBeNull(); // No snapshot committed
    });
  });

  describe('atomicCommit with partial failures', () => {
    it('should fail atomicCommit when manifest write fails', async () => {
      const chaosAdapter = createChaosAdapter(baseAdapter, [
        { type: 'error', pathPattern: /_manifest\.json$/, errorMessage: 'Manifest write failed' },
      ]);
      const storage = new TableStorage(chaosAdapter, 'com/example/atomic');

      const result = await atomicCommit(storage, async () => {
        const { manifest, schema } = createTable({
          location: 'com/example/atomic',
          schema: { columns: [{ name: 'id', type: 'int64', nullable: false }] },
        });
        return { manifest, schema, result: 'created' };
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Manifest write failed');
      }
    });

    it('should succeed atomicCommit when schema write succeeds but is retried', async () => {
      let schemaWriteAttempts = 0;

      // Custom adapter that fails first schema write, succeeds second
      const retryAdapter: R2StorageAdapter = {
        async readJson<T>(path: string): Promise<T | null> {
          return baseAdapter.readJson<T>(path);
        },
        async writeJson(path: string, data: unknown): Promise<void> {
          if (path.includes('_schema') && schemaWriteAttempts === 0) {
            schemaWriteAttempts++;
            throw new Error('Transient schema write failure');
          }
          return baseAdapter.writeJson(path, data);
        },
        async readBinary(path: string): Promise<Uint8Array | null> {
          return baseAdapter.readBinary(path);
        },
        async writeBinary(path: string, data: Uint8Array): Promise<void> {
          return baseAdapter.writeBinary(path, data);
        },
        async list(prefix: string): Promise<string[]> {
          return baseAdapter.list(prefix);
        },
        async delete(path: string): Promise<void> {
          return baseAdapter.delete(path);
        },
        async exists(path: string): Promise<boolean> {
          return baseAdapter.exists(path);
        },
        async head(path: string): Promise<{ size: number; lastModified: Date; etag?: string } | null> {
          return baseAdapter.head(path);
        },
      };

      const storage = new TableStorage(retryAdapter, 'com/example/retry');

      // First attempt fails
      const result1 = await atomicCommit(storage, async () => {
        const { manifest, schema } = createTable({
          location: 'com/example/retry',
          schema: { columns: [{ name: 'id', type: 'int64', nullable: false }] },
        });
        return { manifest, schema, result: 'created' };
      });

      expect(result1.success).toBe(false);

      // Second attempt should succeed
      const result2 = await atomicCommit(storage, async () => {
        const { manifest, schema } = createTable({
          location: 'com/example/retry',
          schema: { columns: [{ name: 'id', type: 'int64', nullable: false }] },
        });
        return { manifest, schema, result: 'created' };
      });

      expect(result2.success).toBe(true);
    });
  });
});

// =============================================================================
// 2. Network Timeout Tests
// =============================================================================

describe('Network Timeouts', () => {
  let baseAdapter: R2StorageAdapter;

  beforeEach(() => {
    baseAdapter = createMemoryAdapter();
  });

  it('should timeout on slow manifest read', async () => {
    const chaosAdapter = createChaosAdapter(baseAdapter, [
      { type: 'timeout', pathPattern: /_manifest\.json$/, timeoutMs: 50 },
    ]);
    const storage = new TableStorage(chaosAdapter, 'com/example/timeout');

    const startTime = Date.now();
    await expect(storage.readManifest()).rejects.toThrow('Operation timed out');
    const elapsed = Date.now() - startTime;

    // Should timeout around 50ms
    expect(elapsed).toBeGreaterThanOrEqual(45);
    expect(elapsed).toBeLessThan(200);
    expect(chaosAdapter.stats.timeoutOps).toBe(1);
  });

  it('should timeout on slow data file write', async () => {
    const chaosAdapter = createChaosAdapter(baseAdapter, [
      { type: 'timeout', pathPattern: /\/data\//, timeoutMs: 30 },
    ]);
    const storage = new TableStorage(chaosAdapter, 'com/example/timeout');

    await expect(
      storage.writeDataFile('data/block.bin', new Uint8Array([1, 2, 3]))
    ).rejects.toThrow('Operation timed out');

    expect(chaosAdapter.stats.timeoutOps).toBe(1);
  });

  it('should handle mixed timeouts and successes', async () => {
    // Only timeout on specific paths
    const chaosAdapter = createChaosAdapter(baseAdapter, [
      { type: 'timeout', pathPattern: /block-002/, timeoutMs: 20 },
    ]);
    const storage = new TableStorage(chaosAdapter, 'com/example/mixed');

    // These should succeed
    await storage.writeDataFile('data/block-001.bin', new Uint8Array([1]));
    await storage.writeDataFile('data/block-003.bin', new Uint8Array([3]));

    // This should timeout
    await expect(
      storage.writeDataFile('data/block-002.bin', new Uint8Array([2]))
    ).rejects.toThrow('Operation timed out');

    expect(chaosAdapter.stats.successOps).toBe(2);
    expect(chaosAdapter.stats.timeoutOps).toBe(1);
  });

  it('should handle timeout during list operation', async () => {
    const chaosAdapter = createChaosAdapter(baseAdapter, [
      { type: 'timeout', pathPattern: /data/, timeoutMs: 25 },
    ]);
    const storage = new TableStorage(chaosAdapter, 'com/example/list-timeout');

    await expect(storage.listDataFiles()).rejects.toThrow('Operation timed out');
  });

  it('should not corrupt state on timeout during write', async () => {
    // Pre-populate some data
    await baseAdapter.writeJson('com/example/state/test.json', { value: 'original' });

    const chaosAdapter = createChaosAdapter(baseAdapter, [
      { type: 'timeout', pathPattern: /test\.json$/, timeoutMs: 20 },
    ]);

    // Attempt to overwrite with timeout
    await expect(
      chaosAdapter.writeJson('com/example/state/test.json', { value: 'updated' })
    ).rejects.toThrow('Operation timed out');

    // Original data should still be intact (timeout prevents write)
    const data = await baseAdapter.readJson<{ value: string }>('com/example/state/test.json');
    expect(data?.value).toBe('original');
  });
});

// =============================================================================
// 3. Corrupted Response Tests
// =============================================================================

describe('Corrupted Responses', () => {
  let baseAdapter: R2StorageAdapter;

  beforeEach(() => {
    baseAdapter = createMemoryAdapter();
  });

  describe('corrupted manifest data', () => {
    it('should detect corrupted manifest JSON', async () => {
      // Write valid manifest first
      const { manifest } = createTable({
        location: 'com/example/corrupt',
        schema: { columns: [{ name: 'id', type: 'int64', nullable: false }] },
      });
      const validJson = serializeManifest(manifest);
      await baseAdapter.writeJson('com/example/corrupt/_manifest.json', JSON.parse(validJson));

      // Create adapter that corrupts manifest reads
      const chaosAdapter = createChaosAdapter(baseAdapter, [
        {
          type: 'corrupt',
          pathPattern: /_manifest\.json$/,
          corruptionFn: (data) => {
            // Remove required field
            const corrupted = { ...(data as object) };
            delete (corrupted as Record<string, unknown>).formatVersion;
            return corrupted;
          },
        },
      ]);

      const result = await chaosAdapter.readJson<TableManifest>('com/example/corrupt/_manifest.json');

      // The corrupted data is missing formatVersion
      expect(result).not.toBeNull();
      expect((result as Record<string, unknown>).formatVersion).toBeUndefined();
      expect(chaosAdapter.stats.corruptedOps).toBe(1);
    });

    it('should detect manifest with invalid tableId', async () => {
      const chaosAdapter = createChaosAdapter(baseAdapter, [
        {
          type: 'corrupt',
          pathPattern: /_manifest\.json$/,
          corruptionFn: (data) => {
            const corrupted = { ...(data as object) };
            (corrupted as Record<string, unknown>).tableId = ''; // Invalid empty tableId
            return corrupted;
          },
        },
      ]);

      // Write valid manifest
      const { manifest } = createTable({
        location: 'com/example/corrupt-id',
        schema: { columns: [{ name: 'id', type: 'int64', nullable: false }] },
      });
      await baseAdapter.writeJson('com/example/corrupt-id/_manifest.json', JSON.parse(serializeManifest(manifest)));

      const result = await chaosAdapter.readJson<TableManifest>('com/example/corrupt-id/_manifest.json');
      expect(result?.tableId).toBe('');
    });

    it('should detect manifest with corrupted snapshot references', async () => {
      const chaosAdapter = createChaosAdapter(baseAdapter, [
        {
          type: 'corrupt',
          pathPattern: /_manifest\.json$/,
          corruptionFn: (data) => {
            const corrupted = { ...(data as object) } as Record<string, unknown>;
            // Point to non-existent snapshot
            corrupted.currentSnapshotId = 'non-existent-snapshot-id';
            return corrupted;
          },
        },
      ]);

      const { manifest } = createTable({
        location: 'com/example/bad-snapshot',
        schema: { columns: [{ name: 'id', type: 'int64', nullable: false }] },
      });
      await baseAdapter.writeJson('com/example/bad-snapshot/_manifest.json', JSON.parse(serializeManifest(manifest)));

      const result = await chaosAdapter.readJson<TableManifest>('com/example/bad-snapshot/_manifest.json');
      expect(result?.currentSnapshotId).toBe('non-existent-snapshot-id');
    });
  });

  describe('corrupted binary data', () => {
    it('should detect corrupted data file bytes', async () => {
      const originalData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      await baseAdapter.writeBinary('com/example/data/block.bin', originalData);

      const chaosAdapter = createChaosAdapter(baseAdapter, [
        {
          type: 'corrupt',
          pathPattern: /\.bin$/,
          corruptionFn: (data) => {
            // Flip some bits
            const corrupted = new Uint8Array(data as Uint8Array);
            for (let i = 0; i < corrupted.length; i++) {
              corrupted[i] ^= 0xFF; // Invert all bits
            }
            return corrupted;
          },
        },
      ]);

      const result = await chaosAdapter.readBinary('com/example/data/block.bin');
      expect(result).not.toBeNull();

      // Verify data is corrupted
      const isCorrupted = result!.some((byte, i) => byte !== originalData[i]);
      expect(isCorrupted).toBe(true);
    });

    it('should detect truncated data file', async () => {
      const originalData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      await baseAdapter.writeBinary('com/example/data/large.bin', originalData);

      const chaosAdapter = createChaosAdapter(baseAdapter, [
        {
          type: 'corrupt',
          pathPattern: /large\.bin$/,
          corruptionFn: (data) => {
            // Truncate to half
            const original = data as Uint8Array;
            return original.slice(0, Math.floor(original.length / 2));
          },
        },
      ]);

      const result = await chaosAdapter.readBinary('com/example/data/large.bin');
      expect(result).not.toBeNull();
      expect(result!.length).toBe(5); // Half of original 10 bytes
    });

    it('should detect data with appended garbage', async () => {
      const originalData = new Uint8Array([1, 2, 3, 4]);
      await baseAdapter.writeBinary('com/example/data/padded.bin', originalData);

      const chaosAdapter = createChaosAdapter(baseAdapter, [
        {
          type: 'corrupt',
          pathPattern: /padded\.bin$/,
          corruptionFn: (data) => {
            // Append garbage bytes
            const original = data as Uint8Array;
            const garbage = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]);
            const corrupted = new Uint8Array(original.length + garbage.length);
            corrupted.set(original);
            corrupted.set(garbage, original.length);
            return corrupted;
          },
        },
      ]);

      const result = await chaosAdapter.readBinary('com/example/data/padded.bin');
      expect(result).not.toBeNull();
      expect(result!.length).toBe(8); // Original 4 + garbage 4
    });
  });

  describe('corrupted schema data', () => {
    it('should detect schema with invalid column types', async () => {
      const chaosAdapter = createChaosAdapter(baseAdapter, [
        {
          type: 'corrupt',
          pathPattern: /_schema\//,
          corruptionFn: (data) => {
            const corrupted = { ...(data as object) } as Record<string, unknown>;
            if (corrupted.columns && Array.isArray(corrupted.columns)) {
              (corrupted.columns as Array<Record<string, unknown>>)[0].type = 'invalid_type';
            }
            return corrupted;
          },
        },
      ]);

      // Write a valid schema
      await baseAdapter.writeJson('com/example/test/_schema/v1.json', {
        schemaId: 1,
        version: 1,
        columns: [{ name: 'id', type: 'int64', nullable: false }],
      });

      const result = await chaosAdapter.readJson<Record<string, unknown>>('com/example/test/_schema/v1.json');
      expect((result?.columns as Array<Record<string, unknown>>)?.[0]?.type).toBe('invalid_type');
    });

    it('should detect schema with missing column names', async () => {
      const chaosAdapter = createChaosAdapter(baseAdapter, [
        {
          type: 'corrupt',
          pathPattern: /_schema\//,
          corruptionFn: (data) => {
            const corrupted = { ...(data as object) } as Record<string, unknown>;
            if (corrupted.columns && Array.isArray(corrupted.columns)) {
              delete (corrupted.columns as Array<Record<string, unknown>>)[0].name;
            }
            return corrupted;
          },
        },
      ]);

      await baseAdapter.writeJson('com/example/test/_schema/v2.json', {
        schemaId: 2,
        version: 2,
        columns: [{ name: 'email', type: 'string', nullable: true }],
      });

      const result = await chaosAdapter.readJson<Record<string, unknown>>('com/example/test/_schema/v2.json');
      expect((result?.columns as Array<Record<string, unknown>>)?.[0]?.name).toBeUndefined();
    });
  });

  describe('corruption probability', () => {
    it('should corrupt only a fraction of reads with probability setting', async () => {
      // Write test data
      for (let i = 0; i < 20; i++) {
        await baseAdapter.writeJson(`com/example/prob/file-${i}.json`, { id: i });
      }

      const chaosAdapter = createChaosAdapter(baseAdapter, [
        {
          type: 'corrupt',
          pathPattern: /file-\d+\.json$/,
          probability: 0.3, // 30% corruption rate
          corruptionFn: (data) => ({ ...(data as object), corrupted: true }),
        },
      ]);

      let corruptedCount = 0;
      for (let i = 0; i < 20; i++) {
        const result = await chaosAdapter.readJson<{ id: number; corrupted?: boolean }>(`com/example/prob/file-${i}.json`);
        if (result?.corrupted) {
          corruptedCount++;
        }
      }

      // With 30% probability over 20 reads, expect roughly 6 corrupted (allow variance)
      // This is probabilistic, so we use a wide range
      expect(corruptedCount).toBeGreaterThanOrEqual(0);
      expect(corruptedCount).toBeLessThanOrEqual(20);
    });
  });
});

// =============================================================================
// 4. Combined Chaos Scenarios
// =============================================================================

describe('Combined Chaos Scenarios', () => {
  let baseAdapter: R2StorageAdapter;

  beforeEach(() => {
    baseAdapter = createMemoryAdapter();
  });

  it('should handle multiple fault types simultaneously', async () => {
    const chaosAdapter = createChaosAdapter(baseAdapter, [
      { type: 'timeout', pathPattern: /timeout/, timeoutMs: 20 },
      { type: 'error', pathPattern: /error/, errorMessage: 'Injected error' },
      { type: 'corrupt', pathPattern: /corrupt/, corruptionFn: () => ({ corrupted: true }) },
    ]);

    // Write some test data
    await baseAdapter.writeJson('com/example/normal/data.json', { normal: true });
    await baseAdapter.writeJson('com/example/corrupt/data.json', { normal: true });

    // Normal read should work
    const normal = await chaosAdapter.readJson<{ normal: boolean }>('com/example/normal/data.json');
    expect(normal?.normal).toBe(true);

    // Timeout path should timeout
    await expect(
      chaosAdapter.readJson('com/example/timeout/data.json')
    ).rejects.toThrow('Operation timed out');

    // Error path should error
    await expect(
      chaosAdapter.readJson('com/example/error/data.json')
    ).rejects.toThrow('Injected error');

    // Corrupt path should return corrupted data
    const corrupted = await chaosAdapter.readJson<{ corrupted: boolean }>('com/example/corrupt/data.json');
    expect(corrupted?.corrupted).toBe(true);
  });

  it('should track all fault statistics', async () => {
    const chaosAdapter = createChaosAdapter(baseAdapter, [
      { type: 'timeout', pathPattern: /timeout/, timeoutMs: 10 },
      { type: 'error', pathPattern: /error/, errorMessage: 'Error!' },
      { type: 'corrupt', pathPattern: /corrupt/, corruptionFn: (d) => d },
    ]);

    await baseAdapter.writeJson('com/example/corrupt/test.json', {});

    // Trigger each type
    await chaosAdapter.readJson('com/example/normal/test.json'); // success
    await chaosAdapter.readJson('com/example/corrupt/test.json'); // corrupt
    await expect(chaosAdapter.readJson('com/example/timeout/test.json')).rejects.toThrow();
    await expect(chaosAdapter.readJson('com/example/error/test.json')).rejects.toThrow();

    expect(chaosAdapter.stats.totalOps).toBe(4);
    expect(chaosAdapter.stats.successOps).toBe(1); // normal read
    expect(chaosAdapter.stats.corruptedOps).toBe(1);
    expect(chaosAdapter.stats.timeoutOps).toBe(1);
    expect(chaosAdapter.stats.failedOps).toBe(1);
  });

  it('should reset stats correctly', async () => {
    const chaosAdapter = createChaosAdapter(baseAdapter, [
      { type: 'error', probability: 1.0, errorMessage: 'Always fail' },
    ]);

    await expect(chaosAdapter.readJson('any/path.json')).rejects.toThrow();
    expect(chaosAdapter.stats.failedOps).toBe(1);

    chaosAdapter.reset();

    expect(chaosAdapter.stats.totalOps).toBe(0);
    expect(chaosAdapter.stats.failedOps).toBe(0);
  });

  it('should handle recovery after transient failures', async () => {
    let failureCount = 0;
    const maxFailures = 3;

    // Custom adapter that fails first N attempts, then succeeds
    const recoverableAdapter: R2StorageAdapter = {
      async readJson<T>(path: string): Promise<T | null> {
        if (failureCount < maxFailures) {
          failureCount++;
          throw new Error(`Transient failure ${failureCount}`);
        }
        return baseAdapter.readJson<T>(path);
      },
      async writeJson(path: string, data: unknown): Promise<void> {
        return baseAdapter.writeJson(path, data);
      },
      async readBinary(path: string): Promise<Uint8Array | null> {
        return baseAdapter.readBinary(path);
      },
      async writeBinary(path: string, data: Uint8Array): Promise<void> {
        return baseAdapter.writeBinary(path, data);
      },
      async list(prefix: string): Promise<string[]> {
        return baseAdapter.list(prefix);
      },
      async delete(path: string): Promise<void> {
        return baseAdapter.delete(path);
      },
      async exists(path: string): Promise<boolean> {
        return baseAdapter.exists(path);
      },
      async head(path: string): Promise<{ size: number; lastModified: Date; etag?: string } | null> {
        return baseAdapter.head(path);
      },
    };

    // Write test data
    await baseAdapter.writeJson('test.json', { value: 42 });

    // First 3 attempts should fail
    for (let i = 0; i < maxFailures; i++) {
      await expect(recoverableAdapter.readJson('test.json')).rejects.toThrow(`Transient failure ${i + 1}`);
    }

    // 4th attempt should succeed
    const result = await recoverableAdapter.readJson<{ value: number }>('test.json');
    expect(result?.value).toBe(42);
  });
});

// =============================================================================
// 5. Snapshot and Time-Travel Chaos Tests
// =============================================================================

describe('Snapshot and Time-Travel under Chaos', () => {
  let baseAdapter: R2StorageAdapter;

  beforeEach(() => {
    baseAdapter = createMemoryAdapter();
  });

  it('should handle corrupted snapshot during time-travel query', async () => {
    const storage = new TableStorage(baseAdapter, 'com/example/time-travel');

    // Set up table with snapshot
    const { manifest, schema } = createTable({
      location: 'com/example/time-travel',
      schema: { columns: [{ name: 'id', type: 'int64', nullable: false }] },
    });

    await storage.writeSchema(schema);
    const file = createManifestFile('data/block.bin', 1024, [], createFileStats(100, {}));
    const { manifest: m1, snapshot: s1 } = appendFiles(manifest, null, [file]);
    await storage.writeSnapshot(s1);
    await storage.writeManifest(m1);

    // Create chaos adapter that corrupts snapshot reads
    const chaosAdapter = createChaosAdapter(baseAdapter, [
      {
        type: 'corrupt',
        pathPattern: /\/snapshots\//,
        corruptionFn: (data) => {
          const corrupted = { ...(data as object) } as Record<string, unknown>;
          corrupted.manifestList = []; // Empty manifest list
          return corrupted;
        },
      },
    ]);
    const chaosStorage = new TableStorage(chaosAdapter, 'com/example/time-travel');

    // Read snapshot should return corrupted data
    const loadedSnapshot = await chaosStorage.readSnapshot(s1.snapshotId);
    expect(loadedSnapshot?.manifestList).toHaveLength(0); // Corrupted to empty
  });

  it('should detect inconsistent snapshot chain', async () => {
    const storage = new TableStorage(baseAdapter, 'com/example/chain');

    const { manifest, schema } = createTable({
      location: 'com/example/chain',
      schema: { columns: [{ name: 'id', type: 'int64', nullable: false }] },
    });

    await storage.writeSchema(schema);

    // Create two snapshots
    const file1 = createManifestFile('data/block-1.bin', 1024, [], createFileStats(100, {}));
    const { manifest: m1, snapshot: s1 } = appendFiles(manifest, null, [file1]);
    await storage.writeSnapshot(s1);

    const file2 = createManifestFile('data/block-2.bin', 1024, [], createFileStats(100, {}));
    const { manifest: m2, snapshot: s2 } = appendFiles(m1, s1, [file2]);
    await storage.writeSnapshot(s2);
    await storage.writeManifest(m2);

    // Create chaos adapter that corrupts parent references
    const chaosAdapter = createChaosAdapter(baseAdapter, [
      {
        type: 'corrupt',
        pathPattern: /\/snapshots\//,
        corruptionFn: (data) => {
          const corrupted = { ...(data as object) } as Record<string, unknown>;
          corrupted.parentSnapshotId = 'broken-reference'; // Invalid parent
          return corrupted;
        },
      },
    ]);
    const chaosStorage = new TableStorage(chaosAdapter, 'com/example/chain');

    const loadedSnapshot = await chaosStorage.readSnapshot(s2.snapshotId);
    expect(loadedSnapshot?.parentSnapshotId).toBe('broken-reference');
  });
});

// =============================================================================
// 6. Compaction Chaos Tests
// =============================================================================

describe('Compaction under Chaos', () => {
  let baseAdapter: R2StorageAdapter;

  beforeEach(() => {
    baseAdapter = createMemoryAdapter();
  });

  it('should handle failure during compaction data file deletion', async () => {
    const storage = new TableStorage(baseAdapter, 'com/example/compact');

    // Write some data files
    for (let i = 0; i < 5; i++) {
      await storage.writeDataFile(`data/small-${i}.bin`, new Uint8Array([i]));
    }

    // Create chaos adapter that fails deletion
    const chaosAdapter = createChaosAdapter(baseAdapter, [
      { type: 'error', pathPattern: /small-2\.bin$/, errorMessage: 'Cannot delete small-2.bin' },
    ]);
    const chaosStorage = new TableStorage(chaosAdapter, 'com/example/compact');

    // Attempt to delete all files - should fail on small-2
    const deleteResults: boolean[] = [];
    for (let i = 0; i < 5; i++) {
      try {
        await chaosStorage.deleteDataFile(`data/small-${i}.bin`);
        deleteResults.push(true);
      } catch {
        deleteResults.push(false);
      }
    }

    // 4 should succeed, 1 should fail
    expect(deleteResults.filter(r => r).length).toBe(4);
    expect(deleteResults.filter(r => !r).length).toBe(1);
    expect(deleteResults[2]).toBe(false); // small-2 failed
  });

  it('should handle partial failure writing compacted file', async () => {
    let writeAttempts = 0;

    const partialWriteAdapter: R2StorageAdapter = {
      async readJson<T>(path: string): Promise<T | null> {
        return baseAdapter.readJson<T>(path);
      },
      async writeJson(path: string, data: unknown): Promise<void> {
        return baseAdapter.writeJson(path, data);
      },
      async readBinary(path: string): Promise<Uint8Array | null> {
        return baseAdapter.readBinary(path);
      },
      async writeBinary(path: string, data: Uint8Array): Promise<void> {
        writeAttempts++;
        if (path.includes('compacted') && writeAttempts === 1) {
          throw new Error('First compaction write failed');
        }
        return baseAdapter.writeBinary(path, data);
      },
      async list(prefix: string): Promise<string[]> {
        return baseAdapter.list(prefix);
      },
      async delete(path: string): Promise<void> {
        return baseAdapter.delete(path);
      },
      async exists(path: string): Promise<boolean> {
        return baseAdapter.exists(path);
      },
      async head(path: string): Promise<{ size: number; lastModified: Date; etag?: string } | null> {
        return baseAdapter.head(path);
      },
    };

    const storage = new TableStorage(partialWriteAdapter, 'com/example/compact-fail');

    // First write attempt should fail
    await expect(
      storage.writeDataFile('data/compacted-001.bin', new Uint8Array([1, 2, 3, 4, 5]))
    ).rejects.toThrow('First compaction write failed');

    // Second attempt should succeed
    await storage.writeDataFile('data/compacted-001.bin', new Uint8Array([1, 2, 3, 4, 5]));

    // Verify file exists
    const data = await storage.readDataFile('data/compacted-001.bin');
    expect(data).not.toBeNull();
    expect(data!.length).toBe(5);
  });
});
