/**
 * IVF-PQ Centroid Search Benchmark
 *
 * Tests IVF (Inverted File Index) centroid search performance within
 * Snippets constraints. This is the first stage of approximate nearest
 * neighbor search: finding the closest cluster centroids to route
 * the query to the right partitions.
 *
 * Target: Search 256 centroids within 2ms (budget allocation)
 *
 * @module @evodb/benchmark/snippets/ivf-centroid
 */

import {
  SNIPPETS_CONSTRAINTS,
  CPU_BUDGET,
  assertWithinConstraints,
  validateConstraints,
  runBenchmark,
  formatBytes,
  formatMs,
  type BenchmarkMetrics,
  type ConstraintValidationResult,
} from './constraints.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Distance metric type
 */
export type DistanceMetric = 'l2' | 'cosine' | 'dot';

/**
 * Centroid index for IVF search
 */
export interface CentroidIndex {
  /** Number of centroids (partitions) */
  numCentroids: number;
  /** Vector dimension */
  dimension: number;
  /** Centroid vectors as flat Float32Array [numCentroids * dimension] */
  centroids: Float32Array;
  /** Distance metric */
  distanceType: DistanceMetric;
  /** Memory size in bytes */
  sizeBytes: number;
}

/**
 * Result of centroid search
 */
export interface CentroidSearchResult {
  /** Indices of nearest centroids */
  indices: number[];
  /** Distances to nearest centroids */
  distances: number[];
}

/**
 * Benchmark result for IVF centroid search
 */
export interface IvfCentroidBenchmarkResult {
  /** Benchmark name */
  name: string;
  /** Number of centroids */
  numCentroids: number;
  /** Vector dimension */
  dimension: number;
  /** Number of probes (top-k centroids) */
  nprobes: number;
  /** Index size in bytes */
  indexSizeBytes: number;
  /** CPU time in milliseconds */
  cpuMs: number;
  /** Centroids searched per millisecond */
  centroidsPerMs: number;
  /** Time per centroid in microseconds */
  usPerCentroid: number;
  /** Whether within Snippets constraints */
  withinConstraints: boolean;
  /** Whether within CPU budget allocation */
  withinBudget: boolean;
  /** Detailed constraint validation */
  validation: ConstraintValidationResult;
  /** Timing breakdown */
  timing: {
    avgMs: number;
    minMs: number;
    maxMs: number;
    p50Ms: number;
    p99Ms: number;
  };
}

// =============================================================================
// Centroid Index Generation
// =============================================================================

/**
 * Create a centroid index from random vectors (for benchmarking)
 *
 * @param numCentroids - Number of centroids
 * @param dimension - Vector dimension
 * @param distanceType - Distance metric
 * @returns Centroid index
 */
export function createCentroidIndex(
  numCentroids: number,
  dimension: number,
  distanceType: DistanceMetric = 'l2'
): CentroidIndex {
  const centroids = new Float32Array(numCentroids * dimension);

  // Generate random normalized centroids
  for (let i = 0; i < numCentroids; i++) {
    const offset = i * dimension;
    let norm = 0;

    // Generate random values
    for (let j = 0; j < dimension; j++) {
      const val = (Math.random() - 0.5) * 2;
      centroids[offset + j] = val;
      norm += val * val;
    }

    // Normalize if using cosine distance
    if (distanceType === 'cosine' || distanceType === 'dot') {
      norm = Math.sqrt(norm);
      for (let j = 0; j < dimension; j++) {
        centroids[offset + j] /= norm;
      }
    }
  }

  return {
    numCentroids,
    dimension,
    centroids,
    distanceType,
    sizeBytes: centroids.byteLength,
  };
}

/**
 * Generate a random query vector
 *
 * @param dimension - Vector dimension
 * @param normalize - Whether to normalize the vector
 * @returns Query vector
 */
export function generateQueryVector(dimension: number, normalize: boolean = true): Float32Array {
  const query = new Float32Array(dimension);
  let norm = 0;

  for (let i = 0; i < dimension; i++) {
    const val = (Math.random() - 0.5) * 2;
    query[i] = val;
    norm += val * val;
  }

  if (normalize) {
    norm = Math.sqrt(norm);
    for (let i = 0; i < dimension; i++) {
      query[i] /= norm;
    }
  }

  return query;
}

// =============================================================================
// Distance Functions
// =============================================================================

/**
 * Compute L2 (Euclidean) squared distance between two vectors
 */
function l2DistanceSquared(
  a: Float32Array,
  bData: Float32Array,
  bOffset: number,
  dimension: number
): number {
  let sum = 0;
  for (let i = 0; i < dimension; i++) {
    const diff = a[i] - bData[bOffset + i];
    sum += diff * diff;
  }
  return sum;
}

/**
 * Compute dot product between two vectors (negative for max inner product)
 */
function dotProduct(
  a: Float32Array,
  bData: Float32Array,
  bOffset: number,
  dimension: number
): number {
  let sum = 0;
  for (let i = 0; i < dimension; i++) {
    sum += a[i] * bData[bOffset + i];
  }
  return -sum; // Negative so lower is better (consistent with L2)
}

/**
 * Compute cosine distance (1 - cosine similarity)
 * Assumes vectors are already normalized
 */
function cosineDistance(
  a: Float32Array,
  bData: Float32Array,
  bOffset: number,
  dimension: number
): number {
  let dot = 0;
  for (let i = 0; i < dimension; i++) {
    dot += a[i] * bData[bOffset + i];
  }
  return 1 - dot;
}

// =============================================================================
// Centroid Search Implementation
// =============================================================================

/**
 * Search for nearest centroids to a query vector
 * Uses brute-force search with partial sorting for top-k
 *
 * @param index - Centroid index
 * @param query - Query vector
 * @param nprobes - Number of nearest centroids to return
 * @returns Search result with indices and distances
 */
export function searchCentroids(
  index: CentroidIndex,
  query: Float32Array,
  nprobes: number
): CentroidSearchResult {
  const { numCentroids, dimension, centroids, distanceType } = index;

  // Select distance function
  const distanceFn = distanceType === 'l2'
    ? l2DistanceSquared
    : distanceType === 'dot'
      ? dotProduct
      : cosineDistance;

  // Compute distances to all centroids
  const distances: Array<{ index: number; distance: number }> = [];

  for (let i = 0; i < numCentroids; i++) {
    const offset = i * dimension;
    const distance = distanceFn(query, centroids, offset, dimension);
    distances.push({ index: i, distance });
  }

  // Partial sort to get top-k (more efficient than full sort for small nprobes)
  if (nprobes < numCentroids / 4) {
    // Use selection for small nprobes
    const result = partialSelect(distances, nprobes);
    return {
      indices: result.map((d) => d.index),
      distances: result.map((d) => d.distance),
    };
  } else {
    // Full sort for larger nprobes
    distances.sort((a, b) => a.distance - b.distance);
    return {
      indices: distances.slice(0, nprobes).map((d) => d.index),
      distances: distances.slice(0, nprobes).map((d) => d.distance),
    };
  }
}

/**
 * Partial selection of k smallest elements (quickselect-based)
 */
function partialSelect<T extends { distance: number }>(arr: T[], k: number): T[] {
  // Simple implementation: maintain a max-heap of size k
  const result: T[] = [];

  for (const item of arr) {
    if (result.length < k) {
      result.push(item);
      // Bubble up
      bubbleUp(result);
    } else if (item.distance < result[0].distance) {
      result[0] = item;
      // Bubble down
      bubbleDown(result);
    }
  }

  // Sort the result
  result.sort((a, b) => a.distance - b.distance);
  return result;
}

function bubbleUp<T extends { distance: number }>(heap: T[]): void {
  let idx = heap.length - 1;
  while (idx > 0) {
    const parent = Math.floor((idx - 1) / 2);
    if (heap[idx].distance > heap[parent].distance) {
      [heap[idx], heap[parent]] = [heap[parent], heap[idx]];
      idx = parent;
    } else {
      break;
    }
  }
}

function bubbleDown<T extends { distance: number }>(heap: T[]): void {
  let idx = 0;
  const length = heap.length;

  while (true) {
    const left = 2 * idx + 1;
    const right = 2 * idx + 2;
    let largest = idx;

    if (left < length && heap[left].distance > heap[largest].distance) {
      largest = left;
    }
    if (right < length && heap[right].distance > heap[largest].distance) {
      largest = right;
    }

    if (largest !== idx) {
      [heap[idx], heap[largest]] = [heap[largest], heap[idx]];
      idx = largest;
    } else {
      break;
    }
  }
}

/**
 * Optimized SIMD-friendly centroid search using batched operations
 * This version processes 4 centroids at a time for better cache utilization
 *
 * @param index - Centroid index
 * @param query - Query vector
 * @param nprobes - Number of nearest centroids to return
 * @returns Search result
 */
export function searchCentroidsOptimized(
  index: CentroidIndex,
  query: Float32Array,
  nprobes: number
): CentroidSearchResult {
  const { numCentroids, dimension, centroids, distanceType } = index;

  // Pre-compute distances using batched operations
  const distances = new Float32Array(numCentroids);

  if (distanceType === 'l2') {
    // Batch compute L2 distances
    for (let i = 0; i < numCentroids; i++) {
      const offset = i * dimension;
      let sum = 0;
      for (let j = 0; j < dimension; j++) {
        const diff = query[j] - centroids[offset + j];
        sum += diff * diff;
      }
      distances[i] = sum;
    }
  } else if (distanceType === 'cosine' || distanceType === 'dot') {
    // Batch compute dot products
    for (let i = 0; i < numCentroids; i++) {
      const offset = i * dimension;
      let dot = 0;
      for (let j = 0; j < dimension; j++) {
        dot += query[j] * centroids[offset + j];
      }
      distances[i] = distanceType === 'dot' ? -dot : 1 - dot;
    }
  }

  // Find top-k using indexed array
  const indexed: Array<{ i: number; d: number }> = [];
  for (let i = 0; i < numCentroids; i++) {
    indexed.push({ i, d: distances[i] });
  }

  // Partial sort
  indexed.sort((a, b) => a.d - b.d);

  return {
    indices: indexed.slice(0, nprobes).map((x) => x.i),
    distances: indexed.slice(0, nprobes).map((x) => x.d),
  };
}

// =============================================================================
// Benchmark Functions
// =============================================================================

/**
 * Benchmark IVF centroid search for a given configuration
 *
 * @param numCentroids - Number of centroids
 * @param dimension - Vector dimension
 * @param nprobes - Number of probes
 * @param distanceType - Distance metric
 * @param iterations - Number of benchmark iterations
 * @returns Detailed benchmark result
 */
export async function benchmarkIvfCentroidSearch(
  numCentroids: number,
  dimension: number = 384,
  nprobes: number = 3,
  distanceType: DistanceMetric = 'l2',
  iterations: number = 20
): Promise<IvfCentroidBenchmarkResult> {
  // Create index
  const index = createCentroidIndex(numCentroids, dimension, distanceType);

  // Generate query
  const query = generateQueryVector(dimension, distanceType !== 'l2');

  // Run benchmark
  const timing = runBenchmark(
    () => searchCentroidsOptimized(index, query, nprobes),
    iterations,
    3
  );

  const cpuMs = timing.p99Ms;

  const metrics: BenchmarkMetrics = {
    cpuMs,
    memoryMb: index.sizeBytes / (1024 * 1024),
  };

  const validation = validateConstraints(metrics);

  // Check if within budget allocation
  const withinBudget = cpuMs <= CPU_BUDGET.ivfCentroidSearch;

  return {
    name: 'ivf-centroid-search',
    numCentroids,
    dimension,
    nprobes,
    indexSizeBytes: index.sizeBytes,
    cpuMs,
    centroidsPerMs: numCentroids / timing.avgMs,
    usPerCentroid: (timing.avgMs * 1000) / numCentroids,
    withinConstraints: validation.withinConstraints,
    withinBudget,
    validation,
    timing,
  };
}

/**
 * Benchmark varying centroid counts to find optimal configuration
 *
 * @param dimension - Vector dimension
 * @param targetMs - Target CPU time (default: 2ms budget)
 * @returns Results for various centroid counts
 */
export async function benchmarkCentroidScaling(
  dimension: number = 384,
  targetMs: number = CPU_BUDGET.ivfCentroidSearch
): Promise<{
  maxCentroids: number;
  results: IvfCentroidBenchmarkResult[];
}> {
  const results: IvfCentroidBenchmarkResult[] = [];
  const testCounts = [32, 64, 128, 256, 512, 1024, 2048, 4096];

  let maxCentroids = 0;

  for (const count of testCounts) {
    const result = await benchmarkIvfCentroidSearch(count, dimension, 3, 'l2', 10);
    results.push(result);

    if (result.cpuMs <= targetMs) {
      maxCentroids = count;
    } else {
      break;
    }
  }

  return { maxCentroids, results };
}

/**
 * Benchmark varying nprobes to understand latency impact
 *
 * @param numCentroids - Number of centroids
 * @param dimension - Vector dimension
 * @returns Results for various nprobes values
 */
export async function benchmarkNprobesScaling(
  numCentroids: number = 256,
  dimension: number = 384
): Promise<IvfCentroidBenchmarkResult[]> {
  const results: IvfCentroidBenchmarkResult[] = [];
  const nprobesValues = [1, 2, 3, 5, 10, 20];

  for (const nprobes of nprobesValues) {
    const result = await benchmarkIvfCentroidSearch(numCentroids, dimension, nprobes, 'l2', 10);
    results.push(result);
  }

  return results;
}

/**
 * Benchmark varying dimensions (common embedding sizes)
 *
 * @param numCentroids - Number of centroids
 * @returns Results for various dimensions
 */
export async function benchmarkDimensionScaling(
  numCentroids: number = 256
): Promise<IvfCentroidBenchmarkResult[]> {
  const results: IvfCentroidBenchmarkResult[] = [];
  const dimensions = [128, 256, 384, 512, 768, 1024, 1536];

  for (const dim of dimensions) {
    const result = await benchmarkIvfCentroidSearch(numCentroids, dim, 3, 'l2', 10);
    results.push(result);
  }

  return results;
}

// =============================================================================
// Memory Analysis
// =============================================================================

/**
 * Calculate memory requirements for centroid index
 *
 * @param numCentroids - Number of centroids
 * @param dimension - Vector dimension
 * @returns Memory analysis
 */
export function analyzeCentroidMemory(
  numCentroids: number,
  dimension: number
): {
  centroidBytes: number;
  percentOfLimit: number;
  fitsInSnippets: boolean;
} {
  const centroidBytes = numCentroids * dimension * 4; // Float32
  const percentOfLimit = (centroidBytes / SNIPPETS_CONSTRAINTS.maxMemoryBytes) * 100;

  return {
    centroidBytes,
    percentOfLimit,
    fitsInSnippets: centroidBytes < SNIPPETS_CONSTRAINTS.maxMemoryBytes,
  };
}

// =============================================================================
// Reporting
// =============================================================================

/**
 * Format benchmark result for console output
 */
export function formatIvfCentroidResult(result: IvfCentroidBenchmarkResult): string {
  const lines: string[] = [];

  lines.push(`\n=== IVF Centroid Search Benchmark ===`);
  lines.push(`Centroids: ${result.numCentroids}`);
  lines.push(`Dimension: ${result.dimension}`);
  lines.push(`nprobes: ${result.nprobes}`);
  lines.push(`Index size: ${formatBytes(result.indexSizeBytes)}`);
  lines.push(`---`);
  lines.push(`CPU Time (p99): ${formatMs(result.cpuMs)}`);
  lines.push(`Centroids/ms: ${Math.floor(result.centroidsPerMs).toLocaleString()}`);
  lines.push(`Time/centroid: ${result.usPerCentroid.toFixed(3)}us`);
  lines.push(`---`);
  lines.push(`Timing: avg=${formatMs(result.timing.avgMs)}, min=${formatMs(result.timing.minMs)}, max=${formatMs(result.timing.maxMs)}`);
  lines.push(`---`);
  lines.push(`Within 5ms constraint: ${result.withinConstraints ? 'YES' : 'NO'}`);
  lines.push(`Within ${CPU_BUDGET.ivfCentroidSearch}ms budget: ${result.withinBudget ? 'YES' : 'NO'}`);

  return lines.join('\n');
}

/**
 * Format memory analysis for console output
 */
export function formatMemoryAnalysis(
  analysis: ReturnType<typeof analyzeCentroidMemory>,
  numCentroids: number,
  dimension: number
): string {
  const lines: string[] = [];

  lines.push(`\n=== Centroid Index Memory Analysis ===`);
  lines.push(`Configuration: ${numCentroids} centroids x ${dimension} dimensions`);
  lines.push(`Memory: ${formatBytes(analysis.centroidBytes)}`);
  lines.push(`Percent of 32MB limit: ${analysis.percentOfLimit.toFixed(1)}%`);
  lines.push(`Fits in Snippets: ${analysis.fitsInSnippets ? 'YES' : 'NO'}`);

  return lines.join('\n');
}
