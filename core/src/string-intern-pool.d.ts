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
 * Statistics for string interning performance monitoring
 */
export interface StringPoolStats {
    /** Number of cache hits */
    hits: number;
    /** Number of cache misses */
    misses: number;
    /** Number of entries evicted */
    evictions: number;
    /** Current pool size */
    size: number;
    /** Maximum pool size */
    maxSize: number;
    /** Hit rate (0-1) */
    hitRate: number;
}
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
export declare class LRUStringPool {
    private cache;
    private _maxSize;
    private _hits;
    private _misses;
    private _evictions;
    /**
     * Create a new LRU string pool
     * @param maxSize Maximum number of strings to cache (default: 10000)
     * @throws Error if maxSize is less than 1
     */
    constructor(maxSize?: number);
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
    intern(s: string): string;
    /**
     * Check if a string is currently in the pool
     * @param s The string to check
     * @returns true if the string is cached
     */
    has(s: string): boolean;
    /**
     * Get the current number of cached strings
     */
    get size(): number;
    /**
     * Get the maximum pool size
     */
    get maxSize(): number;
    /**
     * Clear all cached strings
     */
    clear(): void;
    /**
     * Get performance statistics
     * @returns Current stats including hits, misses, evictions, and hit rate
     */
    getStats(): StringPoolStats;
    /**
     * Reset statistics counters (does not clear the cache)
     */
    resetStats(): void;
}
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
export declare function internString(s: string): string;
/**
 * Get statistics for the global string pool
 * @returns Current global pool stats
 */
export declare function getStringPoolStats(): StringPoolStats;
/**
 * Reset the global string pool (clears cache and stats)
 * Useful for testing or when memory pressure requires clearing
 */
export declare function resetStringPool(): void;
//# sourceMappingURL=string-intern-pool.d.ts.map