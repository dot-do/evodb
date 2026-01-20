/**
 * IVF-PQ (Inverted File with Product Quantization) Index
 * Implements approximate nearest neighbor search using IVF-PQ algorithm
 *
 * @module @evodb/lance-reader/ivf-pq
 */

import type {
  StorageAdapter,
  VectorSearchOptions,
  SearchResult,
  IvfStructure,
  PqCodebook,
  DistanceType,
  PartitionData,
} from './types.js';
import { VectorIndex } from './vector-index.js';

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
 * Compute negative dot product distance (for maximum inner product search)
 */
function dotDistance(a: Float32Array, b: Float32Array, offset: number = 0): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[offset + i];
  }
  return -dot; // Negate so lower is better
}

/**
 * Get distance function for a distance type
 */
function getDistanceFunction(type: DistanceType): (a: Float32Array, b: Float32Array, offset?: number) => number {
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
// Min Heap for Top-K Results
// ==========================================

/**
 * Min heap for maintaining top-K results
 * Actually stores as max heap to efficiently drop worst results
 */
class TopKHeap {
  private heap: SearchResult[] = [];
  private k: number;

  constructor(k: number) {
    this.k = k;
  }

  /**
   * Add a result, keeping only top K
   */
  push(result: SearchResult): void {
    if (this.heap.length < this.k) {
      this.heap.push(result);
      this.bubbleUp(this.heap.length - 1);
    } else if (result.distance < this.heap[0].distance) {
      // Replace worst (root of max heap)
      this.heap[0] = result;
      this.bubbleDown(0);
    }
  }

  /**
   * Get worst distance in heap (for early termination)
   */
  worstDistance(): number {
    return this.heap.length > 0 ? this.heap[0].distance : Infinity;
  }

  /**
   * Check if heap is full
   */
  isFull(): boolean {
    return this.heap.length >= this.k;
  }

  /**
   * Get sorted results (best first)
   */
  toSortedArray(): SearchResult[] {
    return [...this.heap].sort((a, b) => a.distance - b.distance);
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.heap[parentIndex].distance >= this.heap[index].distance) break;
      [this.heap[parentIndex], this.heap[index]] = [this.heap[index], this.heap[parentIndex]];
      index = parentIndex;
    }
  }

  private bubbleDown(index: number): void {
    const length = this.heap.length;
    while (true) {
      const left = 2 * index + 1;
      const right = 2 * index + 2;
      let largest = index;

      if (left < length && this.heap[left].distance > this.heap[largest].distance) {
        largest = left;
      }
      if (right < length && this.heap[right].distance > this.heap[largest].distance) {
        largest = right;
      }

      if (largest === index) break;
      [this.heap[index], this.heap[largest]] = [this.heap[largest], this.heap[index]];
      index = largest;
    }
  }
}

// ==========================================
// IVF-PQ Index Implementation
// ==========================================

/**
 * IVF-PQ index for approximate nearest neighbor search
 *
 * The IVF-PQ algorithm:
 * 1. Coarse quantization: Find nearest centroids to narrow search space
 * 2. Product quantization: Use precomputed lookup tables for fast distance estimation
 * 3. Asymmetric distance computation: Query is exact, database vectors are quantized
 */
export class IvfPqIndex extends VectorIndex {
  private storage: StorageAdapter;
  private auxFilePath: string;
  private ivf: IvfStructure;
  private pq: PqCodebook;
  private distanceType: DistanceType;
  private distanceFunc: (a: Float32Array, b: Float32Array, offset?: number) => number;

  // Cached partition data
  private partitionCache = new Map<number, PartitionData>();
  private maxCachedPartitions = 50;

  constructor(
    storage: StorageAdapter,
    auxFilePath: string,
    ivf: IvfStructure,
    pq: PqCodebook,
    distanceType: DistanceType
  ) {
    super();
    this.storage = storage;
    this.auxFilePath = auxFilePath;
    this.ivf = ivf;
    this.pq = pq;
    this.distanceType = distanceType;
    this.distanceFunc = getDistanceFunction(distanceType);
  }

  get indexType(): string {
    return 'ivf_pq';
  }

  get dimension(): number {
    return this.ivf.dimension;
  }

  /**
   * Search for k nearest neighbors
   */
  async search(
    query: Float32Array,
    options: VectorSearchOptions
  ): Promise<SearchResult[]> {
    const { k, nprobes = 10, filter } = options;

    if (query.length !== this.ivf.dimension) {
      throw new Error(
        `Query dimension ${query.length} does not match index dimension ${this.ivf.dimension}`
      );
    }

    // Step 1: Find nearest centroids
    const nearestPartitions = this.findNearestCentroids(query, nprobes);

    // Step 2: Build PQ distance lookup tables
    const lookupTables = this.buildPqLookupTables(query);

    // Step 3: Search partitions and collect candidates
    const heap = new TopKHeap(k);

    for (const partitionId of nearestPartitions) {
      await this.searchPartition(partitionId, lookupTables, heap, filter);
    }

    // Step 4: Return sorted results
    const results = heap.toSortedArray();

    // Compute normalized scores
    for (const result of results) {
      result.score = this.distanceToScore(result.distance);
    }

    return results;
  }

  /**
   * Find nearest centroids to the query vector
   */
  private findNearestCentroids(query: Float32Array, n: number): number[] {
    const numPartitions = this.ivf.numPartitions;
    const dimension = this.ivf.dimension;
    const centroids = this.ivf.centroids;

    // Compute distances to all centroids
    const distances: Array<{ id: number; dist: number }> = new Array(numPartitions);

    for (let i = 0; i < numPartitions; i++) {
      const offset = i * dimension;
      const dist = this.distanceFunc(query, centroids, offset);
      distances[i] = { id: i, dist };
    }

    // Sort and return top n
    distances.sort((a, b) => a.dist - b.dist);
    return distances.slice(0, n).map(d => d.id);
  }

  /**
   * Build product quantization lookup tables for efficient distance computation
   *
   * For each sub-vector m and each codebook entry c, compute:
   * table[m][c] = distance(query_subvector_m, codebook[c][m])
   *
   * Then distance to a quantized vector is: sum of table[m][pq_code[m]] for all m
   */
  private buildPqLookupTables(query: Float32Array): Float32Array[] {
    const numSubVectors = this.pq.numSubVectors;
    const subDim = this.pq.subDim;
    const numCodes = 1 << this.pq.numBits; // 256 for 8-bit PQ
    const codebook = this.pq.codebook;

    const tables: Float32Array[] = new Array(numSubVectors);

    for (let m = 0; m < numSubVectors; m++) {
      const table = new Float32Array(numCodes);
      const subQuery = query.subarray(m * subDim, (m + 1) * subDim);

      for (let c = 0; c < numCodes; c++) {
        // Codebook layout: [numCodes, numSubVectors, subDim]
        // Entry for code c, subvector m starts at: c * numSubVectors * subDim + m * subDim
        const codebookOffset = (c * numSubVectors + m) * subDim;

        // Compute partial distance
        let dist = 0;
        for (let d = 0; d < subDim; d++) {
          if (this.distanceType === 'l2') {
            const diff = subQuery[d] - codebook[codebookOffset + d];
            dist += diff * diff;
          } else if (this.distanceType === 'cosine') {
            // For cosine, we accumulate dot products and norms separately
            // Simplified: use L2 on normalized vectors
            const diff = subQuery[d] - codebook[codebookOffset + d];
            dist += diff * diff;
          } else {
            // Dot product (negative)
            dist -= subQuery[d] * codebook[codebookOffset + d];
          }
        }
        table[c] = dist;
      }

      tables[m] = table;
    }

    return tables;
  }

  /**
   * Search a single partition using lookup tables
   */
  private async searchPartition(
    partitionId: number,
    lookupTables: Float32Array[],
    heap: TopKHeap,
    filter?: VectorSearchOptions['filter']
  ): Promise<void> {
    // Load partition data
    const partitionData = await this.loadPartitionData(partitionId);

    if (partitionData.numRows === 0) return;

    const numSubVectors = this.pq.numSubVectors;
    const worstAllowed = heap.isFull() ? heap.worstDistance() : Infinity;

    // Scan all rows in partition
    for (let i = 0; i < partitionData.numRows; i++) {
      const rowId = partitionData.rowIds[i];

      // Apply filter if present
      if (filter) {
        if (filter.type === 'include' && !filter.rowIds.has(rowId)) continue;
        if (filter.type === 'exclude' && filter.rowIds.has(rowId)) continue;
        if (filter.type === 'predicate' && !filter.fn(rowId)) continue;
      }

      // Compute asymmetric distance using lookup tables
      let distance = 0;
      const codeOffset = i * numSubVectors;

      for (let m = 0; m < numSubVectors; m++) {
        const code = partitionData.pqCodes[codeOffset + m];
        distance += lookupTables[m][code];

        // Early termination if distance already exceeds worst in heap
        if (distance >= worstAllowed) break;
      }

      // Add to heap if good enough
      if (distance < worstAllowed || !heap.isFull()) {
        heap.push({
          rowId,
          distance,
          score: 0, // Will be computed later
        });
      }
    }
  }

  /**
   * Load partition data from auxiliary file
   */
  private async loadPartitionData(partitionId: number): Promise<PartitionData> {
    // Check cache
    const cached = this.partitionCache.get(partitionId);
    if (cached) return cached;

    // Get partition bounds from IVF structure
    const offset = Number(this.ivf.offsets[partitionId]);
    const length = this.ivf.lengths[partitionId];

    if (length === 0) {
      return { rowIds: new BigUint64Array(0), pqCodes: new Uint8Array(0), numRows: 0 };
    }

    // Read partition data from auxiliary file
    // The auxiliary file is an Arrow IPC file with partitioned data
    // Each partition is stored as contiguous records

    // Calculate byte range for this partition
    // Row format: rowId (8 bytes) + pqCodes (numSubVectors bytes)
    const rowSize = 8 + this.pq.numSubVectors;
    const byteOffset = offset * rowSize;
    const byteLength = length * rowSize;

    const buffer = await this.storage.getRange(this.auxFilePath, byteOffset, byteLength);

    // Parse partition data
    const partitionData = this.parsePartitionData(buffer, length);

    // Cache with LRU eviction
    if (this.partitionCache.size >= this.maxCachedPartitions) {
      const oldestKey = this.partitionCache.keys().next().value;
      if (oldestKey !== undefined) {
        this.partitionCache.delete(oldestKey);
      }
    }
    this.partitionCache.set(partitionId, partitionData);

    return partitionData;
  }

  /**
   * Parse raw partition data into structured format
   */
  private parsePartitionData(buffer: ArrayBuffer, numRows: number): PartitionData {
    const view = new DataView(buffer);
    const numSubVectors = this.pq.numSubVectors;
    const rowSize = 8 + numSubVectors;

    const rowIds = new BigUint64Array(numRows);
    const pqCodes = new Uint8Array(numRows * numSubVectors);

    for (let i = 0; i < numRows; i++) {
      const rowOffset = i * rowSize;

      // Read row ID (uint64 little-endian)
      rowIds[i] = view.getBigUint64(rowOffset, true);

      // Read PQ codes
      const codeOffset = i * numSubVectors;
      for (let m = 0; m < numSubVectors; m++) {
        pqCodes[codeOffset + m] = view.getUint8(rowOffset + 8 + m);
      }
    }

    return { rowIds, pqCodes, numRows };
  }

  /**
   * Convert distance to normalized similarity score
   */
  private distanceToScore(distance: number): number {
    switch (this.distanceType) {
      case 'l2':
        // Convert L2 squared distance to similarity
        // score = 1 / (1 + sqrt(distance))
        return 1 / (1 + Math.sqrt(Math.max(0, distance)));
      case 'cosine':
        // Cosine distance is already 0-2, convert to 0-1 similarity
        return 1 - distance / 2;
      case 'dot':
        // Dot product was negated, so higher (less negative) is better
        // Use sigmoid-like transformation
        return 1 / (1 + Math.exp(distance));
      default:
        return 1 / (1 + distance);
    }
  }

  /**
   * Clear the partition cache
   */
  clearCache(): void {
    this.partitionCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.partitionCache.size,
      maxSize: this.maxCachedPartitions,
    };
  }

  /**
   * Search multiple query vectors in batch
   * More efficient than multiple single searches because:
   * - IVF centroids are loaded once
   * - Partitions are loaded once per batch
   *
   * @param queries - Array of query vectors
   * @param options - Search options (same for all queries)
   * @returns Array of search results, one per query
   */
  async batchSearch(
    queries: Float32Array[],
    options: VectorSearchOptions
  ): Promise<SearchResult[][]> {
    const { k, nprobes = 10, filter } = options;

    // Validate all queries have correct dimension
    for (let i = 0; i < queries.length; i++) {
      if (queries[i].length !== this.ivf.dimension) {
        throw new Error(
          `Query ${i} dimension ${queries[i].length} does not match index dimension ${this.ivf.dimension}`
        );
      }
    }

    // Step 1: Find nearest centroids for all queries
    const queryPartitions = queries.map(query => this.findNearestCentroids(query, nprobes));

    // Step 2: Collect all unique partitions to load
    const allPartitions = new Set<number>();
    for (const partitions of queryPartitions) {
      for (const p of partitions) {
        allPartitions.add(p);
      }
    }

    // Step 3: Pre-load all needed partitions
    const loadPromises = Array.from(allPartitions).map(p => this.loadPartitionData(p));
    await Promise.all(loadPromises);

    // Step 4: Build lookup tables and search for each query
    const results: SearchResult[][] = [];

    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];
      const partitions = queryPartitions[i];

      // Build PQ distance lookup tables for this query
      const lookupTables = this.buildPqLookupTables(query);

      // Search partitions and collect candidates
      const heap = new TopKHeap(k);

      for (const partitionId of partitions) {
        await this.searchPartition(partitionId, lookupTables, heap, filter);
      }

      // Get sorted results
      const queryResults = heap.toSortedArray();

      // Compute normalized scores
      for (const result of queryResults) {
        result.score = this.distanceToScore(result.distance);
      }

      results.push(queryResults);
    }

    return results;
  }
}

// ==========================================
// Utility Functions
// ==========================================

/**
 * Normalize a vector to unit length
 */
export function normalizeVector(v: Float32Array): Float32Array {
  let norm = 0;
  for (let i = 0; i < v.length; i++) {
    norm += v[i] * v[i];
  }
  norm = Math.sqrt(norm);

  if (norm === 0) return v;

  const result = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) {
    result[i] = v[i] / norm;
  }
  return result;
}

/**
 * Compute exact L2 distance between two vectors
 */
export function computeL2Distance(a: Float32Array, b: Float32Array): number {
  return Math.sqrt(l2DistanceSquared(a, b));
}

/**
 * Compute exact cosine similarity between two vectors
 */
export function computeCosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

/**
 * Compute exact dot product between two vectors
 */
export function computeDotProduct(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

// ==========================================
// Index Building
// ==========================================

/**
 * Options for building an IVF-PQ index
 */
export interface BuildIvfPqOptions {
  numPartitions: number;
  numSubVectors: number;
  numBits: number;
  distanceType: DistanceType;
  maxIterations?: number;
}

/**
 * Build an IVF-PQ index from a set of vectors
 * This is a simplified implementation for creating test fixtures and small indices
 *
 * @param vectors - Array of vectors to index
 * @param options - Index building options
 * @returns IVF structure, PQ codebook, and partition data
 */
export async function buildIvfPqIndex(
  vectors: Float32Array[],
  options: BuildIvfPqOptions
): Promise<{
  ivf: IvfStructure;
  pq: PqCodebook;
  partitionData: PartitionData[];
}> {
  const {
    numPartitions,
    numSubVectors,
    numBits,
    distanceType,
    maxIterations = 20,
  } = options;

  if (vectors.length === 0) {
    throw new Error('Cannot build index from empty vector set');
  }

  const dimension = vectors[0].length;
  const subDim = Math.floor(dimension / numSubVectors);

  if (dimension % numSubVectors !== 0) {
    throw new Error(`Dimension ${dimension} must be divisible by numSubVectors ${numSubVectors}`);
  }

  // Step 1: K-means clustering to find centroids
  const centroids = kMeansClustering(vectors, numPartitions, maxIterations, distanceType);

  // Step 2: Assign vectors to partitions
  const partitionAssignments = assignToPartitions(vectors, centroids, distanceType);

  // Step 3: Build PQ codebook from residuals
  const pqCodebook = buildPqCodebook(vectors, centroids, partitionAssignments, numSubVectors, numBits);

  // Step 4: Encode vectors using PQ
  const partitionData = encodeVectors(vectors, centroids, partitionAssignments, pqCodebook, numSubVectors);

  // Build IVF structure
  const ivf: IvfStructure = {
    centroids: flattenCentroids(centroids),
    offsets: computePartitionOffsets(partitionData),
    lengths: new Uint32Array(partitionData.map(p => p.numRows)),
    numPartitions,
    dimension,
  };

  const pq: PqCodebook = {
    codebook: pqCodebook,
    numSubVectors,
    numBits,
    distanceType,
    subDim,
  };

  return { ivf, pq, partitionData };
}

/**
 * Simple k-means clustering implementation
 */
function kMeansClustering(
  vectors: Float32Array[],
  k: number,
  maxIterations: number,
  distanceType: DistanceType
): Float32Array[] {
  const dimension = vectors[0].length;
  const distFn = getDistanceFunction(distanceType);

  // Initialize centroids randomly from input vectors
  const centroids: Float32Array[] = [];
  const usedIndices = new Set<number>();

  for (let i = 0; i < k && i < vectors.length; i++) {
    let idx: number;
    do {
      idx = Math.floor(Math.random() * vectors.length);
    } while (usedIndices.has(idx) && usedIndices.size < vectors.length);
    usedIndices.add(idx);
    centroids.push(new Float32Array(vectors[idx]));
  }

  // Run k-means iterations
  for (let iter = 0; iter < maxIterations; iter++) {
    // Assign vectors to nearest centroid
    const assignments = new Uint32Array(vectors.length);
    const counts = new Uint32Array(k);
    const sums = centroids.map(() => new Float32Array(dimension));

    for (let i = 0; i < vectors.length; i++) {
      let bestDist = Infinity;
      let bestCentroid = 0;

      for (let c = 0; c < centroids.length; c++) {
        const dist = distFn(vectors[i], centroids[c]);
        if (dist < bestDist) {
          bestDist = dist;
          bestCentroid = c;
        }
      }

      assignments[i] = bestCentroid;
      counts[bestCentroid]++;

      for (let d = 0; d < dimension; d++) {
        sums[bestCentroid][d] += vectors[i][d];
      }
    }

    // Update centroids
    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        for (let d = 0; d < dimension; d++) {
          centroids[c][d] = sums[c][d] / counts[c];
        }
      }
    }
  }

  return centroids;
}

/**
 * Assign vectors to nearest centroids
 */
function assignToPartitions(
  vectors: Float32Array[],
  centroids: Float32Array[],
  distanceType: DistanceType
): Uint32Array {
  const distFn = getDistanceFunction(distanceType);
  const assignments = new Uint32Array(vectors.length);

  for (let i = 0; i < vectors.length; i++) {
    let bestDist = Infinity;
    let bestCentroid = 0;

    for (let c = 0; c < centroids.length; c++) {
      const dist = distFn(vectors[i], centroids[c]);
      if (dist < bestDist) {
        bestDist = dist;
        bestCentroid = c;
      }
    }

    assignments[i] = bestCentroid;
  }

  return assignments;
}

/**
 * Build PQ codebook from residual vectors
 */
function buildPqCodebook(
  vectors: Float32Array[],
  centroids: Float32Array[],
  assignments: Uint32Array,
  numSubVectors: number,
  numBits: number
): Float32Array {
  const dimension = vectors[0].length;
  const subDim = Math.floor(dimension / numSubVectors);
  const numCodes = 1 << numBits; // 256 for 8-bit

  // Codebook layout: [numCodes, numSubVectors, subDim]
  const codebook = new Float32Array(numCodes * numSubVectors * subDim);

  // Compute residuals
  const residuals = vectors.map((v, i) => {
    const residual = new Float32Array(dimension);
    const centroid = centroids[assignments[i]];
    for (let d = 0; d < dimension; d++) {
      residual[d] = v[d] - centroid[d];
    }
    return residual;
  });

  // Train sub-quantizers for each sub-vector
  for (let m = 0; m < numSubVectors; m++) {
    // Extract sub-vectors
    const subVectors = residuals.map(r => r.subarray(m * subDim, (m + 1) * subDim));

    // Cluster sub-vectors
    const subCentroids = kMeansClustering(
      subVectors.map(sv => new Float32Array(sv)),
      numCodes,
      10,
      'l2'
    );

    // Store in codebook
    for (let c = 0; c < subCentroids.length; c++) {
      const offset = (c * numSubVectors + m) * subDim;
      for (let d = 0; d < subDim; d++) {
        codebook[offset + d] = subCentroids[c][d];
      }
    }
  }

  return codebook;
}

/**
 * Encode vectors using PQ
 */
function encodeVectors(
  vectors: Float32Array[],
  centroids: Float32Array[],
  assignments: Uint32Array,
  codebook: Float32Array,
  numSubVectors: number
): PartitionData[] {
  const dimension = vectors[0].length;
  const subDim = Math.floor(dimension / numSubVectors);
  const numCodes = 256; // Assuming 8-bit

  // Group vectors by partition
  const partitionVectors = new Map<number, { idx: number; vec: Float32Array }[]>();
  for (let i = 0; i < vectors.length; i++) {
    const p = assignments[i];
    let list = partitionVectors.get(p);
    if (!list) {
      list = [];
      partitionVectors.set(p, list);
    }
    list.push({ idx: i, vec: vectors[i] });
  }

  // Encode each partition
  const partitionData: PartitionData[] = [];
  const numPartitions = centroids.length;

  for (let p = 0; p < numPartitions; p++) {
    const vecs = partitionVectors.get(p) || [];
    const numRows = vecs.length;

    const rowIds = new BigUint64Array(numRows);
    const pqCodes = new Uint8Array(numRows * numSubVectors);

    for (let i = 0; i < vecs.length; i++) {
      rowIds[i] = BigInt(vecs[i].idx);

      // Compute residual
      const residual = new Float32Array(dimension);
      for (let d = 0; d < dimension; d++) {
        residual[d] = vecs[i].vec[d] - centroids[p][d];
      }

      // Encode each sub-vector
      for (let m = 0; m < numSubVectors; m++) {
        let bestCode = 0;
        let bestDist = Infinity;

        const subResidual = residual.subarray(m * subDim, (m + 1) * subDim);

        for (let c = 0; c < numCodes; c++) {
          const offset = (c * numSubVectors + m) * subDim;
          let dist = 0;
          for (let d = 0; d < subDim; d++) {
            const diff = subResidual[d] - codebook[offset + d];
            dist += diff * diff;
          }
          if (dist < bestDist) {
            bestDist = dist;
            bestCode = c;
          }
        }

        pqCodes[i * numSubVectors + m] = bestCode;
      }
    }

    partitionData.push({ rowIds, pqCodes, numRows });
  }

  return partitionData;
}

/**
 * Flatten centroids array to single Float32Array
 */
function flattenCentroids(centroids: Float32Array[]): Float32Array {
  if (centroids.length === 0) return new Float32Array(0);
  const dimension = centroids[0].length;
  const flat = new Float32Array(centroids.length * dimension);
  for (let i = 0; i < centroids.length; i++) {
    flat.set(centroids[i], i * dimension);
  }
  return flat;
}

/**
 * Compute partition offsets from partition data
 */
function computePartitionOffsets(partitionData: PartitionData[]): BigUint64Array {
  const offsets = new BigUint64Array(partitionData.length);
  let offset = 0n;
  for (let i = 0; i < partitionData.length; i++) {
    offsets[i] = offset;
    offset += BigInt(partitionData[i].numRows);
  }
  return offsets;
}
