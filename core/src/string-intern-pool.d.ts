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
 * Configuration options for memory leak prevention
 */
export interface StringPoolOptions {
    /** Maximum string length to intern. Longer strings are returned but not cached. */
    maxStringLength?: number;
    /** Maximum memory usage in bytes. Entries are evicted when exceeded. */
    maxMemoryBytes?: number;
    /** Time-to-live in milliseconds. Entries older than this are eligible for pruning. */
    ttlMs?: number;
}

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
    /** Estimated memory usage in bytes */
    memoryBytes: number;
    /** Maximum string length allowed (undefined if not set) */
    maxStringLength?: number;
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
export declare class LRUStringPool {
    private cache;
    private _maxSize;
    private _memoryBytes;
    private _maxStringLength?;
    private _maxMemoryBytes?;
    private _ttlMs?;
    private _hits;
    private _misses;
    private _evictions;
    /**
     * Create a new LRU string pool
     * @param maxSize Maximum number of strings to cache (default: 10000)
     * @param options Memory leak prevention options
     * @throws Error if maxSize is less than 1
     */
    constructor(maxSize?: number, options?: StringPoolOptions);
    /**
     * Estimate memory size of a string in bytes
     */
    private estimateByteSize;
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
    intern(s: string): string;
    /**
     * Evict the oldest (least recently used) entry
     */
    private evictOldest;
    /**
     * Prune entries that have exceeded their TTL
     * Call this periodically or before operations to clean up stale entries
     */
    pruneExpired(): void;
    /**
     * Check if a string is currently in the pool
     * Note: This does NOT refresh the TTL (use intern() for that)
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
     * Clear all cached strings and reset memory tracking
     */
    clear(): void;
    /**
     * Get performance statistics
     * @returns Current stats including hits, misses, evictions, hit rate, and memory usage
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
