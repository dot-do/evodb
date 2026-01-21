/**
 * @evodb/core - String Intern Pool Tests (TDD)
 *
 * Tests for the LRU string intern pool to prevent memory leaks
 * and cache thrashing when the pool reaches capacity.
 *
 * Issue: pocs-k52r - String intern pool clears entirely at 10K entries
 * causing cache thrashing and performance degradation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  LRUStringPool,
  getStringPoolStats,
  resetStringPool,
} from '../index.js';

// =============================================================================
// 1. BASIC INTERNING TESTS
// =============================================================================

describe('LRUStringPool', () => {
  let pool: LRUStringPool;

  beforeEach(() => {
    pool = new LRUStringPool(100); // Small size for testing
  });

  describe('Basic Interning', () => {
    it('should return same reference for same string', () => {
      const s1 = pool.intern('hello');
      const s2 = pool.intern('hello');

      // Should be the exact same reference
      expect(s1).toBe(s2);
      expect(Object.is(s1, s2)).toBe(true);
    });

    it('should intern multiple different strings', () => {
      const a = pool.intern('alpha');
      const b = pool.intern('beta');
      const c = pool.intern('gamma');

      expect(a).toBe('alpha');
      expect(b).toBe('beta');
      expect(c).toBe('gamma');

      // Should return same references on re-access
      expect(pool.intern('alpha')).toBe(a);
      expect(pool.intern('beta')).toBe(b);
      expect(pool.intern('gamma')).toBe(c);
    });

    it('should handle empty strings', () => {
      const s1 = pool.intern('');
      const s2 = pool.intern('');
      expect(s1).toBe('');
      expect(s1).toBe(s2);
    });

    it('should handle strings with special characters', () => {
      const s1 = pool.intern('hello\nworld');
      const s2 = pool.intern('hello\tworld');
      const s3 = pool.intern('unicode: \u{1F600}');

      expect(pool.intern('hello\nworld')).toBe(s1);
      expect(pool.intern('hello\tworld')).toBe(s2);
      expect(pool.intern('unicode: \u{1F600}')).toBe(s3);
    });
  });

  // =============================================================================
  // 2. POOL SIZE LIMIT TESTS
  // =============================================================================

  describe('Pool Size Limit', () => {
    it('should respect max size', () => {
      const smallPool = new LRUStringPool(10);

      // Fill the pool
      for (let i = 0; i < 20; i++) {
        smallPool.intern(`string-${i}`);
      }

      // Pool size should not exceed max
      expect(smallPool.size).toBeLessThanOrEqual(10);
    });

    it('should evict entries when at capacity', () => {
      const smallPool = new LRUStringPool(3);

      smallPool.intern('a');
      smallPool.intern('b');
      smallPool.intern('c');
      expect(smallPool.size).toBe(3);

      // Adding a 4th should evict the oldest
      smallPool.intern('d');
      expect(smallPool.size).toBe(3);
    });

    it('should not evict when accessing existing entry', () => {
      const smallPool = new LRUStringPool(3);

      smallPool.intern('a');
      smallPool.intern('b');
      smallPool.intern('c');

      // Re-access 'a' - should not add new entry
      smallPool.intern('a');
      expect(smallPool.size).toBe(3);
    });
  });

  // =============================================================================
  // 3. LRU EVICTION TESTS
  // =============================================================================

  describe('LRU Eviction Policy', () => {
    it('should evict least recently used entry first', () => {
      const smallPool = new LRUStringPool(3);

      smallPool.intern('a'); // LRU order: a
      smallPool.intern('b'); // LRU order: a, b
      smallPool.intern('c'); // LRU order: a, b, c

      // Add new entry - 'a' should be evicted as oldest
      smallPool.intern('d'); // LRU order: b, c, d

      // 'a' should no longer be in cache (different reference)
      expect(smallPool.has('a')).toBe(false);
      expect(smallPool.has('b')).toBe(true);
      expect(smallPool.has('c')).toBe(true);
      expect(smallPool.has('d')).toBe(true);
    });

    it('should move accessed entry to most recent position', () => {
      const smallPool = new LRUStringPool(3);

      smallPool.intern('a'); // LRU order: a
      smallPool.intern('b'); // LRU order: a, b
      smallPool.intern('c'); // LRU order: a, b, c

      // Access 'a' again - moves to end
      smallPool.intern('a'); // LRU order: b, c, a

      // Add new entry - 'b' should be evicted as oldest
      smallPool.intern('d'); // LRU order: c, a, d

      expect(smallPool.has('a')).toBe(true);
      expect(smallPool.has('b')).toBe(false);
      expect(smallPool.has('c')).toBe(true);
      expect(smallPool.has('d')).toBe(true);
    });

    it('should preserve recently accessed entries under load', () => {
      const smallPool = new LRUStringPool(5);

      // Add 5 strings
      for (let i = 0; i < 5; i++) {
        smallPool.intern(`str-${i}`);
      }

      // Keep accessing str-0 and str-1 while adding more
      for (let i = 5; i < 10; i++) {
        smallPool.intern('str-0'); // Keep refreshing these
        smallPool.intern('str-1');
        smallPool.intern(`str-${i}`);
      }

      // str-0 and str-1 should still be present
      expect(smallPool.has('str-0')).toBe(true);
      expect(smallPool.has('str-1')).toBe(true);
    });
  });

  // =============================================================================
  // 4. STATISTICS TESTS
  // =============================================================================

  describe('Statistics', () => {
    it('should track hits correctly', () => {
      pool.intern('a');
      pool.intern('a');
      pool.intern('a');

      const stats = pool.getStats();
      expect(stats.hits).toBe(2); // First was a miss, next 2 were hits
    });

    it('should track misses correctly', () => {
      pool.intern('a');
      pool.intern('b');
      pool.intern('c');

      const stats = pool.getStats();
      expect(stats.misses).toBe(3);
    });

    it('should track evictions correctly', () => {
      const smallPool = new LRUStringPool(3);

      smallPool.intern('a');
      smallPool.intern('b');
      smallPool.intern('c');
      smallPool.intern('d'); // Evicts 'a'
      smallPool.intern('e'); // Evicts 'b'

      const stats = smallPool.getStats();
      expect(stats.evictions).toBe(2);
    });

    it('should calculate hit rate correctly', () => {
      pool.intern('a'); // miss
      pool.intern('a'); // hit
      pool.intern('a'); // hit
      pool.intern('a'); // hit
      pool.intern('b'); // miss

      const stats = pool.getStats();
      expect(stats.hits).toBe(3);
      expect(stats.misses).toBe(2);
      expect(stats.hitRate).toBeCloseTo(0.6, 2); // 3/(3+2) = 0.6
    });

    it('should handle zero accesses for hit rate', () => {
      const stats = pool.getStats();
      expect(stats.hitRate).toBe(0);
    });

    it('should reset statistics', () => {
      pool.intern('a');
      pool.intern('a');
      pool.intern('b');

      pool.resetStats();
      const stats = pool.getStats();

      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.evictions).toBe(0);
    });
  });

  // =============================================================================
  // 5. PERFORMANCE TESTS
  // =============================================================================

  describe('Performance', () => {
    it('should handle 10K internings efficiently', () => {
      const largePool = new LRUStringPool(10000);
      const start = performance.now();

      for (let i = 0; i < 10000; i++) {
        largePool.intern(`string-${i}`);
      }

      const elapsed = performance.now() - start;

      // Should complete in reasonable time (< 100ms for 10K ops)
      expect(elapsed).toBeLessThan(100);
    });

    it('should maintain O(1) average for intern operations', () => {
      const largePool = new LRUStringPool(1000);

      // First, fill the pool
      for (let i = 0; i < 1000; i++) {
        largePool.intern(`init-${i}`);
      }

      // Measure time for 1000 operations at capacity
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        // Mix of hits and misses
        largePool.intern(`init-${i % 500}`);
        largePool.intern(`new-${i}`);
      }
      const elapsed = performance.now() - start;

      // Average operation should be very fast
      const avgPerOp = elapsed / 2000;
      expect(avgPerOp).toBeLessThan(0.1); // < 0.1ms per op
    });

    it('should not degrade performance with evictions', () => {
      const smallPool = new LRUStringPool(100);

      // Cause many evictions
      const start = performance.now();
      for (let i = 0; i < 10000; i++) {
        smallPool.intern(`evict-test-${i}`);
      }
      const elapsed = performance.now() - start;

      // Should still complete quickly despite constant evictions
      expect(elapsed).toBeLessThan(100);
    });
  });

  // =============================================================================
  // 6. GLOBAL POOL TESTS
  // =============================================================================

  describe('Global String Pool', () => {
    beforeEach(() => {
      resetStringPool();
    });

    it('should expose global pool statistics', () => {
      const stats = getStringPoolStats();
      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      expect(stats).toHaveProperty('evictions');
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('maxSize');
      expect(stats).toHaveProperty('hitRate');
    });

    it('should allow resetting global pool', () => {
      // This should not throw
      expect(() => resetStringPool()).not.toThrow();

      const stats = getStringPoolStats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  // =============================================================================
  // 7. EDGE CASES
  // =============================================================================

  describe('Edge Cases', () => {
    it('should handle pool size of 1', () => {
      const tinyPool = new LRUStringPool(1);

      tinyPool.intern('a');
      expect(tinyPool.has('a')).toBe(true);

      tinyPool.intern('b');
      expect(tinyPool.has('a')).toBe(false);
      expect(tinyPool.has('b')).toBe(true);
    });

    it('should handle very long strings', () => {
      const longString = 'x'.repeat(10000);
      const ref1 = pool.intern(longString);
      const ref2 = pool.intern(longString);

      expect(ref1).toBe(ref2);
      expect(ref1.length).toBe(10000);
    });

    it('should handle clear operation', () => {
      pool.intern('a');
      pool.intern('b');
      pool.intern('c');

      pool.clear();

      expect(pool.size).toBe(0);
      expect(pool.has('a')).toBe(false);
      expect(pool.has('b')).toBe(false);
      expect(pool.has('c')).toBe(false);
    });

    it('should handle interning same string in rapid succession', () => {
      const refs: string[] = [];
      for (let i = 0; i < 100; i++) {
        refs.push(pool.intern('repeated'));
      }

      // All should be the same reference
      const first = refs[0];
      expect(refs.every(r => r === first)).toBe(true);
    });
  });

  // =============================================================================
  // 8. CONFIGURABLE MAX SIZE
  // =============================================================================

  describe('Configurable Max Size', () => {
    it('should use default max size when not specified', () => {
      const defaultPool = new LRUStringPool();
      expect(defaultPool.maxSize).toBe(10000); // Default from implementation
    });

    it('should allow custom max size', () => {
      const customPool = new LRUStringPool(5000);
      expect(customPool.maxSize).toBe(5000);
    });

    it('should reject invalid max size', () => {
      expect(() => new LRUStringPool(0)).toThrow();
      expect(() => new LRUStringPool(-1)).toThrow();
    });
  });

  // =============================================================================
  // 9. MEMORY LEAK PREVENTION TESTS (TDD - Issue evodb-4dt)
  // =============================================================================

  describe('Memory Leak Prevention', () => {
    it('should reject strings exceeding maxStringLength', () => {
      // Memory leak: unbounded string length allows massive memory consumption
      // Even with maxSize=100, 100 strings of 1MB each = 100MB memory
      const poolWithLimit = new LRUStringPool(100, { maxStringLength: 1000 });

      const shortString = 'x'.repeat(500);
      const longString = 'y'.repeat(2000);

      // Short string should be interned
      const interned = poolWithLimit.intern(shortString);
      expect(interned).toBe(shortString);
      expect(poolWithLimit.has(shortString)).toBe(true);

      // Long string should NOT be interned (returns original, not cached)
      const notInterned = poolWithLimit.intern(longString);
      expect(notInterned).toBe(longString); // Returns original string
      expect(poolWithLimit.has(longString)).toBe(false); // But not cached
    });

    it('should track memory usage and enforce maxMemoryBytes', () => {
      // Memory leak: count-based limits ignore string sizes
      // 10 strings of 100KB each = 1MB even with maxSize=10
      const poolWithMemLimit = new LRUStringPool(1000, { maxMemoryBytes: 1000 });

      // Add strings that are ~100 bytes each (including overhead)
      for (let i = 0; i < 20; i++) {
        poolWithMemLimit.intern(`string-${i}-${'x'.repeat(50)}`);
      }

      // Memory should be limited, so fewer than 20 strings should be cached
      const stats = poolWithMemLimit.getStats();
      expect(stats.memoryBytes).toBeDefined();
      expect(stats.memoryBytes).toBeLessThanOrEqual(1200); // Allow some overhead
    });

    it('should support TTL-based expiration to prevent stale entry accumulation', () => {
      // Memory leak: if working set is small, old entries never get evicted
      // Example: pool of 10K, but only 100 unique strings used actively
      // The other 9900 entries sit forever consuming memory
      const poolWithTTL = new LRUStringPool(100, { ttlMs: 50 });

      // Add some entries
      poolWithTTL.intern('entry-1');
      poolWithTTL.intern('entry-2');
      poolWithTTL.intern('entry-3');

      expect(poolWithTTL.has('entry-1')).toBe(true);

      // Wait for TTL to expire
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          // After TTL, entries should be eligible for cleanup
          // Note: actual cleanup happens on next operation or explicit prune
          poolWithTTL.pruneExpired();

          expect(poolWithTTL.has('entry-1')).toBe(false);
          expect(poolWithTTL.has('entry-2')).toBe(false);
          expect(poolWithTTL.has('entry-3')).toBe(false);
          resolve();
        }, 100);
      });
    });

    it('should refresh TTL on access', () => {
      const poolWithTTL = new LRUStringPool(100, { ttlMs: 100 });

      poolWithTTL.intern('keep-alive');

      return new Promise<void>((resolve) => {
        // Re-access before TTL expires
        setTimeout(() => {
          poolWithTTL.intern('keep-alive'); // Refresh TTL
        }, 50);

        // Check after original TTL would have expired
        setTimeout(() => {
          // Entry should still exist because we refreshed it
          expect(poolWithTTL.has('keep-alive')).toBe(true);
          resolve();
        }, 130);
      });
    });

    it('should report memoryBytes in stats', () => {
      const poolWithStats = new LRUStringPool(100);

      poolWithStats.intern('hello');
      poolWithStats.intern('world');
      poolWithStats.intern('testing-memory-stats');

      const stats = poolWithStats.getStats();

      // Stats should include memory estimate
      expect(stats.memoryBytes).toBeDefined();
      expect(stats.memoryBytes).toBeGreaterThan(0);
      // Rough estimate: 5 + 5 + 20 chars = 30 chars * 2 bytes = 60 bytes min
      expect(stats.memoryBytes).toBeGreaterThanOrEqual(30);
    });

    it('should evict by memory pressure before count limit', () => {
      // Test that memory limit triggers eviction even when count is low
      const poolWithMemLimit = new LRUStringPool(1000, { maxMemoryBytes: 200 });

      // Add 5 strings of ~50 bytes each = ~250 bytes total
      // Memory limit of 200 should cause evictions
      for (let i = 0; i < 5; i++) {
        poolWithMemLimit.intern(`mem-test-${i}-${'z'.repeat(30)}`);
      }

      // Should have evicted some entries to stay under memory limit
      expect(poolWithMemLimit.size).toBeLessThan(5);
    });

    it('should expose maxStringLength in stats', () => {
      const poolWithLimit = new LRUStringPool(100, { maxStringLength: 500 });
      const stats = poolWithLimit.getStats();

      expect(stats.maxStringLength).toBe(500);
    });

    it('should handle concurrent TTL expiration correctly', () => {
      const poolWithTTL = new LRUStringPool(100, { ttlMs: 50 });

      // Add entries at different times
      poolWithTTL.intern('first');

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          poolWithTTL.intern('second');
        }, 30);

        setTimeout(() => {
          poolWithTTL.pruneExpired();
          // 'first' should be expired (>50ms old), 'second' should not be (<50ms old)
          expect(poolWithTTL.has('first')).toBe(false);
          expect(poolWithTTL.has('second')).toBe(true);
          resolve();
        }, 70);
      });
    });
  });

  // =============================================================================
  // 10. HIGH HIT RATE CACHE OPTIMIZATION BENCHMARK (Issue: evodb-wvz)
  // =============================================================================

  describe('High Hit Rate Cache Optimization (evodb-wvz)', () => {
    /**
     * This benchmark tests the optimization for cache hit handling.
     *
     * Problem: The original implementation used Map delete+set on every cache hit
     * to maintain LRU order. At high hit rates (90%+), this was expensive:
     * - Map delete: O(1) amortized but involves hash table operations
     * - Map set: O(1) amortized but involves hash table operations
     * - Object allocation: New CacheEntry object on every hit
     *
     * Solution: Doubly-linked list for O(1) move-to-tail via pointer updates:
     * - No Map modifications on cache hit (only on miss/eviction)
     * - No object allocation on cache hit (in-place lastAccess update)
     * - 4-6 pointer updates vs hash table operations
     */

    it('should efficiently handle 95% hit rate workload', () => {
      const pool = new LRUStringPool(1000);

      // Warm up: add 100 strings that will be hot
      const hotStrings = Array.from({ length: 100 }, (_, i) => `hot-string-${i}`);
      for (const s of hotStrings) {
        pool.intern(s);
      }

      // Workload: 95% hits on hot strings, 5% new strings
      const iterations = 100000;
      const coldStrings = Array.from({ length: 5000 }, (_, i) => `cold-string-${i}`);
      let coldIndex = 0;

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        if (Math.random() < 0.95) {
          // 95% hit rate - access hot strings
          pool.intern(hotStrings[i % hotStrings.length]);
        } else {
          // 5% miss rate - new strings
          pool.intern(coldStrings[coldIndex++ % coldStrings.length]);
        }
      }
      const elapsed = performance.now() - start;

      const stats = pool.getStats();
      const avgTimePerOp = elapsed / iterations;

      console.log(`High Hit Rate Benchmark (95% hits, ${iterations.toLocaleString()} ops):`);
      console.log(`  Total time: ${elapsed.toFixed(2)}ms`);
      console.log(`  Avg time per op: ${(avgTimePerOp * 1000).toFixed(2)}us`);
      console.log(`  Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
      console.log(`  Hits: ${stats.hits.toLocaleString()}`);
      console.log(`  Misses: ${stats.misses.toLocaleString()}`);
      console.log(`  Evictions: ${stats.evictions.toLocaleString()}`);

      // Performance assertion: should complete 100K ops in < 100ms
      // This is a reasonable threshold that validates the O(1) optimization
      expect(elapsed).toBeLessThan(100);

      // Hit rate should be approximately 95%
      expect(stats.hitRate).toBeGreaterThan(0.90);
    });

    it('should show O(1) cache hit performance regardless of pool size', () => {
      // Test that cache hits are O(1) - time shouldn't grow with pool size
      const sizes = [100, 1000, 10000];
      const hitsPerTest = 50000;
      const results: { size: number; avgTime: number }[] = [];

      for (const size of sizes) {
        const pool = new LRUStringPool(size);

        // Fill the pool
        for (let i = 0; i < size; i++) {
          pool.intern(`string-${i}`);
        }

        // Measure hit performance
        const start = performance.now();
        for (let i = 0; i < hitsPerTest; i++) {
          pool.intern(`string-${i % size}`); // Always a hit
        }
        const elapsed = performance.now() - start;

        results.push({ size, avgTime: elapsed / hitsPerTest });
      }

      console.log(`O(1) Cache Hit Verification:`);
      for (const { size, avgTime } of results) {
        console.log(`  Pool size ${size.toLocaleString()}: ${(avgTime * 1000).toFixed(3)}us/op`);
      }

      // O(1) property: time should not scale significantly with pool size
      // Allow 3x variance for environmental noise, but times should be similar
      const minTime = Math.min(...results.map(r => r.avgTime));
      const maxTime = Math.max(...results.map(r => r.avgTime));
      expect(maxTime).toBeLessThan(minTime * 3);
    });

    it('should maintain correct LRU ordering with doubly-linked list', () => {
      const pool = new LRUStringPool(5);

      // Add entries in order: a, b, c, d, e
      pool.intern('a');
      pool.intern('b');
      pool.intern('c');
      pool.intern('d');
      pool.intern('e');

      // Access pattern: a, c (moves them to most recent)
      pool.intern('a'); // Order now: b, d, e, c, a
      pool.intern('c'); // Order now: b, d, e, a, c

      // Add new entry - should evict 'b' (oldest)
      pool.intern('f'); // Order now: d, e, a, c, f

      expect(pool.has('a')).toBe(true);
      expect(pool.has('b')).toBe(false); // Evicted
      expect(pool.has('c')).toBe(true);
      expect(pool.has('d')).toBe(true);
      expect(pool.has('e')).toBe(true);
      expect(pool.has('f')).toBe(true);

      // Access 'd' to move it to end
      pool.intern('d'); // Order now: e, a, c, f, d

      // Add another - should evict 'e'
      pool.intern('g'); // Order now: a, c, f, d, g

      expect(pool.has('d')).toBe(true);
      expect(pool.has('e')).toBe(false); // Evicted
      expect(pool.has('g')).toBe(true);
    });

    it('should handle rapid repeated access to same string', () => {
      const pool = new LRUStringPool(100);

      pool.intern('hotkey');

      // Rapid repeated access to same string
      const iterations = 100000;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        pool.intern('hotkey');
      }
      const elapsed = performance.now() - start;

      const stats = pool.getStats();

      console.log(`Rapid Repeated Access (${iterations.toLocaleString()} accesses to same key):`);
      console.log(`  Total time: ${elapsed.toFixed(2)}ms`);
      console.log(`  Avg time per op: ${((elapsed / iterations) * 1000).toFixed(3)}us`);

      // When accessing the same key repeatedly, it's already at tail
      // so moveToTail should be a no-op (early return)
      expect(elapsed).toBeLessThan(50);
      expect(stats.hits).toBe(iterations);
    });

    it('should compare delete+set vs pointer-based LRU (simulation)', () => {
      // This test simulates the difference between the two approaches
      // by measuring the optimized implementation's performance

      const poolSize = 1000;
      const pool = new LRUStringPool(poolSize);

      // Fill pool
      for (let i = 0; i < poolSize; i++) {
        pool.intern(`key-${i}`);
      }

      // Measure cache hit performance (optimized path)
      const iterations = 100000;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        // Access random existing key - all hits, moving nodes around
        pool.intern(`key-${i % poolSize}`);
      }

      const optimizedTime = performance.now() - start;

      console.log(`Optimized LRU Performance (${iterations.toLocaleString()} cache hits):`);
      console.log(`  Time: ${optimizedTime.toFixed(2)}ms`);
      console.log(`  Throughput: ${Math.round(iterations / (optimizedTime / 1000)).toLocaleString()} ops/s`);

      // Should be fast - pointer operations only, no Map modifications
      expect(optimizedTime).toBeLessThan(100);
    });
  });
});
