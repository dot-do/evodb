/**
 * Prefetch Implementation for EvoDB Edge Cache
 *
 * Provides functions to prefetch datasets and partitions to the edge cache,
 * check cache status, and manage cache invalidation.
 */

import type {
  CacheStatus,
  PrefetchOptions,
  PrefetchResult,
  PrefetchProgress,
  PartitionMode,
  EdgeCacheConfig,
} from './index.js';

import {
  DEFAULT_CONFIG,
  DEFAULT_TTL,
  
  
  isWithinSizeLimit,
} from './index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Prefetcher instance for managing cache operations
 */
export interface Prefetcher {
  /** Configuration */
  config: EdgeCacheConfig;

  /** Prefetch an entire dataset */
  prefetchDataset(table: string, options?: PrefetchOptions): Promise<PrefetchResult>;

  /** Warm a single partition */
  warmPartition(partitionPath: string, mode?: PartitionMode): Promise<boolean>;

  /** Check cache status for a partition */
  checkCacheStatus(partitionPath: string): Promise<CacheStatus>;

  /** Invalidate a partition from cache */
  invalidatePartition(partitionPath: string): Promise<boolean>;

  /** Invalidate all partitions for a table */
  invalidateTable(table: string): Promise<number>;

  /** Get all cached partitions */
  getCachedPartitions(): Map<string, CacheStatus>;
}

/**
 * Internal fetch function type (for dependency injection in tests)
 */
export type FetchFunction = typeof fetch;

// ============================================================================
// Types for Error Logging
// ============================================================================

/**
 * Structured log format for cache errors
 */
export interface CacheErrorLog {
  /** Operation type: get, put, or delete */
  operation: 'get' | 'put' | 'delete';
  /** Cache key (partition path or table identifier) */
  key: string;
  /** Error message */
  error: string;
  /** Timestamp of the error */
  timestamp: number;
}

/**
 * Metrics for cache errors
 */
export interface CacheErrorMetrics {
  /** Total number of errors */
  totalErrors: number;
  /** Errors by operation type */
  errorsByOperation: {
    get: number;
    put: number;
    delete: number;
  };
}

// ============================================================================
// Internal State
// ============================================================================

/**
 * Default maximum entries for the cache status map
 */
const DEFAULT_MAX_CACHE_STATUS_ENTRIES = 10000;

/**
 * Maximum entries for the cache status map (configurable via setCacheStatusMapMaxSize)
 */
let maxCacheStatusEntries = DEFAULT_MAX_CACHE_STATUS_ENTRIES;

/**
 * In-memory cache status tracking with LRU eviction
 * Maps partition path to cache status
 */
const cacheStatusMap = new Map<string, CacheStatus>();

/**
 * Default fetch function (can be overridden for testing)
 */
let fetchFn: FetchFunction = globalThis.fetch;

/**
 * Cache error metrics tracking
 */
let cacheErrorMetrics: CacheErrorMetrics = {
  totalErrors: 0,
  errorsByOperation: {
    get: 0,
    put: 0,
    delete: 0,
  },
};

/**
 * Set the fetch function (for testing)
 */
export function setFetchFunction(fn: FetchFunction): void {
  fetchFn = fn;
}

/**
 * Reset the fetch function to default
 */
export function resetFetchFunction(): void {
  fetchFn = globalThis.fetch;
}

/**
 * Clear the cache status map (for testing)
 */
export function clearCacheStatusMap(): void {
  cacheStatusMap.clear();
}

/**
 * Get cache error metrics
 */
export function getCacheErrorMetrics(): CacheErrorMetrics {
  return {
    totalErrors: cacheErrorMetrics.totalErrors,
    errorsByOperation: { ...cacheErrorMetrics.errorsByOperation },
  };
}

/**
 * Reset cache error metrics (for testing)
 */
export function resetCacheErrorMetrics(): void {
  cacheErrorMetrics = {
    totalErrors: 0,
    errorsByOperation: {
      get: 0,
      put: 0,
      delete: 0,
    },
  };
}

/**
 * Log a cache error with structured format and increment metrics
 *
 * @param operation - The cache operation type (get, put, delete)
 * @param key - The cache key (partition path or table identifier)
 * @param error - The error that occurred
 */
function logCacheError(
  operation: 'get' | 'put' | 'delete',
  key: string,
  error: unknown
): void {
  // Increment metrics
  cacheErrorMetrics.totalErrors++;
  cacheErrorMetrics.errorsByOperation[operation]++;

  // Extract error message
  let errorMessage: string;
  if (error instanceof Error) {
    errorMessage = error.message;
  } else if (error === undefined || error === null) {
    errorMessage = 'Unknown error';
  } else {
    errorMessage = String(error);
  }

  // Create structured log entry for metrics tracking
  const _logEntry: CacheErrorLog = {
    operation,
    key,
    error: errorMessage,
    timestamp: Date.now(),
  };

  // Error is tracked in metrics above
  // Note: In production, use @evodb/observability logger for structured logging
}

/**
 * Set the maximum number of entries in the cache status map
 * @param maxSize - Maximum number of entries (default: 10000)
 */
export function setCacheStatusMapMaxSize(maxSize: number): void {
  maxCacheStatusEntries = maxSize;
  // Evict if current size exceeds new max
  evictCacheStatusEntriesIfNeeded();
}

/**
 * Get the current maximum cache status map size
 */
export function getCacheStatusMapMaxSize(): number {
  return maxCacheStatusEntries;
}

/**
 * Get the current cache status map size
 */
export function getCacheStatusMapSize(): number {
  return cacheStatusMap.size;
}

/**
 * Evict oldest entries from cache status map using LRU strategy
 * (Map maintains insertion order, so first entries are oldest)
 */
function evictCacheStatusEntriesIfNeeded(): void {
  // Use >= because this is called BEFORE adding the new entry
  while (cacheStatusMap.size >= maxCacheStatusEntries) {
    const oldestKey = cacheStatusMap.keys().next().value;
    if (oldestKey !== undefined) {
      cacheStatusMap.delete(oldestKey);
    } else {
      break;
    }
  }
}

/**
 * Set a cache status entry with LRU behavior
 * Moves existing entries to end, evicts oldest if at capacity
 */
function setCacheStatusEntry(partitionPath: string, status: CacheStatus): void {
  // If key already exists, delete it first to update its position (LRU)
  if (cacheStatusMap.has(partitionPath)) {
    cacheStatusMap.delete(partitionPath);
  } else {
    // Evict oldest entries if cache is at capacity
    evictCacheStatusEntriesIfNeeded();
  }
  cacheStatusMap.set(partitionPath, status);
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Prefetch an entire dataset to the edge cache
 *
 * @param table - Table name to prefetch
 * @param options - Prefetch options
 * @returns Prefetch result with success/failure details
 *
 * @example
 * ```typescript
 * const result = await prefetchDataset('users', {
 *   mode: 'standard',
 *   priority: 50,
 *   onProgress: (p) => console.log(`${p.completed}/${p.total} done`)
 * });
 * ```
 */
export async function prefetchDataset(
  table: string,
  options: PrefetchOptions = {}
): Promise<PrefetchResult> {
  const startTime = Date.now();
  const {
    mode = 'standard',
    partitions = [],
    priority = 50,
    ttl = DEFAULT_TTL,
    waitForCompletion = true,
    onProgress,
  } = options;

  const config = DEFAULT_CONFIG;
  const results: Array<{ partition: string; success: boolean; error?: string; bytes?: number }> = [];

  // If no specific partitions provided, discover them
  const partitionsToFetch = partitions.length > 0
    ? partitions
    : await discoverPartitions(table, config);

  const progress: PrefetchProgress = {
    total: partitionsToFetch.length,
    completed: 0,
    failed: 0,
    bytesTransferred: 0,
    totalBytes: 0,
  };

  // Prefetch partitions with concurrency control
  const concurrency = config.maxConcurrentPrefetch;
  const chunks = chunkArray(partitionsToFetch, concurrency);

  for (const chunk of chunks) {
    const chunkPromises = chunk.map(async (partitionPath) => {
      progress.currentPartition = partitionPath;
      onProgress?.(progress);

      try {
        const success = await warmPartitionInternal(
          partitionPath,
          mode,
          ttl,
          priority,
          config
        );

        if (success) {
          const status = cacheStatusMap.get(partitionPath);
          const bytes = status?.sizeBytes ?? 0;
          progress.completed++;
          progress.bytesTransferred += bytes;
          results.push({ partition: partitionPath, success: true, bytes });
        } else {
          progress.failed++;
          results.push({ partition: partitionPath, success: false, error: 'Failed to warm partition' });
        }
      } catch (error) {
        progress.failed++;
        results.push({
          partition: partitionPath,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      onProgress?.(progress);
    });

    if (waitForCompletion) {
      await Promise.all(chunkPromises);
    }
  }

  const durationMs = Date.now() - startTime;

  return {
    success: progress.failed === 0,
    cachedCount: progress.completed,
    failedCount: progress.failed,
    failures: results
      .filter((r) => !r.success)
      .map((r) => ({ partition: r.partition, error: r.error ?? 'Unknown error' })),
    durationMs,
    totalBytes: progress.bytesTransferred,
  };
}

/**
 * Warm a single partition to the edge cache
 *
 * @param partitionPath - Path to the partition
 * @param mode - Partition mode (standard or enterprise)
 * @returns True if partition was successfully warmed
 *
 * @example
 * ```typescript
 * const success = await warmPartition('data/users/year=2024/month=01/data.parquet');
 * ```
 */
export async function warmPartition(
  partitionPath: string,
  mode: PartitionMode = 'standard'
): Promise<boolean> {
  return warmPartitionInternal(partitionPath, mode, DEFAULT_TTL, 50, DEFAULT_CONFIG);
}

/**
 * Internal implementation for warming a partition
 */
async function warmPartitionInternal(
  partitionPath: string,
  mode: PartitionMode,
  _ttl: number, // Reserved for future Cache-Control header support
  priority: number,
  config: EdgeCacheConfig
): Promise<boolean> {
  const url = buildCacheUrl(partitionPath, config);

  try {
    // HEAD request to check if already cached
    const headResponse = await fetchFn(url, {
      method: 'HEAD',
      headers: {
        'X-Prefetch-Priority': String(priority),
      },
    });

    // Check if already cached via CF-Cache-Status header
    const cacheHit = headResponse.headers.get('CF-Cache-Status') === 'HIT';

    if (cacheHit) {
      // Already cached, update our tracking
      updateCacheStatus(partitionPath, headResponse, true);
      return true;
    }

    // GET request to warm the cache
    const response = await fetchFn(url, {
      method: 'GET',
      headers: {
        'X-Prefetch-Priority': String(priority),
        'X-Partition-Mode': mode,
      },
    });

    if (!response.ok) {
      logCacheError('put', partitionPath, new Error(`HTTP ${response.status}: ${response.statusText}`));
      return false;
    }

    // Verify size is within limits
    const contentLength = parseInt(response.headers.get('Content-Length') ?? '0', 10);
    if (!isWithinSizeLimit(contentLength, mode)) {
      // Partition exceeds size limit for the mode - skip caching
      // Note: In production, use @evodb/observability logger for structured logging
      return false;
    }

    // Consume the response to ensure it's cached
    await response.arrayBuffer();

    // Update our tracking
    updateCacheStatus(partitionPath, response, true, contentLength);

    return true;
  } catch (error) {
    logCacheError('put', partitionPath, error);
    return false;
  }
}

/**
 * Check the cache status for a partition
 *
 * @param partitionPath - Path to the partition
 * @returns Cache status information
 *
 * @example
 * ```typescript
 * const status = await checkCacheStatus('data/users/year=2024/data.parquet');
 * if (status.cached) {
 *   console.log(`Cached, TTL remaining: ${status.ttlRemaining}s`);
 * }
 * ```
 */
export async function checkCacheStatus(partitionPath: string): Promise<CacheStatus> {
  const config = DEFAULT_CONFIG;
  const url = buildCacheUrl(partitionPath, config);

  // Check local cache first
  const localStatus = cacheStatusMap.get(partitionPath);

  try {
    // HEAD request to check actual cache status
    const response = await fetchFn(url, {
      method: 'HEAD',
    });

    const cfCacheStatus = response.headers.get('CF-Cache-Status');
    const cached = cfCacheStatus === 'HIT';

    const status: CacheStatus = {
      cached,
      edgeLocation: response.headers.get('CF-Ray')?.split('-')[1],
    };

    if (cached) {
      const age = parseInt(response.headers.get('Age') ?? '0', 10);
      const cacheControl = response.headers.get('Cache-Control') ?? '';
      const maxAge = extractMaxAge(cacheControl);

      status.ttlRemaining = maxAge ? Math.max(0, maxAge - age) : undefined;
      status.sizeBytes = parseInt(response.headers.get('Content-Length') ?? '0', 10);
      status.hitCount = (localStatus?.hitCount ?? 0) + 1;

      // Estimate cached time
      if (age > 0) {
        status.cachedAt = new Date(Date.now() - age * 1000);
      }
    }

    // Update local tracking with LRU behavior
    setCacheStatusEntry(partitionPath, status);

    return status;
  } catch (error) {
    // Log error with context and increment metrics
    logCacheError('get', partitionPath, error);
    // Return uncached status on error
    const uncachedStatus: CacheStatus = { cached: false };
    setCacheStatusEntry(partitionPath, uncachedStatus);
    return uncachedStatus;
  }
}

/**
 * Invalidate a partition from the cache
 *
 * @param partitionPath - Path to the partition to invalidate
 * @returns True if invalidation was successful
 *
 * @example
 * ```typescript
 * await invalidatePartition('data/users/year=2024/data.parquet');
 * ```
 */
export async function invalidatePartition(partitionPath: string): Promise<boolean> {
  const config = DEFAULT_CONFIG;
  const url = buildCacheUrl(partitionPath, config);

  try {
    // PURGE request to invalidate cache
    const response = await fetchFn(url, {
      method: 'PURGE',
    });

    if (response.ok || response.status === 200) {
      // Update local tracking with LRU behavior
      setCacheStatusEntry(partitionPath, { cached: false });
      return true;
    }

    // Log error for non-ok response
    logCacheError('delete', partitionPath, new Error(`HTTP ${response.status}: ${response.statusText}`));
    return false;
  } catch (error) {
    logCacheError('delete', partitionPath, error);
    return false;
  }
}

/**
 * Invalidate all partitions for a table
 *
 * @param table - Table name to invalidate
 * @returns Number of partitions invalidated
 *
 * @example
 * ```typescript
 * const count = await invalidateTable('users');
 * console.log(`Invalidated ${count} partitions`);
 * ```
 */
export async function invalidateTable(table: string): Promise<number> {
  const config = DEFAULT_CONFIG;

  try {
    // Use cache tag purge endpoint
    const purgeUrl = `${config.cdnBaseUrl}/purge`;
    const response = await fetchFn(purgeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tags: [`evodb:${table}:*`],
      }),
    });

    if (!response.ok) {
      return 0;
    }

    // Count and clear local tracking for this table
    let count = 0;
    for (const [path, status] of cacheStatusMap.entries()) {
      if (path.includes(`/${table}/`) || path.startsWith(`${table}/`)) {
        // Note: We use direct set here since we're updating existing entries
        // (not adding new ones), so no LRU eviction is needed
        setCacheStatusEntry(path, { cached: false });
        if (status.cached) {
          count++;
        }
      }
    }

    return count;
  } catch (error) {
    logCacheError('delete', `table:${table}`, error);
    return 0;
  }
}

/**
 * Create a prefetcher instance with custom configuration
 *
 * @param config - Partial configuration (merged with defaults)
 * @returns Prefetcher instance
 *
 * @example
 * ```typescript
 * const prefetcher = createPrefetcher({
 *   cdnBaseUrl: 'https://my-cdn.workers.do',
 *   defaultMode: 'enterprise',
 *   maxConcurrentPrefetch: 10,
 * });
 *
 * await prefetcher.prefetchDataset('users');
 * ```
 */
export function createPrefetcher(config: Partial<EdgeCacheConfig> = {}): Prefetcher {
  const mergedConfig: EdgeCacheConfig = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  const localCacheMap = new Map<string, CacheStatus>();

  return {
    config: mergedConfig,

    async prefetchDataset(table: string, options?: PrefetchOptions): Promise<PrefetchResult> {
      return prefetchDataset(table, options);
    },

    async warmPartition(partitionPath: string, mode?: PartitionMode): Promise<boolean> {
      return warmPartitionInternal(
        partitionPath,
        mode ?? mergedConfig.defaultMode,
        mergedConfig.defaultTtl,
        50,
        mergedConfig
      );
    },

    async checkCacheStatus(partitionPath: string): Promise<CacheStatus> {
      const status = await checkCacheStatus(partitionPath);
      localCacheMap.set(partitionPath, status);
      return status;
    },

    async invalidatePartition(partitionPath: string): Promise<boolean> {
      const result = await invalidatePartition(partitionPath);
      if (result) {
        localCacheMap.set(partitionPath, { cached: false });
      }
      return result;
    },

    async invalidateTable(table: string): Promise<number> {
      const count = await invalidateTable(table);
      // Update local map
      for (const [path] of localCacheMap.entries()) {
        if (path.includes(`/${table}/`) || path.startsWith(`${table}/`)) {
          localCacheMap.set(path, { cached: false });
        }
      }
      return count;
    },

    getCachedPartitions(): Map<string, CacheStatus> {
      return new Map(localCacheMap);
    },
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build the CDN URL for a partition path
 */
function buildCacheUrl(partitionPath: string, config: EdgeCacheConfig): string {
  const normalizedPath = partitionPath.startsWith('/')
    ? partitionPath.slice(1)
    : partitionPath;
  return `${config.cdnBaseUrl}/${normalizedPath}`;
}

/**
 * Update cache status tracking from a response
 */
function updateCacheStatus(
  partitionPath: string,
  response: Response,
  cached: boolean,
  sizeBytes?: number
): void {
  const existingStatus = cacheStatusMap.get(partitionPath);

  const status: CacheStatus = {
    cached,
    cachedAt: cached ? new Date() : undefined,
    sizeBytes: sizeBytes ?? parseInt(response.headers.get('Content-Length') ?? '0', 10),
    hitCount: (existingStatus?.hitCount ?? 0) + (cached ? 1 : 0),
    edgeLocation: response.headers.get('CF-Ray')?.split('-')[1],
  };

  const cacheControl = response.headers.get('Cache-Control') ?? '';
  const maxAge = extractMaxAge(cacheControl);
  if (maxAge) {
    status.ttlRemaining = maxAge;
  }

  setCacheStatusEntry(partitionPath, status);
}

/**
 * Extract max-age from Cache-Control header
 */
function extractMaxAge(cacheControl: string): number | undefined {
  const match = cacheControl.match(/max-age=(\d+)/);
  return match ? parseInt(match[1], 10) : undefined;
}

/**
 * Discover partitions for a table (placeholder - would typically call catalog)
 */
async function discoverPartitions(
  _table: string,
  _config: EdgeCacheConfig // Reserved for future catalog integration
): Promise<string[]> {
  // In a real implementation, this would query the catalog
  // For now, return empty array indicating manual partition specification needed
  // Note: Callers should specify partitions explicitly until catalog integration is complete
  return [];
}

/**
 * Split an array into chunks
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
