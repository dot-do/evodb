/**
 * BitPackedEncoding Plugin Tests
 *
 * TDD Issue: evodb-w1m
 *
 * Tests for the BitPackedEncoding example plugin that:
 * - Packs integers using minimal bits based on value range
 * - Provides compression for small integer ranges
 * - Demonstrates encoding plugin implementation
 */

import { describe, it, expect } from 'vitest';
import {
  BitPackedEncodingPlugin,
  createBitPackedEncodingPlugin,
} from '../plugins/examples/bit-packed-encoding.js';
import { validateEncodingPlugin, isEncodingPlugin } from '../plugins/plugin-validation.js';
import { type ColumnStats, Type } from '../types.js';

describe('BitPackedEncodingPlugin', () => {
  describe('Plugin Structure', () => {
    it('should have valid metadata', () => {
      const plugin = createBitPackedEncodingPlugin();
      expect(plugin.metadata.name).toBe('bit-packed');
      expect(plugin.metadata.version).toBeDefined();
      expect(plugin.metadata.description).toBeDefined();
    });

    it('should have typeId >= 100', () => {
      const plugin = createBitPackedEncodingPlugin();
      expect(plugin.typeId).toBeGreaterThanOrEqual(100);
    });

    it('should pass validation', () => {
      const plugin = createBitPackedEncodingPlugin();
      expect(() => validateEncodingPlugin(plugin)).not.toThrow();
    });

    it('should be recognized as encoding plugin', () => {
      const plugin = createBitPackedEncodingPlugin();
      expect(isEncodingPlugin(plugin)).toBe(true);
    });

    it('should support Int32 type', () => {
      const plugin = createBitPackedEncodingPlugin();
      expect(plugin.supportedTypes).toContain(Type.Int32);
    });
  });

  describe('shouldUse', () => {
    it('should return true for small integer ranges', () => {
      const plugin = createBitPackedEncodingPlugin();
      const values = [10, 20, 15, 12, 18]; // range = 10, fits in 4 bits
      const stats: ColumnStats = { min: 10, max: 20, nullCount: 0, distinctEst: 5 };

      expect(plugin.shouldUse(values, stats)).toBe(true);
    });

    it('should return false for large integer ranges', () => {
      const plugin = createBitPackedEncodingPlugin();
      const values = [0, 1000000, 500000];
      const stats: ColumnStats = { min: 0, max: 1000000, nullCount: 0, distinctEst: 3 };

      // Large range means bit-packing provides little benefit
      expect(plugin.shouldUse(values, stats)).toBe(false);
    });

    it('should return false for empty arrays', () => {
      const plugin = createBitPackedEncodingPlugin();
      const stats: ColumnStats = { min: undefined, max: undefined, nullCount: 0, distinctEst: 0 };

      expect(plugin.shouldUse([], stats)).toBe(false);
    });

    it('should return false for arrays with undefined min/max', () => {
      const plugin = createBitPackedEncodingPlugin();
      const stats: ColumnStats = { min: undefined, max: undefined, nullCount: 5, distinctEst: 0 };

      expect(plugin.shouldUse([1, 2, 3], stats)).toBe(false);
    });

    it('should return true for single distinct value', () => {
      const plugin = createBitPackedEncodingPlugin();
      const values = [42, 42, 42, 42, 42];
      const stats: ColumnStats = { min: 42, max: 42, nullCount: 0, distinctEst: 1 };

      // Single value = 0 bits per value (just store the base)
      expect(plugin.shouldUse(values, stats)).toBe(true);
    });
  });

  describe('encode/decode', () => {
    const plugin = createBitPackedEncodingPlugin();

    it('should encode and decode simple sequence', () => {
      const values = [5, 10, 7, 3, 8];
      const stats: ColumnStats = { min: 3, max: 10, nullCount: 0, distinctEst: 5 };

      const encoded = plugin.encode(values, stats);
      const decoded = plugin.decode(encoded, values.length, stats);

      expect(decoded).toEqual(values);
    });

    it('should handle single value', () => {
      const values = [42];
      const stats: ColumnStats = { min: 42, max: 42, nullCount: 0, distinctEst: 1 };

      const encoded = plugin.encode(values, stats);
      const decoded = plugin.decode(encoded, values.length, stats);

      expect(decoded).toEqual(values);
    });

    it('should handle all same values', () => {
      const values = [100, 100, 100, 100, 100];
      const stats: ColumnStats = { min: 100, max: 100, nullCount: 0, distinctEst: 1 };

      const encoded = plugin.encode(values, stats);
      const decoded = plugin.decode(encoded, values.length, stats);

      expect(decoded).toEqual(values);
    });

    it('should handle negative values', () => {
      const values = [-5, -3, -1, 0, 2];
      const stats: ColumnStats = { min: -5, max: 2, nullCount: 0, distinctEst: 5 };

      const encoded = plugin.encode(values, stats);
      const decoded = plugin.decode(encoded, values.length, stats);

      expect(decoded).toEqual(values);
    });

    it('should handle large arrays', () => {
      const values = Array.from({ length: 1000 }, (_, i) => i % 16);
      const stats: ColumnStats = { min: 0, max: 15, nullCount: 0, distinctEst: 16 };

      const encoded = plugin.encode(values, stats);
      const decoded = plugin.decode(encoded, values.length, stats);

      expect(decoded).toEqual(values);
    });

    it('should handle empty array', () => {
      const values: number[] = [];
      const stats: ColumnStats = { min: undefined, max: undefined, nullCount: 0, distinctEst: 0 };

      const encoded = plugin.encode(values, stats);
      const decoded = plugin.decode(encoded, 0, stats);

      expect(decoded).toEqual([]);
    });

    it('should handle values requiring different bit widths', () => {
      // 1-bit: range 0-1
      const values1Bit = [0, 1, 0, 1, 1, 0];
      const stats1Bit: ColumnStats = { min: 0, max: 1, nullCount: 0, distinctEst: 2 };
      const encoded1 = plugin.encode(values1Bit, stats1Bit);
      const decoded1 = plugin.decode(encoded1, values1Bit.length, stats1Bit);
      expect(decoded1).toEqual(values1Bit);

      // 8-bit: range 0-255
      const values8Bit = [0, 128, 255, 64, 192];
      const stats8Bit: ColumnStats = { min: 0, max: 255, nullCount: 0, distinctEst: 5 };
      const encoded8 = plugin.encode(values8Bit, stats8Bit);
      const decoded8 = plugin.decode(encoded8, values8Bit.length, stats8Bit);
      expect(decoded8).toEqual(values8Bit);

      // 16-bit: range 0-65535
      const values16Bit = [0, 32768, 65535, 16384, 49152];
      const stats16Bit: ColumnStats = { min: 0, max: 65535, nullCount: 0, distinctEst: 5 };
      const encoded16 = plugin.encode(values16Bit, stats16Bit);
      const decoded16 = plugin.decode(encoded16, values16Bit.length, stats16Bit);
      expect(decoded16).toEqual(values16Bit);
    });
  });

  describe('estimateSize', () => {
    const plugin = createBitPackedEncodingPlugin();

    it('should estimate smaller than plain encoding for small ranges', () => {
      // Values in range 0-15 need 4 bits each
      const values = Array.from({ length: 100 }, (_, i) => i % 16);
      const plainSize = values.length * 4; // 400 bytes

      const estimatedSize = plugin.estimateSize(values);

      // 4 bits * 100 values = 400 bits = 50 bytes + header
      expect(estimatedSize).toBeLessThan(plainSize);
    });

    it('should return appropriate size for header-only (empty array)', () => {
      const values: number[] = [];
      const estimatedSize = plugin.estimateSize(values);

      // Just header size
      expect(estimatedSize).toBeLessThanOrEqual(20);
    });

    it('should return header size for single value (0 bits needed)', () => {
      const values = [42, 42, 42];
      const estimatedSize = plugin.estimateSize(values);

      // Just header, no data needed when all values are the same
      expect(estimatedSize).toBeLessThanOrEqual(20);
    });
  });

  describe('Compression Efficiency', () => {
    const plugin = createBitPackedEncodingPlugin();

    it('should achieve good compression for small ranges', () => {
      // 100 values in range 0-7 (3 bits each)
      const values = Array.from({ length: 100 }, (_, i) => i % 8);
      const stats: ColumnStats = { min: 0, max: 7, nullCount: 0, distinctEst: 8 };

      const encoded = plugin.encode(values, stats);
      const plainSize = values.length * 4; // 400 bytes

      // 3 bits * 100 = 300 bits = ~38 bytes + header
      expect(encoded.length).toBeLessThan(plainSize / 4);
    });

    it('should maintain correctness with maximum compression', () => {
      // All zeros - requires 0 bits per value
      const values = Array.from({ length: 1000 }, () => 0);
      const stats: ColumnStats = { min: 0, max: 0, nullCount: 0, distinctEst: 1 };

      const encoded = plugin.encode(values, stats);
      const decoded = plugin.decode(encoded, values.length, stats);

      expect(decoded).toEqual(values);
      // Should be very small - just header
      expect(encoded.length).toBeLessThan(50);
    });
  });

  describe('Edge Cases', () => {
    const plugin = createBitPackedEncodingPlugin();

    it('should handle maximum safe integer range', () => {
      // Range that requires 31 bits (max for safe bit-packing)
      const values = [0, (1 << 30) - 1];
      const stats: ColumnStats = { min: 0, max: (1 << 30) - 1, nullCount: 0, distinctEst: 2 };

      const encoded = plugin.encode(values, stats);
      const decoded = plugin.decode(encoded, values.length, stats);

      expect(decoded).toEqual(values);
    });

    it('should handle sequential integers', () => {
      const values = [100, 101, 102, 103, 104];
      const stats: ColumnStats = { min: 100, max: 104, nullCount: 0, distinctEst: 5 };

      const encoded = plugin.encode(values, stats);
      const decoded = plugin.decode(encoded, values.length, stats);

      expect(decoded).toEqual(values);
    });
  });
});
