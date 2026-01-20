/**
 * EvoDB Edge Cache Integration
 *
 * Provides edge caching capabilities for EvoDB with cdn.workers.do,
 * supporting up to 5GB file sizes in enterprise mode.
 *
 * @module @evodb/edge-cache
 */


// ============================================================================
// Types
// ============================================================================

/**
 * Partition mode determining max file size limits
 */
export type PartitionMode = 'standard' | 'enterprise';

/**
 * Cache status for a partition
 */
export interface CacheStatus {
  /** Whether the partition is currently cached */
  cached: boolean;
  /** Time when the partition was cached (if cached) */
  cachedAt?: Date;
  /** Time-to-live remaining in seconds (if cached) */
  ttlRemaining?: number;
  /** Size of the cached partition in bytes */
  sizeBytes?: number;
  /** Cache hit count since last cache fill */
  hitCount?: number;
  /** Edge location where partition is cached */
  edgeLocation?: string;
}

/**
 * Options for prefetching datasets
 */
export interface PrefetchOptions {
  /** Partition mode: standard (500MB max) or enterprise (5GB max) */
  mode?: PartitionMode;
  /** Specific partitions to prefetch (if not provided, prefetches all) */
  partitions?: string[];
  /** Priority for prefetching (0-100, higher is more urgent) */
  priority?: number;
  /** Custom TTL in seconds (default: 86400 = 24 hours) */
  ttl?: number;
  /** Whether to wait for prefetch to complete */
  waitForCompletion?: boolean;
  /** Callback for progress updates */
  onProgress?: (progress: PrefetchProgress) => void;
}

/**
 * Progress information during prefetch operations
 */
export interface PrefetchProgress {
  /** Total number of partitions to prefetch */
  total: number;
  /** Number of partitions completed */
  completed: number;
  /** Number of partitions failed */
  failed: number;
  /** Current partition being processed */
  currentPartition?: string;
  /** Bytes transferred so far */
  bytesTransferred: number;
  /** Total bytes to transfer */
  totalBytes: number;
}

/**
 * Result of a prefetch operation
 */
export interface PrefetchResult {
  /** Whether the prefetch was successful */
  success: boolean;
  /** Number of partitions successfully cached */
  cachedCount: number;
  /** Number of partitions that failed to cache */
  failedCount: number;
  /** Partitions that failed with error details */
  failures: Array<{ partition: string; error: string }>;
  /** Total time taken in milliseconds */
  durationMs: number;
  /** Total bytes cached */
  totalBytes: number;
}

/**
 * Query plan with cache awareness
 */
export interface CacheAwareQueryPlan {
  /** Partitions to read from cache */
  cachedPartitions: string[];
  /** Partitions to read from origin */
  originPartitions: string[];
  /** Partitions queued for background prefetch */
  prefetchQueue: string[];
  /** Estimated cost score (lower is better) */
  estimatedCost: number;
  /** Whether query can be fully served from cache */
  fullyCached: boolean;
}

/**
 * Partition information for planning
 */
export interface PartitionInfo {
  /** Partition path */
  path: string;
  /** Size in bytes */
  sizeBytes: number;
  /** Estimated row count */
  rowCount?: number;
  /** Min/max values for partition columns */
  bounds?: Record<string, { min: unknown; max: unknown }>;
  /** Last modified timestamp */
  lastModified?: Date;
}

/**
 * Cache entry for tracking partition cache state
 */
export interface CacheEntry {
  /** Partition path */
  partitionPath: string;
  /** Cache status */
  status: CacheStatus;
  /** Last access time */
  lastAccessed: Date;
  /** Access count */
  accessCount: number;
  /** Predicted hotness score (0-1) */
  hotnessScore: number;
}

/**
 * Configuration for the edge cache
 */
export interface EdgeCacheConfig {
  /** Base URL for cdn.workers.do */
  cdnBaseUrl: string;
  /** Default partition mode */
  defaultMode: PartitionMode;
  /** Default TTL in seconds */
  defaultTtl: number;
  /** Maximum concurrent prefetch operations */
  maxConcurrentPrefetch: number;
  /** Enable automatic background prefetch */
  enableBackgroundPrefetch: boolean;
  /** Hotness threshold for background prefetch (0-1) */
  hotnessThreshold: number;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Maximum file size limits by partition mode
 */
export const MAX_FILE_SIZE: Record<PartitionMode, number> = {
  standard: 500 * 1024 * 1024, // 500MB
  enterprise: 5 * 1024 * 1024 * 1024, // 5GB
};

/**
 * Default cache TTL in seconds (24 hours)
 */
export const DEFAULT_TTL = 86400;

/**
 * Default CDN base URL
 */
export const DEFAULT_CDN_BASE_URL = 'https://cdn.workers.do';

/**
 * Default maximum concurrent prefetch operations
 */
export const DEFAULT_MAX_CONCURRENT_PREFETCH = 5;

/**
 * Default edge cache configuration
 */
export const DEFAULT_CONFIG: EdgeCacheConfig = {
  cdnBaseUrl: DEFAULT_CDN_BASE_URL,
  defaultMode: 'standard',
  defaultTtl: DEFAULT_TTL,
  maxConcurrentPrefetch: DEFAULT_MAX_CONCURRENT_PREFETCH,
  enableBackgroundPrefetch: true,
  hotnessThreshold: 0.7,
};

// ============================================================================
// Cache Headers
// ============================================================================

/**
 * Generate cache headers for a partition
 *
 * @param table - Table name
 * @param partition - Partition identifier
 * @param ttl - Time-to-live in seconds (default: 86400)
 * @returns Cache headers object
 */
export function getCacheHeaders(
  table: string,
  partition: string,
  ttl: number = DEFAULT_TTL
): Record<string, string> {
  return {
    'Cache-Control': `public, max-age=${ttl}`,
    'CF-Cache-Tag': `evodb:${table}:${partition}`,
  };
}

/**
 * Generate versioned cache headers for a partition.
 * Includes snapshot version to prevent stale reads.
 *
 * @param table - Table name
 * @param partition - Partition identifier
 * @param snapshotId - Snapshot version for cache key versioning
 * @param ttl - Time-to-live in seconds (default: 86400)
 * @returns Cache headers object with version info
 */
export function getVersionedCacheHeaders(
  table: string,
  partition: string,
  snapshotId: string,
  ttl: number = DEFAULT_TTL
): Record<string, string> {
  return {
    'Cache-Control': `public, max-age=${ttl}`,
    'CF-Cache-Tag': `evodb:${table}:${partition}`,
    'X-EvoDB-Snapshot': snapshotId,
  };
}

/**
 * Parse cache tags from header value
 *
 * @param cfCacheTag - CF-Cache-Tag header value
 * @returns Parsed cache tag components
 */
export function parseCacheTag(cfCacheTag: string): {
  namespace: string;
  table: string;
  partition: string;
} | null {
  const parts = cfCacheTag.split(':');
  if (parts.length !== 3 || parts[0] !== 'evodb') {
    return null;
  }
  return {
    namespace: parts[0],
    table: parts[1],
    partition: parts[2],
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a file size is within the limit for a partition mode
 *
 * @param sizeBytes - File size in bytes
 * @param mode - Partition mode
 * @returns True if size is within limit
 */
export function isWithinSizeLimit(
  sizeBytes: number,
  mode: PartitionMode
): boolean {
  return sizeBytes <= MAX_FILE_SIZE[mode];
}

/**
 * Get the appropriate partition mode for a file size
 *
 * @param sizeBytes - File size in bytes
 * @returns Partition mode that supports the file size, or null if too large
 */
export function getRequiredMode(sizeBytes: number): PartitionMode | null {
  if (sizeBytes <= MAX_FILE_SIZE.standard) {
    return 'standard';
  }
  if (sizeBytes <= MAX_FILE_SIZE.enterprise) {
    return 'enterprise';
  }
  return null;
}

/**
 * Format bytes to human-readable string
 *
 * @param bytes - Number of bytes
 * @returns Formatted string (e.g., "1.5 GB")
 */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unitIndex = 0;
  let size = bytes;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

// ============================================================================
// Re-exports
// ============================================================================

export {
  prefetchDataset,
  warmPartition,
  checkCacheStatus,
  invalidatePartition,
  invalidateTable,
  createPrefetcher,
  type Prefetcher,
} from './prefetch.js';

export {
  CacheAwarePlanner,
  createCacheAwarePlanner,
  type QueryContext,
  type PlannerOptions,
  type PrefetchError,
  type PrefetchErrorStats,
  type PrefetchErrorCallback,
} from './cache-aware-planner.js';

export {
  CacheInvalidationManager,
  createCacheInvalidationManager,
  setFetchFunction as setInvalidationFetchFunction,
  resetFetchFunction as resetInvalidationFetchFunction,
  type CacheInvalidationHook,
  type CDCCommitEvent,
  type CDCOperation,
  type InvalidationResult,
  type InvalidationScope,
  type InvalidationLevel,
  type InvalidationStrategy,
  type InvalidationManagerConfig,
  type InvalidationStats,
  type HookResult,
} from './cache-invalidation.js';
