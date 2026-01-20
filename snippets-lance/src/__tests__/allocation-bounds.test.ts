/**
 * Tests for allocation bounds checking to prevent OOM attacks
 *
 * These tests verify that the allocation limits are enforced when parsing
 * untrusted header values from Lance index files.
 *
 * @module @evodb/snippets-lance/tests/allocation-bounds
 */

import { describe, it, expect } from 'vitest';
import {
  ALLOCATION_LIMITS,
  validateAllocationSize,
  validateCount,
} from '../types.js';

// ==========================================
// validateAllocationSize Tests
// ==========================================

describe('validateAllocationSize', () => {
  describe('valid sizes', () => {
    it('should accept size of 0', () => {
      expect(() => validateAllocationSize(0, 1000, 'test')).not.toThrow();
    });

    it('should accept size equal to limit', () => {
      expect(() => validateAllocationSize(1000, 1000, 'test')).not.toThrow();
    });

    it('should accept size below limit', () => {
      expect(() => validateAllocationSize(500, 1000, 'test')).not.toThrow();
    });

    it('should accept BigInt values within limit', () => {
      expect(() => validateAllocationSize(BigInt(500), 1000, 'test')).not.toThrow();
    });
  });

  describe('invalid sizes', () => {
    it('should reject size exceeding limit', () => {
      expect(() => validateAllocationSize(1001, 1000, 'test')).toThrow(
        /exceeds maximum allowed size/
      );
    });

    it('should reject negative numbers', () => {
      expect(() => validateAllocationSize(-1, 1000, 'test')).toThrow(
        /must be a non-negative/
      );
    });

    it('should reject NaN', () => {
      expect(() => validateAllocationSize(NaN, 1000, 'test')).toThrow(
        /must be a non-negative finite number/
      );
    });

    it('should reject Infinity', () => {
      expect(() => validateAllocationSize(Infinity, 1000, 'test')).toThrow(
        /must be a non-negative finite number/
      );
    });

    it('should reject negative BigInt', () => {
      expect(() => validateAllocationSize(BigInt(-1), 1000, 'test')).toThrow(
        /must be non-negative/
      );
    });

    it('should reject BigInt exceeding Number.MAX_SAFE_INTEGER', () => {
      const hugeValue = BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1);
      expect(() => validateAllocationSize(hugeValue, Number.MAX_VALUE, 'test')).toThrow(
        /exceeds Number.MAX_SAFE_INTEGER/
      );
    });
  });

  describe('error messages', () => {
    it('should include context in error message', () => {
      expect(() => validateAllocationSize(2000, 1000, 'centroidSize')).toThrow(
        /centroidSize exceeds maximum allowed size/
      );
    });

    it('should include actual and limit values in error message', () => {
      expect(() => validateAllocationSize(2000, 1000, 'test')).toThrow(
        /2,000 > 1,000/
      );
    });

    it('should warn about corrupted or malicious file', () => {
      expect(() => validateAllocationSize(2000, 1000, 'test')).toThrow(
        /corrupted or malicious file/
      );
    });
  });
});

// ==========================================
// validateCount Tests
// ==========================================

describe('validateCount', () => {
  describe('valid counts', () => {
    it('should accept count of 0', () => {
      expect(() => validateCount(0, 1000, 'test')).not.toThrow();
    });

    it('should accept count equal to limit', () => {
      expect(() => validateCount(1000, 1000, 'test')).not.toThrow();
    });

    it('should accept count below limit', () => {
      expect(() => validateCount(500, 1000, 'test')).not.toThrow();
    });
  });

  describe('invalid counts', () => {
    it('should reject count exceeding limit', () => {
      expect(() => validateCount(1001, 1000, 'test')).toThrow(
        /exceeds maximum allowed/
      );
    });

    it('should reject negative numbers', () => {
      expect(() => validateCount(-1, 1000, 'test')).toThrow(
        /must be a non-negative integer/
      );
    });

    it('should reject non-integers', () => {
      expect(() => validateCount(1.5, 1000, 'test')).toThrow(
        /must be a non-negative integer/
      );
    });

    it('should reject NaN', () => {
      expect(() => validateCount(NaN, 1000, 'test')).toThrow(
        /must be a non-negative integer/
      );
    });

    it('should reject Infinity', () => {
      expect(() => validateCount(Infinity, 1000, 'test')).toThrow(
        /must be a non-negative integer/
      );
    });
  });

  describe('error messages', () => {
    it('should include context in error message', () => {
      expect(() => validateCount(2000, 1000, 'numPartitions')).toThrow(
        /numPartitions exceeds maximum allowed/
      );
    });

    it('should warn about corrupted or malicious file', () => {
      expect(() => validateCount(2000, 1000, 'test')).toThrow(
        /corrupted or malicious file/
      );
    });
  });
});

// ==========================================
// ALLOCATION_LIMITS Tests
// ==========================================

describe('ALLOCATION_LIMITS', () => {
  it('should have reasonable MAX_PARTITIONS', () => {
    // 16K partitions is very large for IVF
    expect(ALLOCATION_LIMITS.MAX_PARTITIONS).toBe(16_384);
    expect(ALLOCATION_LIMITS.MAX_PARTITIONS).toBeLessThanOrEqual(100_000);
  });

  it('should have reasonable MAX_DIMENSION', () => {
    // 4096 covers most embedding models
    expect(ALLOCATION_LIMITS.MAX_DIMENSION).toBe(4_096);
    expect(ALLOCATION_LIMITS.MAX_DIMENSION).toBeGreaterThanOrEqual(384); // MiniLM
    expect(ALLOCATION_LIMITS.MAX_DIMENSION).toBeGreaterThanOrEqual(768); // BERT
  });

  it('should have reasonable MAX_SUB_VECTORS', () => {
    expect(ALLOCATION_LIMITS.MAX_SUB_VECTORS).toBe(256);
  });

  it('should have reasonable MAX_NUM_BITS', () => {
    // 8 bits is standard PQ, 16 would be unusual
    expect(ALLOCATION_LIMITS.MAX_NUM_BITS).toBe(16);
    expect(ALLOCATION_LIMITS.MAX_NUM_BITS).toBeLessThanOrEqual(32);
  });

  it('should have reasonable MAX_VECTORS_PER_PARTITION', () => {
    // 1M vectors per partition is very large
    expect(ALLOCATION_LIMITS.MAX_VECTORS_PER_PARTITION).toBe(1_000_000);
  });

  it('should have centroid size limit under 100MB', () => {
    // 64MB cap
    expect(ALLOCATION_LIMITS.MAX_CENTROID_SIZE_BYTES).toBe(67_108_864);
    expect(ALLOCATION_LIMITS.MAX_CENTROID_SIZE_BYTES).toBeLessThanOrEqual(100 * 1024 * 1024);
  });

  it('should have PQ codebook size limit under 32MB', () => {
    // 16MB cap
    expect(ALLOCATION_LIMITS.MAX_PQ_CODEBOOK_SIZE_BYTES).toBe(16_777_216);
    expect(ALLOCATION_LIMITS.MAX_PQ_CODEBOOK_SIZE_BYTES).toBeLessThanOrEqual(32 * 1024 * 1024);
  });

  it('should have partition meta size limit under 2MB', () => {
    // 1MB cap
    expect(ALLOCATION_LIMITS.MAX_PARTITION_META_SIZE_BYTES).toBe(1_048_576);
    expect(ALLOCATION_LIMITS.MAX_PARTITION_META_SIZE_BYTES).toBeLessThanOrEqual(2 * 1024 * 1024);
  });

  it('should have partition data size limit equal to Snippets memory limit', () => {
    // 32MB cap (matches Snippets constraint)
    expect(ALLOCATION_LIMITS.MAX_PARTITION_DATA_SIZE_BYTES).toBe(33_554_432);
  });

  it('should support typical index configurations', () => {
    // Typical: 1024 partitions, 384 dim = 1.5MB centroids
    const typicalCentroidSize = 1024 * 384 * 4;
    expect(typicalCentroidSize).toBeLessThan(ALLOCATION_LIMITS.MAX_CENTROID_SIZE_BYTES);

    // Large: 4096 partitions, 768 dim = 12MB centroids
    const largeCentroidSize = 4096 * 768 * 4;
    expect(largeCentroidSize).toBeLessThan(ALLOCATION_LIMITS.MAX_CENTROID_SIZE_BYTES);

    // Typical PQ: 256 codes * 48 subvectors * 8 subdim * 4 = 384KB
    const typicalCodebookSize = 256 * 48 * 8 * 4;
    expect(typicalCodebookSize).toBeLessThan(ALLOCATION_LIMITS.MAX_PQ_CODEBOOK_SIZE_BYTES);
  });
});

// ==========================================
// Malicious Header Simulation Tests
// ==========================================

describe('malicious header protection', () => {
  it('should reject absurdly large numPartitions', () => {
    // Attacker tries to allocate billions of partitions
    const maliciousPartitions = 1_000_000_000;
    expect(() =>
      validateCount(maliciousPartitions, ALLOCATION_LIMITS.MAX_PARTITIONS, 'numPartitions')
    ).toThrow(/exceeds maximum allowed/);
  });

  it('should reject absurdly large dimension', () => {
    // Attacker tries to allocate vectors with millions of dimensions
    const maliciousDimension = 10_000_000;
    expect(() =>
      validateCount(maliciousDimension, ALLOCATION_LIMITS.MAX_DIMENSION, 'dimension')
    ).toThrow(/exceeds maximum allowed/);
  });

  it('should reject absurdly large centroidSize', () => {
    // Attacker claims centroid data is 10EB (Exabytes) - exceeds MAX_SAFE_INTEGER
    const maliciousCentroidSize = BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1);
    expect(() =>
      validateAllocationSize(maliciousCentroidSize, ALLOCATION_LIMITS.MAX_CENTROID_SIZE_BYTES, 'centroidSize')
    ).toThrow(/exceeds Number.MAX_SAFE_INTEGER/);
  });

  it('should reject centroidSize that would cause OOM', () => {
    // Attacker claims centroid data is 1GB (under Number.MAX_SAFE_INTEGER but huge)
    const maliciousCentroidSize = 1024 * 1024 * 1024; // 1GB
    expect(() =>
      validateAllocationSize(maliciousCentroidSize, ALLOCATION_LIMITS.MAX_CENTROID_SIZE_BYTES, 'centroidSize')
    ).toThrow(/exceeds maximum allowed size/);
  });

  it('should reject numVectors that would cause OOM', () => {
    // Attacker claims partition has 100M vectors
    const maliciousNumVectors = 100_000_000;
    expect(() =>
      validateCount(maliciousNumVectors, ALLOCATION_LIMITS.MAX_VECTORS_PER_PARTITION, 'numVectors')
    ).toThrow(/exceeds maximum allowed/);
  });

  it('should protect against partition data overflow attack', () => {
    // If numSubVectors is 256 and numVectors is huge, pqCodes allocation would OOM
    // pqCodes = numVectors * numSubVectors = 100M * 256 = 25.6GB
    const maliciousNumVectors = 100_000_000;
    const numSubVectors = 256;
    const pqCodesBytes = maliciousNumVectors * numSubVectors;

    expect(() =>
      validateAllocationSize(pqCodesBytes, ALLOCATION_LIMITS.MAX_PARTITION_DATA_SIZE_BYTES, 'pqCodes')
    ).toThrow(/exceeds maximum allowed size/);
  });

  it('should protect against lookup table overflow attack', () => {
    // If numBits is manipulated to be 32, numCodes = 2^32 = 4 billion
    // Lookup tables would be numSubVectors * numCodes * 4 bytes
    const maliciousNumBits = 32;
    expect(() =>
      validateCount(maliciousNumBits, ALLOCATION_LIMITS.MAX_NUM_BITS, 'numBits')
    ).toThrow(/exceeds maximum allowed/);
  });
});
