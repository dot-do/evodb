/**
 * Test Helpers for Writer Transaction Simulation
 *
 * Provides reusable utilities for testing:
 * - Mock R2 buckets with failure modes
 * - Mock DO storage with vi.fn() spies
 * - Crash snapshot capture and restore
 * - Failing bucket factories for various failure scenarios
 *
 * @evodb/writer test-helpers
 */

import { vi } from 'vitest';
import type { R2Bucket, R2Object, WalEntry } from '../types.js';
import type { DOStorage } from '../writer.js';
import {
  createMockR2Bucket as createGenericMockR2Bucket,
  createMockDOStorage as createGenericMockDOStorage,
  generateWalEntry as baseGenerateWalEntry,
  generateWalEntries as baseGenerateWalEntries,
} from '@evodb/test-utils';

// =============================================================================
// Mock R2 Bucket with Spies
// =============================================================================

/**
 * Extended R2 bucket interface with internal storage access
 */
export interface MockR2BucketWithStorage extends R2Bucket {
  _storage: Map<string, { data: Uint8Array; metadata?: Record<string, string> }>;
  _clear: () => void;
}

/**
 * Create a mock R2 bucket with vi.fn() spies for test assertions
 *
 * @example
 * ```ts
 * const bucket = createMockR2Bucket();
 * await bucket.put('key', new Uint8Array([1, 2, 3]));
 * expect(bucket.put).toHaveBeenCalledWith('key', expect.any(Uint8Array));
 * ```
 */
export function createMockR2Bucket(): MockR2BucketWithStorage {
  const baseBucket = createGenericMockR2Bucket();
  return {
    put: vi.fn(baseBucket.put),
    get: vi.fn(baseBucket.get),
    delete: vi.fn(baseBucket.delete),
    list: vi.fn(baseBucket.list),
    head: vi.fn(baseBucket.head),
    _storage: baseBucket._storage,
    _clear: baseBucket._clear,
  } as MockR2BucketWithStorage;
}

// =============================================================================
// Mock DO Storage with Spies
// =============================================================================

/**
 * Extended DO storage interface with internal storage access
 */
export interface MockDOStorageWithInternals extends DOStorage {
  _storage: Map<string, unknown>;
  _clear: () => void;
}

/**
 * Create a mock DO storage with vi.fn() spies for test assertions
 *
 * @example
 * ```ts
 * const storage = createMockDOStorage();
 * await storage.put('state', { value: 1 });
 * expect(storage.put).toHaveBeenCalledWith('state', { value: 1 });
 * ```
 */
export function createMockDOStorage(): MockDOStorageWithInternals {
  const baseStorage = createGenericMockDOStorage();
  return {
    get: vi.fn(baseStorage.get),
    put: vi.fn(baseStorage.put),
    delete: vi.fn(baseStorage.delete),
    list: vi.fn(baseStorage.list),
    _storage: baseStorage._storage,
    _clear: baseStorage._clear,
  };
}

// =============================================================================
// WAL Entry Helpers
// =============================================================================

/**
 * Create a mock WAL entry for testing
 *
 * @example
 * ```ts
 * const entry = createMockWalEntry(1, { id: 1, name: 'test' });
 * ```
 */
export function createMockWalEntry(lsn: number, data: string | object = 'test'): WalEntry {
  return baseGenerateWalEntry(lsn, data) as WalEntry;
}

/**
 * Create multiple mock WAL entries for testing
 *
 * @example
 * ```ts
 * const entries = createMockWalEntries(5);
 * const customEntries = createMockWalEntries(3, (i) => ({ id: i, value: `item-${i}` }));
 * ```
 */
export function createMockWalEntries(
  count: number,
  dataGenerator?: (index: number) => string | object
): WalEntry[] {
  return baseGenerateWalEntries(count, dataGenerator) as WalEntry[];
}

// =============================================================================
// Failing R2 Bucket Factory
// =============================================================================

/**
 * Options for creating a failing R2 bucket
 */
export interface FailingBucketOptions {
  /** Fail all put operations */
  failOnPut?: boolean;
  /** Fail put operations after N successful puts */
  failAfterNPuts?: number;
  /** Fail all get operations */
  failOnGet?: boolean;
  /** Fail all delete operations */
  failOnDelete?: boolean;
  /** Fail all head operations */
  failOnHead?: boolean;
  /** Custom error message */
  errorMessage?: string;
}

/**
 * Extended R2 bucket interface with call count tracking
 */
export interface FailingR2Bucket extends R2Bucket {
  _callCounts: { put: number; get: number; delete: number; head: number };
  _resetCallCounts: () => void;
}

/**
 * Create a failing R2 bucket that simulates specific failure modes
 *
 * @example
 * ```ts
 * // Bucket that always fails on put
 * const bucket = createFailingR2Bucket({ failOnPut: true });
 *
 * // Bucket that fails after 2 successful puts
 * const partialFailBucket = createFailingR2Bucket({ failAfterNPuts: 2 });
 * ```
 */
export function createFailingR2Bucket(options: FailingBucketOptions): FailingR2Bucket {
  const callCounts = { put: 0, get: 0, delete: 0, head: 0 };
  const storage = new Map<string, { data: Uint8Array; metadata?: Record<string, string> }>();
  const errorMessage = options.errorMessage || 'Simulated R2 failure';

  return {
    _callCounts: callCounts,
    _resetCallCounts: () => {
      callCounts.put = 0;
      callCounts.get = 0;
      callCounts.delete = 0;
      callCounts.head = 0;
    },

    put: vi.fn(async (key: string, value: ArrayBuffer | Uint8Array | string, opts?: { customMetadata?: Record<string, string> }) => {
      callCounts.put++;
      if (options.failOnPut) {
        throw new Error(`${errorMessage}: put`);
      }
      if (options.failAfterNPuts && callCounts.put > options.failAfterNPuts) {
        throw new Error(`${errorMessage}: put after ${options.failAfterNPuts} puts`);
      }
      let data: Uint8Array;
      if (typeof value === 'string') {
        data = new TextEncoder().encode(value);
      } else if (value instanceof ArrayBuffer) {
        data = new Uint8Array(value);
      } else {
        data = value;
      }
      storage.set(key, { data: new Uint8Array(data), metadata: opts?.customMetadata });
      return {
        key,
        version: '1',
        size: data.length,
        etag: `"${key}"`,
        httpEtag: `"${key}"`,
        checksums: {},
        uploaded: new Date(),
        customMetadata: opts?.customMetadata,
      } as R2Object;
    }),

    get: vi.fn(async (key: string) => {
      callCounts.get++;
      if (options.failOnGet) {
        throw new Error(`${errorMessage}: get`);
      }
      const item = storage.get(key);
      if (!item) return null;
      return {
        key,
        version: '1',
        size: item.data.length,
        etag: `"${key}"`,
        httpEtag: `"${key}"`,
        checksums: {},
        uploaded: new Date(),
        customMetadata: item.metadata,
        async arrayBuffer() {
          return item.data.buffer.slice(item.data.byteOffset, item.data.byteOffset + item.data.byteLength);
        },
        async text() {
          return new TextDecoder().decode(item.data);
        },
        async json<T>() {
          return JSON.parse(new TextDecoder().decode(item.data)) as T;
        },
      };
    }),

    delete: vi.fn(async (keys: string | string[]) => {
      callCounts.delete++;
      if (options.failOnDelete) {
        throw new Error(`${errorMessage}: delete`);
      }
      const keyList = Array.isArray(keys) ? keys : [keys];
      for (const key of keyList) {
        storage.delete(key);
      }
    }),

    list: vi.fn(async () => ({
      objects: [],
      truncated: false,
      delimitedPrefixes: [],
    })),

    head: vi.fn(async (key: string) => {
      callCounts.head++;
      if (options.failOnHead) {
        throw new Error(`${errorMessage}: head`);
      }
      const item = storage.get(key);
      if (!item) return null;
      return {
        key,
        version: '1',
        size: item.data.length,
        etag: `"${key}"`,
        httpEtag: `"${key}"`,
        checksums: {},
        uploaded: new Date(),
        customMetadata: item.metadata,
      };
    }),
  };
}

// =============================================================================
// Crash Snapshot Utilities
// =============================================================================

/**
 * Snapshot of storage state at a point in time
 */
export interface CrashSnapshot {
  /** Deep copy of DO storage state */
  doStorage: Map<string, unknown>;
  /** Deep copy of R2 storage state */
  r2Storage: Map<string, { data: Uint8Array; metadata?: Record<string, string> }>;
  /** Timestamp when snapshot was taken */
  timestamp: number;
}

/**
 * Capture a snapshot of storage state for crash simulation
 *
 * This creates a deep copy of both DO and R2 storage state that can be
 * used to verify state consistency or restore state after simulated crash.
 *
 * @example
 * ```ts
 * const doStorage = mockDOStorage._storage;
 * const r2Storage = mockR2Bucket._storage;
 *
 * // Capture state before operation
 * const snapshot = captureCrashSnapshot(doStorage, r2Storage);
 *
 * // Perform operations...
 *
 * // Verify state changed
 * expect(doStorage.get('key')).not.toEqual(snapshot.doStorage.get('key'));
 * ```
 */
export function captureCrashSnapshot(
  doStorage: Map<string, unknown>,
  r2Storage: Map<string, { data: Uint8Array; metadata?: Record<string, string> }>
): CrashSnapshot {
  // Deep copy DO storage (JSON round-trip for deep clone)
  const doStorageCopy = new Map<string, unknown>();
  for (const [key, value] of doStorage) {
    try {
      doStorageCopy.set(key, JSON.parse(JSON.stringify(value)));
    } catch {
      // For non-serializable values, use shallow copy
      doStorageCopy.set(key, value);
    }
  }

  // Deep copy R2 storage
  const r2StorageCopy = new Map<string, { data: Uint8Array; metadata?: Record<string, string> }>();
  for (const [key, value] of r2Storage) {
    r2StorageCopy.set(key, {
      data: new Uint8Array(value.data),
      metadata: value.metadata ? { ...value.metadata } : undefined,
    });
  }

  return {
    doStorage: doStorageCopy,
    r2Storage: r2StorageCopy,
    timestamp: Date.now(),
  };
}

/**
 * Restore storage state from a crash snapshot
 *
 * @example
 * ```ts
 * // Restore to previous state
 * restoreFromSnapshot(snapshot, mockDOStorage._storage, mockR2Bucket._storage);
 * ```
 */
export function restoreFromSnapshot(
  snapshot: CrashSnapshot,
  doStorage: Map<string, unknown>,
  r2Storage: Map<string, { data: Uint8Array; metadata?: Record<string, string> }>
): void {
  // Clear and restore DO storage
  doStorage.clear();
  for (const [key, value] of snapshot.doStorage) {
    doStorage.set(key, value);
  }

  // Clear and restore R2 storage
  r2Storage.clear();
  for (const [key, value] of snapshot.r2Storage) {
    r2Storage.set(key, {
      data: new Uint8Array(value.data),
      metadata: value.metadata ? { ...value.metadata } : undefined,
    });
  }
}

/**
 * Compare two snapshots to detect changes
 *
 * @returns Object describing differences between snapshots
 */
export function compareSnapshots(
  before: CrashSnapshot,
  after: CrashSnapshot
): {
  doStorageChanges: {
    added: string[];
    removed: string[];
    modified: string[];
  };
  r2StorageChanges: {
    added: string[];
    removed: string[];
    modified: string[];
  };
} {
  const doChanges = {
    added: [] as string[],
    removed: [] as string[],
    modified: [] as string[],
  };

  const r2Changes = {
    added: [] as string[],
    removed: [] as string[],
    modified: [] as string[],
  };

  // Detect DO storage changes
  for (const key of after.doStorage.keys()) {
    if (!before.doStorage.has(key)) {
      doChanges.added.push(key);
    } else if (JSON.stringify(before.doStorage.get(key)) !== JSON.stringify(after.doStorage.get(key))) {
      doChanges.modified.push(key);
    }
  }
  for (const key of before.doStorage.keys()) {
    if (!after.doStorage.has(key)) {
      doChanges.removed.push(key);
    }
  }

  // Detect R2 storage changes
  for (const key of after.r2Storage.keys()) {
    if (!before.r2Storage.has(key)) {
      r2Changes.added.push(key);
    } else {
      const beforeData = before.r2Storage.get(key)!.data;
      const afterData = after.r2Storage.get(key)!.data;
      if (beforeData.length !== afterData.length || !beforeData.every((v, i) => v === afterData[i])) {
        r2Changes.modified.push(key);
      }
    }
  }
  for (const key of before.r2Storage.keys()) {
    if (!after.r2Storage.has(key)) {
      r2Changes.removed.push(key);
    }
  }

  return {
    doStorageChanges: doChanges,
    r2StorageChanges: r2Changes,
  };
}

// =============================================================================
// Transaction Simulation Utilities
// =============================================================================

/**
 * Simulate a transaction that can be committed or rolled back
 */
export interface TransactionSimulator<T> {
  /** Execute the transaction */
  execute: () => Promise<T>;
  /** Commit the transaction (no-op, but marks as committed) */
  commit: () => void;
  /** Rollback to pre-transaction state */
  rollback: () => void;
  /** Whether the transaction has been committed */
  isCommitted: boolean;
  /** Whether the transaction has been rolled back */
  isRolledBack: boolean;
}

/**
 * Create a transaction simulator for testing atomic operations
 *
 * @example
 * ```ts
 * const transaction = createTransactionSimulator(
 *   mockDOStorage._storage,
 *   mockR2Bucket._storage,
 *   async () => {
 *     await writer.flush();
 *     return writer.getBlockIndex();
 *   }
 * );
 *
 * const result = await transaction.execute();
 * if (someCondition) {
 *   transaction.commit();
 * } else {
 *   transaction.rollback();
 * }
 * ```
 */
export function createTransactionSimulator<T>(
  doStorage: Map<string, unknown>,
  r2Storage: Map<string, { data: Uint8Array; metadata?: Record<string, string> }>,
  operation: () => Promise<T>
): TransactionSimulator<T> {
  let snapshot: CrashSnapshot | null = null;
  let committed = false;
  let rolledBack = false;

  return {
    async execute(): Promise<T> {
      snapshot = captureCrashSnapshot(doStorage, r2Storage);
      return await operation();
    },

    commit(): void {
      if (rolledBack) {
        throw new Error('Cannot commit after rollback');
      }
      committed = true;
      snapshot = null; // Free memory
    },

    rollback(): void {
      if (committed) {
        throw new Error('Cannot rollback after commit');
      }
      if (!snapshot) {
        throw new Error('No snapshot to rollback to');
      }
      restoreFromSnapshot(snapshot, doStorage, r2Storage);
      rolledBack = true;
    },

    get isCommitted(): boolean {
      return committed;
    },

    get isRolledBack(): boolean {
      return rolledBack;
    },
  };
}

// =============================================================================
// Async Test Utilities
// =============================================================================

/**
 * Wait for a condition to be true with timeout
 *
 * @example
 * ```ts
 * await waitForCondition(() => writer.getPendingBlockCount() === 0, 5000);
 * ```
 */
export async function waitForCondition(
  condition: () => boolean,
  timeoutMs: number = 5000,
  intervalMs: number = 50
): Promise<void> {
  const startTime = Date.now();
  while (!condition()) {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error('Timeout waiting for condition');
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
}

/**
 * Delay execution for specified milliseconds
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Run an operation with a deadline
 *
 * @example
 * ```ts
 * const result = await withDeadline(
 *   async () => await writer.flush(),
 *   5000
 * );
 * ```
 */
export async function withDeadline<T>(
  operation: () => Promise<T>,
  deadlineMs: number
): Promise<T> {
  return Promise.race([
    operation(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Operation deadline exceeded')), deadlineMs)
    ),
  ]);
}
