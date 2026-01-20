/**
 * LRU String Intern Pool
 *
 * Provides memory-efficient string interning with LRU eviction policy.
 * This replaces the naive full-clear approach that caused cache thrashing.
 *
 * Issue: pocs-k52r - Previous implementation cleared entire pool at 10K entries,
 * causing performance degradation due to cache thrashing.
 *
 * Solution: LRU eviction using Map's insertion order (oldest first),
 * with move-to-end on access to maintain recency.
 *
 * Issue: evodb-4dt - Memory leak prevention features added:
 * - maxStringLength: Reject strings exceeding this length (prevents unbounded memory)
 * - maxMemoryBytes: Limit total memory usage (not just entry count)
 * - ttlMs: Time-to-live for entries (prevents stale entry accumulation)
 *
 * @module string-intern-pool
 */

/**
 * LRU (Least Recently Used) String Intern Pool
 *
 * Intern strings to reduce memory by returning the same reference
 * for identical strings. Uses LRU eviction when the pool reaches
 * maximum capacity.
 *
 * JavaScript's Map maintains insertion order, which we leverage for LRU:
 * - New entries go to the end
 * - Accessed entries are deleted and re-inserted (moved to end)
 * - Eviction removes from the beginning (oldest)
 *
 * Memory Leak Prevention Features:
 * - maxStringLength: Skip interning strings that are too long
 * - maxMemoryBytes: Evict entries when memory limit exceeded
 * - ttlMs: Expire entries after a time period
 *
 * @example
 * ```typescript
 * const pool = new LRUStringPool(1000);
 * const s1 = pool.intern('hello');
 * const s2 = pool.intern('hello');
 * console.log(s1 === s2); // true - same reference
 *
 * // With memory leak prevention
 * const safePool = new LRUStringPool(1000, {
 *   maxStringLength: 10000,
 *   maxMemoryBytes: 1_000_000,
 *   ttlMs: 60_000
 * });
 * ```
 */
export class LRUStringPool {
    cache;
    _maxSize;
    _memoryBytes = 0;

    // Memory leak prevention options
    _maxStringLength;
    _maxMemoryBytes;
    _ttlMs;

    // Statistics
    _hits = 0;
    _misses = 0;
    _evictions = 0;

    /**
     * Create a new LRU string pool
     * @param maxSize Maximum number of strings to cache (default: 10000)
     * @param options Memory leak prevention options
     * @throws Error if maxSize is less than 1
     */
    constructor(maxSize = 10000, options = {}) {
        if (maxSize < 1) {
            throw new Error('maxSize must be at least 1');
        }
        this._maxSize = maxSize;
        this._maxStringLength = options.maxStringLength;
        this._maxMemoryBytes = options.maxMemoryBytes;
        this._ttlMs = options.ttlMs;
        this.cache = new Map();
    }

    /**
     * Estimate memory size of a string in bytes
     * JavaScript strings use ~2 bytes per character (UTF-16)
     * Plus overhead for the Map entry (~50 bytes estimated)
     */
    estimateByteSize(s) {
        return s.length * 2 + 50; // 2 bytes per char + entry overhead
    }

    /**
     * Intern a string, returning a cached reference if available.
     *
     * If the string is already in the cache, its entry is moved to
     * the most-recently-used position. If the cache is full and the
     * string is new, the least-recently-used entry is evicted.
     *
     * Memory Leak Prevention:
     * - Strings exceeding maxStringLength are returned but not cached
     * - Memory limit triggers eviction before count limit
     * - TTL is refreshed on access
     *
     * @param s The string to intern
     * @returns The interned string (may be same reference or cached reference)
     */
    intern(s) {
        const now = Date.now();

        // Check maxStringLength - don't cache strings that are too long
        if (this._maxStringLength !== undefined && s.length > this._maxStringLength) {
            this._misses++;
            return s; // Return original, but don't cache
        }

        const existing = this.cache.get(s);

        if (existing !== undefined) {
            // Cache hit - move to end (most recently used) and refresh TTL
            this._hits++;
            this.cache.delete(s);
            this.cache.set(s, {
                value: existing.value,
                lastAccess: now,
                byteSize: existing.byteSize,
            });
            return existing.value;
        }

        // Cache miss
        this._misses++;

        const byteSize = this.estimateByteSize(s);

        // Evict by memory pressure first (if maxMemoryBytes is set)
        if (this._maxMemoryBytes !== undefined) {
            while (this._memoryBytes + byteSize > this._maxMemoryBytes && this.cache.size > 0) {
                this.evictOldest();
            }
        }

        // Evict oldest if at count capacity
        if (this.cache.size >= this._maxSize) {
            this.evictOldest();
        }

        // Add new entry
        this.cache.set(s, {
            value: s,
            lastAccess: now,
            byteSize,
        });
        this._memoryBytes += byteSize;

        return s;
    }

    /**
     * Evict the oldest (least recently used) entry
     */
    evictOldest() {
        const oldest = this.cache.keys().next().value;
        if (oldest !== undefined) {
            const entry = this.cache.get(oldest);
            if (entry) {
                this._memoryBytes -= entry.byteSize;
            }
            this.cache.delete(oldest);
            this._evictions++;
        }
    }

    /**
     * Prune entries that have exceeded their TTL
     * Call this periodically or before operations to clean up stale entries
     */
    pruneExpired() {
        if (this._ttlMs === undefined) {
            return; // No TTL configured
        }

        const now = Date.now();
        const expireThreshold = now - this._ttlMs;

        // Collect keys to delete (can't delete during iteration)
        const toDelete = [];

        for (const [key, entry] of this.cache) {
            if (entry.lastAccess < expireThreshold) {
                toDelete.push(key);
            }
        }

        // Delete expired entries
        for (const key of toDelete) {
            const entry = this.cache.get(key);
            if (entry) {
                this._memoryBytes -= entry.byteSize;
            }
            this.cache.delete(key);
            this._evictions++;
        }
    }

    /**
     * Check if a string is currently in the pool
     * Note: This does NOT refresh the TTL (use intern() for that)
     * @param s The string to check
     * @returns true if the string is cached
     */
    has(s) {
        if (!this.cache.has(s)) {
            return false;
        }
        // Check TTL if configured
        if (this._ttlMs !== undefined) {
            const entry = this.cache.get(s);
            if (entry && Date.now() - entry.lastAccess > this._ttlMs) {
                return false; // Entry exists but is expired
            }
        }
        return true;
    }

    /**
     * Get the current number of cached strings
     */
    get size() {
        return this.cache.size;
    }

    /**
     * Get the maximum pool size
     */
    get maxSize() {
        return this._maxSize;
    }

    /**
     * Clear all cached strings and reset memory tracking
     */
    clear() {
        this.cache.clear();
        this._memoryBytes = 0;
    }

    /**
     * Get performance statistics
     * @returns Current stats including hits, misses, evictions, hit rate, and memory usage
     */
    getStats() {
        const total = this._hits + this._misses;
        return {
            hits: this._hits,
            misses: this._misses,
            evictions: this._evictions,
            size: this.cache.size,
            maxSize: this._maxSize,
            hitRate: total === 0 ? 0 : this._hits / total,
            memoryBytes: this._memoryBytes,
            maxStringLength: this._maxStringLength,
        };
    }

    /**
     * Reset statistics counters (does not clear the cache)
     */
    resetStats() {
        this._hits = 0;
        this._misses = 0;
        this._evictions = 0;
    }
}

// =============================================================================
// Global String Pool
// =============================================================================

/**
 * Global string intern pool used by encode.ts
 * Default size of 10K matches the original implementation's threshold
 */
const globalStringPool = new LRUStringPool(10000);

/**
 * Intern a string using the global pool
 *
 * This is the drop-in replacement for the original internString function.
 * It uses LRU eviction instead of clearing the entire pool.
 *
 * @param s The string to intern
 * @returns The interned string
 * @internal
 */
export function internString(s) {
    return globalStringPool.intern(s);
}

/**
 * Get statistics for the global string pool
 * @returns Current global pool stats
 */
export function getStringPoolStats() {
    return globalStringPool.getStats();
}

/**
 * Reset the global string pool (clears cache and stats)
 * Useful for testing or when memory pressure requires clearing
 */
export function resetStringPool() {
    globalStringPool.clear();
    globalStringPool.resetStats();
}
//# sourceMappingURL=string-intern-pool.js.map
