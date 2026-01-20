/**
 * @evodb/query - Cache-Aware Query Planner
 *
 * A query planner that considers cached data when planning queries.
 * It prefers queries that can use cached blocks to minimize I/O costs.
 *
 * Features:
 * - Reorders partitions to prioritize cached blocks
 * - Adjusts cost estimates based on cache status
 * - Provides prefetch recommendations
 * - Tracks cache-aware planning statistics
 */

import type {
  Query,
  QueryEngineConfig,
  PartitionInfo,
} from './types.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration for cache-aware query planning.
 */
export interface CacheAwarePlanConfig {
  /** Enable cache-aware planning */
  enabled: boolean;

  /**
   * Cost reduction factor for cached partitions (0.0 - 1.0).
   * E.g., 0.5 means cached partitions have 50% the cost of non-cached.
   */
  cacheWeightFactor: number;

  /**
   * Maximum distance (in positions) a partition can be reordered.
   * Limits how much the original order is disrupted.
   */
  maxReorderDistance: number;

  /**
   * Cache ratio threshold for prefetch recommendation.
   * If cache ratio is above this, recommend prefetching remaining partitions.
   */
  prefetchThreshold: number;
}

/**
 * Statistics about cache benefit for a set of partitions.
 */
export interface CacheBenefitStats {
  /** Number of cached partitions */
  cachedPartitions: number;

  /** Total number of partitions */
  totalPartitions: number;

  /** Ratio of cached partitions (0.0 - 1.0) */
  cacheRatio: number;

  /** Estimated I/O savings from cache in bytes */
  estimatedSavings: number;
}

/**
 * Cache statistics for a plan.
 */
export interface PlanCacheStats {
  /** Number of cached partitions */
  cachedPartitions: number;

  /** Total number of partitions */
  totalPartitions: number;

  /** Total bytes in cached partitions */
  cachedBytes: number;

  /** Total bytes in uncached partitions */
  uncachedBytes: number;

  /** Ratio of cached partitions (0.0 - 1.0) */
  cacheRatio: number;
}

/**
 * A cache-aware query plan.
 */
export interface CacheAwarePlan {
  /** The original query */
  query: Query;

  /** Partitions ordered by cache priority */
  orderedPartitions: PartitionInfo[];

  /** Whether partitions were reordered for cache optimization */
  isReordered: boolean;

  /** Cache statistics for the plan */
  cacheStats: PlanCacheStats;

  /** Estimated total cost (cache-adjusted) */
  estimatedCost: number;

  /** Plan creation timestamp */
  createdAt: number;
}

/**
 * Prefetch recommendation.
 */
export interface PrefetchRecommendation {
  /** Whether prefetching is recommended */
  shouldPrefetch: boolean;

  /** Partitions that should be prefetched */
  partitionsToPrefetch: PartitionInfo[];

  /** Estimated cost of prefetching (bytes) */
  estimatedPrefetchCost: number;

  /** Current cache ratio */
  currentCacheRatio: number;
}

/**
 * Statistics about cache-aware planning operations.
 */
export interface CacheAwarePlanStats {
  /** Total plans created */
  plansCreated: number;

  /** Plans that were reordered */
  plansReordered: number;

  /** Average cache ratio across all plans */
  averageCacheRatio: number;

  /** Total cached bytes encountered */
  totalCachedBytes: number;

  /** Total uncached bytes encountered */
  totalUncachedBytes: number;
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CACHE_AWARE_CONFIG: CacheAwarePlanConfig = {
  enabled: true,
  cacheWeightFactor: 0.5,
  maxReorderDistance: 3,
  prefetchThreshold: 0.7,
};

// =============================================================================
// CacheAwareQueryPlanner Implementation
// =============================================================================

/**
 * Cache-Aware Query Planner
 *
 * Considers cached data when planning queries and prefers queries
 * that can use cached blocks to minimize I/O costs.
 *
 * @example
 * ```typescript
 * const planner = new CacheAwareQueryPlanner(config);
 *
 * // Create a cache-aware plan
 * const plan = planner.createCacheAwarePlan(query, partitions);
 *
 * // Get prefetch recommendations
 * const rec = planner.getPrefetchRecommendation(partitions);
 * if (rec.shouldPrefetch) {
 *   await prefetchPartitions(rec.partitionsToPrefetch);
 * }
 * ```
 */
export class CacheAwareQueryPlanner {
  private readonly config: CacheAwarePlanConfig;
  private readonly cacheEnabled: boolean;
  private readonly explicitlyConfigured: boolean;

  // Statistics tracking
  private stats: CacheAwarePlanStats = {
    plansCreated: 0,
    plansReordered: 0,
    averageCacheRatio: 0,
    totalCachedBytes: 0,
    totalUncachedBytes: 0,
  };

  constructor(engineConfig: QueryEngineConfig & { cacheAwarePlanning?: CacheAwarePlanConfig }) {
    // Track if cache-aware planning was explicitly configured
    this.explicitlyConfigured = engineConfig.cacheAwarePlanning !== undefined;
    this.config = engineConfig.cacheAwarePlanning ?? DEFAULT_CACHE_AWARE_CONFIG;
    this.cacheEnabled = engineConfig.cache?.enabled ?? false;
  }

  /**
   * Check if cache-aware planning is enabled.
   * Requires both explicit configuration and cache to be enabled.
   */
  isEnabled(): boolean {
    return this.explicitlyConfigured && this.config.enabled && this.cacheEnabled;
  }

  /**
   * Reorder partitions to prioritize cached ones.
   *
   * Cached partitions are moved towards the front, but respecting
   * the maxReorderDistance limit to avoid excessive disruption.
   */
  reorderByCache(partitions: PartitionInfo[]): PartitionInfo[] {
    if (!this.isEnabled() || partitions.length <= 1) {
      return [...partitions];
    }

    const result: PartitionInfo[] = [];
    const cached: PartitionInfo[] = [];
    const nonCached: PartitionInfo[] = [];

    // Separate cached and non-cached partitions while tracking original indices
    const partitionsWithIndex = partitions.map((p, index) => ({ partition: p, originalIndex: index }));

    for (const item of partitionsWithIndex) {
      if (item.partition.isCached) {
        cached.push(item.partition);
      } else {
        nonCached.push(item.partition);
      }
    }

    // Apply maxReorderDistance constraint
    if (this.config.maxReorderDistance > 0 && this.config.maxReorderDistance < partitions.length) {
      // Use a more conservative reordering that respects max distance
      return this.reorderWithDistanceLimit(partitions, this.config.maxReorderDistance);
    }

    // Full reordering: cached first, then non-cached
    result.push(...cached);
    result.push(...nonCached);

    return result;
  }

  /**
   * Reorder partitions with a maximum reorder distance constraint.
   */
  private reorderWithDistanceLimit(partitions: PartitionInfo[], maxDistance: number): PartitionInfo[] {
    const result = [...partitions];

    // Bubble up cached partitions, but only by maxDistance positions
    for (let i = 1; i < result.length; i++) {
      if (result[i].isCached) {
        // Find how far up this partition can move
        let targetIndex = Math.max(0, i - maxDistance);

        // Find the first position >= targetIndex that is not cached
        while (targetIndex < i && result[targetIndex].isCached) {
          targetIndex++;
        }

        if (targetIndex < i) {
          // Move the cached partition up
          const cached = result.splice(i, 1)[0];
          result.splice(targetIndex, 0, cached);
        }
      }
    }

    return result;
  }

  /**
   * Estimate the cost of reading a partition.
   * Cached partitions have reduced cost based on cacheWeightFactor.
   */
  estimatePartitionCost(partition: PartitionInfo): number {
    const baseCost = partition.sizeBytes;

    if (partition.isCached) {
      return baseCost * this.config.cacheWeightFactor;
    }

    return baseCost;
  }

  /**
   * Calculate the total cost for a set of partitions.
   */
  calculateTotalCost(partitions: PartitionInfo[]): number {
    return partitions.reduce((sum, p) => sum + this.estimatePartitionCost(p), 0);
  }

  /**
   * Estimate the cache benefit for a set of partitions.
   */
  estimateCacheBenefit(partitions: PartitionInfo[]): CacheBenefitStats {
    if (partitions.length === 0) {
      return {
        cachedPartitions: 0,
        totalPartitions: 0,
        cacheRatio: 0,
        estimatedSavings: 0,
      };
    }

    const cachedPartitions = partitions.filter(p => p.isCached);
    const cachedBytes = cachedPartitions.reduce((sum, p) => sum + p.sizeBytes, 0);
    const totalBytes = partitions.reduce((sum, p) => sum + p.sizeBytes, 0);

    // Savings = bytes that don't need to be read from storage
    const estimatedSavings = cachedBytes * (1 - this.config.cacheWeightFactor);

    return {
      cachedPartitions: cachedPartitions.length,
      totalPartitions: partitions.length,
      cacheRatio: cachedPartitions.length / partitions.length,
      estimatedSavings,
    };
  }

  /**
   * Create a cache-aware execution plan for a query.
   */
  createCacheAwarePlan(query: Query, partitions: PartitionInfo[]): CacheAwarePlan {
    const createdAt = Date.now();

    // Check if cache-aware planning should be skipped
    const shouldSkip = !this.isEnabled() || query.hints?.forceScan;

    // Calculate cache statistics
    const cachedPartitions = partitions.filter(p => p.isCached);
    const uncachedPartitions = partitions.filter(p => !p.isCached);
    const cachedBytes = cachedPartitions.reduce((sum, p) => sum + p.sizeBytes, 0);
    const uncachedBytes = uncachedPartitions.reduce((sum, p) => sum + p.sizeBytes, 0);
    const cacheRatio = partitions.length > 0 ? cachedPartitions.length / partitions.length : 0;

    // Reorder partitions if enabled and beneficial
    let orderedPartitions: PartitionInfo[];
    let isReordered = false;

    if (shouldSkip) {
      orderedPartitions = [...partitions];
    } else {
      orderedPartitions = this.reorderByCache(partitions);

      // Check if reordering actually changed anything
      isReordered = this.hasOrderChanged(partitions, orderedPartitions);
    }

    // Calculate estimated cost
    const estimatedCost = this.calculateTotalCost(orderedPartitions);

    // Update statistics
    this.updateStats(cachedBytes, uncachedBytes, cacheRatio, isReordered);

    const plan: CacheAwarePlan = {
      query,
      orderedPartitions,
      isReordered,
      cacheStats: {
        cachedPartitions: cachedPartitions.length,
        totalPartitions: partitions.length,
        cachedBytes,
        uncachedBytes,
        cacheRatio,
      },
      estimatedCost,
      createdAt,
    };

    return plan;
  }

  /**
   * Check if the order of partitions changed after reordering.
   */
  private hasOrderChanged(original: PartitionInfo[], reordered: PartitionInfo[]): boolean {
    if (original.length !== reordered.length) {
      return true;
    }

    for (let i = 0; i < original.length; i++) {
      if (original[i].path !== reordered[i].path) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get prefetch recommendation for a set of partitions.
   */
  getPrefetchRecommendation(partitions: PartitionInfo[]): PrefetchRecommendation {
    if (partitions.length === 0) {
      return {
        shouldPrefetch: false,
        partitionsToPrefetch: [],
        estimatedPrefetchCost: 0,
        currentCacheRatio: 0,
      };
    }

    const cachedCount = partitions.filter(p => p.isCached).length;
    const currentCacheRatio = cachedCount / partitions.length;

    // Only recommend prefetch if cache ratio is above threshold
    const shouldPrefetch = currentCacheRatio >= this.config.prefetchThreshold && currentCacheRatio < 1;

    const partitionsToPrefetch = shouldPrefetch
      ? partitions.filter(p => !p.isCached)
      : [];

    const estimatedPrefetchCost = partitionsToPrefetch.reduce((sum, p) => sum + p.sizeBytes, 0);

    return {
      shouldPrefetch,
      partitionsToPrefetch,
      estimatedPrefetchCost,
      currentCacheRatio,
    };
  }

  /**
   * Update internal statistics.
   */
  private updateStats(cachedBytes: number, uncachedBytes: number, cacheRatio: number, isReordered: boolean): void {
    this.stats.plansCreated++;

    if (isReordered) {
      this.stats.plansReordered++;
    }

    this.stats.totalCachedBytes += cachedBytes;
    this.stats.totalUncachedBytes += uncachedBytes;

    // Calculate running average of cache ratio
    this.stats.averageCacheRatio =
      ((this.stats.averageCacheRatio * (this.stats.plansCreated - 1)) + cacheRatio) / this.stats.plansCreated;
  }

  /**
   * Get cache-aware planning statistics.
   */
  getStats(): CacheAwarePlanStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics.
   */
  resetStats(): void {
    this.stats = {
      plansCreated: 0,
      plansReordered: 0,
      averageCacheRatio: 0,
      totalCachedBytes: 0,
      totalUncachedBytes: 0,
    };
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a cache-aware query planner.
 */
export function createCacheAwareQueryPlanner(
  config: QueryEngineConfig & { cacheAwarePlanning?: CacheAwarePlanConfig }
): CacheAwareQueryPlanner {
  return new CacheAwareQueryPlanner(config);
}
