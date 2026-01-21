/**
 * Fallback Storage Tests
 *
 * Tests for the local DO storage fallback when R2 is unavailable.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  FallbackStorage,
  FallbackRecoveryManager,
  DEFAULT_RECOVERY_CONFIG,
  type DOStorage,
} from '../fallback.js';
import type { WalEntry } from '../types.js';

// =============================================================================
// Mock Storage Implementation
// =============================================================================

function createMockStorage(): DOStorage & { _data: Map<string, unknown> } {
  const data = new Map<string, unknown>();

  return {
    _data: data,

    async get<T>(keyOrKeys: string | string[]): Promise<T | Map<string, T> | undefined> {
      if (Array.isArray(keyOrKeys)) {
        const result = new Map<string, T>();
        for (const key of keyOrKeys) {
          const value = data.get(key);
          if (value !== undefined) {
            result.set(key, value as T);
          }
        }
        return result as Map<string, T>;
      }
      return data.get(keyOrKeys) as T | undefined;
    },

    async put<T>(keyOrEntries: string | Map<string, T>, value?: T): Promise<void> {
      if (typeof keyOrEntries === 'string') {
        data.set(keyOrEntries, value);
      } else {
        for (const [k, v] of keyOrEntries) {
          data.set(k, v);
        }
      }
    },

    async delete(keyOrKeys: string | string[]): Promise<boolean | number> {
      if (Array.isArray(keyOrKeys)) {
        let count = 0;
        for (const key of keyOrKeys) {
          if (data.delete(key)) {
            count++;
          }
        }
        return count;
      }
      return data.delete(keyOrKeys);
    },

    async list<T>(options?: { prefix?: string; limit?: number }): Promise<Map<string, T>> {
      const result = new Map<string, T>();
      const prefix = options?.prefix ?? '';
      const limit = options?.limit ?? Infinity;
      let count = 0;

      for (const [key, value] of data) {
        if (key.startsWith(prefix)) {
          result.set(key, value as T);
          count++;
          if (count >= limit) {
            break;
          }
        }
      }

      return result;
    },
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

function createWalEntry(sequence: number): WalEntry {
  return {
    sequence,
    timestamp: Date.now(),
    operation: 'INSERT',
    table: 'test_table',
    rowId: `row-${sequence}`,
    after: { id: `row-${sequence}` },
  };
}

// =============================================================================
// FALLBACK STORAGE TESTS
// =============================================================================

describe('FallbackStorage', () => {
  let storage: DOStorage & { _data: Map<string, unknown> };
  let fallback: FallbackStorage;

  beforeEach(() => {
    storage = createMockStorage();
    fallback = new FallbackStorage(storage, 1024 * 1024);
  });

  describe('store', () => {
    it('should store WAL entries', async () => {
      const entries = [createWalEntry(1), createWalEntry(2)];
      await fallback.store(entries);

      expect(fallback.hasData()).toBe(true);
      expect(fallback.getEntryCount()).toBe(2);
    });

    it('should handle empty entry array', async () => {
      await fallback.store([]);
      expect(fallback.hasData()).toBe(false);
    });
  });

  describe('retrieve', () => {
    it('should retrieve all stored entries', async () => {
      await fallback.store([createWalEntry(1), createWalEntry(2)]);
      const retrieved = await fallback.retrieve();
      expect(retrieved).toHaveLength(2);
    });

    it('should return entries sorted by sequence', async () => {
      await fallback.store([createWalEntry(3)]);
      await fallback.store([createWalEntry(1)]);
      await fallback.store([createWalEntry(2)]);

      const retrieved = await fallback.retrieve();
      expect(retrieved[0].sequence).toBe(1);
      expect(retrieved[1].sequence).toBe(2);
      expect(retrieved[2].sequence).toBe(3);
    });
  });

  describe('clear', () => {
    it('should remove all entries', async () => {
      await fallback.store([createWalEntry(1)]);
      await fallback.clear();
      expect(fallback.hasData()).toBe(false);
      expect(fallback.getEntryCount()).toBe(0);
    });
  });

  describe('remove', () => {
    it('should remove specific entries by sequence', async () => {
      await fallback.store([createWalEntry(1), createWalEntry(2), createWalEntry(3)]);
      await fallback.remove([1, 3]);
      const remaining = await fallback.retrieve();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].sequence).toBe(2);
    });
  });

  describe('status methods', () => {
    it('should return correct utilization', async () => {
      expect(fallback.getUtilization()).toBe(0);
      await fallback.store([createWalEntry(1)]);
      expect(fallback.getUtilization()).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// RECOVERY MANAGER TESTS
// =============================================================================

describe('FallbackRecoveryManager', () => {
  let storage: DOStorage & { _data: Map<string, unknown> };
  let fallback: FallbackStorage;
  let recoveryManager: FallbackRecoveryManager;

  beforeEach(() => {
    storage = createMockStorage();
    fallback = new FallbackStorage(storage, 1024 * 1024);
    recoveryManager = new FallbackRecoveryManager(fallback);
  });

  it('should recover entries using provided function', async () => {
    await fallback.store([createWalEntry(1)]);

    const recovered: WalEntry[] = [];
    const result = await recoveryManager.attemptRecovery(async (entries) => {
      recovered.push(...entries);
    });

    expect(result).toBe(1);
    expect(recovered).toHaveLength(1);
    expect(fallback.hasData()).toBe(false);
  });

  it('should return 0 when no data to recover', async () => {
    const result = await recoveryManager.attemptRecovery(async () => {});
    expect(result).toBe(0);
  });

  it('should return -1 when already recovering', async () => {
    await fallback.store([createWalEntry(1)]);

    const longRecoveryPromise = recoveryManager.attemptRecovery(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const result = await recoveryManager.attemptRecovery(async () => {});
    expect(result).toBe(-1);

    await longRecoveryPromise;
  });

  it('should track isRecovering correctly', async () => {
    expect(recoveryManager.isRecovering()).toBe(false);
  });

  describe('DEFAULT_RECOVERY_CONFIG', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_RECOVERY_CONFIG.maxRetries).toBe(10);
      expect(DEFAULT_RECOVERY_CONFIG.retryDelayMs).toBe(1000);
      expect(DEFAULT_RECOVERY_CONFIG.backoffMultiplier).toBe(2);
      expect(DEFAULT_RECOVERY_CONFIG.maxDelayMs).toBe(60000);
    });
  });
});
