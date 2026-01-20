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
 * @example
 * ```typescript
 * const pool = new LRUStringPool(1000);
 * const s1 = pool.intern('hello');
 * const s2 = pool.intern('hello');
 * console.log(s1 === s2); // true - same reference
 * ```
 */
export class LRUStringPool {
    cache;
    _maxSize;
    // Statistics
    _hits = 0;
    _misses = 0;
    _evictions = 0;
    /**
     * Create a new LRU string pool
     * @param maxSize Maximum number of strings to cache (default: 10000)
     * @throws Error if maxSize is less than 1
     */
    constructor(maxSize = 10000) {
        if (maxSize < 1) {
            throw new Error('maxSize must be at least 1');
        }
        this._maxSize = maxSize;
        this.cache = new Map();
    }
    /**
     * Intern a string, returning a cached reference if available.
     *
     * If the string is already in the cache, its entry is moved to
     * the most-recently-used position. If the cache is full and the
     * string is new, the least-recently-used entry is evicted.
     *
     * @param s The string to intern
     * @returns The interned string (may be same reference or cached reference)
     */
    intern(s) {
        const existing = this.cache.get(s);
        if (existing !== undefined) {
            // Cache hit - move to end (most recently used)
            this._hits++;
            this.cache.delete(s);
            this.cache.set(s, existing);
            return existing;
        }
        // Cache miss
        this._misses++;
        // Evict oldest if at capacity
        if (this.cache.size >= this._maxSize) {
            const oldest = this.cache.keys().next().value;
            if (oldest !== undefined) {
                this.cache.delete(oldest);
                this._evictions++;
            }
        }
        // Add new entry
        this.cache.set(s, s);
        return s;
    }
    /**
     * Check if a string is currently in the pool
     * @param s The string to check
     * @returns true if the string is cached
     */
    has(s) {
        return this.cache.has(s);
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
     * Clear all cached strings
     */
    clear() {
        this.cache.clear();
    }
    /**
     * Get performance statistics
     * @returns Current stats including hits, misses, evictions, and hit rate
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