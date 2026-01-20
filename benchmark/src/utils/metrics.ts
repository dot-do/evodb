/**
 * @evodb/benchmark - Metrics Utilities
 *
 * Statistical functions for computing benchmark metrics.
 */

import type { LatencyMetrics, ThroughputMetrics, CacheMetrics, CostMetrics } from '../types.js';

/**
 * Compute latency metrics from samples
 */
export function computeLatencyMetrics(samples: number[]): LatencyMetrics {
  if (samples.length === 0) {
    return {
      min: 0,
      max: 0,
      mean: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      stdDev: 0,
    };
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;

  const min = sorted[0];
  const max = sorted[n - 1];
  const mean = samples.reduce((a, b) => a + b, 0) / n;

  // Percentiles
  const p50 = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);
  const p99 = percentile(sorted, 99);

  // Standard deviation
  const variance = samples.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);

  return { min, max, mean, p50, p95, p99, stdDev };
}

/**
 * Compute percentile from sorted array
 */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];

  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  if (upper >= sorted.length) return sorted[sorted.length - 1];

  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Compute throughput metrics
 */
export function computeThroughputMetrics(
  operations: number,
  durationMs: number,
  rowsScanned: number,
  bytesScanned: number
): ThroughputMetrics {
  const durationSec = durationMs / 1000;

  return {
    qps: operations / durationSec,
    rowsPerSecond: rowsScanned / durationSec,
    bytesPerSecond: bytesScanned / durationSec,
    totalOperations: operations,
    totalDurationMs: durationMs,
  };
}

/**
 * Compute cache metrics
 */
export function computeCacheMetrics(
  hits: number,
  misses: number,
  bytesFromCache: number,
  bytesFromOrigin: number,
  lookupTimes: number[]
): CacheMetrics {
  const total = hits + misses;

  return {
    hits,
    misses,
    hitRatio: total > 0 ? hits / total : 0,
    bytesFromCache,
    bytesFromOrigin,
    avgLookupTimeMs: lookupTimes.length > 0
      ? lookupTimes.reduce((a, b) => a + b, 0) / lookupTimes.length
      : 0,
  };
}

/**
 * Cloudflare pricing constants (as of 2024)
 * These are approximations for cost estimation
 */
export const CF_PRICING = {
  // Workers
  workerRequestCost: 0.50 / 1_000_000, // $0.50 per million requests
  workerCpuCostMs: 0.00001, // ~$0.01 per 1000ms CPU time

  // R2
  r2ClassAOpCost: 4.50 / 1_000_000, // $4.50 per million Class A ops (PUT, POST, LIST)
  r2ClassBOpCost: 0.36 / 1_000_000, // $0.36 per million Class B ops (GET, HEAD)
  r2StorageGbMonth: 0.015, // $0.015 per GB-month
  r2EgressGb: 0.00, // Free egress to Workers

  // Cache API
  cacheApiCost: 0, // Free

  // Durable Objects
  doRequestCost: 0.15 / 1_000_000, // $0.15 per million requests
  doDurationCostMs: 0.00001, // ~$0.01 per 1000ms
  doStorageGb: 0.20, // $0.20 per GB-month
};

/**
 * Compute cost metrics
 */
export function computeCostMetrics(
  workerRequests: number,
  cpuTimeMs: number,
  r2ReadOps: number,
  r2WriteOps: number,
  egressBytes: number
): CostMetrics {
  const workersCpuCost = cpuTimeMs * CF_PRICING.workerCpuCostMs;
  const workerRequestCost = workerRequests * CF_PRICING.workerRequestCost;

  const r2ReadCost = r2ReadOps * CF_PRICING.r2ClassBOpCost;
  const r2WriteCost = r2WriteOps * CF_PRICING.r2ClassAOpCost;
  const r2EgressCost = (egressBytes / (1024 * 1024 * 1024)) * CF_PRICING.r2EgressGb;

  const totalCost = workersCpuCost + workerRequestCost + r2ReadCost + r2WriteCost + r2EgressCost;
  const costPerQuery = workerRequests > 0 ? totalCost / workerRequests : 0;

  return {
    costPerQuery,
    costPerMillionQueries: costPerQuery * 1_000_000,
    workersCpuCost: workersCpuCost + workerRequestCost,
    r2ReadCost: r2ReadCost + r2WriteCost,
    r2EgressCost,
  };
}

/**
 * Histogram bucket for latency distribution
 */
export interface HistogramBucket {
  /** Lower bound (inclusive) */
  lower: number;
  /** Upper bound (exclusive) */
  upper: number;
  /** Count of values in this bucket */
  count: number;
  /** Percentage of total */
  percentage: number;
}

/**
 * Create latency histogram
 */
export function createHistogram(samples: number[], bucketCount: number = 20): HistogramBucket[] {
  if (samples.length === 0) return [];

  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const bucketSize = (max - min) / bucketCount;

  const buckets: HistogramBucket[] = [];
  for (let i = 0; i < bucketCount; i++) {
    buckets.push({
      lower: min + i * bucketSize,
      upper: min + (i + 1) * bucketSize,
      count: 0,
      percentage: 0,
    });
  }

  // Count values in each bucket
  for (const sample of samples) {
    const bucketIndex = Math.min(
      Math.floor((sample - min) / bucketSize),
      bucketCount - 1
    );
    buckets[bucketIndex].count++;
  }

  // Calculate percentages
  for (const bucket of buckets) {
    bucket.percentage = (bucket.count / samples.length) * 100;
  }

  return buckets;
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unitIndex = 0;
  let value = bytes;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return `${value.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Format duration to human-readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(2)}us`;
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}min`;
}

/**
 * Format number with SI prefix
 */
export function formatNumber(n: number): string {
  const prefixes = ['', 'K', 'M', 'G', 'T'];
  let prefixIndex = 0;
  let value = n;

  while (value >= 1000 && prefixIndex < prefixes.length - 1) {
    value /= 1000;
    prefixIndex++;
  }

  return `${value.toFixed(prefixIndex > 0 ? 2 : 0)}${prefixes[prefixIndex]}`;
}

/**
 * Calculate speedup factor
 */
export function calculateSpeedup(baselineMs: number, comparisonMs: number): number {
  if (comparisonMs === 0) return Infinity;
  return baselineMs / comparisonMs;
}

/**
 * Calculate scaling efficiency
 * Measures how well performance scales with added resources
 * 1.0 = perfect linear scaling, <1.0 = sublinear, >1.0 = superlinear
 */
export function calculateScalingEfficiency(
  singleWorkerQps: number,
  multiWorkerQps: number,
  workerCount: number
): number {
  const expectedQps = singleWorkerQps * workerCount;
  return multiWorkerQps / expectedQps;
}

/**
 * Merge multiple latency sample arrays
 */
export function mergeSamples(...sampleArrays: number[][]): number[] {
  return sampleArrays.flat();
}

/**
 * Aggregate multiple benchmark results
 */
export function aggregateLatencyMetrics(metrics: LatencyMetrics[]): LatencyMetrics {
  if (metrics.length === 0) {
    return computeLatencyMetrics([]);
  }

  // Use weighted average based on sample counts (approximated by mean)
  const totalWeight = metrics.length;

  return {
    min: Math.min(...metrics.map(m => m.min)),
    max: Math.max(...metrics.map(m => m.max)),
    mean: metrics.reduce((sum, m) => sum + m.mean, 0) / totalWeight,
    p50: metrics.reduce((sum, m) => sum + m.p50, 0) / totalWeight,
    p95: metrics.reduce((sum, m) => sum + m.p95, 0) / totalWeight,
    p99: metrics.reduce((sum, m) => sum + m.p99, 0) / totalWeight,
    stdDev: Math.sqrt(
      metrics.reduce((sum, m) => sum + m.stdDev * m.stdDev, 0) / totalWeight
    ),
  };
}
