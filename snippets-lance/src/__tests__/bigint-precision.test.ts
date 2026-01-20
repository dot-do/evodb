/**
 * Tests for BigInt to Number safe conversion
 *
 * Verifies that BigInt values exceeding Number.MAX_SAFE_INTEGER
 * are properly detected and throw appropriate errors rather than
 * silently losing precision.
 *
 * @module @evodb/snippets-lance/tests/bigint-precision
 */

import { describe, it, expect } from 'vitest';
import { validateAllocationSize } from '../types.js';
import { safeBigIntToNumber } from '../cached-lance-reader.js';

// ==========================================
// Constants for testing
// ==========================================

/** Number.MAX_SAFE_INTEGER = 2^53 - 1 */
const MAX_SAFE = Number.MAX_SAFE_INTEGER;
const MAX_SAFE_BIGINT = BigInt(MAX_SAFE);

/** Just over the safe limit */
const OVER_SAFE = MAX_SAFE_BIGINT + 1n;

/** A petabyte in bytes - realistic large file size */
const ONE_PETABYTE = 1125899906842624n; // 2^50 bytes

/** 10 petabytes - well beyond MAX_SAFE_INTEGER (~9 PB) */
const TEN_PETABYTES = 11258999068426240n; // ~10 PB > MAX_SAFE_INTEGER

// ==========================================
// validateAllocationSize Tests
// ==========================================

describe('BigInt Precision Safety', () => {
  describe('validateAllocationSize', () => {
    it('should accept valid number values', () => {
      expect(() => validateAllocationSize(100, 1000, 'test')).not.toThrow();
      expect(() => validateAllocationSize(0, 1000, 'test')).not.toThrow();
      expect(() => validateAllocationSize(1000, 1000, 'test')).not.toThrow();
    });

    it('should reject number values exceeding limit', () => {
      expect(() => validateAllocationSize(1001, 1000, 'test'))
        .toThrow('exceeds maximum allowed size');
    });

    it('should accept valid bigint values within safe range', () => {
      expect(() => validateAllocationSize(100n, 1000, 'test')).not.toThrow();
      expect(() => validateAllocationSize(0n, 1000, 'test')).not.toThrow();
      expect(() => validateAllocationSize(1000n, 1000, 'test')).not.toThrow();
    });

    it('should reject bigint values exceeding limit', () => {
      expect(() => validateAllocationSize(1001n, 1000, 'test'))
        .toThrow('exceeds maximum allowed size');
    });

    it('should reject negative bigint values', () => {
      expect(() => validateAllocationSize(-1n, 1000, 'test'))
        .toThrow('must be non-negative');
    });

    it('should throw for BigInt values exceeding Number.MAX_SAFE_INTEGER', () => {
      expect(() => validateAllocationSize(OVER_SAFE, Number.MAX_VALUE, 'Large offset'))
        .toThrow('exceeds Number.MAX_SAFE_INTEGER');
    });

    it('should throw for 10 petabyte offsets', () => {
      expect(() => validateAllocationSize(TEN_PETABYTES, Number.MAX_VALUE, 'File offset'))
        .toThrow('exceeds Number.MAX_SAFE_INTEGER');
    });

    it('should accept values at exactly Number.MAX_SAFE_INTEGER', () => {
      // MAX_SAFE_INTEGER is 9007199254740991, about 8 PB
      // We set limit to MAX_SAFE to avoid the "exceeds limit" error
      expect(() => validateAllocationSize(MAX_SAFE_BIGINT, MAX_SAFE, 'Max safe value'))
        .not.toThrow();
    });

    it('should accept 1 petabyte offsets (within safe range)', () => {
      // 1 PB = 2^50 bytes = 1125899906842624, which is < MAX_SAFE_INTEGER
      expect(() => validateAllocationSize(ONE_PETABYTE, Number(ONE_PETABYTE), '1 PB offset'))
        .not.toThrow();
    });
  });

  describe('Precision Loss Detection', () => {
    it('should detect that Number loses precision for values > MAX_SAFE_INTEGER', () => {
      // Demonstrate the precision loss that would occur without safe conversion
      const unsafeValue = MAX_SAFE_BIGINT + 1n;
      const naiveConversion = Number(unsafeValue);

      // This shows the bug: Number(MAX_SAFE + 1) === Number(MAX_SAFE + 2)
      // because precision is lost
      const alsoLosesPrecision = Number(MAX_SAFE_BIGINT + 2n);

      // Without proper handling, these would be equal (both lose precision)
      expect(naiveConversion).toBe(alsoLosesPrecision);

      // But as BigInts, they are different
      expect(unsafeValue).not.toBe(MAX_SAFE_BIGINT + 2n);
    });

    it('should correctly identify MAX_SAFE_INTEGER boundary', () => {
      // Verify our constants are correct
      expect(MAX_SAFE).toBe(9007199254740991);
      expect(MAX_SAFE).toBe(2 ** 53 - 1);

      // Verify BigInt comparison works
      expect(OVER_SAFE > MAX_SAFE_BIGINT).toBe(true);
      expect(MAX_SAFE_BIGINT > MAX_SAFE_BIGINT - 1n).toBe(true);
    });
  });

  describe('Error Message Quality', () => {
    it('should include actual value in error message', () => {
      try {
        validateAllocationSize(TEN_PETABYTES, Number.MAX_VALUE, 'File offset');
        expect.fail('Should have thrown');
      } catch (e) {
        const message = (e as Error).message;
        expect(message).toContain(TEN_PETABYTES.toString());
        expect(message).toContain(MAX_SAFE.toString());
      }
    });

    it('should include context in error message', () => {
      try {
        validateAllocationSize(TEN_PETABYTES, Number.MAX_VALUE, 'Partition byte offset');
        expect.fail('Should have thrown');
      } catch (e) {
        const message = (e as Error).message;
        expect(message).toContain('Partition byte offset');
      }
    });
  });
});

// ==========================================
// Edge Cases
// ==========================================

describe('Edge Cases', () => {
  it('should handle zero correctly', () => {
    expect(() => validateAllocationSize(0, 100, 'zero')).not.toThrow();
    expect(() => validateAllocationSize(0n, 100, 'zero bigint')).not.toThrow();
  });

  it('should reject negative numbers', () => {
    expect(() => validateAllocationSize(-1, 100, 'negative'))
      .toThrow('must be a non-negative finite number');
  });

  it('should reject NaN', () => {
    expect(() => validateAllocationSize(NaN, 100, 'nan'))
      .toThrow('must be a non-negative finite number');
  });

  it('should reject Infinity', () => {
    expect(() => validateAllocationSize(Infinity, 100, 'infinity'))
      .toThrow('must be a non-negative finite number');
  });
});

// ==========================================
// safeBigIntToNumber Tests
// ==========================================

describe('safeBigIntToNumber', () => {
  it('should convert valid BigInt values to Number', () => {
    expect(safeBigIntToNumber(0n, 'test')).toBe(0);
    expect(safeBigIntToNumber(100n, 'test')).toBe(100);
    expect(safeBigIntToNumber(1000000n, 'test')).toBe(1000000);
  });

  it('should convert MAX_SAFE_INTEGER exactly', () => {
    expect(safeBigIntToNumber(MAX_SAFE_BIGINT, 'max safe')).toBe(MAX_SAFE);
  });

  it('should throw for values exceeding MAX_SAFE_INTEGER', () => {
    expect(() => safeBigIntToNumber(OVER_SAFE, 'over safe'))
      .toThrow('exceeds Number.MAX_SAFE_INTEGER');
  });

  it('should throw for 10 petabyte offsets', () => {
    expect(() => safeBigIntToNumber(TEN_PETABYTES, 'huge offset'))
      .toThrow('exceeds Number.MAX_SAFE_INTEGER');
  });

  it('should throw for negative values', () => {
    expect(() => safeBigIntToNumber(-1n, 'negative'))
      .toThrow('cannot be negative');
  });

  it('should include context in error message', () => {
    try {
      safeBigIntToNumber(OVER_SAFE, 'Centroid offset');
      expect.fail('Should have thrown');
    } catch (e) {
      expect((e as Error).message).toContain('Centroid offset');
    }
  });

  it('should handle 1 petabyte correctly (within safe range)', () => {
    // 1 PB is within MAX_SAFE_INTEGER, should convert fine
    expect(safeBigIntToNumber(ONE_PETABYTE, '1 PB')).toBe(Number(ONE_PETABYTE));
  });
});
