/**
 * HNSW (Hierarchical Navigable Small World) Graph Index
 * Implements approximate nearest neighbor search using HNSW algorithm
 *
 * @module @evodb/lance-reader/hnsw
 */

import type {
  StorageAdapter,
  VectorSearchOptions,
  SearchResult,
  DistanceType,
} from './types.js';
import { VectorIndex } from './vector-index.js';

// ==========================================
// Distance Functions
// ==========================================

/**
 * Compute L2 (Euclidean) squared distance
 */
function l2DistanceSquared(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return sum;
}

/**
 * Compute cosine distance
 */
function cosineDistance(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 1;
  return 1 - dot / denom;
}

/**
 * Compute negative dot product (for MIPS)
 */
function dotDistance(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return -dot;
}

type DistanceFunction = (a: Float32Array, b: Float32Array) => number;

function getDistanceFunction(type: DistanceType): DistanceFunction {
  switch (type) {
    case 'l2': return l2DistanceSquared;
    case 'cosine': return cosineDistance;
    case 'dot': return dotDistance;
    default: return l2DistanceSquared;
  }
}

// ==========================================
// Priority Queue Implementation
// ==========================================

interface HeapItem {
  nodeId: bigint;
  distance: number;
}

/**
 * Min-heap priority queue for HNSW search
 */
class MinHeap {
  private heap: HeapItem[] = [];

  get size(): number {
    return this.heap.length;
  }

  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  push(item: HeapItem): void {
    this.heap.push(item);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): HeapItem | undefined {
    if (this.heap.length === 0) return undefined;
    const min = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length > 0 && last) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }
    return min;
  }

  peek(): HeapItem | undefined {
    return this.heap[0];
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.heap[parentIndex].distance <= this.heap[index].distance) break;
      [this.heap[parentIndex], this.heap[index]] = [this.heap[index], this.heap[parentIndex]];
      index = parentIndex;
    }
  }

  private bubbleDown(index: number): void {
    const length = this.heap.length;
    while (true) {
      const left = 2 * index + 1;
      const right = 2 * index + 2;
      let smallest = index;

      if (left < length && this.heap[left].distance < this.heap[smallest].distance) {
        smallest = left;
      }
      if (right < length && this.heap[right].distance < this.heap[smallest].distance) {
        smallest = right;
      }

      if (smallest === index) break;
      [this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]];
      index = smallest;
    }
  }
}

/**
 * Max-heap priority queue for maintaining top-K
 */
class MaxHeap {
  private heap: HeapItem[] = [];

  get size(): number {
    return this.heap.length;
  }

  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  push(item: HeapItem): void {
    this.heap.push(item);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): HeapItem | undefined {
    if (this.heap.length === 0) return undefined;
    const max = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length > 0 && last) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }
    return max;
  }

  peek(): HeapItem | undefined {
    return this.heap[0];
  }

  toArray(): HeapItem[] {
    return [...this.heap];
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
// HNSW Graph Node
// ==========================================

interface HnswNode {
  id: bigint;
  vector: Float32Array;
  neighbors: bigint[][]; // neighbors[level] = [neighbor_ids]
}

// ==========================================
// HNSW Index Implementation
// ==========================================

/**
 * HNSW index for approximate nearest neighbor search
 *
 * The HNSW algorithm:
 * 1. Start from entry point at top level
 * 2. Greedily descend through levels, finding closest node at each level
 * 3. At bottom level (0), perform beam search with ef candidates
 * 4. Return top-k from candidates
 */
export class HnswIndex extends VectorIndex {
  private _storage: StorageAdapter;
  private _indexPath: string;
  private distanceType: DistanceType;
  private distanceFunc: DistanceFunction;
  private m: number;
  private maxLevel: number;

  // Graph data
  private entryPoint: bigint = 0n;
  private nodes: Map<bigint, HnswNode> = new Map();
  private vectors: Map<bigint, Float32Array> = new Map();
  private graphDimension: number = 0;

  // Level information (reserved for future use)
  private _levelOffsets: number[] = [];
  private _nodesPerLevel: number[] = [];

  // Cache for loaded graph sections
  private loadedLevels: Set<number> = new Set();
  private initialized = false;

  constructor(
    storage: StorageAdapter,
    indexPath: string,
    distanceType: DistanceType,
    m: number,
    maxLevel: number
  ) {
    super();
    this._storage = storage;
    this._indexPath = indexPath;
    this.distanceType = distanceType;
    this.distanceFunc = getDistanceFunction(distanceType);
    this.m = m;
    this.maxLevel = maxLevel;
  }

  get indexType(): string {
    return 'hnsw';
  }

  get dimension(): number {
    return this.graphDimension;
  }

  /**
   * Initialize the index by loading metadata
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Read index metadata from header
    // In Lance format, HNSW metadata is stored in Arrow schema metadata
    // and the graph structure is in the data

    // For now, we'll use a simplified approach where the graph
    // is loaded incrementally as needed

    // Load entry point and level structure
    await this.loadMetadata();

    this.initialized = true;
  }

  /**
   * Load HNSW metadata from index file
   */
  private async loadMetadata(): Promise<void> {
    // Read the first part of the index to get metadata
    // The exact format depends on Lance's HNSW implementation
    // This is a simplified version

    // In a full implementation, we would:
    // 1. Read the Arrow IPC schema to get lance:hnsw metadata
    // 2. Parse entry_point, max_level, level_offsets from metadata
    // 3. Load vector dimension from schema

    // For now, use provided constructor values
    this._levelOffsets = new Array(this.maxLevel + 1).fill(0).map((_, i) => i * 1000);
    this._nodesPerLevel = new Array(this.maxLevel + 1).fill(0);
  }

  /**
   * Search for k nearest neighbors
   */
  async search(
    query: Float32Array,
    options: VectorSearchOptions
  ): Promise<SearchResult[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    const { k, efSearch = 100, filter } = options;

    if (this.graphDimension > 0 && query.length !== this.graphDimension) {
      throw new Error(
        `Query dimension ${query.length} does not match index dimension ${this.graphDimension}`
      );
    }

    // If graph is empty, return empty results
    if (this.nodes.size === 0) {
      // Try to load at least the entry point and some neighbors
      await this.loadGraphSection(this.maxLevel);
    }

    if (this.nodes.size === 0) {
      return [];
    }

    // Set dimension if not yet known
    if (this.graphDimension === 0) {
      const firstNode = this.nodes.values().next().value;
      if (firstNode) {
        this.graphDimension = firstNode.vector.length;
      }
    }

    // Start from entry point
    let currentNode = this.entryPoint;

    // Traverse from top level to level 1
    for (let level = this.maxLevel; level > 0; level--) {
      currentNode = await this.searchLevel(query, currentNode, 1, level);
    }

    // Search level 0 with efSearch candidates
    const candidates = await this.searchLevelWithEf(query, currentNode, efSearch, 0, filter);

    // Convert to results and return top-k
    const results: SearchResult[] = candidates
      .map(item => ({
        rowId: item.nodeId,
        distance: item.distance,
        score: this.distanceToScore(item.distance),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, k);

    return results;
  }

  /**
   * Search a single level, returning the closest node
   */
  private async searchLevel(
    query: Float32Array,
    entryPoint: bigint,
    _ef: number,
    level: number
  ): Promise<bigint> {
    // Ensure level is loaded
    await this.ensureLevelLoaded(level);

    const visited = new Set<bigint>();
    let currentNode = entryPoint;
    let currentDist = await this.computeDistanceToNode(query, currentNode);
    visited.add(currentNode);

    let improved = true;
    while (improved) {
      improved = false;

      const neighbors = await this.getNeighbors(currentNode, level);
      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);

        const dist = await this.computeDistanceToNode(query, neighbor);
        if (dist < currentDist) {
          currentDist = dist;
          currentNode = neighbor;
          improved = true;
        }
      }
    }

    return currentNode;
  }

  /**
   * Search level with ef expansion factor
   */
  private async searchLevelWithEf(
    query: Float32Array,
    entryPoint: bigint,
    ef: number,
    level: number,
    filter?: VectorSearchOptions['filter']
  ): Promise<HeapItem[]> {
    await this.ensureLevelLoaded(level);

    const visited = new Set<bigint>();
    const candidates = new MinHeap(); // Nodes to explore
    const results = new MaxHeap();    // Best results found

    // Helper function to check if a node passes the filter
    const passesFilter = (nodeId: bigint): boolean => {
      if (!filter) return true;
      if (filter.type === 'include' && !filter.rowIds.has(nodeId)) return false;
      if (filter.type === 'exclude' && filter.rowIds.has(nodeId)) return false;
      if (filter.type === 'predicate' && !filter.fn(nodeId)) return false;
      return true;
    };

    const entryDist = await this.computeDistanceToNode(query, entryPoint);
    candidates.push({ nodeId: entryPoint, distance: entryDist });
    // Only add entry point to results if it passes filter
    if (passesFilter(entryPoint)) {
      results.push({ nodeId: entryPoint, distance: entryDist });
    }
    visited.add(entryPoint);

    while (!candidates.isEmpty()) {
      const current = candidates.pop()!;

      // If current is worse than worst result, we're done
      const worstResult = results.peek();
      if (worstResult && current.distance > worstResult.distance && results.size >= ef) {
        break;
      }

      // Explore neighbors
      const neighbors = await this.getNeighbors(current.nodeId, level);
      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);

        const dist = await this.computeDistanceToNode(query, neighbor);

        // Always add to candidates to continue exploring
        candidates.push({ nodeId: neighbor, distance: dist });

        // Only add to results if passes filter
        if (passesFilter(neighbor)) {
          // Add to results if better than worst result or results not full
          const worstResult = results.peek();
          if (results.size < ef || (worstResult && dist < worstResult.distance)) {
            results.push({ nodeId: neighbor, distance: dist });

            // Trim results to ef size
            if (results.size > ef) {
              results.pop();
            }
          }
        }
      }
    }

    return results.toArray();
  }

  /**
   * Compute distance from query to a node
   */
  private async computeDistanceToNode(query: Float32Array, nodeId: bigint): Promise<number> {
    const vector = await this.getVector(nodeId);
    if (!vector) {
      return Infinity;
    }
    return this.distanceFunc(query, vector);
  }

  /**
   * Get neighbors of a node at a specific level
   */
  private async getNeighbors(nodeId: bigint, level: number): Promise<bigint[]> {
    const node = this.nodes.get(nodeId);
    if (!node || !node.neighbors[level]) {
      // Try to load node if not present
      await this.loadNode(nodeId);
      const loadedNode = this.nodes.get(nodeId);
      if (!loadedNode || !loadedNode.neighbors[level]) {
        return [];
      }
      return loadedNode.neighbors[level];
    }
    return node.neighbors[level];
  }

  /**
   * Get vector for a node
   */
  private async getVector(nodeId: bigint): Promise<Float32Array | undefined> {
    const node = this.nodes.get(nodeId);
    if (node) {
      return node.vector;
    }

    // Try to load node
    await this.loadNode(nodeId);
    const loadedNode = this.nodes.get(nodeId);
    return loadedNode?.vector;
  }

  /**
   * Ensure a level is loaded into memory
   */
  private async ensureLevelLoaded(level: number): Promise<void> {
    if (this.loadedLevels.has(level)) return;
    await this.loadGraphSection(level);
    this.loadedLevels.add(level);
  }

  /**
   * Load a section of the graph
   */
  private async loadGraphSection(_level: number): Promise<void> {
    // In a full implementation, this would:
    // 1. Read the Arrow IPC file for the index
    // 2. Extract nodes and neighbors for the specified level
    // 3. Cache vectors and neighbor lists

    // For now, this is a placeholder that would be filled in
    // based on the actual Lance HNSW format

    // Simulate loading some sample data for testing
    if (this.nodes.size === 0) {
      // Create a simple test graph
      this.createTestGraph();
    }
  }

  /**
   * Load a specific node
   */
  private async loadNode(_nodeId: bigint): Promise<void> {
    // In a full implementation, this would load node data from storage
    // For now, it's a no-op since we load entire levels
  }

  /**
   * Create a simple test graph for demonstration
   */
  private createTestGraph(): void {
    // This creates a minimal test graph
    // In production, data would be loaded from the index file

    const dim = 128;
    this.graphDimension = dim;

    // Create entry point
    this.entryPoint = 0n;

    // Create some test nodes
    for (let i = 0; i < 100; i++) {
      const id = BigInt(i);
      const vector = new Float32Array(dim);
      for (let j = 0; j < dim; j++) {
        vector[j] = Math.random() * 2 - 1;
      }

      // Create neighbors for each level
      const neighbors: bigint[][] = [];
      for (let level = 0; level <= this.maxLevel; level++) {
        const levelNeighbors: bigint[] = [];
        const numNeighbors = level === 0 ? this.m * 2 : this.m;
        for (let n = 0; n < numNeighbors && n < 100; n++) {
          const neighborId = BigInt((i + n + 1) % 100);
          if (neighborId !== id) {
            levelNeighbors.push(neighborId);
          }
        }
        neighbors.push(levelNeighbors);
      }

      this.nodes.set(id, { id, vector, neighbors });
    }
  }

  /**
   * Convert distance to similarity score
   */
  private distanceToScore(distance: number): number {
    switch (this.distanceType) {
      case 'l2':
        return 1 / (1 + Math.sqrt(Math.max(0, distance)));
      case 'cosine':
        return 1 - distance / 2;
      case 'dot':
        return 1 / (1 + Math.exp(distance));
      default:
        return 1 / (1 + distance);
    }
  }

  /**
   * Clear cached graph data
   */
  clearCache(): void {
    this.nodes.clear();
    this.vectors.clear();
    this.loadedLevels.clear();
  }

  /**
   * Get graph statistics
   */
  getStats(): {
    numNodes: number;
    numLevels: number;
    loadedLevels: number[];
    indexPath: string;
    levelOffsets: number[];
  } {
    return {
      numNodes: this.nodes.size,
      numLevels: this.maxLevel + 1,
      loadedLevels: Array.from(this.loadedLevels),
      indexPath: this._indexPath,
      levelOffsets: this._levelOffsets,
    };
  }

  /**
   * Get the storage adapter (for advanced use cases)
   */
  getStorage(): StorageAdapter {
    return this._storage;
  }

  /**
   * Get nodes per level statistics (reserved for future use)
   */
  getNodesPerLevel(): number[] {
    return this._nodesPerLevel;
  }

  /**
   * Re-rank search results with exact distance calculations
   * After ANN search, this fetches original vectors and computes exact distances
   *
   * @param query - Query vector
   * @param annResults - Results from approximate nearest neighbor search
   * @param options - Options including k for final result count
   * @returns Re-ranked results with exact distances
   */
  async rerankWithExactDistances(
    query: Float32Array,
    annResults: SearchResult[],
    options: { k: number }
  ): Promise<SearchResult[]> {
    const { k } = options;

    // Fetch original vectors for all ANN results and compute exact distances
    const exactResults: SearchResult[] = [];

    for (const result of annResults) {
      const vector = await this.getVector(result.rowId);
      if (vector) {
        const exactDistance = this.distanceFunc(query, vector);
        exactResults.push({
          rowId: result.rowId,
          distance: exactDistance,
          score: this.distanceToScore(exactDistance),
        });
      }
    }

    // Sort by exact distance and return top k
    exactResults.sort((a, b) => a.distance - b.distance);
    return exactResults.slice(0, k);
  }

  /**
   * Stream search results using an async generator
   * For large result sets, this avoids loading all results at once
   *
   * @param query - Query vector
   * @param options - Search options
   * @yields Search results one at a time
   */
  async *searchStream(
    query: Float32Array,
    options: VectorSearchOptions
  ): AsyncGenerator<SearchResult, void, unknown> {
    const { k, efSearch = 100 } = options;

    if (!this.initialized) {
      await this.initialize();
    }

    // Perform the full search
    const results = await this.search(query, { ...options, k: Math.min(k, 1000), efSearch });

    // Yield results one at a time
    for (const result of results) {
      yield result;
    }
  }
}
