/**
 * Declarative Query Cache
 * Issue: evodb-mgwo - TDD: Implement declarative query caching
 *
 * Provides in-memory caching for query results with:
 * - TTL-based expiration
 * - LRU eviction with configurable maxSize
 * - Pattern-based invalidation using glob patterns
 * - Key normalization for consistent lookups
 *
 * @example
 * ```typescript
 * import { createQueryCache } from '@evodb/core';
 *
 * const cache = createQueryCache({ ttl: 60000, maxSize: 1000 });
 *
 * // Cache a query result
 * cache.set('users:list', users, { ttl: 30000 });
 *
 * // Get cached result
 * const cached = cache.get<User[]>('users:list');
 *
 * // Invalidate related entries
 * cache.invalidate('users:*');
 * ```
 *
 * @module query-cache
 */

/**
 * Configuration options for the query cache
 */
export interface QueryCacheOptions {
  /**
   * Default time-to-live in milliseconds for cached entries.
   * Set to 0 for no expiration.
   * @default 0 (no expiration)
   */
  ttl?: number;

  /**
   * Maximum number of entries to keep in cache.
   * When exceeded, least recently used entries are evicted.
   * Set to 0 for unlimited entries.
   * @default 0 (unlimited)
   */
  maxSize?: number;

  /**
   * Patterns that should trigger invalidation of this entry.
   * Supports glob-style patterns with * wildcard.
   * @example ['users:*', 'auth:*']
   */
  invalidateOn?: string[];
}

/**
 * Cache entry with metadata
 */
interface CacheEntry<T> {
  /** The cached value */
  value: T;
  /** Timestamp when entry expires (0 = never) */
  expiresAt: number;
  /** Patterns that should trigger invalidation */
  invalidateOn: string[];
}

/**
 * Query cache interface for caching query results
 */
export interface QueryCache {
  /**
   * Get a cached value by key.
   * Returns undefined if key doesn't exist or has expired.
   *
   * @typeParam T - Expected type of the cached value
   * @param key - Cache key to lookup
   * @returns Cached value or undefined if not found/expired
   */
  get<T>(key: string): T | undefined;

  /**
   * Set a value in the cache.
   * If the key already exists, it will be updated.
   *
   * @typeParam T - Type of the value to cache
   * @param key - Cache key
   * @param value - Value to cache
   * @param options - Per-entry options (TTL, invalidation patterns)
   */
  set<T>(key: string, value: T, options?: QueryCacheOptions): void;

  /**
   * Invalidate cache entries matching a pattern.
   * Supports glob-style patterns with * as wildcard.
   *
   * @param pattern - Pattern to match keys against (e.g., 'users:*')
   *
   * @example
   * ```typescript
   * cache.invalidate('users:1');     // Exact match
   * cache.invalidate('users:*');     // All user entries
   * cache.invalidate('*');           // All entries
   * ```
   */
  invalidate(pattern: string): void;

  /**
   * Clear all entries from the cache.
   */
  clear(): void;
}

/**
 * Normalize a cache key for consistent lookups.
 * - Trims whitespace
 * - Converts to lowercase for case-insensitive matching
 */
function normalizeKey(key: string): string {
  return key.trim().toLowerCase();
}

/**
 * Convert a glob pattern to a regex for matching.
 * Supports * as a wildcard that matches any characters.
 */
function patternToRegex(pattern: string): RegExp {
  // Escape special regex characters except *
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  // Convert * to .*
  const regexStr = escaped.replace(/\*/g, '.*');
  return new RegExp(`^${regexStr}$`, 'i');
}

/**
 * Check if a key matches a pattern.
 */
function matchesPattern(key: string, pattern: string): boolean {
  const normalizedKey = normalizeKey(key);
  const normalizedPattern = normalizeKey(pattern);

  if (!normalizedPattern.includes('*')) {
    // Exact match (case insensitive)
    return normalizedKey === normalizedPattern;
  }

  const regex = patternToRegex(normalizedPattern);
  return regex.test(normalizedKey);
}

/**
 * Create a new query cache instance.
 *
 * @param options - Default options for the cache
 * @returns New QueryCache instance
 *
 * @example
 * ```typescript
 * // Create cache with defaults
 * const cache = createQueryCache();
 *
 * // Create cache with 1 minute TTL and max 1000 entries
 * const cache = createQueryCache({ ttl: 60000, maxSize: 1000 });
 * ```
 */
export function createQueryCache(options?: QueryCacheOptions): QueryCache {
  const defaultTtl = options?.ttl ?? 0;
  const maxSize = options?.maxSize ?? 0;

  // Map for O(1) lookups
  const entries = new Map<string, CacheEntry<unknown>>();
  // Track insertion order for LRU eviction
  const accessOrder: string[] = [];

  /**
   * Get current timestamp for TTL calculations
   */
  function now(): number {
    return Date.now();
  }

  /**
   * Check if an entry has expired
   */
  function isExpired(entry: CacheEntry<unknown>): boolean {
    return entry.expiresAt > 0 && now() >= entry.expiresAt;
  }

  /**
   * Update access order for LRU tracking
   */
  function updateAccessOrder(normalizedKey: string): void {
    const index = accessOrder.indexOf(normalizedKey);
    if (index > -1) {
      accessOrder.splice(index, 1);
    }
    accessOrder.push(normalizedKey);
  }

  /**
   * Remove oldest entry for LRU eviction
   */
  function evictOldest(): void {
    if (accessOrder.length > 0) {
      const oldestKey = accessOrder.shift()!;
      entries.delete(oldestKey);
    }
  }

  /**
   * Remove a specific key from the cache
   */
  function removeKey(normalizedKey: string): void {
    entries.delete(normalizedKey);
    const index = accessOrder.indexOf(normalizedKey);
    if (index > -1) {
      accessOrder.splice(index, 1);
    }
  }

  return {
    get<T>(key: string): T | undefined {
      const normalizedKey = normalizeKey(key);
      const entry = entries.get(normalizedKey);

      if (!entry) {
        return undefined;
      }

      if (isExpired(entry)) {
        removeKey(normalizedKey);
        return undefined;
      }

      // Update access order for LRU
      updateAccessOrder(normalizedKey);

      return entry.value as T;
    },

    set<T>(key: string, value: T, entryOptions?: QueryCacheOptions): void {
      const normalizedKey = normalizeKey(key);

      // Calculate expiration time
      const ttl = entryOptions?.ttl ?? defaultTtl;
      let expiresAt = 0;

      if (ttl < 0) {
        // Negative TTL means already expired (immediate expiration)
        return;
      } else if (ttl > 0) {
        expiresAt = now() + ttl;
      }

      // Check if key already exists
      const existingIndex = accessOrder.indexOf(normalizedKey);
      const isUpdate = existingIndex > -1;

      if (!isUpdate && maxSize > 0 && entries.size >= maxSize) {
        // Need to evict oldest entry
        evictOldest();
      }

      // Store the entry
      entries.set(normalizedKey, {
        value,
        expiresAt,
        invalidateOn: entryOptions?.invalidateOn ?? [],
      });

      // Update access order
      updateAccessOrder(normalizedKey);
    },

    invalidate(pattern: string): void {
      const keysToRemove: string[] = [];

      for (const normalizedKey of Array.from(entries.keys())) {
        // Check if key matches the pattern directly
        if (matchesPattern(normalizedKey, pattern)) {
          keysToRemove.push(normalizedKey);
          continue;
        }

        // Check if any invalidateOn patterns match
        const entry = entries.get(normalizedKey);
        if (entry) {
          for (const invalidatePattern of entry.invalidateOn) {
            if (matchesPattern(invalidatePattern, pattern) || matchesPattern(normalizedKey, pattern)) {
              keysToRemove.push(normalizedKey);
              break;
            }
          }
        }
      }

      // Remove matched keys
      for (const key of keysToRemove) {
        removeKey(key);
      }
    },

    clear(): void {
      entries.clear();
      accessOrder.length = 0;
    },
  };
}
