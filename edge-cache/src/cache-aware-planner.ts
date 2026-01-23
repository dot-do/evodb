/**
 * Cache-Aware Query Planner for EvoDB Edge Cache
 *
 * Provides intelligent query planning that considers cache state,
 * prefers cached partitions, and schedules background prefetch
 * for predicted-hot partitions.
 */

import type {
  CacheStatus,
  CacheAwareQueryPlan,
  PartitionInfo,
  CacheEntry,
  EdgeCacheConfig,
  PartitionMode,
} from './index.js';

import { DEFAULT_CONFIG, isWithinSizeLimit } from './index.js';
import { checkCacheStatus, warmPartition } from './prefetch.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Query context for planning
 */
export interface QueryContext {
  /** Table being queried */
  table: string;
  /** Partition filter predicates */
  predicates?: PartitionPredicate[];
  /** Columns being selected */
  selectedColumns?: string[];
  /** Expected row limit */
  limit?: number;
  /** Query priority (affects prefetch scheduling) */
  priority?: number;
}

/**
 * Partition filter predicate
 */
export interface PartitionPredicate {
  /** Column name */
  column: string;
  /** Operator */
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'between';
  /** Value(s) to compare */
  value: unknown;
  /** Upper bound for 'between' operator */
  upperValue?: unknown;
}

/**
 * Error information for prefetch failures
 */
export interface PrefetchError {
  /** Partition path that failed */
  partitionPath: string;
  /** Error that occurred */
  error: Error;
  /** Timestamp of the error */
  timestamp: Date;
  /** Operation that failed (e.g., 'warmPartition', 'checkCacheStatus') */
  operation: string;
}

/**
 * Error statistics for prefetch operations
 */
export interface PrefetchErrorStats {
  /** Total number of errors since last reset */
  totalErrors: number;
  /** Number of errors in the last minute */
  errorsLastMinute: number;
  /** Number of errors in the last hour */
  errorsLastHour: number;
  /** Recent errors (last 100) */
  recentErrors: PrefetchError[];
}

/**
 * Callback for handling prefetch errors
 */
export type PrefetchErrorCallback = (error: PrefetchError) => void;

/**
 * Options for the cache-aware planner
 */
export interface PlannerOptions {
  /** Edge cache configuration */
  config?: Partial<EdgeCacheConfig>;
  /** Cost multiplier for cache misses (higher = prefer cache more) */
  cacheMissCostMultiplier?: number;
  /** Minimum TTL remaining to consider a partition "safely cached" */
  minTtlThreshold?: number;
  /** Enable automatic background prefetch of predicted-hot partitions */
  enablePredictivePrefetch?: boolean;
  /** Partition mode for new prefetch operations */
  partitionMode?: PartitionMode;
  /** Callback for prefetch errors (called for each error) */
  onPrefetchError?: PrefetchErrorCallback;
  /** Enable verbose logging for prefetch operations */
  verboseLogging?: boolean;
  /** Maximum number of entries to track in access patterns (default: 10000) */
  maxAccessPatternEntries?: number;
  /** Maximum number of entries to track in cache entries (default: 10000) */
  maxCacheEntries?: number;
}

/**
 * Access pattern for hotness prediction
 */
interface AccessPattern {
  partitionPath: string;
  accessCount: number;
  lastAccessed: Date;
  totalLatencyMs: number;
  avgLatencyMs: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Maximum number of recent errors to keep */
const MAX_RECENT_ERRORS = 100;

/** Time window for "last minute" error count (in milliseconds) */
const ONE_MINUTE_MS = 60 * 1000;

/** Time window for "last hour" error count (in milliseconds) */
const ONE_HOUR_MS = 60 * 60 * 1000;

// ============================================================================
// CacheAwarePlanner Class
// ============================================================================

/**
 * Cache-aware query planner that optimizes partition selection
 * based on cache state and access patterns
 */
export class CacheAwarePlanner {
  private config: EdgeCacheConfig;
  private options: Required<Omit<PlannerOptions, 'onPrefetchError' | 'verboseLogging' | 'maxAccessPatternEntries' | 'maxCacheEntries'>> & {
    onPrefetchError?: PrefetchErrorCallback;
    verboseLogging: boolean;
    maxAccessPatternEntries: number;
    maxCacheEntries: number;
  };

  /** Cache entries tracking current cache state */
  private cacheEntries = new Map<string, CacheEntry>();

  /** Access patterns for hotness prediction */
  private accessPatterns = new Map<string, AccessPattern>();

  /** Background prefetch queue */
  private prefetchQueue = new Set<string>();

  /** Prefetch in progress */
  private prefetchInProgress = new Set<string>();

  /** Recent prefetch errors for tracking/debugging */
  private prefetchErrors: PrefetchError[] = [];

  /** Total error count since last reset */
  private totalErrorCount = 0;

  constructor(options: PlannerOptions = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...options.config,
    };

    this.options = {
      config: this.config,
      cacheMissCostMultiplier: options.cacheMissCostMultiplier ?? 10,
      minTtlThreshold: options.minTtlThreshold ?? 3600, // 1 hour
      enablePredictivePrefetch: options.enablePredictivePrefetch ?? true,
      partitionMode: options.partitionMode ?? 'standard',
      onPrefetchError: options.onPrefetchError,
      verboseLogging: options.verboseLogging ?? false,
      maxAccessPatternEntries: options.maxAccessPatternEntries ?? 10000,
      maxCacheEntries: options.maxCacheEntries ?? 10000,
    };
  }

  /**
   * Plan a query with cache awareness
   *
   * @param partitions - Available partitions for the query
   * @param context - Query context
   * @returns Cache-aware query plan
   *
   * @example
   * ```typescript
   * const planner = new CacheAwarePlanner();
   * const plan = await planner.plan(partitions, {
   *   table: 'users',
   *   predicates: [{ column: 'year', operator: 'eq', value: 2024 }]
   * });
   *
   * // Read from cache first
   * for (const p of plan.cachedPartitions) {
   *   await readFromCache(p);
   * }
   * // Then origin
   * for (const p of plan.originPartitions) {
   *   await readFromOrigin(p);
   * }
   * ```
   */
  async plan(
    partitions: PartitionInfo[],
    context: QueryContext
  ): Promise<CacheAwareQueryPlan> {
    // Filter partitions based on predicates
    const filteredPartitions = this.applyPredicates(partitions, context.predicates);

    // Check cache status for all filtered partitions
    const partitionStatuses = await Promise.all(
      filteredPartitions.map(async (p) => ({
        partition: p,
        status: await this.getCacheEntry(p.path),
      }))
    );

    // Categorize partitions
    const cachedPartitions: string[] = [];
    const originPartitions: string[] = [];
    const prefetchCandidates: string[] = [];

    for (const { partition, status } of partitionStatuses) {
      const isCached = status.status.cached &&
        (status.status.ttlRemaining ?? 0) >= this.options.minTtlThreshold;

      if (isCached) {
        cachedPartitions.push(partition.path);
      } else {
        originPartitions.push(partition.path);

        // Check if this partition should be prefetched
        if (this.shouldPrefetch(partition, status)) {
          prefetchCandidates.push(partition.path);
        }
      }

      // Record access for hotness tracking
      this.recordAccess(partition.path);
    }

    // Schedule background prefetch
    const prefetchQueue = this.options.enablePredictivePrefetch
      ? await this.schedulePrefetch(prefetchCandidates, context.priority ?? 50)
      : [];

    // Calculate estimated cost
    const estimatedCost = this.calculateCost(cachedPartitions, originPartitions);

    return {
      cachedPartitions,
      originPartitions,
      prefetchQueue,
      estimatedCost,
      fullyCached: originPartitions.length === 0,
    };
  }

  /**
   * Update cache state for a partition
   *
   * @param partitionPath - Partition path
   * @param status - New cache status
   */
  updateCacheState(partitionPath: string, status: CacheStatus): void {
    const existing = this.cacheEntries.get(partitionPath);
    const isNewEntry = !existing;

    this.cacheEntries.set(partitionPath, {
      partitionPath,
      status,
      lastAccessed: new Date(),
      accessCount: (existing?.accessCount ?? 0) + 1,
      hotnessScore: this.calculateHotness(partitionPath),
    });

    // Evict oldest entries if we've exceeded the limit (only on new entries)
    if (isNewEntry) {
      this.evictCacheEntriesIfNeeded();
    }
  }

  /**
   * Get the current cache entry for a partition
   *
   * @param partitionPath - Partition path
   * @returns Cache entry with status
   */
  async getCacheEntry(partitionPath: string): Promise<CacheEntry> {
    // Check if we have a recent entry
    const existing = this.cacheEntries.get(partitionPath);

    // If entry exists and was checked recently (within 60s), use it
    if (existing && (Date.now() - existing.lastAccessed.getTime()) < 60000) {
      return existing;
    }

    // Otherwise, check actual cache status
    const status = await checkCacheStatus(partitionPath);
    const isNewEntry = !existing;

    const entry: CacheEntry = {
      partitionPath,
      status,
      lastAccessed: new Date(),
      accessCount: (existing?.accessCount ?? 0) + 1,
      hotnessScore: this.calculateHotness(partitionPath),
    };

    this.cacheEntries.set(partitionPath, entry);

    // Evict oldest entries if we've exceeded the limit (only on new entries)
    if (isNewEntry) {
      this.evictCacheEntriesIfNeeded();
    }

    return entry;
  }

  /**
   * Get all cache entries
   */
  getCacheEntries(): Map<string, CacheEntry> {
    return new Map(this.cacheEntries);
  }

  /**
   * Get predicted-hot partitions that should be prefetched
   *
   * @param threshold - Hotness threshold (0-1)
   * @returns Partition paths predicted to be hot
   */
  getPredictedHotPartitions(threshold?: number): string[] {
    const hotThreshold = threshold ?? this.config.hotnessThreshold;

    return Array.from(this.cacheEntries.entries())
      .filter(([_, entry]) =>
        entry.hotnessScore >= hotThreshold && !entry.status.cached
      )
      .sort((a, b) => b[1].hotnessScore - a[1].hotnessScore)
      .map(([path]) => path);
  }

  /**
   * Get prefetch error statistics
   *
   * @returns Error statistics for monitoring and debugging
   */
  getPrefetchErrorStats(): PrefetchErrorStats {
    const now = Date.now();

    const errorsLastMinute = this.prefetchErrors.filter(
      (e) => now - e.timestamp.getTime() < ONE_MINUTE_MS
    ).length;

    const errorsLastHour = this.prefetchErrors.filter(
      (e) => now - e.timestamp.getTime() < ONE_HOUR_MS
    ).length;

    return {
      totalErrors: this.totalErrorCount,
      errorsLastMinute,
      errorsLastHour,
      recentErrors: [...this.prefetchErrors],
    };
  }

  /**
   * Clear prefetch error history
   */
  clearPrefetchErrors(): void {
    this.prefetchErrors = [];
    this.totalErrorCount = 0;
  }

  /**
   * Clear all tracked state
   */
  clear(): void {
    this.cacheEntries.clear();
    this.accessPatterns.clear();
    this.prefetchQueue.clear();
    this.prefetchInProgress.clear();
    this.prefetchErrors = [];
    this.totalErrorCount = 0;
  }

  /**
   * Get the current size of access patterns map (for monitoring)
   */
  getAccessPatternCount(): number {
    return this.accessPatterns.size;
  }

  /**
   * Get the current size of cache entries map (for monitoring)
   */
  getCacheEntryCount(): number {
    return this.cacheEntries.size;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Evict oldest entries from access patterns map using LRU strategy
   * Removes entries until we're under the configured limit
   */
  private evictAccessPatternsIfNeeded(): void {
    const maxEntries = this.options.maxAccessPatternEntries;
    if (this.accessPatterns.size <= maxEntries) {
      return;
    }

    // Sort by lastAccessed (oldest first) and evict
    const sortedEntries = Array.from(this.accessPatterns.entries())
      .sort((a, b) => a[1].lastAccessed.getTime() - b[1].lastAccessed.getTime());

    const entriesToEvict = sortedEntries.slice(0, this.accessPatterns.size - maxEntries);
    for (const [key] of entriesToEvict) {
      this.accessPatterns.delete(key);
    }
  }

  /**
   * Evict oldest entries from cache entries map using LRU strategy
   * Removes entries until we're under the configured limit
   */
  private evictCacheEntriesIfNeeded(): void {
    const maxEntries = this.options.maxCacheEntries;
    if (this.cacheEntries.size <= maxEntries) {
      return;
    }

    // Sort by lastAccessed (oldest first) and evict
    const sortedEntries = Array.from(this.cacheEntries.entries())
      .sort((a, b) => a[1].lastAccessed.getTime() - b[1].lastAccessed.getTime());

    const entriesToEvict = sortedEntries.slice(0, this.cacheEntries.size - maxEntries);
    for (const [key] of entriesToEvict) {
      this.cacheEntries.delete(key);
    }
  }

  /**
   * Record a prefetch error with full context
   */
  private recordPrefetchError(
    partitionPath: string,
    error: Error,
    operation: string
  ): void {
    const prefetchError: PrefetchError = {
      partitionPath,
      error,
      timestamp: new Date(),
      operation,
    };

    // Increment total count
    this.totalErrorCount++;

    // Add to recent errors (maintain max size)
    this.prefetchErrors.push(prefetchError);
    if (this.prefetchErrors.length > MAX_RECENT_ERRORS) {
      this.prefetchErrors.shift();
    }

    // Log the error to console for visibility
    console.error('[edge-cache] Prefetch error', { message: prefetchError.error.message });

    // Call user-provided error callback
    if (this.options.onPrefetchError) {
      try {
        this.options.onPrefetchError(prefetchError);
      } catch (callbackError) {
        // Log callback errors to prevent silent failures
        console.error('Error in onPrefetchError callback', callbackError);
      }
    }
  }

  /**
   * Apply partition predicates to filter partitions
   */
  private applyPredicates(
    partitions: PartitionInfo[],
    predicates?: PartitionPredicate[]
  ): PartitionInfo[] {
    if (!predicates || predicates.length === 0) {
      return partitions;
    }

    return partitions.filter((partition) => {
      for (const predicate of predicates) {
        const bounds = partition.bounds?.[predicate.column];
        if (!bounds) {
          // No bounds info, include partition (conservative)
          continue;
        }

        if (!this.matchesPredicate(bounds, predicate)) {
          return false;
        }
      }
      return true;
    });
  }

  /**
   * Check if partition bounds match a predicate
   */
  private matchesPredicate(
    bounds: { min: unknown; max: unknown },
    predicate: PartitionPredicate
  ): boolean {
    const { min, max } = bounds;
    const { operator, value, upperValue } = predicate;

    // Type-safe comparison helper
    const compare = (a: unknown, b: unknown): number => {
      if (typeof a === 'number' && typeof b === 'number') {
        return a - b;
      }
      if (typeof a === 'string' && typeof b === 'string') {
        return a.localeCompare(b);
      }
      // Fallback: coerce to string
      return String(a).localeCompare(String(b));
    };

    // For simplicity, assume numeric/string comparison
    switch (operator) {
      case 'eq':
        return compare(min, value) <= 0 && compare(value, max) <= 0;
      case 'ne':
        return !(min === value && max === value);
      case 'gt':
        return compare(max, value) > 0;
      case 'gte':
        return compare(max, value) >= 0;
      case 'lt':
        return compare(min, value) < 0;
      case 'lte':
        return compare(min, value) <= 0;
      case 'in':
        if (Array.isArray(value)) {
          return value.some((v) => compare(min, v) <= 0 && compare(v, max) <= 0);
        }
        return false;
      case 'between':
        return compare(max, value) >= 0 && compare(min, upperValue) <= 0;
      default:
        return true;
    }
  }

  /**
   * Record an access for hotness prediction
   */
  private recordAccess(partitionPath: string, latencyMs: number = 0): void {
    const existing = this.accessPatterns.get(partitionPath);

    if (existing) {
      existing.accessCount++;
      existing.lastAccessed = new Date();
      existing.totalLatencyMs += latencyMs;
      existing.avgLatencyMs = existing.totalLatencyMs / existing.accessCount;
    } else {
      this.accessPatterns.set(partitionPath, {
        partitionPath,
        accessCount: 1,
        lastAccessed: new Date(),
        totalLatencyMs: latencyMs,
        avgLatencyMs: latencyMs,
      });
      // Evict oldest entries if we've exceeded the limit
      this.evictAccessPatternsIfNeeded();
    }
  }

  /**
   * Calculate hotness score for a partition (0-1)
   */
  private calculateHotness(partitionPath: string): number {
    const pattern = this.accessPatterns.get(partitionPath);
    if (!pattern) {
      return 0;
    }

    // Factors:
    // 1. Access frequency (normalized by max)
    // 2. Recency (exponential decay)
    // 3. Average latency (higher latency = more benefit from caching)

    const maxAccesses = Math.max(
      1,
      ...Array.from(this.accessPatterns.values()).map((p) => p.accessCount)
    );
    const frequencyScore = pattern.accessCount / maxAccesses;

    const ageMs = Date.now() - pattern.lastAccessed.getTime();
    const ageHours = ageMs / (1000 * 60 * 60);
    const recencyScore = Math.exp(-ageHours / 24); // Decay over 24 hours

    // Latency score - higher latency means more benefit
    const latencyScore = Math.min(1, pattern.avgLatencyMs / 1000);

    // Weighted combination
    return (
      0.5 * frequencyScore +
      0.3 * recencyScore +
      0.2 * latencyScore
    );
  }

  /**
   * Determine if a partition should be prefetched
   */
  private shouldPrefetch(partition: PartitionInfo, entry: CacheEntry): boolean {
    // Don't prefetch if already cached with sufficient TTL
    if (entry.status.cached &&
        (entry.status.ttlRemaining ?? 0) >= this.options.minTtlThreshold) {
      return false;
    }

    // Don't prefetch if already in queue or in progress
    if (this.prefetchQueue.has(partition.path) ||
        this.prefetchInProgress.has(partition.path)) {
      return false;
    }

    // Check size limit
    if (!isWithinSizeLimit(partition.sizeBytes, this.options.partitionMode)) {
      return false;
    }

    // Prefetch if hotness exceeds threshold
    return entry.hotnessScore >= this.config.hotnessThreshold;
  }

  /**
   * Schedule background prefetch for partitions
   */
  private async schedulePrefetch(
    partitions: string[],
    priority: number
  ): Promise<string[]> {
    const scheduled: string[] = [];

    for (const path of partitions) {
      if (!this.prefetchQueue.has(path) && !this.prefetchInProgress.has(path)) {
        this.prefetchQueue.add(path);
        scheduled.push(path);

        // Start background prefetch (fire and forget, but with error tracking)
        this.executePrefetch(path, priority).catch((error) => {
          // This catch is a safety net - executePrefetch handles its own errors
          this.recordPrefetchError(
            path,
            error instanceof Error ? error : new Error(String(error)),
            'schedulePrefetch'
          );
        });
      }
    }

    return scheduled;
  }

  /**
   * Execute a single background prefetch
   */
  private async executePrefetch(partitionPath: string, priority: number): Promise<void> {
    this.prefetchQueue.delete(partitionPath);
    this.prefetchInProgress.add(partitionPath);

    try {
      // Verbose logging for prefetch operations
      if (this.options.verboseLogging) {
        console.log(`[edge-cache] Starting prefetch for ${partitionPath} with priority ${priority}`);
      }

      const success = await warmPartition(partitionPath, this.options.partitionMode);

      if (success) {

        // Update cache entry - this can also fail
        try {
          const status = await checkCacheStatus(partitionPath);
          this.updateCacheState(partitionPath, status);
        } catch (statusError) {
          // Log but don't fail - the prefetch itself succeeded
          this.recordPrefetchError(
            partitionPath,
            statusError instanceof Error ? statusError : new Error(String(statusError)),
            'checkCacheStatus'
          );
        }
      } else {
        // warmPartition returned false - this is a failure that was previously silent
        this.recordPrefetchError(
          partitionPath,
          new Error('warmPartition returned false - partition could not be warmed'),
          'warmPartition'
        );
      }
    } catch (error) {
      // Exception during warmPartition
      this.recordPrefetchError(
        partitionPath,
        error instanceof Error ? error : new Error(String(error)),
        'warmPartition'
      );
      throw error; // Re-throw so the outer catch in schedulePrefetch doesn't double-log
    } finally {
      this.prefetchInProgress.delete(partitionPath);
    }
  }

  /**
   * Calculate estimated cost for a query plan
   */
  private calculateCost(
    cachedPartitions: string[],
    originPartitions: string[]
  ): number {
    // Base cost: 1 per cached partition, multiplier per origin partition
    const cachedCost = cachedPartitions.length;
    const originCost = originPartitions.length * this.options.cacheMissCostMultiplier;

    return cachedCost + originCost;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a cache-aware query planner instance
 *
 * @param options - Planner options
 * @returns CacheAwarePlanner instance
 *
 * @example
 * ```typescript
 * const planner = createCacheAwarePlanner({
 *   config: { cdnBaseUrl: 'https://cdn.workers.do' },
 *   cacheMissCostMultiplier: 5,
 *   enablePredictivePrefetch: true,
 * });
 * ```
 */
export function createCacheAwarePlanner(options?: PlannerOptions): CacheAwarePlanner {
  return new CacheAwarePlanner(options);
}
