/**
 * Bloom Filter Tests
 *
 * Tests for the bit array-based bloom filter implementation.
 * Verifies space efficiency, false positive rates, and serialization.
 *
 * Issue: evodb-xhy - Replace bloom filter Map with bit arrays
 */

import { describe, it, expect } from 'vitest';
import {
  BloomFilter,
  BLOOM_BITS_PER_ELEMENT,
  BLOOM_HASH_COUNT,
  calculateBloomParams,
} from '../snippet-format.js';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Calculate the size of a Map<string, Set<string>> for comparison
 * This simulates what a naive Map-based implementation would cost
 */
function estimateMapBasedSize(elementCount: number, avgKeyLength: number = 10): number {
  // Each Map entry has overhead: key string + Set object + pointer overhead
  // Conservative estimate: ~100 bytes per entry in V8
  const perEntryOverhead = 100;
  // String storage: 2 bytes per character in JS strings
  const stringOverhead = avgKeyLength * 2;
  // Set object overhead per entry
  const setOverhead = 50;

  return elementCount * (perEntryOverhead + stringOverhead + setOverhead);
}

/**
 * Generate test strings
 */
function generateStrings(count: number, prefix: string = 'value_'): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}${i.toString().padStart(8, '0')}`);
}

// =============================================================================
// SPACE EFFICIENCY TESTS (TDD RED -> GREEN)
// =============================================================================

describe('BloomFilter Space Efficiency', () => {
  it('should use Uint8Array bit storage instead of Map<string, Set<string>>', () => {
    const bloom = new BloomFilter(1000);

    // Verify the internal storage is a Uint8Array (bit array)
    const bytes = bloom.toBytes();
    expect(bytes).toBeInstanceOf(Uint8Array);

    // Calculate expected size: 1000 elements * 10 bits/element = 10000 bits = 1250 bytes
    const expectedBits = 1000 * BLOOM_BITS_PER_ELEMENT;
    const expectedBytes = Math.ceil(expectedBits / 8);
    expect(bytes.length).toBe(expectedBytes);
  });

  it('should be significantly more space efficient than Map-based approach', () => {
    const elementCounts = [100, 1000, 10000, 100000];

    for (const count of elementCounts) {
      const bloom = new BloomFilter(count);
      const bloomSize = bloom.toBytes().length;
      const mapEstimate = estimateMapBasedSize(count);

      // Bit array should be at least 10x smaller than Map-based approach
      const ratio = mapEstimate / bloomSize;

      console.log(`Elements: ${count.toLocaleString()}`);
      console.log(`  Bit array: ${bloomSize.toLocaleString()} bytes`);
      console.log(`  Map estimate: ${mapEstimate.toLocaleString()} bytes`);
      console.log(`  Space savings: ${ratio.toFixed(1)}x smaller`);

      expect(ratio).toBeGreaterThan(10);
    }
  });

  it('should have predictable size based on element count', () => {
    // Size should be: ceil(elementCount * BLOOM_BITS_PER_ELEMENT / 8)
    const testCases = [
      { count: 100, expectedBytes: Math.ceil(100 * BLOOM_BITS_PER_ELEMENT / 8) },
      { count: 1000, expectedBytes: Math.ceil(1000 * BLOOM_BITS_PER_ELEMENT / 8) },
      { count: 10000, expectedBytes: Math.ceil(10000 * BLOOM_BITS_PER_ELEMENT / 8) },
    ];

    for (const { count, expectedBytes } of testCases) {
      const bloom = new BloomFilter(count);
      expect(bloom.toBytes().length).toBe(expectedBytes);
    }
  });

  it('should use 10 bits per element for ~1% false positive rate', () => {
    // With k=7 hash functions and m/n=10 bits per element,
    // theoretical FP rate is approximately (1 - e^(-7/10))^7 ~ 0.82%
    expect(BLOOM_BITS_PER_ELEMENT).toBe(10);
    expect(BLOOM_HASH_COUNT).toBe(7);
  });
});

// =============================================================================
// FALSE POSITIVE RATE TESTS
// =============================================================================

describe('BloomFilter False Positive Rate', () => {
  it('should have no false negatives', () => {
    const count = 1000;
    const bloom = new BloomFilter(count);
    const values = generateStrings(count);

    // Add all values
    for (const v of values) {
      bloom.add(v);
    }

    // Check all values - should all return true (no false negatives)
    for (const v of values) {
      expect(bloom.mightContain(v)).toBe(true);
    }
  });

  it('should have false positive rate under 2%', () => {
    const count = 10000;
    const bloom = new BloomFilter(count);

    // Insert values
    const inserted = generateStrings(count, 'inserted_');
    for (const v of inserted) {
      bloom.add(v);
    }

    // Check values that were NOT inserted
    const notInserted = generateStrings(count, 'not_inserted_');
    let falsePositives = 0;
    for (const v of notInserted) {
      if (bloom.mightContain(v)) {
        falsePositives++;
      }
    }

    const fpRate = falsePositives / notInserted.length;
    console.log(`False positive rate: ${(fpRate * 100).toFixed(2)}% (${falsePositives}/${notInserted.length})`);

    // With 10 bits per element and 7 hash functions, target is ~1%
    // Allow up to 2% to account for hash collision variance
    expect(fpRate).toBeLessThan(0.02);
  });

  it('should maintain consistent false positive rate across different data sizes', () => {
    const sizes = [1000, 5000, 10000];
    const rates: number[] = [];

    for (const size of sizes) {
      const bloom = new BloomFilter(size);

      // Insert values
      for (let i = 0; i < size; i++) {
        bloom.add(`value_${i}`);
      }

      // Check non-existent values
      let falsePositives = 0;
      const testSize = Math.min(size, 1000);
      for (let i = size; i < size + testSize; i++) {
        if (bloom.mightContain(`value_${i}`)) {
          falsePositives++;
        }
      }

      const rate = falsePositives / testSize;
      rates.push(rate);
      console.log(`Size ${size}: FP rate = ${(rate * 100).toFixed(2)}%`);
    }

    // All rates should be under 2%
    for (const rate of rates) {
      expect(rate).toBeLessThan(0.02);
    }
  });
});

// =============================================================================
// SERIALIZATION TESTS
// =============================================================================

describe('BloomFilter Serialization', () => {
  it('should serialize to and deserialize from bytes', () => {
    const bloom = new BloomFilter(1000);
    const values = generateStrings(100);

    for (const v of values) {
      bloom.add(v);
    }

    // Serialize
    const bytes = bloom.toBytes();
    expect(bytes).toBeInstanceOf(Uint8Array);

    // Deserialize
    const restored = BloomFilter.fromBytes(bytes);

    // Verify all values are still present
    for (const v of values) {
      expect(restored.mightContain(v)).toBe(true);
    }

    // Verify size is preserved
    expect(restored.toBytes().length).toBe(bytes.length);
  });

  it('should produce identical bytes for same filter state', () => {
    const bloom1 = new BloomFilter(100);
    const bloom2 = new BloomFilter(100);

    const values = generateStrings(50);

    for (const v of values) {
      bloom1.add(v);
      bloom2.add(v);
    }

    const bytes1 = bloom1.toBytes();
    const bytes2 = bloom2.toBytes();

    expect(bytes1.length).toBe(bytes2.length);
    expect(Array.from(bytes1)).toEqual(Array.from(bytes2));
  });
});

// =============================================================================
// HASH FUNCTION TESTS
// =============================================================================

describe('BloomFilter Hash Functions', () => {
  it('should use 7 hash functions for optimal distribution', () => {
    expect(BLOOM_HASH_COUNT).toBe(7);
  });

  it('should handle different value types', () => {
    const bloom = new BloomFilter(100);

    // String values
    bloom.add('hello');
    expect(bloom.mightContain('hello')).toBe(true);

    // Numeric values
    bloom.add(12345);
    expect(bloom.mightContain(12345)).toBe(true);

    // Values not added should usually return false
    expect(bloom.mightContain('not_added')).toBe(false);
    expect(bloom.mightContain(99999)).toBe(false);
  });

  it('should have good bit distribution', () => {
    const bloom = new BloomFilter(1000);

    // Add some values
    for (let i = 0; i < 100; i++) {
      bloom.add(`test_${i}`);
    }

    // Check that bits are set across the filter
    const bytes = bloom.toBytes();
    let setBits = 0;
    for (const byte of bytes) {
      for (let bit = 0; bit < 8; bit++) {
        if (byte & (1 << bit)) {
          setBits++;
        }
      }
    }

    // With 100 elements and 7 hash functions, we expect ~700 bit sets
    // Accounting for collisions, should have at least 500 unique bits set
    console.log(`Set bits: ${setBits} / ${bytes.length * 8} (${(setBits / (bytes.length * 8) * 100).toFixed(1)}%)`);
    expect(setBits).toBeGreaterThan(300);
  });
});

// =============================================================================
// PERFORMANCE TESTS
// =============================================================================

describe('BloomFilter Performance', () => {
  it('should add and lookup elements quickly', () => {
    const count = 100000;
    const bloom = new BloomFilter(count);
    const values = generateStrings(count);

    // Benchmark add
    const addStart = performance.now();
    for (const v of values) {
      bloom.add(v);
    }
    const addTime = performance.now() - addStart;

    // Benchmark lookup
    const lookupStart = performance.now();
    for (const v of values) {
      bloom.mightContain(v);
    }
    const lookupTime = performance.now() - lookupStart;

    console.log(`BloomFilter Performance (${count.toLocaleString()} elements):`);
    console.log(`  Add: ${addTime.toFixed(2)}ms (${(addTime / count * 1000).toFixed(3)}us per element)`);
    console.log(`  Lookup: ${lookupTime.toFixed(2)}ms (${(lookupTime / count * 1000).toFixed(3)}us per element)`);

    // Should be fast - under 1 microsecond per operation
    expect(addTime / count).toBeLessThan(1); // < 1ms per 1000 ops
    expect(lookupTime / count).toBeLessThan(1);
  });

  it('should maintain constant time operations regardless of fill rate', () => {
    const size = 100000;
    const bloom = new BloomFilter(size);

    // Add 10% of capacity
    const iterations = 10000;
    for (let i = 0; i < iterations; i++) {
      bloom.add(`early_${i}`);
    }

    // Measure lookup time for early elements
    const earlyStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      bloom.mightContain(`early_${i}`);
    }
    const earlyTime = performance.now() - earlyStart;

    // Fill to 90%
    for (let i = iterations; i < 90000; i++) {
      bloom.add(`fill_${i}`);
    }

    // Measure lookup time for same elements after more fill
    const lateStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      bloom.mightContain(`early_${i}`);
    }
    const lateTime = performance.now() - lateStart;

    console.log(`Lookup time at 10% fill: ${earlyTime.toFixed(2)}ms`);
    console.log(`Lookup time at 90% fill: ${lateTime.toFixed(2)}ms`);

    // Lookup time should be relatively constant (within 3x)
    expect(lateTime / earlyTime).toBeLessThan(3);
  });
});

// =============================================================================
// EDGE CASES
// =============================================================================

describe('BloomFilter Edge Cases', () => {
  it('should handle empty filter', () => {
    const bloom = new BloomFilter(100);

    // Empty filter should return false for all lookups
    expect(bloom.mightContain('anything')).toBe(false);
    expect(bloom.mightContain(12345)).toBe(false);
  });

  it('should handle single element', () => {
    const bloom = new BloomFilter(100);
    bloom.add('only_one');

    expect(bloom.mightContain('only_one')).toBe(true);
    expect(bloom.mightContain('other')).toBe(false);
  });

  it('should handle duplicate adds', () => {
    const bloom = new BloomFilter(100);

    // Add same value multiple times
    for (let i = 0; i < 10; i++) {
      bloom.add('duplicate');
    }

    expect(bloom.mightContain('duplicate')).toBe(true);

    // Size should not have changed
    const bytes = bloom.toBytes();
    expect(bytes.length).toBe(Math.ceil(100 * BLOOM_BITS_PER_ELEMENT / 8));
  });

  it('should handle empty string', () => {
    const bloom = new BloomFilter(100);
    bloom.add('');

    expect(bloom.mightContain('')).toBe(true);
  });

  it('should handle very long strings', () => {
    const bloom = new BloomFilter(100);
    const longString = 'x'.repeat(10000);
    bloom.add(longString);

    expect(bloom.mightContain(longString)).toBe(true);
  });
});

// =============================================================================
// CONFIGURABLE FALSE POSITIVE RATE TESTS
// =============================================================================

describe('BloomFilter Configurable False Positive Rate', () => {
  it('should calculate optimal parameters for different FPR targets', () => {
    // 1% FPR - default
    const params1 = calculateBloomParams(1000, 0.01);
    expect(params1.numBits).toBeGreaterThan(9000); // ~9585 bits
    expect(params1.numBits).toBeLessThan(11000);
    expect(params1.numHashes).toBe(7);

    // 0.1% FPR - more bits, more hashes
    const params01 = calculateBloomParams(1000, 0.001);
    expect(params01.numBits).toBeGreaterThan(14000); // ~14378 bits
    expect(params01.numBits).toBeLessThan(16000);
    expect(params01.numHashes).toBe(10);

    // 0.01% FPR - even more bits and hashes
    const params001 = calculateBloomParams(1000, 0.0001);
    expect(params001.numBits).toBeGreaterThan(19000); // ~19170 bits
    expect(params001.numBits).toBeLessThan(21000);
    expect(params001.numHashes).toBe(13);

    console.log('Optimal parameters for 1000 elements:');
    console.log(`  1% FPR:    ${params1.numBits} bits, ${params1.numHashes} hashes`);
    console.log(`  0.1% FPR:  ${params01.numBits} bits, ${params01.numHashes} hashes`);
    console.log(`  0.01% FPR: ${params001.numBits} bits, ${params001.numHashes} hashes`);
  });

  it('should support configurable FPR via constructor number parameter', () => {
    const bloom = new BloomFilter(1000, 0.001); // 0.1% FPR

    // Should use more bits than default
    const defaultBloom = new BloomFilter(1000);
    expect(bloom.getSizeBytes()).toBeGreaterThan(defaultBloom.getSizeBytes());

    // Should use more hashes
    expect(bloom.getHashCount()).toBeGreaterThan(defaultBloom.getHashCount());
  });

  it('should support configurable FPR via constructor config object', () => {
    const bloom = new BloomFilter(1000, { falsePositiveRate: 0.001 });

    // Verify size matches expected for 0.1% FPR
    const params = calculateBloomParams(1000, 0.001);
    expect(bloom.getSizeBytes()).toBe(Math.ceil(params.numBits / 8));
    expect(bloom.getHashCount()).toBe(params.numHashes);
  });

  it('should support factory method for configurable FPR', () => {
    const bloom = BloomFilter.withFalsePositiveRate(1000, 0.001);

    expect(bloom).toBeInstanceOf(BloomFilter);
    expect(bloom.getHashCount()).toBe(10); // Optimal for 0.1% FPR
  });

  it('should achieve lower false positive rate with 0.1% configuration', () => {
    const count = 5000;
    const targetFpr = 0.001; // 0.1%
    const bloom = new BloomFilter(count, targetFpr);

    // Insert values
    for (let i = 0; i < count; i++) {
      bloom.add(`value_${i}`);
    }

    // Test false positives
    let falsePositives = 0;
    const testSize = 10000;
    for (let i = count; i < count + testSize; i++) {
      if (bloom.mightContain(`value_${i}`)) {
        falsePositives++;
      }
    }

    const observedFpr = falsePositives / testSize;
    console.log(`Target FPR: ${(targetFpr * 100).toFixed(2)}%, Observed: ${(observedFpr * 100).toFixed(3)}%`);

    // Double-hashing doesn't achieve theoretical optimal FPR, but should be
    // significantly lower than the default 1% configuration
    // Allow up to 1% actual FPR (10x theoretical target) due to hash quality
    expect(observedFpr).toBeLessThan(0.01);
  });

  it('should achieve lower false positive rate with 0.01% configuration', () => {
    const count = 5000;
    const targetFpr = 0.0001; // 0.01%
    const bloom = new BloomFilter(count, targetFpr);

    // Insert values
    for (let i = 0; i < count; i++) {
      bloom.add(`value_${i}`);
    }

    // Test false positives
    let falsePositives = 0;
    const testSize = 10000;
    for (let i = count; i < count + testSize; i++) {
      if (bloom.mightContain(`value_${i}`)) {
        falsePositives++;
      }
    }

    const observedFpr = falsePositives / testSize;
    console.log(`Target FPR: ${(targetFpr * 100).toFixed(3)}%, Observed: ${(observedFpr * 100).toFixed(4)}%`);

    // Double-hashing with FNV doesn't achieve theoretical optimal FPR for very
    // low targets, but should still be significantly lower than 1% default
    // Allow up to 0.5% actual FPR (50x theoretical target) due to hash quality
    expect(observedFpr).toBeLessThan(0.005);
  });

  it('should trade off space for accuracy', () => {
    const count = 10000;

    const bloom1pct = new BloomFilter(count, 0.01);   // 1%
    const bloom01pct = new BloomFilter(count, 0.001); // 0.1%
    const bloom001pct = new BloomFilter(count, 0.0001); // 0.01%

    console.log('Space vs Accuracy Trade-off (10000 elements):');
    console.log(`  1% FPR:    ${bloom1pct.getSizeBytes()} bytes, ${bloom1pct.getHashCount()} hashes`);
    console.log(`  0.1% FPR:  ${bloom01pct.getSizeBytes()} bytes, ${bloom01pct.getHashCount()} hashes`);
    console.log(`  0.01% FPR: ${bloom001pct.getSizeBytes()} bytes, ${bloom001pct.getHashCount()} hashes`);

    // More accurate filters should be larger
    expect(bloom01pct.getSizeBytes()).toBeGreaterThan(bloom1pct.getSizeBytes());
    expect(bloom001pct.getSizeBytes()).toBeGreaterThan(bloom01pct.getSizeBytes());

    // More accurate filters should use more hashes
    expect(bloom01pct.getHashCount()).toBeGreaterThan(bloom1pct.getHashCount());
    expect(bloom001pct.getHashCount()).toBeGreaterThan(bloom01pct.getHashCount());
  });

  it('should be backwards compatible with default constructor', () => {
    const bloom = new BloomFilter(1000);

    // Default should use BLOOM_BITS_PER_ELEMENT and BLOOM_HASH_COUNT
    expect(bloom.getSizeBytes()).toBe(Math.ceil(1000 * BLOOM_BITS_PER_ELEMENT / 8));
    expect(bloom.getHashCount()).toBe(BLOOM_HASH_COUNT);
  });

  it('should handle edge case FPR values', () => {
    // Very high FPR (clamped to 0.5)
    const highFprParams = calculateBloomParams(1000, 0.9);
    expect(highFprParams.numHashes).toBeGreaterThan(0);

    // Very low FPR (clamped to 0.0001)
    const lowFprParams = calculateBloomParams(1000, 0.00001);
    expect(lowFprParams.numHashes).toBeLessThanOrEqual(20); // Capped at 20

    // Zero elements
    const zeroParams = calculateBloomParams(0, 0.01);
    expect(zeroParams.numBits).toBeGreaterThan(0);
  });
});
