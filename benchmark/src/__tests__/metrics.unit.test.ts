/**
 * @evodb/benchmark - Metrics Utilities Tests
 *
 * Additional tests for metrics computation and result aggregation.
 */

import { describe, it, expect } from 'vitest';
import {
  computeLatencyMetrics,
  computeThroughputMetrics,
  computeCacheMetrics,
  computeCostMetrics,
  percentile,
  createHistogram,
  formatBytes,
  formatDuration,
  formatNumber,
  calculateSpeedup,
  calculateScalingEfficiency,
  mergeSamples,
  aggregateLatencyMetrics,
  CF_PRICING,
} from '../utils/metrics.js';

describe('Metrics Utilities - Extended Tests', () => {
  describe('computeLatencyMetrics', () => {
    it('should handle empty samples', () => {
      const metrics = computeLatencyMetrics([]);

      expect(metrics.min).toBe(0);
      expect(metrics.max).toBe(0);
      expect(metrics.mean).toBe(0);
      expect(metrics.p50).toBe(0);
      expect(metrics.p95).toBe(0);
      expect(metrics.p99).toBe(0);
      expect(metrics.stdDev).toBe(0);
    });

    it('should handle single sample', () => {
      const metrics = computeLatencyMetrics([42]);

      expect(metrics.min).toBe(42);
      expect(metrics.max).toBe(42);
      expect(metrics.mean).toBe(42);
      expect(metrics.p50).toBe(42);
      expect(metrics.stdDev).toBe(0);
    });

    it('should calculate standard deviation correctly', () => {
      // Samples with known stddev: [2, 4, 4, 4, 5, 5, 7, 9] has stddev ~2
      const samples = [2, 4, 4, 4, 5, 5, 7, 9];
      const metrics = computeLatencyMetrics(samples);

      // Mean is 5
      expect(metrics.mean).toBe(5);
      // StdDev should be around 2
      expect(metrics.stdDev).toBeCloseTo(2, 0);
    });

    it('should not modify original array', () => {
      const original = [3, 1, 4, 1, 5, 9, 2, 6];
      const originalCopy = [...original];

      computeLatencyMetrics(original);

      expect(original).toEqual(originalCopy);
    });

    it('should handle large samples', () => {
      const samples = Array.from({ length: 10000 }, (_, i) => i);
      const metrics = computeLatencyMetrics(samples);

      expect(metrics.min).toBe(0);
      expect(metrics.max).toBe(9999);
      expect(metrics.mean).toBeCloseTo(4999.5, 1);
      expect(metrics.p50).toBeCloseTo(4999.5, 1);
    });

    it('should handle samples with negative values', () => {
      const samples = [-10, -5, 0, 5, 10];
      const metrics = computeLatencyMetrics(samples);

      expect(metrics.min).toBe(-10);
      expect(metrics.max).toBe(10);
      expect(metrics.mean).toBe(0);
    });
  });

  describe('percentile', () => {
    it('should handle empty array', () => {
      expect(percentile([], 50)).toBe(0);
    });

    it('should handle single element', () => {
      expect(percentile([42], 50)).toBe(42);
      expect(percentile([42], 0)).toBe(42);
      expect(percentile([42], 100)).toBe(42);
    });

    it('should interpolate between values', () => {
      const sorted = [10, 20, 30, 40, 50];
      // p50 of [10, 20, 30, 40, 50] should be 30
      expect(percentile(sorted, 50)).toBe(30);
    });

    it('should return min for p0', () => {
      const sorted = [10, 20, 30, 40, 50];
      expect(percentile(sorted, 0)).toBe(10);
    });

    it('should return max for p100', () => {
      const sorted = [10, 20, 30, 40, 50];
      expect(percentile(sorted, 100)).toBe(50);
    });

    it('should handle p25 and p75', () => {
      const sorted = [0, 25, 50, 75, 100];
      expect(percentile(sorted, 25)).toBe(25);
      expect(percentile(sorted, 75)).toBe(75);
    });
  });

  describe('computeThroughputMetrics', () => {
    it('should calculate QPS correctly', () => {
      const metrics = computeThroughputMetrics(1000, 1000, 10000, 1000000);

      expect(metrics.qps).toBe(1000);
      expect(metrics.rowsPerSecond).toBe(10000);
      expect(metrics.bytesPerSecond).toBe(1000000);
      expect(metrics.totalOperations).toBe(1000);
      expect(metrics.totalDurationMs).toBe(1000);
    });

    it('should handle fractional seconds', () => {
      const metrics = computeThroughputMetrics(500, 500, 5000, 500000);

      expect(metrics.qps).toBe(1000); // 500 ops / 0.5 sec
    });

    it('should handle very fast operations', () => {
      const metrics = computeThroughputMetrics(100, 10, 1000, 100000);

      expect(metrics.qps).toBe(10000); // 100 ops / 0.01 sec
    });
  });

  describe('computeCacheMetrics', () => {
    it('should calculate hit ratio correctly', () => {
      const metrics = computeCacheMetrics(80, 20, 8000, 2000, [1, 2, 3, 4, 5]);

      expect(metrics.hits).toBe(80);
      expect(metrics.misses).toBe(20);
      expect(metrics.hitRatio).toBe(0.8);
      expect(metrics.bytesFromCache).toBe(8000);
      expect(metrics.bytesFromOrigin).toBe(2000);
      expect(metrics.avgLookupTimeMs).toBe(3);
    });

    it('should handle zero total accesses', () => {
      const metrics = computeCacheMetrics(0, 0, 0, 0, []);

      expect(metrics.hitRatio).toBe(0);
      expect(metrics.avgLookupTimeMs).toBe(0);
    });

    it('should handle 100% hit ratio', () => {
      const metrics = computeCacheMetrics(100, 0, 10000, 0, [1, 1, 1]);

      expect(metrics.hitRatio).toBe(1);
    });

    it('should handle 0% hit ratio', () => {
      const metrics = computeCacheMetrics(0, 100, 0, 10000, [5, 5, 5]);

      expect(metrics.hitRatio).toBe(0);
    });
  });

  describe('computeCostMetrics', () => {
    it('should calculate all cost components', () => {
      const metrics = computeCostMetrics(1000000, 10000, 1000, 100, 0);

      expect(metrics.costPerQuery).toBeGreaterThan(0);
      expect(metrics.costPerMillionQueries).toBe(metrics.costPerQuery * 1000000);
      expect(metrics.workersCpuCost).toBeGreaterThan(0);
      expect(metrics.r2ReadCost).toBeGreaterThan(0);
    });

    it('should handle zero requests', () => {
      const metrics = computeCostMetrics(0, 0, 0, 0, 0);

      expect(metrics.costPerQuery).toBe(0);
    });

    it('should include R2 write costs', () => {
      const metricsWithWrites = computeCostMetrics(1000, 100, 10, 10, 0);
      const metricsWithoutWrites = computeCostMetrics(1000, 100, 10, 0, 0);

      expect(metricsWithWrites.r2ReadCost).toBeGreaterThan(metricsWithoutWrites.r2ReadCost);
    });
  });

  describe('createHistogram', () => {
    it('should handle empty samples', () => {
      const histogram = createHistogram([]);
      expect(histogram).toEqual([]);
    });

    it('should create specified number of buckets', () => {
      const samples = Array.from({ length: 100 }, () => Math.random() * 100);
      const histogram = createHistogram(samples, 10);

      expect(histogram).toHaveLength(10);
    });

    it('should have correct total count', () => {
      const samples = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const histogram = createHistogram(samples, 5);

      const totalCount = histogram.reduce((sum, b) => sum + b.count, 0);
      expect(totalCount).toBe(10);
    });

    it('should have percentages summing to ~100', () => {
      const samples = Array.from({ length: 1000 }, (_, i) => i);
      const histogram = createHistogram(samples, 20);

      const totalPercentage = histogram.reduce((sum, b) => sum + b.percentage, 0);
      expect(totalPercentage).toBeCloseTo(100, 5);
    });

    it('should have correct bucket boundaries', () => {
      const samples = [0, 50, 100];
      const histogram = createHistogram(samples, 10);

      expect(histogram[0].lower).toBe(0);
      expect(histogram[histogram.length - 1].upper).toBe(100);
    });

    it('should handle uniform distribution', () => {
      const samples = Array.from({ length: 100 }, (_, i) => i);
      const histogram = createHistogram(samples, 10);

      // Each bucket should have roughly 10 samples
      for (const bucket of histogram) {
        expect(bucket.count).toBeGreaterThanOrEqual(8);
        expect(bucket.count).toBeLessThanOrEqual(12);
      }
    });
  });

  describe('formatBytes', () => {
    it('should format bytes correctly', () => {
      expect(formatBytes(0)).toBe('0.00 B');
      expect(formatBytes(500)).toBe('500.00 B');
      expect(formatBytes(1023)).toBe('1023.00 B');
    });

    it('should format kilobytes correctly', () => {
      expect(formatBytes(1024)).toBe('1.00 KB');
      expect(formatBytes(1536)).toBe('1.50 KB');
    });

    it('should format megabytes correctly', () => {
      expect(formatBytes(1024 * 1024)).toBe('1.00 MB');
      expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.50 MB');
    });

    it('should format gigabytes correctly', () => {
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1.00 GB');
    });

    it('should format terabytes correctly', () => {
      expect(formatBytes(1024 * 1024 * 1024 * 1024)).toBe('1.00 TB');
    });
  });

  describe('formatDuration', () => {
    it('should format microseconds', () => {
      expect(formatDuration(0.001)).toBe('1.00us');
      expect(formatDuration(0.5)).toBe('500.00us');
    });

    it('should format milliseconds', () => {
      expect(formatDuration(1)).toBe('1.00ms');
      expect(formatDuration(500)).toBe('500.00ms');
      expect(formatDuration(999)).toBe('999.00ms');
    });

    it('should format seconds', () => {
      expect(formatDuration(1000)).toBe('1.00s');
      expect(formatDuration(30000)).toBe('30.00s');
    });

    it('should format minutes', () => {
      expect(formatDuration(60000)).toBe('1.00min');
      expect(formatDuration(120000)).toBe('2.00min');
    });
  });

  describe('formatNumber', () => {
    it('should format small numbers without prefix', () => {
      expect(formatNumber(0)).toBe('0');
      expect(formatNumber(500)).toBe('500');
      expect(formatNumber(999)).toBe('999');
    });

    it('should format thousands with K prefix', () => {
      expect(formatNumber(1000)).toBe('1.00K');
      expect(formatNumber(1500)).toBe('1.50K');
      expect(formatNumber(999000)).toBe('999.00K');
    });

    it('should format millions with M prefix', () => {
      expect(formatNumber(1000000)).toBe('1.00M');
      expect(formatNumber(2500000)).toBe('2.50M');
    });

    it('should format billions with G prefix', () => {
      expect(formatNumber(1000000000)).toBe('1.00G');
    });
  });

  describe('calculateSpeedup', () => {
    it('should calculate positive speedup', () => {
      expect(calculateSpeedup(100, 50)).toBe(2);
      expect(calculateSpeedup(100, 25)).toBe(4);
    });

    it('should calculate slowdown', () => {
      expect(calculateSpeedup(100, 200)).toBe(0.5);
    });

    it('should return 1 for equal times', () => {
      expect(calculateSpeedup(100, 100)).toBe(1);
    });

    it('should return Infinity for zero comparison', () => {
      expect(calculateSpeedup(100, 0)).toBe(Infinity);
    });
  });

  describe('calculateScalingEfficiency', () => {
    it('should return 1 for perfect linear scaling', () => {
      expect(calculateScalingEfficiency(100, 400, 4)).toBe(1);
      expect(calculateScalingEfficiency(100, 800, 8)).toBe(1);
    });

    it('should return <1 for sublinear scaling', () => {
      const efficiency = calculateScalingEfficiency(100, 300, 4);
      expect(efficiency).toBe(0.75);
    });

    it('should return >1 for superlinear scaling', () => {
      const efficiency = calculateScalingEfficiency(100, 500, 4);
      expect(efficiency).toBe(1.25);
    });
  });

  describe('mergeSamples', () => {
    it('should merge multiple sample arrays', () => {
      const merged = mergeSamples([1, 2], [3, 4], [5, 6]);
      expect(merged).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('should handle empty arrays', () => {
      const merged = mergeSamples([], [1, 2], []);
      expect(merged).toEqual([1, 2]);
    });

    it('should handle single array', () => {
      const merged = mergeSamples([1, 2, 3]);
      expect(merged).toEqual([1, 2, 3]);
    });

    it('should handle no arrays', () => {
      const merged = mergeSamples();
      expect(merged).toEqual([]);
    });
  });

  describe('aggregateLatencyMetrics', () => {
    it('should aggregate multiple metrics', () => {
      const metrics = [
        { min: 10, max: 100, mean: 50, p50: 45, p95: 90, p99: 95, stdDev: 20 },
        { min: 5, max: 150, mean: 60, p50: 55, p95: 100, p99: 110, stdDev: 25 },
      ];

      const aggregated = aggregateLatencyMetrics(metrics);

      expect(aggregated.min).toBe(5);
      expect(aggregated.max).toBe(150);
      expect(aggregated.mean).toBe(55);
      expect(aggregated.p50).toBe(50);
    });

    it('should handle empty metrics array', () => {
      const aggregated = aggregateLatencyMetrics([]);

      expect(aggregated.min).toBe(0);
      expect(aggregated.max).toBe(0);
      expect(aggregated.mean).toBe(0);
    });

    it('should handle single metrics entry', () => {
      const metrics = [
        { min: 10, max: 100, mean: 50, p50: 45, p95: 90, p99: 95, stdDev: 20 },
      ];

      const aggregated = aggregateLatencyMetrics(metrics);

      expect(aggregated.min).toBe(10);
      expect(aggregated.max).toBe(100);
      expect(aggregated.mean).toBe(50);
    });
  });

  describe('CF_PRICING', () => {
    it('should have valid pricing values', () => {
      expect(CF_PRICING.workerRequestCost).toBeGreaterThan(0);
      expect(CF_PRICING.workerCpuCostMs).toBeGreaterThan(0);
      expect(CF_PRICING.r2ClassAOpCost).toBeGreaterThan(0);
      expect(CF_PRICING.r2ClassBOpCost).toBeGreaterThan(0);
      expect(CF_PRICING.r2StorageGbMonth).toBeGreaterThan(0);
    });

    it('should have Class A ops more expensive than Class B', () => {
      expect(CF_PRICING.r2ClassAOpCost).toBeGreaterThan(CF_PRICING.r2ClassBOpCost);
    });

    it('should have free R2 egress to Workers', () => {
      expect(CF_PRICING.r2EgressGb).toBe(0);
    });

    it('should have free Cache API', () => {
      expect(CF_PRICING.cacheApiCost).toBe(0);
    });
  });
});
