/**
 * @evodb/reader - Cache API tier
 * FREE caching layer using Cloudflare Cache API
 *
 * This module provides transparent caching with proper error handling.
 * All cache errors are logged and categorized to distinguish between:
 * - Cache misses (expected behavior)
 * - Cache API not available (warning)
 * - Permission/quota errors (error with details)
 */

import type { CacheTierConfig, CacheStats, R2Bucket, R2Object } from './types.js';
import { DEFAULT_CACHE_TTL_SECONDS, CACHE_API_MAX_ITEM_SIZE } from '@evodb/core';

// ============================================================================
// Cache Result Types - Discriminated Union
// ============================================================================

/**
 * Error types for cache operations.
 * Used to categorize errors for logging, metrics, and debugging.
 */
export type CacheErrorType =
  | 'permission'   // NotAllowedError - permission denied
  | 'quota'        // QuotaExceededError - storage quota exceeded
  | 'network'      // TimeoutError, NetworkError - network issues
  | 'unavailable'  // ReferenceError - Cache API not available
  | 'unknown';     // Other errors

/**
 * Result of a cache get operation.
 * Discriminated union to clearly distinguish hit, miss, and error states.
 */
export type CacheGetResult =
  | { status: 'hit'; data: ArrayBuffer }
  | { status: 'miss' }
  | { status: 'error'; error: Error; errorType: CacheErrorType };

/**
 * Result of a cache put operation.
 */
export type CachePutResult =
  | { status: 'success' }
  | { status: 'error'; error: Error; errorType: CacheErrorType };

/**
 * Result of a cache invalidate operation.
 */
export type CacheInvalidateResult =
  | { status: 'success'; deleted: boolean }
  | { status: 'error'; error: Error; errorType: CacheErrorType };

/**
 * Error callback context for cache operations.
 */
export interface CacheErrorContext {
  operation: 'get' | 'put' | 'invalidate';
  key: string;
  error: Error;
  errorType: CacheErrorType;
}

/**
 * Error callback function type.
 */
export type CacheErrorCallback = (context: CacheErrorContext) => void;

/**
 * Extended cache tier configuration with error callback.
 */
export interface ExtendedCacheTierConfig extends Partial<CacheTierConfig> {
  /** Optional callback for cache errors */
  onError?: CacheErrorCallback;
}

/**
 * Error statistics by type.
 */
export interface CacheErrorStats {
  permission: number;
  quota: number;
  network: number;
  unavailable: number;
  unknown: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default cache configuration
 */
const DEFAULT_CACHE_CONFIG: CacheTierConfig = {
  enableCacheApi: true,
  cacheTtlSeconds: DEFAULT_CACHE_TTL_SECONDS, // 1 hour
  maxCachedItemSize: CACHE_API_MAX_ITEM_SIZE, // 25MB (Cache API limit)
  cacheKeyPrefix: 'evodb:',
};

// ============================================================================
// CacheTier Class
// ============================================================================

/**
 * Cache tier manager for R2 data.
 * Uses Cloudflare Cache API (FREE) for hot data.
 *
 * Error Handling:
 * - Cache misses are silent (expected behavior)
 * - Cache API unavailability logs a warning
 * - Permission/quota errors log with full details
 * - All errors are tracked in metrics
 *
 * @example
 * ```typescript
 * const cache = new CacheTier({
 *   onError: (ctx) => {
 *     analytics.track('cache_error', ctx);
 *   }
 * });
 *
 * // New status-returning methods
 * const result = await cache.getWithStatus('key');
 * if (result.status === 'hit') {
 *   console.log('Cache hit!', result.data);
 * } else if (result.status === 'error') {
 *   console.error('Cache error:', result.errorType);
 * }
 *
 * // Legacy method still works (falls back to R2)
 * const { data, fromCache } = await cache.get(bucket, 'key');
 * ```
 */
export class CacheTier {
  private readonly config: CacheTierConfig;
  private readonly onError?: CacheErrorCallback;
  private readonly stats: CacheStats & { errors: number } = {
    hits: 0,
    misses: 0,
    bytesServedFromCache: 0,
    bytesReadFromR2: 0,
    errors: 0,
  };
  private readonly errorStats: CacheErrorStats = {
    permission: 0,
    quota: 0,
    network: 0,
    unavailable: 0,
    unknown: 0,
  };

  constructor(config?: ExtendedCacheTierConfig) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
    this.onError = config?.onError;
  }

  /**
   * Get data from cache or R2 (backward compatible).
   *
   * This method maintains backward compatibility with the original API.
   * On cache errors, it silently falls back to R2.
   *
   * For detailed error information, use `getWithStatus()` instead.
   *
   * @param bucket - R2 bucket to read from on cache miss
   * @param key - Key to look up
   * @param options - Optional settings
   * @returns Data and whether it came from cache
   * @throws Error if object not found in R2
   */
  async get(
    bucket: R2Bucket,
    key: string,
    options?: { skipCache?: boolean }
  ): Promise<{ data: ArrayBuffer; fromCache: boolean }> {
    // Try cache first (if enabled and not skipped)
    if (this.config.enableCacheApi && !options?.skipCache) {
      const result = await this.getWithStatus(key);
      if (result.status === 'hit') {
        this.stats.hits++;
        this.stats.bytesServedFromCache += result.data.byteLength;
        return { data: result.data, fromCache: true };
      }
      // On miss or error, fall through to R2
    }

    // Cache miss or error - read from R2
    this.stats.misses++;
    const object = await bucket.get(key);
    if (!object) {
      throw new Error(`Object not found: ${key}`);
    }

    const data = await object.arrayBuffer();
    this.stats.bytesReadFromR2 += data.byteLength;

    // Cache the data (if enabled and within size limit)
    if (
      this.config.enableCacheApi &&
      data.byteLength <= this.config.maxCachedItemSize
    ) {
      await this.putWithStatus(key, data, object);
    }

    return { data, fromCache: false };
  }

  /**
   * Get data from Cache API with detailed status.
   *
   * Returns a discriminated union that clearly indicates:
   * - 'hit': Cache entry found, data available
   * - 'miss': No cache entry (expected behavior)
   * - 'error': Cache operation failed, with error details
   *
   * @param key - Key to look up in cache
   * @returns CacheGetResult with status and data/error
   */
  async getWithStatus(key: string): Promise<CacheGetResult> {
    try {
      const cache = await caches.open('evodb');
      const cacheKey = this.buildCacheUrl(key);
      const response = await cache.match(cacheKey);

      if (!response) {
        return { status: 'miss' };
      }

      const data = await response.arrayBuffer();
      return { status: 'hit', data };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const errorType = this.categorizeError(error);

      this.trackError(errorType);
      this.logError('get', key, error, errorType);
      this.invokeErrorCallback('get', key, error, errorType);

      return { status: 'error', error, errorType };
    }
  }

  /**
   * Put data to Cache API with detailed status.
   *
   * @param key - Key to store
   * @param data - Data to cache
   * @param r2Object - R2 object for metadata (etag)
   * @returns CachePutResult with status and optional error
   */
  async putWithStatus(
    key: string,
    data: ArrayBuffer,
    r2Object: Pick<R2Object, 'etag'>
  ): Promise<CachePutResult> {
    try {
      const cache = await caches.open('evodb');
      const cacheKey = this.buildCacheUrl(key);

      const response = new Response(data, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': data.byteLength.toString(),
          'Cache-Control': `public, max-age=${this.config.cacheTtlSeconds}`,
          'ETag': r2Object.etag,
          'X-EvoDB-Cached': Date.now().toString(),
        },
      });

      await cache.put(cacheKey, response);
      return { status: 'success' };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const errorType = this.categorizeError(error);

      this.trackError(errorType);
      this.logError('put', key, error, errorType);
      this.invokeErrorCallback('put', key, error, errorType);

      return { status: 'error', error, errorType };
    }
  }

  /**
   * Invalidate cache entry (backward compatible).
   *
   * @param key - Key to invalidate
   * @returns true if entry was deleted, false otherwise
   */
  async invalidate(key: string): Promise<boolean> {
    const result = await this.invalidateWithStatus(key);
    return result.status === 'success' && result.deleted;
  }

  /**
   * Invalidate cache entry with detailed status.
   *
   * @param key - Key to invalidate
   * @returns CacheInvalidateResult with status and deleted flag or error
   */
  async invalidateWithStatus(key: string): Promise<CacheInvalidateResult> {
    try {
      const cache = await caches.open('evodb');
      const cacheKey = this.buildCacheUrl(key);
      const deleted = await cache.delete(cacheKey);
      return { status: 'success', deleted };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const errorType = this.categorizeError(error);

      this.trackError(errorType);
      this.logError('invalidate', key, error, errorType);
      this.invokeErrorCallback('invalidate', key, error, errorType);

      return { status: 'error', error, errorType };
    }
  }

  /**
   * Invalidate all entries with prefix.
   *
   * Note: Cache API doesn't support prefix deletion directly.
   * Would need to track keys separately for bulk invalidation.
   * Returns 0 as a no-op - callers should use individual invalidate() instead.
   */
  async invalidatePrefix(_prefix: string): Promise<number> {
    // Prefix invalidation not supported - callers should use individual invalidate()
    return 0;
  }

  /**
   * Build cache URL from key.
   * Cache API requires URL format.
   */
  private buildCacheUrl(key: string): string {
    return `https://evodb.cache/${this.config.cacheKeyPrefix}${encodeURIComponent(key)}`;
  }

  /**
   * Categorize an error by type for logging and metrics.
   */
  private categorizeError(error: Error): CacheErrorType {
    const name = error.name;
    const message = error.message.toLowerCase();

    // Check error name first (most reliable)
    if (name === 'NotAllowedError') {
      return 'permission';
    }
    if (name === 'QuotaExceededError') {
      return 'quota';
    }
    if (name === 'TimeoutError' || name === 'NetworkError') {
      return 'network';
    }
    if (error instanceof ReferenceError || message.includes('is not defined')) {
      return 'unavailable';
    }

    // Check message content as fallback
    if (message.includes('permission') || message.includes('not allowed')) {
      return 'permission';
    }
    if (message.includes('quota') || message.includes('storage')) {
      return 'quota';
    }
    if (message.includes('timeout') || message.includes('network')) {
      return 'network';
    }
    if (message.includes('not available') || message.includes('undefined')) {
      return 'unavailable';
    }

    return 'unknown';
  }

  /**
   * Track error in statistics.
   */
  private trackError(errorType: CacheErrorType): void {
    this.stats.errors++;
    this.errorStats[errorType]++;
  }

  /**
   * Log error with appropriate severity and context.
   * Note: In production, this should be logged through @evodb/observability.
   * Currently this method tracks errors in stats without console logging.
   */
  private logError(
    _operation: 'get' | 'put' | 'invalidate',
    _key: string,
    _error: Error,
    _errorType: CacheErrorType
  ): void {
    // Error tracking is done through trackError() and stats
    // Console logging removed - use @evodb/observability logger in production
    // Error context is available through the error callback if configured
  }

  /**
   * Invoke error callback if configured.
   */
  private invokeErrorCallback(
    operation: 'get' | 'put' | 'invalidate',
    key: string,
    error: Error,
    errorType: CacheErrorType
  ): void {
    if (this.onError) {
      this.onError({
        operation,
        key: this.buildCacheUrl(key),
        error,
        errorType,
      });
    }
  }

  /**
   * Get cache statistics including error count.
   */
  getStats(): CacheStats & { errors: number } {
    return { ...this.stats };
  }

  /**
   * Get error statistics by type.
   */
  getErrorStats(): CacheErrorStats {
    return { ...this.errorStats };
  }

  /**
   * Get cache hit ratio.
   */
  getHitRatio(): number {
    const total = this.stats.hits + this.stats.misses;
    if (total === 0) return 0;
    return this.stats.hits / total;
  }

  /**
   * Reset all statistics including error stats.
   */
  resetStats(): void {
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.stats.bytesServedFromCache = 0;
    this.stats.bytesReadFromR2 = 0;
    this.stats.errors = 0;
    this.errorStats.permission = 0;
    this.errorStats.quota = 0;
    this.errorStats.network = 0;
    this.errorStats.unavailable = 0;
    this.errorStats.unknown = 0;
  }
}

/**
 * Create cache tier from environment variables.
 *
 * @param env - Environment bindings
 * @returns Configured CacheTier instance
 */
export function createCacheTierFromEnv(env: {
  CACHE_PREFIX?: string;
  CACHE_TTL_SECONDS?: string;
}): CacheTier {
  return new CacheTier({
    cacheKeyPrefix: env.CACHE_PREFIX || 'evodb:',
    cacheTtlSeconds: env.CACHE_TTL_SECONDS
      ? parseInt(env.CACHE_TTL_SECONDS, 10)
      : DEFAULT_CACHE_TTL_SECONDS,
  });
}
