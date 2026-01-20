/**
 * IVF-PQ Search Implementation
 *
 * Implements efficient approximate nearest neighbor search using IVF-PQ algorithm:
 * 1. Centroid distance computation to find nearest partitions
 * 2. Top-k partition selection based on nprobes parameter
 * 3. Asymmetric Distance Computation (ADC) using PQ lookup tables
 * 4. Result merging with min-heap for top-k
 *
 * Optimized for Cloudflare Workers:
 * - Minimal memory footprint
 * - Typed arrays throughout
 * - Pre-allocated buffers
 * - Early termination
 *
 * @module @evodb/lance-reader/ivf-pq-search
 */

import type { DistanceType } from './types.js';
import type {
  IvfIndex,
  PqCodebook,
  PqLookupTables,
  PartitionRawData,
  IvfPqSearchParams,
  IvfPqSearchResult,
  IvfPqSearchStats,
  IvfPqBatchResults,
} from './ivf-pq-index.js';
import { createSearchStats, createEmptyLookupTables } from './ivf-pq-index.js';

// ==========================================
// Distance Functions
// ==========================================

/**
 * Compute L2 (Euclidean) squared distance between two vectors
 */
function l2DistanceSquared(a: Float32Array, b: Float32Array, offset: number = 0): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[offset + i];
    sum += diff * diff;
  }
  return sum;
}

/**
 * Compute cosine distance (1 - cosine similarity)
 */
function cosineDistance(a: Float32Array, b: Float32Array, offset: number = 0): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[offset + i];
    normA += a[i] * a[i];
    normB += b[offset + i] * b[offset + i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 1;
  return 1 - dot / denom;
}

/**
 * Compute negative dot product distance (for MIPS)
 */
function dotDistance(a: Float32Array, b: Float32Array, offset: number = 0): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[offset + i];
  }
  return -dot; // Negate so lower is better
}

/**
 * Distance function type
 */
type DistanceFunction = (a: Float32Array, b: Float32Array, offset?: number) => number;

/**
 * Get distance function for a distance type
 */
function getDistanceFunction(type: DistanceType): DistanceFunction {
  switch (type) {
    case 'l2':
      return l2DistanceSquared;
    case 'cosine':
      return cosineDistance;
    case 'dot':
      return dotDistance;
    default:
      return l2DistanceSquared;
  }
}

// ==========================================
// Top-K Heap Implementation
// ==========================================

/**
 * Max heap for maintaining top-K results (by distance)
 * Uses max heap so we can efficiently drop worst results
 *
 * Optimized for minimal allocations:
 * - Pre-allocated arrays
 * - In-place operations
 */
class TopKHeap {
  private readonly rowIds: BigUint64Array;
  private readonly distances: Float64Array;
  private readonly partitionIds: Int32Array;
  private readonly k: number;
  private size: number = 0;

  constructor(k: number) {
    this.k = k;
    this.rowIds = new BigUint64Array(k);
    this.distances = new Float64Array(k);
    this.partitionIds = new Int32Array(k);
  }

  /**
   * Push a result, keeping only top K (lowest distances)
   */
  push(rowId: bigint, distance: number, partitionId: number): void {
    if (this.size < this.k) {
      // Heap not full, add to end
      const idx = this.size;
      this.rowIds[idx] = rowId;
      this.distances[idx] = distance;
      this.partitionIds[idx] = partitionId;
      this.size++;
      this.bubbleUp(idx);
    } else if (distance < this.distances[0]) {
      // Replace root (worst) with new result
      this.rowIds[0] = rowId;
      this.distances[0] = distance;
      this.partitionIds[0] = partitionId;
      this.bubbleDown(0);
    }
  }

  /**
   * Get the worst distance in the heap (for early termination)
   */
  worstDistance(): number {
    return this.size > 0 ? this.distances[0] : Infinity;
  }

  /**
   * Check if heap is full
   */
  isFull(): boolean {
    return this.size >= this.k;
  }

  /**
   * Get current size
   */
  getSize(): number {
    return this.size;
  }

  /**
   * Get sorted results (best first)
   */
  toSortedArray(): IvfPqSearchResult[] {
    const results: IvfPqSearchResult[] = new Array(this.size);

    for (let i = 0; i < this.size; i++) {
      results[i] = {
        rowId: this.rowIds[i],
        distance: this.distances[i],
        partitionId: this.partitionIds[i],
      };
    }

    return results.sort((a, b) => a.distance - b.distance);
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.distances[parentIndex] >= this.distances[index]) break;

      // Swap with parent
      this.swap(parentIndex, index);
      index = parentIndex;
    }
  }

  private bubbleDown(index: number): void {
    while (true) {
      const left = 2 * index + 1;
      const right = 2 * index + 2;
      let largest = index;

      if (left < this.size && this.distances[left] > this.distances[largest]) {
        largest = left;
      }
      if (right < this.size && this.distances[right] > this.distances[largest]) {
        largest = right;
      }

      if (largest === index) break;

      this.swap(index, largest);
      index = largest;
    }
  }

  private swap(i: number, j: number): void {
    // Swap row IDs
    const tmpRowId = this.rowIds[i];
    this.rowIds[i] = this.rowIds[j];
    this.rowIds[j] = tmpRowId;

    // Swap distances
    const tmpDist = this.distances[i];
    this.distances[i] = this.distances[j];
    this.distances[j] = tmpDist;

    // Swap partition IDs
    const tmpPart = this.partitionIds[i];
    this.partitionIds[i] = this.partitionIds[j];
    this.partitionIds[j] = tmpPart;
  }
}

// ==========================================
// Centroid Distance Computation
// ==========================================

/**
 * Find nearest centroids to the query vector
 *
 * @param query - Query vector
 * @param ivf - IVF index with centroids
 * @param n - Number of nearest centroids to return
 * @param distanceType - Distance metric type
 * @returns Array of partition IDs sorted by distance
 */
export function findNearestCentroids(
  query: Float32Array,
  ivf: IvfIndex,
  n: number,
  distanceType: DistanceType
): number[] {
  const numPartitions = ivf.config.numPartitions;
  const dimension = ivf.config.dimension;
  const centroids = ivf.centroids.data;
  const distFn = getDistanceFunction(distanceType);

  // Compute distances to all centroids
  const distances: Array<{ id: number; dist: number }> = new Array(numPartitions);

  for (let i = 0; i < numPartitions; i++) {
    const offset = i * dimension;
    const dist = distFn(query, centroids, offset);
    distances[i] = { id: i, dist };
  }

  // Sort and return top n
  distances.sort((a, b) => a.dist - b.dist);
  return distances.slice(0, Math.min(n, numPartitions)).map(d => d.id);
}

/**
 * Find nearest centroids with pre-allocated buffer (optimized)
 */
export function findNearestCentroidsOptimized(
  query: Float32Array,
  ivf: IvfIndex,
  n: number,
  distanceType: DistanceType,
  distanceBuffer: Float32Array
): number[] {
  const numPartitions = ivf.config.numPartitions;
  const dimension = ivf.config.dimension;
  const centroids = ivf.centroids.data;
  const distFn = getDistanceFunction(distanceType);

  // Compute distances to all centroids
  for (let i = 0; i < numPartitions; i++) {
    const offset = i * dimension;
    distanceBuffer[i] = distFn(query, centroids, offset);
  }

  // Use partial sort for large partition counts
  if (numPartitions > n * 10) {
    return partialArgsort(distanceBuffer, numPartitions, n);
  }

  // Full sort for smaller counts
  const indices = Array.from({ length: numPartitions }, (_, i) => i);
  indices.sort((a, b) => distanceBuffer[a] - distanceBuffer[b]);
  return indices.slice(0, n);
}

/**
 * Partial argsort - returns indices of smallest n elements
 */
function partialArgsort(values: Float32Array, length: number, n: number): number[] {
  // Use a max heap to track the n smallest
  const heap: Array<{ idx: number; val: number }> = [];

  for (let i = 0; i < length; i++) {
    const val = values[i];

    if (heap.length < n) {
      heap.push({ idx: i, val });
      // Bubble up
      let j = heap.length - 1;
      while (j > 0) {
        const parent = Math.floor((j - 1) / 2);
        if (heap[parent].val >= heap[j].val) break;
        [heap[parent], heap[j]] = [heap[j], heap[parent]];
        j = parent;
      }
    } else if (val < heap[0].val) {
      heap[0] = { idx: i, val };
      // Bubble down
      let j = 0;
      while (true) {
        const left = 2 * j + 1;
        const right = 2 * j + 2;
        let largest = j;
        if (left < heap.length && heap[left].val > heap[largest].val) largest = left;
        if (right < heap.length && heap[right].val > heap[largest].val) largest = right;
        if (largest === j) break;
        [heap[j], heap[largest]] = [heap[largest], heap[j]];
        j = largest;
      }
    }
  }

  // Sort the heap by value
  heap.sort((a, b) => a.val - b.val);
  return heap.map(h => h.idx);
}

// ==========================================
// PQ Lookup Table Building
// ==========================================

/**
 * Build PQ distance lookup tables for a query vector
 *
 * For each sub-vector m and each codebook entry c, compute:
 * table[m][c] = distance(query_subvector[m], codebook[c][m])
 *
 * This enables O(M) distance computation per database vector
 * instead of O(D) by summing precomputed sub-distances.
 *
 * @param query - Query vector
 * @param pq - PQ codebook
 * @param distanceType - Distance metric type
 * @returns Lookup tables for ADC
 */
export function buildPqLookupTables(
  query: Float32Array,
  pq: PqCodebook,
  distanceType: DistanceType
): PqLookupTables {
  const { numSubVectors, subDim, numCodes } = pq.config;
  const codebook = pq.data;

  const tables = createEmptyLookupTables(numSubVectors, numCodes);

  for (let m = 0; m < numSubVectors; m++) {
    const table = tables.tables[m];
    const subQuery = query.subarray(m * subDim, (m + 1) * subDim);

    for (let c = 0; c < numCodes; c++) {
      // Codebook layout: [numCodes, numSubVectors, subDim]
      // Entry for code c, subvector m starts at: c * numSubVectors * subDim + m * subDim
      const codebookOffset = (c * numSubVectors + m) * subDim;

      // Compute partial distance
      let dist = 0;
      if (distanceType === 'l2') {
        for (let d = 0; d < subDim; d++) {
          const diff = subQuery[d] - codebook[codebookOffset + d];
          dist += diff * diff;
        }
      } else if (distanceType === 'cosine') {
        // For cosine, use L2 on normalized vectors (approximation)
        for (let d = 0; d < subDim; d++) {
          const diff = subQuery[d] - codebook[codebookOffset + d];
          dist += diff * diff;
        }
      } else {
        // Dot product (negative for min-heap)
        for (let d = 0; d < subDim; d++) {
          dist -= subQuery[d] * codebook[codebookOffset + d];
        }
      }

      table[c] = dist;
    }
  }

  return tables;
}

/**
 * Build lookup tables with pre-allocated buffer (optimized)
 */
export function buildPqLookupTablesOptimized(
  query: Float32Array,
  pq: PqCodebook,
  distanceType: DistanceType,
  tables: PqLookupTables
): void {
  const { numSubVectors, subDim, numCodes } = pq.config;
  const codebook = pq.data;

  for (let m = 0; m < numSubVectors; m++) {
    const table = tables.tables[m];
    const subQueryStart = m * subDim;

    for (let c = 0; c < numCodes; c++) {
      const codebookOffset = (c * numSubVectors + m) * subDim;

      let dist = 0;
      if (distanceType === 'l2') {
        for (let d = 0; d < subDim; d++) {
          const diff = query[subQueryStart + d] - codebook[codebookOffset + d];
          dist += diff * diff;
        }
      } else if (distanceType === 'dot') {
        for (let d = 0; d < subDim; d++) {
          dist -= query[subQueryStart + d] * codebook[codebookOffset + d];
        }
      } else {
        for (let d = 0; d < subDim; d++) {
          const diff = query[subQueryStart + d] - codebook[codebookOffset + d];
          dist += diff * diff;
        }
      }

      table[c] = dist;
    }
  }
}

// ==========================================
// Partition Scanning
// ==========================================

/**
 * Scan a partition using ADC (Asymmetric Distance Computation)
 *
 * @param partition - Partition data
 * @param lookupTables - Pre-computed PQ lookup tables
 * @param heap - Result heap to accumulate results
 * @param params - Search parameters
 * @returns Number of rows scanned
 */
export function scanPartition(
  partition: PartitionRawData,
  lookupTables: PqLookupTables,
  heap: TopKHeap,
  params: IvfPqSearchParams
): number {
  const { preFilter, includeRowIds, excludeRowIds, maxDistance } = params;
  const { rowIds, pqCodes, numRows, partitionId } = partition;
  const numSubVectors = lookupTables.numSubVectors;

  let scanned = 0;
  const worstAllowed = maxDistance !== undefined
    ? Math.min(heap.worstDistance(), maxDistance)
    : heap.isFull()
      ? heap.worstDistance()
      : Infinity;

  for (let i = 0; i < numRows; i++) {
    const rowId = rowIds[i];

    // Apply filters
    if (excludeRowIds && excludeRowIds.has(rowId)) continue;
    if (includeRowIds && !includeRowIds.has(rowId)) continue;
    if (preFilter && !preFilter(rowId)) continue;

    scanned++;

    // Compute asymmetric distance using lookup tables
    let distance = 0;
    const codeOffset = i * numSubVectors;

    for (let m = 0; m < numSubVectors; m++) {
      const code = pqCodes[codeOffset + m];
      distance += lookupTables.tables[m][code];

      // Early termination if distance already exceeds threshold
      if (distance >= worstAllowed) {
        break;
      }
    }

    // Add to heap if distance is good enough
    if (distance < worstAllowed || !heap.isFull()) {
      heap.push(rowId, distance, partitionId);
    }
  }

  return scanned;
}

/**
 * Scan partition with SIMD-friendly loop unrolling (optimized)
 */
export function scanPartitionOptimized(
  partition: PartitionRawData,
  lookupTables: PqLookupTables,
  heap: TopKHeap,
  params: IvfPqSearchParams
): number {
  const { excludeRowIds, maxDistance } = params;
  const { rowIds, pqCodes, numRows, partitionId } = partition;
  const numSubVectors = lookupTables.numSubVectors;
  const tables = lookupTables.tables;

  let scanned = 0;

  // Process 4 rows at a time when possible (loop unrolling)
  const unrollCount = 4;
  const remainder = numRows % unrollCount;
  const mainCount = numRows - remainder;

  for (let i = 0; i < mainCount; i += unrollCount) {
    const worstAllowed = maxDistance !== undefined
      ? Math.min(heap.worstDistance(), maxDistance)
      : heap.isFull()
        ? heap.worstDistance()
        : Infinity;

    // Process 4 rows
    for (let j = 0; j < unrollCount; j++) {
      const idx = i + j;
      const rowId = rowIds[idx];

      if (excludeRowIds && excludeRowIds.has(rowId)) continue;

      scanned++;

      let distance = 0;
      const codeOffset = idx * numSubVectors;

      // Compute ADC distance
      for (let m = 0; m < numSubVectors; m++) {
        distance += tables[m][pqCodes[codeOffset + m]];
      }

      if (distance < worstAllowed) {
        heap.push(rowId, distance, partitionId);
      }
    }
  }

  // Process remaining rows
  for (let i = mainCount; i < numRows; i++) {
    const rowId = rowIds[i];

    if (excludeRowIds && excludeRowIds.has(rowId)) continue;

    scanned++;

    const worstAllowed = heap.isFull() ? heap.worstDistance() : Infinity;
    let distance = 0;
    const codeOffset = i * numSubVectors;

    for (let m = 0; m < numSubVectors; m++) {
      distance += tables[m][pqCodes[codeOffset + m]];
    }

    if (distance < worstAllowed) {
      heap.push(rowId, distance, partitionId);
    }
  }

  return scanned;
}

// ==========================================
// Main Search Function
// ==========================================

/**
 * IVF-PQ Search Engine
 *
 * Coordinates the complete search process:
 * 1. Find nearest centroids
 * 2. Build lookup tables
 * 3. Scan partitions
 * 4. Return results
 */
export class IvfPqSearchEngine {
  private ivf: IvfIndex;
  private pq: PqCodebook;
  private distanceType: DistanceType;

  // Pre-allocated buffers for optimized search
  private centroidDistanceBuffer: Float32Array;
  private lookupTables: PqLookupTables;

  constructor(ivf: IvfIndex, pq: PqCodebook) {
    this.ivf = ivf;
    this.pq = pq;
    this.distanceType = ivf.config.distanceType;

    // Pre-allocate buffers
    this.centroidDistanceBuffer = new Float32Array(ivf.config.numPartitions);
    this.lookupTables = createEmptyLookupTables(
      pq.config.numSubVectors,
      pq.config.numCodes
    );
  }

  /**
   * Get dimension of indexed vectors
   */
  get dimension(): number {
    return this.ivf.config.dimension;
  }

  /**
   * Get number of partitions
   */
  get numPartitions(): number {
    return this.ivf.config.numPartitions;
  }

  /**
   * Search for k nearest neighbors
   *
   * @param query - Query vector
   * @param partitionLoader - Function to load partition data
   * @param params - Search parameters
   * @returns Search results and statistics
   */
  async search(
    query: Float32Array,
    partitionLoader: (partitionId: number) => Promise<PartitionRawData>,
    params: IvfPqSearchParams
  ): Promise<{ results: IvfPqSearchResult[]; stats: IvfPqSearchStats }> {
    const stats = createSearchStats();
    const startTime = performance.now();

    // Validate query dimension
    if (query.length !== this.ivf.config.dimension) {
      throw new Error(
        `Query dimension ${query.length} does not match index dimension ${this.ivf.config.dimension}`
      );
    }

    // Step 1: Find nearest centroids
    const centroidStart = performance.now();
    const nearestPartitions = findNearestCentroidsOptimized(
      query,
      this.ivf,
      params.nprobes,
      this.distanceType,
      this.centroidDistanceBuffer
    );
    stats.centroidDistanceTimeMs = performance.now() - centroidStart;

    // Step 2: Build PQ lookup tables
    const lookupStart = performance.now();
    buildPqLookupTablesOptimized(
      query,
      this.pq,
      this.distanceType,
      this.lookupTables
    );
    stats.lookupTableBuildTimeMs = performance.now() - lookupStart;

    // Step 3: Scan partitions
    const scanStart = performance.now();
    const heap = new TopKHeap(params.k);
    stats.partitionsProbed = nearestPartitions.length;

    for (const partitionId of nearestPartitions) {
      const partition = await partitionLoader(partitionId);
      const scanned = scanPartitionOptimized(partition, this.lookupTables, heap, params);
      stats.rowsScanned += scanned;
    }
    stats.partitionScanTimeMs = performance.now() - scanStart;

    // Step 4: Get sorted results
    const results = heap.toSortedArray();

    // Add normalized scores
    for (const result of results) {
      result.score = this.distanceToScore(result.distance);
    }

    stats.totalTimeMs = performance.now() - startTime;

    return { results, stats };
  }

  /**
   * Batch search for multiple queries
   */
  async batchSearch(
    queries: Float32Array[],
    partitionLoader: (partitionId: number) => Promise<PartitionRawData>,
    params: IvfPqSearchParams
  ): Promise<IvfPqBatchResults> {
    const stats = createSearchStats();
    const startTime = performance.now();

    // Validate all query dimensions
    for (let i = 0; i < queries.length; i++) {
      if (queries[i].length !== this.ivf.config.dimension) {
        throw new Error(
          `Query ${i} dimension ${queries[i].length} does not match index dimension ${this.ivf.config.dimension}`
        );
      }
    }

    // Step 1: Find nearest centroids for all queries
    const centroidStart = performance.now();
    const queryPartitions = queries.map(query =>
      findNearestCentroidsOptimized(
        query,
        this.ivf,
        params.nprobes,
        this.distanceType,
        this.centroidDistanceBuffer
      )
    );
    stats.centroidDistanceTimeMs = performance.now() - centroidStart;

    // Step 2: Collect all unique partitions to load
    const allPartitions = new Set<number>();
    for (const partitions of queryPartitions) {
      for (const p of partitions) {
        allPartitions.add(p);
      }
    }

    // Step 3: Pre-load all needed partitions
    const partitionData = new Map<number, PartitionRawData>();
    const loadPromises = Array.from(allPartitions).map(async p => {
      const data = await partitionLoader(p);
      partitionData.set(p, data);
    });
    await Promise.all(loadPromises);

    // Step 4: Search for each query
    const lookupStart = performance.now();
    const allResults: IvfPqSearchResult[][] = [];

    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];
      const partitions = queryPartitions[i];

      // Build lookup tables for this query
      buildPqLookupTablesOptimized(query, this.pq, this.distanceType, this.lookupTables);

      // Search partitions
      const heap = new TopKHeap(params.k);
      stats.partitionsProbed += partitions.length;

      for (const partitionId of partitions) {
        const partition = partitionData.get(partitionId)!;
        const scanned = scanPartitionOptimized(partition, this.lookupTables, heap, params);
        stats.rowsScanned += scanned;
      }

      // Get sorted results with scores
      const results = heap.toSortedArray();
      for (const result of results) {
        result.score = this.distanceToScore(result.distance);
      }

      allResults.push(results);
    }

    stats.lookupTableBuildTimeMs = performance.now() - lookupStart - stats.partitionScanTimeMs;
    stats.totalTimeMs = performance.now() - startTime;

    return { results: allResults, stats };
  }

  /**
   * Convert distance to normalized similarity score
   */
  private distanceToScore(distance: number): number {
    switch (this.distanceType) {
      case 'l2':
        // Convert L2 squared distance to similarity
        return 1 / (1 + Math.sqrt(Math.max(0, distance)));
      case 'cosine':
        // Cosine distance is already 0-2
        return 1 - distance / 2;
      case 'dot':
        // Dot product was negated
        return 1 / (1 + Math.exp(distance));
      default:
        return 1 / (1 + distance);
    }
  }

  /**
   * Get the IVF index
   */
  getIvfIndex(): IvfIndex {
    return this.ivf;
  }

  /**
   * Get the PQ codebook
   */
  getPqCodebook(): PqCodebook {
    return this.pq;
  }
}

// ==========================================
// Factory Functions
// ==========================================

/**
 * Create a search engine from IVF and PQ structures
 */
export function createSearchEngine(ivf: IvfIndex, pq: PqCodebook): IvfPqSearchEngine {
  return new IvfPqSearchEngine(ivf, pq);
}

// ==========================================
// Utility Functions
// ==========================================

/**
 * Estimate search latency based on index parameters
 */
export function estimateSearchLatency(params: {
  numPartitions: number;
  avgRowsPerPartition: number;
  nprobes: number;
  dimension: number;
  numSubVectors: number;
}): {
  centroidDistanceMs: number;
  lookupTableMs: number;
  partitionScanMs: number;
  totalMs: number;
} {
  const { numPartitions, avgRowsPerPartition, nprobes, dimension, numSubVectors } = params;

  // Rough estimates based on typical performance
  // Centroid distance: ~0.001ms per partition per dimension
  const centroidDistanceMs = numPartitions * dimension * 0.000001;

  // Lookup table: ~0.0001ms per sub-vector per code
  const lookupTableMs = numSubVectors * 256 * 0.0001;

  // Partition scan: ~0.00001ms per row per sub-vector
  const partitionScanMs = nprobes * avgRowsPerPartition * numSubVectors * 0.00001;

  return {
    centroidDistanceMs,
    lookupTableMs,
    partitionScanMs,
    totalMs: centroidDistanceMs + lookupTableMs + partitionScanMs,
  };
}

/**
 * Compute recall at k given ground truth
 */
export function computeRecallAtK(
  results: IvfPqSearchResult[],
  groundTruth: bigint[],
  k: number
): number {
  const resultSet = new Set(results.slice(0, k).map(r => r.rowId));
  const truthSet = new Set(groundTruth.slice(0, k));

  let hits = 0;
  for (const id of resultSet) {
    if (truthSet.has(id)) {
      hits++;
    }
  }

  return hits / k;
}

/**
 * Compute average precision
 */
export function computeAveragePrecision(
  results: IvfPqSearchResult[],
  groundTruth: Set<bigint>
): number {
  let sumPrecision = 0;
  let relevantCount = 0;

  for (let i = 0; i < results.length; i++) {
    if (groundTruth.has(results[i].rowId)) {
      relevantCount++;
      sumPrecision += relevantCount / (i + 1);
    }
  }

  return relevantCount > 0 ? sumPrecision / groundTruth.size : 0;
}
