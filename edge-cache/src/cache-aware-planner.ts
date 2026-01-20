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

import { DEFAULT_CONFIG, DEFAULT_TTL, isWithinSizeLimit } from './index.js';
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
// CacheAwarePlanner Class
// ============================================================================

/**
 * Cache-aware query planner that optimizes partition selection
 * based on cache state and access patterns
 */
export class CacheAwarePlanner {
  private config: EdgeCacheConfig;
  private options: Required<PlannerOptions>;

  /** Cache entries tracking current cache state */
  private cacheEntries = new Map<string, CacheEntry>();

  /** Access patterns for hotness prediction */
  private accessPatterns = new Map<string, AccessPattern>();

  /** Background prefetch queue */
  private prefetchQueue = new Set<string>();

  /** Prefetch in progress */
  private prefetchInProgress = new Set<string>();

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

    this.cacheEntries.set(partitionPath, {
      partitionPath,
      status,
      lastAccessed: new Date(),
      accessCount: (existing?.accessCount ?? 0) + 1,
      hotnessScore: this.calculateHotness(partitionPath),
    });
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

    const entry: CacheEntry = {
      partitionPath,
      status,
      lastAccessed: new Date(),
      accessCount: (existing?.accessCount ?? 0) + 1,
      hotnessScore: this.calculateHotness(partitionPath),
    };

    this.cacheEntries.set(partitionPath, entry);
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
   * Clear all tracked state
   */
  clear(): void {
    this.cacheEntries.clear();
    this.accessPatterns.clear();
    this.prefetchQueue.clear();
    this.prefetchInProgress.clear();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

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

        // Start background prefetch (fire and forget)
        this.executePrefetch(path, priority).catch((error) => {
          console.error(`Background prefetch failed for ${path}:`, error);
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
      const success = await warmPartition(partitionPath, this.options.partitionMode);

      if (success) {
        // Update cache entry
        const status = await checkCacheStatus(partitionPath);
        this.updateCacheState(partitionPath, status);
      }
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
