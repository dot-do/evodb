/**
 * Cache Invalidation Hooks for EvoDB Edge Cache
 *
 * Provides cache invalidation tied to CDC commits, supporting:
 * - Path-level invalidation (individual files)
 * - Partition-level invalidation (using cache tags)
 * - Table-level invalidation (wildcard tags)
 * - Integration with writer flush and compaction events
 * - Versioned cache keys to prevent stale reads
 *
 * ## Versioned Cache Keys (Stale Data Prevention)
 *
 * When Writer DO flushes new blocks, the Cache API may serve stale data
 * for 1-5 minutes due to cache TTL. To prevent this, we support versioned
 * cache keys that include the snapshot ID:
 *
 * ```typescript
 * const manager = createCacheInvalidationManager();
 *
 * // After a write, get the versioned cache key
 * const result = await manager.onCommit(event);
 * const versionedKey = result.versionedCacheKeys['data/users/block.parquet'];
 * // -> 'data/users/block.parquet?v=snap_001'
 *
 * // Reader can use the versioned key for cache lookups
 * const factory = manager.createCacheKeyFactory('users', 'year=2024');
 * const cacheKey = factory('data/users/year=2024/block.parquet');
 * ```
 */

import type { EdgeCacheConfig } from './index.js';
import { DEFAULT_CONFIG } from './index.js';
import {
  invalidatePartition,
  setFetchFunction as setPrefetchFetch,
  resetFetchFunction as resetPrefetchFetch,
} from './prefetch.js';

// ============================================================================
// Internal Fetch State
// ============================================================================

/**
 * Fetch function type for dependency injection
 */
type FetchFunction = typeof fetch;

/**
 * Internal fetch function (can be overridden for testing)
 */
let fetchFn: FetchFunction = globalThis.fetch;

/**
 * Set the fetch function (for testing)
 */
export function setFetchFunction(fn: FetchFunction): void {
  fetchFn = fn;
  // Also set in prefetch module for consistency
  setPrefetchFetch(fn);
}

/**
 * Reset the fetch function to default
 */
export function resetFetchFunction(): void {
  fetchFn = globalThis.fetch;
  resetPrefetchFetch();
}

/**
 * Get the current fetch function (for internal use)
 */
function getFetchFn(): FetchFunction {
  return fetchFn;
}

// ============================================================================
// Types
// ============================================================================

/**
 * Operation type for CDC commit events
 */
export type CDCOperation = 'write' | 'compact' | 'delete';

/**
 * CDC commit event that triggers cache invalidation
 */
export interface CDCCommitEvent {
  /** Table name */
  table: string;
  /** Partition identifier (e.g., "year=2024/month=01") */
  partition: string;
  /** Snapshot ID for the commit */
  snapshotId: string;
  /** Paths affected by this commit */
  affectedPaths: string[];
  /** Timestamp of the commit */
  timestamp: number;
  /** Type of operation */
  operation: CDCOperation;
  /** Optional metadata */
  metadata?: {
    rowCount?: number;
    sizeBytes?: number;
    minLsn?: bigint;
    maxLsn?: bigint;
    [key: string]: unknown;
  };
}

/**
 * Scope level for invalidation
 */
export type InvalidationLevel = 'path' | 'partition' | 'table';

/**
 * Scope definition for cache invalidation
 */
export interface InvalidationScope {
  /** Invalidation level */
  level: InvalidationLevel;
  /** Table name */
  table: string;
  /** Partition identifier (for partition level) */
  partition?: string;
  /** Specific paths (for path level) */
  paths?: string[];
}

/**
 * Result of a single hook execution
 */
export interface HookResult {
  /** Whether the hook succeeded */
  success: boolean;
  /** Paths that were invalidated */
  invalidatedPaths: string[];
  /** Paths that failed to invalidate */
  failedPaths?: string[];
  /** Error message if failed */
  error?: string;
}

/**
 * Result of cache invalidation operation
 */
export interface InvalidationResult {
  /** Overall success status */
  success: boolean;
  /** All paths that were invalidated */
  invalidatedPaths: string[];
  /** Paths that failed to invalidate */
  failedPaths?: string[];
  /** Scope of the invalidation */
  scope?: InvalidationScope;
  /** Results from individual hooks */
  hookResults?: Array<{
    hookName: string;
    success: boolean;
    invalidatedPaths: string[];
    error?: string;
  }>;
  /** Errors encountered */
  errors?: Array<{
    hookName: string;
    error: string;
  }>;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Versioned cache keys for invalidated paths (path -> versioned key) */
  versionedCacheKeys?: Record<string, string>;
  /** Snapshot version that was applied */
  snapshotVersion?: string;
  /** Table name from the commit event */
  table?: string;
  /** Partition from the commit event */
  partition?: string;
}

/**
 * Cache invalidation hook interface
 */
export interface CacheInvalidationHook {
  /** Unique hook name */
  name: string;
  /** Priority for execution order (higher = earlier, default: 50) */
  priority?: number;
  /** Optional filter predicate */
  filter?: (event: CDCCommitEvent) => boolean;
  /** Callback executed on commit */
  onCommit: (event: CDCCommitEvent) => Promise<HookResult>;
}

/**
 * Invalidation strategy type
 */
export type InvalidationStrategy = 'eager' | 'lazy' | 'partition';

/**
 * Configuration for cache invalidation manager
 */
export interface InvalidationManagerConfig {
  /** Edge cache configuration */
  cacheConfig?: Partial<EdgeCacheConfig>;
  /** Invalidation strategy */
  strategy?: InvalidationStrategy;
  /** Batch window for lazy strategy (ms) */
  batchWindow?: number;
  /** Maximum batch size for lazy strategy */
  maxBatchSize?: number;
}

/**
 * Statistics for cache invalidation operations
 */
export interface InvalidationStats {
  /** Total commits processed */
  totalCommits: number;
  /** Total invalidation operations */
  totalInvalidations: number;
  /** Successful invalidations */
  successfulInvalidations: number;
  /** Failed invalidations */
  failedInvalidations: number;
  /** Average invalidation duration (ms) */
  avgDurationMs: number;
  /** Last invalidation timestamp */
  lastInvalidationAt?: number;
}

/**
 * Block metadata (subset of writer BlockMetadata)
 */
interface BlockMetadata {
  id: string;
  r2Key: string;
  rowCount: number;
  sizeBytes: number;
  minLsn: bigint;
  maxLsn: bigint;
  createdAt: number;
  compacted: boolean;
}

/**
 * Flush result (subset of writer FlushResult)
 */
interface FlushResult {
  status: 'persisted' | 'buffered' | 'empty';
  block?: BlockMetadata;
  entryCount: number;
  durationMs: number;
}

/**
 * Compaction result (subset of writer CompactResult)
 */
interface CompactResult {
  status: 'completed' | 'skipped' | 'failed';
  blocksMerged: number;
  newBlock?: BlockMetadata;
  blocksDeleted: string[];
  durationMs: number;
}

// ============================================================================
// CacheInvalidationManager Class
// ============================================================================

/**
 * Manager for cache invalidation hooks
 */
export class CacheInvalidationManager {
  private config: EdgeCacheConfig;
  private strategy: InvalidationStrategy;
  private batchWindow: number;
  private maxBatchSize: number;
  private hooks: Map<string, CacheInvalidationHook> = new Map();
  private pendingEvents: CDCCommitEvent[] = [];
  private pendingPaths: Set<string> = new Set();
  private stats: InvalidationStats = {
    totalCommits: 0,
    totalInvalidations: 0,
    successfulInvalidations: 0,
    failedInvalidations: 0,
    avgDurationMs: 0,
  };
  private totalDurationMs = 0;
  private batchTimer?: ReturnType<typeof setTimeout>;
  /** Tracks current snapshot version per table/partition for versioned cache keys */
  private snapshotVersions: Map<string, string> = new Map();

  constructor(options: InvalidationManagerConfig = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...options.cacheConfig,
    };
    this.strategy = options.strategy ?? 'eager';
    this.batchWindow = options.batchWindow ?? 1000;
    this.maxBatchSize = options.maxBatchSize ?? 100;
  }

  // ============================================================================
  // Versioned Cache Key Methods (Stale Data Prevention)
  // ============================================================================

  /**
   * Generate a versioned cache key that includes the snapshot ID.
   * This ensures that new data is always fetched after a write,
   * preventing stale reads from the Cache API.
   *
   * @param path - The original path (e.g., data/users/block.parquet)
   * @param snapshotId - The snapshot ID to include in the key
   * @returns Versioned cache key with snapshot ID as query parameter
   */
  generateVersionedCacheKey(path: string, snapshotId: string): string {
    // Use query parameter format for versioning
    // This is compatible with standard URL-based cache keys
    const separator = path.includes('?') ? '&' : '?';
    return `${path}${separator}v=${snapshotId}`;
  }

  /**
   * Get the current snapshot version for a table/partition combination.
   *
   * @param table - Table name
   * @param partition - Partition identifier
   * @returns Current snapshot version or undefined if not tracked
   */
  getCurrentSnapshotVersion(table: string, partition: string): string | undefined {
    const key = this.buildSnapshotKey(table, partition);
    return this.snapshotVersions.get(key);
  }

  /**
   * Update the snapshot version for a table/partition combination.
   *
   * @param table - Table name
   * @param partition - Partition identifier
   * @param snapshotId - New snapshot ID
   */
  updateSnapshotVersion(table: string, partition: string, snapshotId: string): void {
    const key = this.buildSnapshotKey(table, partition);
    this.snapshotVersions.set(key, snapshotId);
  }

  /**
   * Create a cache key factory function that uses the current snapshot version.
   * This is useful for readers that need to generate versioned cache keys.
   *
   * @param table - Table name
   * @param partition - Partition identifier
   * @returns Factory function that generates versioned cache keys
   */
  createCacheKeyFactory(table: string, partition: string): (path: string) => string {
    const snapshotId = this.getCurrentSnapshotVersion(table, partition);
    return (path: string) => {
      if (snapshotId) {
        return this.generateVersionedCacheKey(path, snapshotId);
      }
      return path;
    };
  }

  /**
   * Get versioned cache keys for all paths in a commit event.
   *
   * @param event - CDC commit event
   * @returns Map of original path to versioned cache key
   */
  getVersionedCacheKeysForEvent(event: CDCCommitEvent): Record<string, string> {
    const result: Record<string, string> = {};
    for (const path of event.affectedPaths) {
      result[path] = this.generateVersionedCacheKey(path, event.snapshotId);
    }
    return result;
  }

  /**
   * Build internal key for snapshot version tracking.
   */
  private buildSnapshotKey(table: string, partition: string): string {
    return `${table}:${partition}`;
  }

  /**
   * Get all registered hooks
   */
  getHooks(): CacheInvalidationHook[] {
    return Array.from(this.hooks.values());
  }

  /**
   * Get current invalidation strategy
   */
  getStrategy(): InvalidationStrategy {
    return this.strategy;
  }

  /**
   * Get batch window for lazy strategy
   */
  getBatchWindow(): number {
    return this.batchWindow;
  }

  /**
   * Register a cache invalidation hook
   */
  registerHook(hook: CacheInvalidationHook): void {
    this.hooks.set(hook.name, hook);
  }

  /**
   * Unregister a hook by name
   */
  unregisterHook(name: string): void {
    this.hooks.delete(name);
  }

  /**
   * Register the default path invalidation hook
   * Invalidates each affected path individually
   */
  registerDefaultInvalidationHook(): void {
    this.registerHook({
      name: 'default-path-invalidation',
      priority: 50,
      onCommit: async (event) => {
        const invalidatedPaths: string[] = [];
        const failedPaths: string[] = [];

        for (const path of event.affectedPaths) {
          try {
            const success = await invalidatePartition(path);
            if (success) {
              invalidatedPaths.push(path);
            } else {
              failedPaths.push(path);
            }
          } catch {
            failedPaths.push(path);
          }
        }

        return {
          success: failedPaths.length === 0,
          invalidatedPaths,
          failedPaths: failedPaths.length > 0 ? failedPaths : undefined,
        };
      },
    });
  }

  /**
   * Register partition-level invalidation hook
   * Uses cache tags for efficient partition invalidation
   */
  registerPartitionInvalidationHook(): void {
    const config = this.config;
    this.registerHook({
      name: 'partition-invalidation',
      priority: 100,
      onCommit: async (event) => {
        try {
          // Use cache tag purge for partition-level invalidation
          const purgeUrl = `${config.cdnBaseUrl}/purge`;
          const cacheTag = `evodb:${event.table}:${event.partition}`;

          // Use injectable fetch function for testability
          const response = await getFetchFn()(purgeUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              tags: [cacheTag],
            }),
          });

          if (response.ok) {
            return {
              success: true,
              invalidatedPaths: event.affectedPaths,
            };
          }

          return {
            success: false,
            invalidatedPaths: [],
            error: `Partition purge failed: ${response.status}`,
          };
        } catch (error) {
          return {
            success: false,
            invalidatedPaths: [],
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    });
  }

  /**
   * Process a commit event through all registered hooks
   */
  async onCommit(event: CDCCommitEvent): Promise<InvalidationResult> {
    const startTime = Date.now();
    this.stats.totalCommits++;

    // Update snapshot version for this table/partition
    this.updateSnapshotVersion(event.table, event.partition, event.snapshotId);

    // Generate versioned cache keys for the affected paths
    const versionedCacheKeys = this.getVersionedCacheKeysForEvent(event);

    // For lazy strategy, queue the event
    if (this.strategy === 'lazy') {
      this.queueEvent(event);
      return {
        success: true,
        invalidatedPaths: [],
        scope: {
          level: 'path',
          table: event.table,
          paths: event.affectedPaths,
        },
        versionedCacheKeys,
        snapshotVersion: event.snapshotId,
        table: event.table,
        partition: event.partition,
      };
    }

    // Get hooks sorted by priority (descending)
    const sortedHooks = this.getSortedHooks();

    const results: InvalidationResult['hookResults'] = [];
    const errors: InvalidationResult['errors'] = [];
    const allInvalidatedPaths = new Set<string>();
    const allFailedPaths = new Set<string>();
    let overallSuccess = true;

    for (const hook of sortedHooks) {
      // Apply filter if present
      if (hook.filter && !hook.filter(event)) {
        continue;
      }

      try {
        const hookResult = await hook.onCommit(event);

        results.push({
          hookName: hook.name,
          success: hookResult.success,
          invalidatedPaths: hookResult.invalidatedPaths,
          error: hookResult.error,
        });

        for (const path of hookResult.invalidatedPaths) {
          allInvalidatedPaths.add(path);
        }

        if (hookResult.failedPaths) {
          for (const path of hookResult.failedPaths) {
            allFailedPaths.add(path);
          }
        }

        if (!hookResult.success) {
          overallSuccess = false;
        }
      } catch (error) {
        overallSuccess = false;
        errors.push({
          hookName: hook.name,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const durationMs = Date.now() - startTime;
    this.updateStats(allInvalidatedPaths.size, allFailedPaths.size, durationMs);

    // Determine scope based on strategy
    const scope: InvalidationScope = this.strategy === 'partition'
      ? { level: 'partition', table: event.table, partition: event.partition }
      : { level: 'path', table: event.table, paths: event.affectedPaths };

    return {
      success: overallSuccess,
      invalidatedPaths: Array.from(allInvalidatedPaths),
      failedPaths: allFailedPaths.size > 0 ? Array.from(allFailedPaths) : undefined,
      scope,
      hookResults: results.length > 0 ? results : undefined,
      errors: errors.length > 0 ? errors : undefined,
      durationMs,
      versionedCacheKeys,
      snapshotVersion: event.snapshotId,
      table: event.table,
      partition: event.partition,
    };
  }

  /**
   * Process multiple commit events
   */
  async onCommitBatch(events: CDCCommitEvent[]): Promise<InvalidationResult[]> {
    return Promise.all(events.map((event) => this.onCommit(event)));
  }

  /**
   * Flush pending invalidations (for lazy strategy)
   */
  async flushPendingInvalidations(): Promise<InvalidationResult> {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = undefined;
    }

    const pathsToInvalidate = Array.from(this.pendingPaths);
    this.pendingPaths.clear();
    this.pendingEvents = [];

    if (pathsToInvalidate.length === 0) {
      return {
        success: true,
        invalidatedPaths: [],
      };
    }

    const invalidatedPaths: string[] = [];
    const failedPaths: string[] = [];

    for (const path of pathsToInvalidate) {
      try {
        const success = await invalidatePartition(path);
        if (success) {
          invalidatedPaths.push(path);
        } else {
          failedPaths.push(path);
        }
      } catch {
        failedPaths.push(path);
      }
    }

    this.updateStats(invalidatedPaths.length, failedPaths.length, 0);

    return {
      success: failedPaths.length === 0,
      invalidatedPaths,
      failedPaths: failedPaths.length > 0 ? failedPaths : undefined,
    };
  }

  /**
   * Create a commit event from a writer flush result
   */
  createCommitEventFromFlush(
    table: string,
    partition: string,
    flushResult: FlushResult
  ): CDCCommitEvent {
    const affectedPaths: string[] = [];

    if (flushResult.block) {
      affectedPaths.push(flushResult.block.r2Key);
    }

    return {
      table,
      partition,
      snapshotId: flushResult.block?.id ?? `flush_${Date.now()}`,
      affectedPaths,
      timestamp: Date.now(),
      operation: 'write',
      metadata: flushResult.block
        ? {
            rowCount: flushResult.block.rowCount,
            sizeBytes: flushResult.block.sizeBytes,
            minLsn: flushResult.block.minLsn,
            maxLsn: flushResult.block.maxLsn,
          }
        : undefined,
    };
  }

  /**
   * Create a commit event from a compaction result
   */
  createCommitEventFromCompaction(
    table: string,
    partition: string,
    compactResult: CompactResult
  ): CDCCommitEvent {
    const affectedPaths: string[] = [...compactResult.blocksDeleted];

    if (compactResult.newBlock) {
      affectedPaths.push(compactResult.newBlock.r2Key);
    }

    return {
      table,
      partition,
      snapshotId: compactResult.newBlock?.id ?? `compact_${Date.now()}`,
      affectedPaths,
      timestamp: Date.now(),
      operation: 'compact',
      metadata: compactResult.newBlock
        ? {
            rowCount: compactResult.newBlock.rowCount,
            sizeBytes: compactResult.newBlock.sizeBytes,
            minLsn: compactResult.newBlock.minLsn,
            maxLsn: compactResult.newBlock.maxLsn,
            blocksMerged: compactResult.blocksMerged,
          }
        : { blocksMerged: compactResult.blocksMerged },
    };
  }

  /**
   * Get invalidation statistics
   */
  getStats(): InvalidationStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalCommits: 0,
      totalInvalidations: 0,
      successfulInvalidations: 0,
      failedInvalidations: 0,
      avgDurationMs: 0,
    };
    this.totalDurationMs = 0;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private getSortedHooks(): CacheInvalidationHook[] {
    return Array.from(this.hooks.values()).sort(
      (a, b) => (b.priority ?? 50) - (a.priority ?? 50)
    );
  }

  private queueEvent(event: CDCCommitEvent): void {
    this.pendingEvents.push(event);

    for (const path of event.affectedPaths) {
      this.pendingPaths.add(path);
    }

    // Start batch timer if not already running
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.flushPendingInvalidations().catch(console.error);
      }, this.batchWindow);
    }

    // Flush if batch size exceeded
    if (this.pendingPaths.size >= this.maxBatchSize) {
      this.flushPendingInvalidations().catch(console.error);
    }
  }

  private updateStats(
    successCount: number,
    failureCount: number,
    durationMs: number
  ): void {
    this.stats.totalInvalidations += successCount + failureCount;
    this.stats.successfulInvalidations += successCount;
    this.stats.failedInvalidations += failureCount;

    if (durationMs > 0) {
      this.totalDurationMs += durationMs;
      this.stats.avgDurationMs = this.totalDurationMs / this.stats.totalCommits;
    }

    this.stats.lastInvalidationAt = Date.now();
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a cache invalidation manager instance
 *
 * @param options - Manager configuration options
 * @returns CacheInvalidationManager instance
 *
 * @example
 * ```typescript
 * const manager = createCacheInvalidationManager({
 *   strategy: 'eager',
 * });
 *
 * // Register custom hook
 * manager.registerHook({
 *   name: 'custom-invalidation',
 *   onCommit: async (event) => {
 *     // Custom invalidation logic
 *     return { success: true, invalidatedPaths: event.affectedPaths };
 *   },
 * });
 *
 * // Process commit event
 * await manager.onCommit({
 *   table: 'users',
 *   partition: 'year=2024',
 *   snapshotId: 'snap_001',
 *   affectedPaths: ['data/users/block.parquet'],
 *   timestamp: Date.now(),
 *   operation: 'write',
 * });
 * ```
 */
export function createCacheInvalidationManager(
  options?: InvalidationManagerConfig
): CacheInvalidationManager {
  return new CacheInvalidationManager(options);
}
