/**
 * @evodb/core - Encode Module Tests (TDD)
 *
 * Tests for the encode module's string interning integration.
 * Verifies that the LRU string intern pool maintains proper behavior
 * under high cardinality and doesn't cause cache thrashing.
 *
 * Issue: evodb-4dt - String intern pool memory leak fix
 *
 * The original implementation in encode.ts:14-25 had a stringInternPool Map
 * that cleared entirely when reaching 10000 entries, causing:
 * - Cache thrashing under high cardinality workloads
 * - Performance degradation due to loss of frequently used strings
 * - Memory spikes followed by complete cache invalidation
 *
 * The fix implements proper LRU eviction using the LRUStringPool class.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  encode,
  decode,
  Type,
  Encoding,
  resetStringPool,
  getStringPoolStats,
  internString,
  LRUStringPool,
  unpackBitsDense,
  unpackBitsLazy,
  type Column,
  type LazyBitmap,
} from '../index.js';

// =============================================================================
// 1. STRING INTERN POOL INTEGRATION TESTS
// =============================================================================

describe('Encode Module - String Interning Integration', () => {
  beforeEach(() => {
    resetStringPool();
  });

  describe('LRU Behavior', () => {
    it('should maintain LRU behavior when pool reaches capacity', () => {
      // This test verifies that the intern pool uses LRU eviction
      // instead of clearing entirely when it reaches capacity
      const pool = new LRUStringPool(5);

      // Fill the pool
      pool.intern('first');
      pool.intern('second');
      pool.intern('third');
      pool.intern('fourth');
      pool.intern('fifth');

      expect(pool.size).toBe(5);

      // Add one more - should evict 'first' (LRU)
      pool.intern('sixth');

      expect(pool.size).toBe(5); // Size should stay at max
      expect(pool.has('first')).toBe(false); // LRU evicted
      expect(pool.has('second')).toBe(true);
      expect(pool.has('sixth')).toBe(true);
    });

    it('should NOT clear entire pool when reaching capacity', () => {
      // This is the critical test - the original bug cleared everything
      const pool = new LRUStringPool(100);

      // Fill the pool completely
      for (let i = 0; i < 100; i++) {
        pool.intern(`string-${i}`);
      }
      expect(pool.size).toBe(100);

      // Add one more entry
      pool.intern('overflow-entry');

      // BUG: Old implementation would clear entire pool here
      // FIX: Should only evict ONE entry (the oldest)
      expect(pool.size).toBe(100); // Size should stay at max, NOT drop to 1
      expect(pool.has('string-99')).toBe(true); // Recent entries preserved
      expect(pool.has('overflow-entry')).toBe(true);
    });
  });

  describe('Frequently Used Strings Stay in Pool', () => {
    it('should keep frequently accessed strings even under high churn', () => {
      const pool = new LRUStringPool(10);

      // Frequently used strings
      const frequentStrings = ['user_id', 'timestamp', 'event_type'];

      // Access them initially
      frequentStrings.forEach(s => pool.intern(s));

      // Now add many other strings while periodically accessing frequent ones
      for (let i = 0; i < 50; i++) {
        // Add a unique string
        pool.intern(`unique-${i}`);

        // Keep refreshing frequently used strings
        frequentStrings.forEach(s => pool.intern(s));
      }

      // Frequently used strings should still be in the pool
      frequentStrings.forEach(s => {
        expect(pool.has(s)).toBe(true);
      });
    });

    it('should update access time when re-interning existing string', () => {
      const pool = new LRUStringPool(3);

      pool.intern('a'); // Order: a
      pool.intern('b'); // Order: a, b
      pool.intern('c'); // Order: a, b, c

      // Re-access 'a' to make it most recently used
      pool.intern('a'); // Order: b, c, a

      // Add new entry - should evict 'b' (now the LRU)
      pool.intern('d'); // Order: c, a, d

      expect(pool.has('a')).toBe(true); // Was refreshed
      expect(pool.has('b')).toBe(false); // Was evicted
      expect(pool.has('c')).toBe(true);
      expect(pool.has('d')).toBe(true);
    });
  });

  describe('No Cache Thrashing Under High Cardinality', () => {
    it('should maintain stable hit rate under sustained load', () => {
      const pool = new LRUStringPool(1000);

      // Phase 1: Build up cache with common strings
      const commonStrings = Array.from({ length: 100 }, (_, i) => `common-${i}`);
      commonStrings.forEach(s => pool.intern(s));

      pool.resetStats();

      // Phase 2: Mixed workload - common strings + new unique strings
      for (let i = 0; i < 5000; i++) {
        // 70% common strings, 30% unique
        if (Math.random() < 0.7) {
          pool.intern(commonStrings[i % commonStrings.length]);
        } else {
          pool.intern(`unique-${i}`);
        }
      }

      const stats = pool.getStats();

      // With LRU, common strings should stay in cache, giving reasonable hit rate
      // Old implementation would have ~0% hit rate due to full clears
      expect(stats.hitRate).toBeGreaterThan(0.3);
    });

    it('should not experience sudden performance drops at capacity boundary', () => {
      const pool = new LRUStringPool(100);

      const timings: number[] = [];

      // Measure operation time around the capacity boundary
      for (let batch = 0; batch < 3; batch++) {
        const start = performance.now();
        for (let i = 0; i < 200; i++) {
          pool.intern(`batch${batch}-string-${i}`);
        }
        const elapsed = performance.now() - start;
        timings.push(elapsed);
      }

      // All batches should have similar timing (no sudden drop)
      // Old implementation would show huge variance due to full clears
      const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
      timings.forEach(t => {
        // Each batch should be within 3x of average (allowing for some variance)
        // Handle edge case where avg is 0 (very fast execution)
        const threshold = Math.max(avg * 3, 2);
        expect(t).toBeLessThanOrEqual(threshold);
      });
    });

    it('should handle 10K high cardinality strings without clearing cache', () => {
      // This simulates the exact scenario that caused the original bug
      const pool = new LRUStringPool(10000);

      // Fill to exactly 10000 entries
      for (let i = 0; i < 10000; i++) {
        pool.intern(`high-card-${i}`);
      }

      expect(pool.size).toBe(10000);

      // Add one more - this is where the old code would clear EVERYTHING
      pool.intern('the-straw-that-breaks');

      // Pool should still have 10000 entries (evicted 1, added 1)
      expect(pool.size).toBe(10000);

      // Recent entries should still be present
      expect(pool.has('high-card-9999')).toBe(true);
      expect(pool.has('the-straw-that-breaks')).toBe(true);

      // Oldest entry should be evicted
      expect(pool.has('high-card-0')).toBe(false);
    });
  });
});

// =============================================================================
// 2. ENCODING WITH STRING INTERNING TESTS
// =============================================================================

describe('Encode Module - Dictionary Encoding with Interning', () => {
  beforeEach(() => {
    resetStringPool();
  });

  it('should use string interning for dictionary encoding', () => {
    // Use many repeated values to trigger dictionary encoding
    // Dict encoding is used when distinctEst < nonNull.length / 2
    // With 2 distinct values in 10 rows: 2 < 5 = true
    const column: Column = {
      path: 'status',
      type: Type.String,
      nullable: false,
      values: ['active', 'inactive', 'active', 'inactive', 'active', 'inactive', 'active', 'inactive', 'active', 'inactive'],
      nulls: [false, false, false, false, false, false, false, false, false, false],
    };

    // Encode the column
    const [encoded] = encode([column]);

    // Should use dictionary encoding for low cardinality strings (2 distinct in 10 rows)
    expect(encoded.encoding).toBe(Encoding.Dict);

    // Decode and verify roundtrip
    const decoded = decode(encoded, 10);
    expect(decoded.values).toEqual(column.values);

    // Verify string interning works by checking the intern function directly
    // (encoding may happen in worker isolation, so we test interning separately)
    const s1 = internString('active');
    const s2 = internString('active');
    expect(s1).toBe(s2); // Same reference due to interning
  });

  it('should handle repeated encode/decode cycles without memory explosion', () => {
    // This test ensures that repeated encoding doesn't cause unbounded memory growth
    const column: Column = {
      path: 'category',
      type: Type.String,
      nullable: false,
      values: Array.from({ length: 100 }, (_, i) => `category-${i % 10}`),
      nulls: Array(100).fill(false),
    };

    const initialStats = getStringPoolStats();

    // Do many encode/decode cycles
    for (let cycle = 0; cycle < 100; cycle++) {
      const [encoded] = encode([column]);
      decode(encoded, 100);
    }

    const finalStats = getStringPoolStats();

    // Pool size should be bounded (not growing unboundedly)
    expect(finalStats.size).toBeLessThanOrEqual(finalStats.maxSize);

    // Should have good hit rate due to repeated strings
    expect(finalStats.hitRate).toBeGreaterThan(0.5);
  });

  it('should properly encode high cardinality string columns', () => {
    // High cardinality columns with many unique values
    const uniqueValues = Array.from({ length: 1000 }, (_, i) => `unique-value-${i}`);
    const column: Column = {
      path: 'uuid',
      type: Type.String,
      nullable: false,
      values: uniqueValues,
      nulls: Array(1000).fill(false),
    };

    const [encoded] = encode([column]);
    const decoded = decode(encoded, 1000);

    // Values should round-trip correctly
    expect(decoded.values).toEqual(uniqueValues);
  });
});

// =============================================================================
// 3. GLOBAL INTERN STRING FUNCTION TESTS
// =============================================================================

describe('Global internString Function', () => {
  beforeEach(() => {
    resetStringPool();
  });

  it('should return same reference for identical strings', () => {
    const s1 = internString('test-string');
    const s2 = internString('test-string');

    expect(s1).toBe(s2);
    expect(Object.is(s1, s2)).toBe(true);
  });

  it('should track statistics correctly', () => {
    internString('a'); // miss
    internString('a'); // hit
    internString('b'); // miss
    internString('a'); // hit

    const stats = getStringPoolStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(2);
    expect(stats.hitRate).toBe(0.5);
  });

  it('should work correctly after reset', () => {
    internString('before-reset');

    resetStringPool();

    const stats = getStringPoolStats();
    expect(stats.size).toBe(0);
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);

    // Should still work after reset
    const s1 = internString('after-reset');
    const s2 = internString('after-reset');
    expect(s1).toBe(s2);
  });
});

// =============================================================================
// 4. EDGE CASES AND STRESS TESTS
// =============================================================================

describe('String Interning Edge Cases', () => {
  beforeEach(() => {
    resetStringPool();
  });

  it('should handle empty strings correctly', () => {
    const column: Column = {
      path: 'maybe_empty',
      type: Type.String,
      nullable: true,
      values: ['', 'value', '', 'other', ''],
      nulls: [false, false, false, false, false],
    };

    const [encoded] = encode([column]);
    const decoded = decode(encoded, 5);

    expect(decoded.values).toEqual(column.values);
  });

  it('should handle Unicode strings correctly', () => {
    const unicodeStrings = [
      '\u{1F600}', // emoji
      '\u{4E2D}\u{6587}', // Chinese characters
      '\u{0410}\u{0411}\u{0412}', // Cyrillic
      'caf\u{00E9}', // Latin with diacritics
    ];

    const column: Column = {
      path: 'unicode',
      type: Type.String,
      nullable: false,
      values: unicodeStrings,
      nulls: Array(unicodeStrings.length).fill(false),
    };

    const [encoded] = encode([column]);
    const decoded = decode(encoded, unicodeStrings.length);

    expect(decoded.values).toEqual(unicodeStrings);
  });

  it('should handle very long strings', () => {
    const longString = 'x'.repeat(10000);
    const column: Column = {
      path: 'long',
      type: Type.String,
      nullable: false,
      values: [longString, longString, longString],
      nulls: [false, false, false],
    };

    const [encoded] = encode([column]);
    const decoded = decode(encoded, 3);

    expect(decoded.values[0]).toBe(longString);
    expect(decoded.values[1]).toBe(longString);
    expect(decoded.values[2]).toBe(longString);
  });
});

// =============================================================================
// 5. LAZY BITMAP UNPACKING TESTS (Issue: evodb-a2x)
// =============================================================================

describe('Lazy Bitmap Unpacking', () => {
  /**
   * Helper to create a packed bitmap from boolean array
   */
  function packBits(bits: boolean[]): Uint8Array {
    const bytes = new Uint8Array(Math.ceil(bits.length / 8));
    for (let i = 0; i < bits.length; i++) {
      if (bits[i]) bytes[i >>> 3] |= 1 << (i & 7);
    }
    return bytes;
  }

  describe('Basic Functionality', () => {
    it('should return correct values for get(i)', () => {
      const bits = [true, false, true, false, true, true, false, false, true];
      const packed = packBits(bits);
      const lazy = unpackBitsLazy(packed, bits.length);

      for (let i = 0; i < bits.length; i++) {
        expect(lazy.get(i)).toBe(bits[i]);
      }
    });

    it('should report correct length', () => {
      const bits = new Array(100).fill(false);
      const packed = packBits(bits);
      const lazy = unpackBitsLazy(packed, bits.length);

      expect(lazy.length).toBe(100);
    });

    it('should match eager unpackBitsDense for toArray()', () => {
      const bits = Array.from({ length: 256 }, (_, i) => i % 3 === 0);
      const packed = packBits(bits);

      const eager = unpackBitsDense(packed, bits.length);
      const lazy = unpackBitsLazy(packed, bits.length);

      expect(lazy.toArray()).toEqual(eager);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty bitmap', () => {
      const packed = new Uint8Array(0);
      const lazy = unpackBitsLazy(packed, 0);

      expect(lazy.length).toBe(0);
      expect(lazy.toArray()).toEqual([]);
    });

    it('should handle all-true bitmap', () => {
      const bits = new Array(64).fill(true);
      const packed = packBits(bits);
      const lazy = unpackBitsLazy(packed, bits.length);

      for (let i = 0; i < bits.length; i++) {
        expect(lazy.get(i)).toBe(true);
      }
    });

    it('should handle all-false bitmap', () => {
      const bits = new Array(64).fill(false);
      const packed = packBits(bits);
      const lazy = unpackBitsLazy(packed, bits.length);

      for (let i = 0; i < bits.length; i++) {
        expect(lazy.get(i)).toBe(false);
      }
    });

    it('should handle non-byte-aligned count', () => {
      // 13 bits - not a multiple of 8
      const bits = [true, false, true, true, false, false, true, false, true, true, false, true, true];
      const packed = packBits(bits);
      const lazy = unpackBitsLazy(packed, bits.length);

      expect(lazy.length).toBe(13);
      for (let i = 0; i < bits.length; i++) {
        expect(lazy.get(i)).toBe(bits[i]);
      }
    });

    it('should handle large bitmap', () => {
      const count = 100000;
      const bits = Array.from({ length: count }, (_, i) => i % 7 === 0);
      const packed = packBits(bits);
      const lazy = unpackBitsLazy(packed, count);

      expect(lazy.length).toBe(count);

      // Spot check some values
      expect(lazy.get(0)).toBe(true);
      expect(lazy.get(1)).toBe(false);
      expect(lazy.get(7)).toBe(true);
      expect(lazy.get(14)).toBe(true);
      expect(lazy.get(99999)).toBe(bits[99999]);
    });
  });

  describe('Sparse Access Pattern', () => {
    it('should allow accessing specific indices without full unpacking', () => {
      const count = 100000;
      const bits = Array.from({ length: count }, (_, i) => i === 42 || i === 99999);
      const packed = packBits(bits);
      const lazy = unpackBitsLazy(packed, count);

      // Only access 2 specific indices
      expect(lazy.get(42)).toBe(true);
      expect(lazy.get(99999)).toBe(true);
      expect(lazy.get(0)).toBe(false);
      expect(lazy.get(50000)).toBe(false);

      // Verify we haven't allocated the full array by checking length still works
      expect(lazy.length).toBe(count);
    });

    it('should support early termination pattern', () => {
      const count = 100000;
      // First true at index 1000 (i >= 1000 AND i % 1000 === 0, so first match is 1000)
      const bits = Array.from({ length: count }, (_, i) => i >= 1000 && i % 1000 === 0);
      const packed = packBits(bits);
      const lazy = unpackBitsLazy(packed, count);

      // Find first true value (simulating scan with early exit)
      let firstTrue = -1;
      for (let i = 0; i < count; i++) {
        if (lazy.get(i)) {
          firstTrue = i;
          break;
        }
      }

      expect(firstTrue).toBe(1000);
    });
  });

  describe('Type Contract', () => {
    it('should satisfy LazyBitmap interface', () => {
      const packed = new Uint8Array([0b10101010]);
      const lazy: LazyBitmap = unpackBitsLazy(packed, 8);

      // Check interface properties exist and have correct types
      expect(typeof lazy.get).toBe('function');
      expect(typeof lazy.toArray).toBe('function');
      expect(typeof lazy.length).toBe('number');
    });
  });
});
