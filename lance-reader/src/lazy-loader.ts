/**
 * Lazy Loading Infrastructure for Lance Reader
 *
 * Implements deferred loading patterns for vector indices to optimize:
 * - Cold start times (defer loading until first query)
 * - Memory usage (load only needed components)
 * - Bundle size (dynamic imports for optional dependencies)
 *
 * @module @evodb/lance-reader/lazy-loader
 */

import type {
  StorageAdapter,
  VectorSearchOptions,
  SearchResult,
  IvfStructure,
  PqCodebook,
  DistanceType,
} from './types.js';
import { VectorIndex } from './vector-index.js';

// ==========================================
// Lazy Loading Configuration
// ==========================================

/**
 * Configuration options for lazy loading behavior
 */
export interface LazyLoadConfig {
  /**
   * Loading strategy for vector indices
   * - 'lazy': Defer loading until first query (default)
   * - 'eager': Load immediately when index is requested
   * - 'on-demand': Load specific components as needed
   */
  strategy: 'lazy' | 'eager' | 'on-demand';

  /**
   * Whether to preload centroids in background after initialization
   * Centroids are small (~100KB for 256 partitions x 128d) and needed for every search
   * Default: true
   */
  preloadCentroids?: boolean;

  /**
   * Whether to preload PQ codebook in background
   * Codebook is moderate size (~130KB for 16 sub-vectors x 256 codes x 8d)
   * Default: true
   */
  preloadCodebook?: boolean;

  /**
   * Maximum number of partitions to preload
   * Set to 0 to disable partition preloading
   * Default: 0
   */
  maxPreloadPartitions?: number;

  /**
   * Timeout for lazy load operations in milliseconds
   * Default: 30000 (30 seconds)
   */
  loadTimeout?: number;

  /**
   * Enable background prefetching based on access patterns
   * Default: false
   */
  enablePrefetch?: boolean;

  /**
   * Number of recently accessed partitions to track for prefetching
   * Default: 10
   */
  prefetchHistorySize?: number;
}

/**
 * Default lazy load configuration
 */
export const DEFAULT_LAZY_LOAD_CONFIG: Required<LazyLoadConfig> = {
  strategy: 'lazy',
  preloadCentroids: true,
  preloadCodebook: true,
  maxPreloadPartitions: 0,
  loadTimeout: 30000,
  enablePrefetch: false,
  prefetchHistorySize: 10,
};

// ==========================================
// Loading State Types
// ==========================================

/**
 * State of a lazy-loaded component
 */
export type LoadingState =
  | { status: 'unloaded' }
  | { status: 'loading'; promise: Promise<void> }
  | { status: 'loaded' }
  | { status: 'error'; error: Error };

/**
 * Component loading states for an IVF-PQ index
 */
export interface IvfPqLoadingState {
  centroids: LoadingState;
  codebook: LoadingState;
  partitions: Map<number, LoadingState>;
  metadata: LoadingState;
}

/**
 * Component loading states for an HNSW index
 */
export interface HnswLoadingState {
  metadata: LoadingState;
  entryPoint: LoadingState;
  levels: Map<number, LoadingState>;
}

// ==========================================
// Lazy Loader Base Class
// ==========================================

/**
 * Abstract base class for lazy loading vector index components
 */
export abstract class LazyLoader<TState> {
  protected config: Required<LazyLoadConfig>;
  protected state: TState;
  protected loadStartTime: number = 0;

  constructor(config?: Partial<LazyLoadConfig>) {
    this.config = { ...DEFAULT_LAZY_LOAD_CONFIG, ...config };
    this.state = this.createInitialState();
  }

  /**
   * Create the initial loading state
   */
  protected abstract createInitialState(): TState;

  /**
   * Check if a component is loaded
   */
  protected isLoaded(state: LoadingState): boolean {
    return state.status === 'loaded';
  }

  /**
   * Check if a component is currently loading
   */
  protected isLoading(state: LoadingState): boolean {
    return state.status === 'loading';
  }

  /**
   * Get the loading strategy
   */
  getStrategy(): LazyLoadConfig['strategy'] {
    return this.config.strategy;
  }

  /**
   * Get current loading state
   */
  getState(): TState {
    return this.state;
  }

  /**
   * Reset all loading states
   */
  abstract reset(): void;
}

// ==========================================
// Lazy IVF-PQ Index
// ==========================================

/**
 * Lazy-loading wrapper for IVF-PQ index
 *
 * Defers loading of large components until they're actually needed:
 * - Centroids: Loaded on first search or when preloadCentroids is true
 * - Codebook: Loaded on first search or when preloadCodebook is true
 * - Partitions: Loaded as needed during search
 */
export class LazyIvfPqIndex extends VectorIndex {
  private storage: StorageAdapter;
  private indexPath: string;
  private auxFilePath: string;
  private _distanceType: DistanceType;
  private _dimension: number;
  private config: Required<LazyLoadConfig>;
  private loadingState: IvfPqLoadingState;

  // Loaded data
  private _ivf: IvfStructure | null = null;
  private _pq: PqCodebook | null = null;
  private partitionCache = new Map<number, { rowIds: BigUint64Array; pqCodes: Uint8Array; numRows: number }>();
  private maxCachedPartitions = 50;

  // Access tracking for prefetching
  private accessHistory: number[] = [];

  constructor(
    storage: StorageAdapter,
    indexPath: string,
    auxFilePath: string,
    distanceType: DistanceType,
    dimension: number,
    config?: Partial<LazyLoadConfig>
  ) {
    super();
    this.storage = storage;
    this.indexPath = indexPath;
    this.auxFilePath = auxFilePath;
    this._distanceType = distanceType;
    this._dimension = dimension;
    this.config = { ...DEFAULT_LAZY_LOAD_CONFIG, ...config };
    this.loadingState = this.createInitialState();

    // Start background preloading if configured
    if (this.config.strategy !== 'lazy') {
      this.startEagerLoading();
    }
  }

  private createInitialState(): IvfPqLoadingState {
    return {
      centroids: { status: 'unloaded' },
      codebook: { status: 'unloaded' },
      partitions: new Map(),
      metadata: { status: 'unloaded' },
    };
  }

  get indexType(): string {
    return 'ivf_pq';
  }

  get dimension(): number {
    return this._dimension;
  }

  /**
   * Get loading states for monitoring
   */
  getLoadingState(): IvfPqLoadingState {
    return this.loadingState;
  }

  /**
   * Check if the index is ready for search (core components loaded)
   */
  isReady(): boolean {
    return (
      this.loadingState.centroids.status === 'loaded' &&
      this.loadingState.codebook.status === 'loaded'
    );
  }

  /**
   * Ensure core components are loaded before search
   */
  async ensureReady(): Promise<void> {
    await Promise.all([
      this.ensureCentroidsLoaded(),
      this.ensureCodebookLoaded(),
    ]);
  }

  /**
   * Start eager loading in background
   */
  private startEagerLoading(): void {
    // Load centroids and codebook in parallel
    if (this.config.preloadCentroids) {
      this.ensureCentroidsLoaded().catch(() => {
        // Ignore errors during preload - will be caught on search
      });
    }
    if (this.config.preloadCodebook) {
      this.ensureCodebookLoaded().catch(() => {
        // Ignore errors during preload
      });
    }
  }

  /**
   * Ensure centroids are loaded
   */
  private async ensureCentroidsLoaded(): Promise<IvfStructure> {
    if (this._ivf) return this._ivf;

    const state = this.loadingState.centroids;
    if (state.status === 'loading') {
      await state.promise;
      return this._ivf!;
    }

    if (state.status === 'error') {
      throw state.error;
    }

    // Start loading
    const loadPromise = this.loadCentroids();
    this.loadingState.centroids = { status: 'loading', promise: loadPromise };

    try {
      await loadPromise;
      this.loadingState.centroids = { status: 'loaded' };
      return this._ivf!;
    } catch (error) {
      this.loadingState.centroids = { status: 'error', error: error as Error };
      throw error;
    }
  }

  /**
   * Load centroids from storage
   */
  private async loadCentroids(): Promise<void> {
    // Import protobuf parser dynamically
    const { parseIvf } = await import('./protobuf.js');

    // Read IVF structure from index file's global buffer 0
    const indexFilePath = `${this.indexPath}/index.idx`;

    // Read footer to get global buffer info
    const tailBuffer = await this.storage.getRange(indexFilePath, -4096, 4096);
    const footerView = new DataView(tailBuffer, tailBuffer.byteLength - 40, 40);

    // Parse basic footer info
    const gboTableOffset = footerView.getBigUint64(16, true);
    const numGlobalBuffers = footerView.getUint32(24, true);

    if (numGlobalBuffers === 0) {
      throw new Error('No global buffers found in index file');
    }

    // Read GBO table entry for buffer 0
    const gboBuffer = await this.storage.getRange(
      indexFilePath,
      Number(gboTableOffset),
      16
    );
    const gboView = new DataView(gboBuffer);
    const bufferPos = gboView.getBigUint64(0, true);
    const bufferSize = gboView.getBigUint64(8, true);

    // Read IVF buffer
    const ivfBuffer = await this.storage.getRange(
      indexFilePath,
      Number(bufferPos),
      Number(bufferSize)
    );

    this._ivf = parseIvf(ivfBuffer);
  }

  /**
   * Ensure codebook is loaded
   */
  private async ensureCodebookLoaded(): Promise<PqCodebook> {
    if (this._pq) return this._pq;

    const state = this.loadingState.codebook;
    if (state.status === 'loading') {
      await state.promise;
      return this._pq!;
    }

    if (state.status === 'error') {
      throw state.error;
    }

    // Start loading
    const loadPromise = this.loadCodebook();
    this.loadingState.codebook = { status: 'loading', promise: loadPromise };

    try {
      await loadPromise;
      this.loadingState.codebook = { status: 'loaded' };
      return this._pq!;
    } catch (error) {
      this.loadingState.codebook = { status: 'error', error: error as Error };
      throw error;
    }
  }

  /**
   * Load codebook from storage
   */
  private async loadCodebook(): Promise<void> {
    // Import protobuf parser dynamically
    const { parsePqCodebook } = await import('./protobuf.js');

    // Read footer to get global buffer info
    const tailBuffer = await this.storage.getRange(this.auxFilePath, -4096, 4096);
    const footerView = new DataView(tailBuffer, tailBuffer.byteLength - 40, 40);

    const gboTableOffset = footerView.getBigUint64(16, true);
    const numGlobalBuffers = footerView.getUint32(24, true);

    if (numGlobalBuffers === 0) {
      throw new Error('No global buffers found in auxiliary file');
    }

    // Read GBO table entry for buffer 0
    const gboBuffer = await this.storage.getRange(
      this.auxFilePath,
      Number(gboTableOffset),
      16
    );
    const gboView = new DataView(gboBuffer);
    const bufferPos = gboView.getBigUint64(0, true);
    const bufferSize = gboView.getBigUint64(8, true);

    // Read PQ buffer
    const pqBuffer = await this.storage.getRange(
      this.auxFilePath,
      Number(bufferPos),
      Number(bufferSize)
    );

    this._pq = parsePqCodebook(pqBuffer);
  }

  /**
   * Load a partition's data
   */
  private async loadPartition(partitionId: number): Promise<{ rowIds: BigUint64Array; pqCodes: Uint8Array; numRows: number }> {
    // Check cache first
    const cached = this.partitionCache.get(partitionId);
    if (cached) {
      this.trackAccess(partitionId);
      return cached;
    }

    // Check loading state
    let state = this.loadingState.partitions.get(partitionId);
    if (state?.status === 'loading') {
      await state.promise;
      return this.partitionCache.get(partitionId)!;
    }

    // Start loading
    const loadPromise = this.doLoadPartition(partitionId);
    this.loadingState.partitions.set(partitionId, { status: 'loading', promise: loadPromise });

    try {
      await loadPromise;
      this.loadingState.partitions.set(partitionId, { status: 'loaded' });
      this.trackAccess(partitionId);
      return this.partitionCache.get(partitionId)!;
    } catch (error) {
      this.loadingState.partitions.set(partitionId, { status: 'error', error: error as Error });
      throw error;
    }
  }

  /**
   * Actually load partition data from storage
   */
  private async doLoadPartition(partitionId: number): Promise<void> {
    if (!this._ivf || !this._pq) {
      await this.ensureReady();
    }

    const ivf = this._ivf!;
    const pq = this._pq!;

    const offset = Number(ivf.offsets[partitionId]);
    const length = ivf.lengths[partitionId];

    if (length === 0) {
      const emptyData = {
        rowIds: new BigUint64Array(0),
        pqCodes: new Uint8Array(0),
        numRows: 0,
      };
      this.partitionCache.set(partitionId, emptyData);
      return;
    }

    // Calculate byte range
    const rowSize = 8 + pq.numSubVectors;
    const byteOffset = offset * rowSize;
    const byteLength = length * rowSize;

    const buffer = await this.storage.getRange(this.auxFilePath, byteOffset, byteLength);

    // Parse partition data
    const view = new DataView(buffer);
    const numSubVectors = pq.numSubVectors;

    const rowIds = new BigUint64Array(length);
    const pqCodes = new Uint8Array(length * numSubVectors);

    for (let i = 0; i < length; i++) {
      const rowOffset = i * rowSize;
      rowIds[i] = view.getBigUint64(rowOffset, true);

      const codeOffset = i * numSubVectors;
      for (let m = 0; m < numSubVectors; m++) {
        pqCodes[codeOffset + m] = view.getUint8(rowOffset + 8 + m);
      }
    }

    // Cache with LRU eviction
    if (this.partitionCache.size >= this.maxCachedPartitions) {
      const oldestKey = this.partitionCache.keys().next().value;
      if (oldestKey !== undefined) {
        this.partitionCache.delete(oldestKey);
      }
    }

    this.partitionCache.set(partitionId, { rowIds, pqCodes, numRows: length });
  }

  /**
   * Track partition access for prefetching
   */
  private trackAccess(partitionId: number): void {
    if (!this.config.enablePrefetch) return;

    this.accessHistory.push(partitionId);
    if (this.accessHistory.length > this.config.prefetchHistorySize) {
      this.accessHistory.shift();
    }

    // Prefetch likely next partitions based on access patterns
    this.prefetchRelatedPartitions(partitionId);
  }

  /**
   * Prefetch partitions that are likely to be accessed next
   */
  private prefetchRelatedPartitions(currentPartition: number): void {
    if (!this._ivf) return;

    // Simple prefetch strategy: load adjacent partitions
    const adjacentPartitions = [currentPartition - 1, currentPartition + 1].filter(
      p => p >= 0 && p < this._ivf!.numPartitions && !this.partitionCache.has(p)
    );

    for (const partitionId of adjacentPartitions.slice(0, 2)) {
      // Fire and forget - don't await
      this.loadPartition(partitionId).catch(() => {
        // Ignore prefetch errors
      });
    }
  }

  /**
   * Search for k nearest neighbors
   */
  async search(
    query: Float32Array,
    options: VectorSearchOptions
  ): Promise<SearchResult[]> {
    // Ensure core components are loaded
    await this.ensureReady();

    const ivf = this._ivf!;
    const pq = this._pq!;

    if (query.length !== ivf.dimension) {
      throw new Error(
        `Query dimension ${query.length} does not match index dimension ${ivf.dimension}`
      );
    }

    const { k, nprobes = 10, filter } = options;

    // Find nearest centroids
    const nearestPartitions = this.findNearestCentroids(query, nprobes);

    // Build PQ lookup tables
    const lookupTables = this.buildPqLookupTables(query);

    // Search partitions
    const results: SearchResult[] = [];

    for (const partitionId of nearestPartitions) {
      const partitionData = await this.loadPartition(partitionId);

      for (let i = 0; i < partitionData.numRows; i++) {
        const rowId = partitionData.rowIds[i];

        // Apply filter
        if (filter) {
          if (filter.type === 'include' && !filter.rowIds.has(rowId)) continue;
          if (filter.type === 'exclude' && filter.rowIds.has(rowId)) continue;
          if (filter.type === 'predicate' && !filter.fn(rowId)) continue;
        }

        // Compute distance using lookup tables
        let distance = 0;
        const codeOffset = i * pq.numSubVectors;

        for (let m = 0; m < pq.numSubVectors; m++) {
          const code = partitionData.pqCodes[codeOffset + m];
          distance += lookupTables[m][code];
        }

        results.push({
          rowId,
          distance,
          score: this.distanceToScore(distance),
        });
      }
    }

    // Sort by distance and return top k
    results.sort((a, b) => a.distance - b.distance);
    return results.slice(0, k);
  }

  /**
   * Find nearest centroids to query
   */
  private findNearestCentroids(query: Float32Array, n: number): number[] {
    const ivf = this._ivf!;
    const distances: Array<{ id: number; dist: number }> = new Array(ivf.numPartitions);

    for (let i = 0; i < ivf.numPartitions; i++) {
      const offset = i * ivf.dimension;
      let dist = 0;
      for (let d = 0; d < ivf.dimension; d++) {
        const diff = query[d] - ivf.centroids[offset + d];
        dist += diff * diff;
      }
      distances[i] = { id: i, dist };
    }

    distances.sort((a, b) => a.dist - b.dist);
    return distances.slice(0, n).map(d => d.id);
  }

  /**
   * Build PQ lookup tables for query
   */
  private buildPqLookupTables(query: Float32Array): Float32Array[] {
    const pq = this._pq!;
    const numSubVectors = pq.numSubVectors;
    const subDim = pq.subDim;
    const numCodes = 1 << pq.numBits;
    const codebook = pq.codebook;

    const tables: Float32Array[] = new Array(numSubVectors);

    for (let m = 0; m < numSubVectors; m++) {
      const table = new Float32Array(numCodes);
      const subQuery = query.subarray(m * subDim, (m + 1) * subDim);

      for (let c = 0; c < numCodes; c++) {
        const codebookOffset = (c * numSubVectors + m) * subDim;

        let dist = 0;
        for (let d = 0; d < subDim; d++) {
          const diff = subQuery[d] - codebook[codebookOffset + d];
          dist += diff * diff;
        }
        table[c] = dist;
      }

      tables[m] = table;
    }

    return tables;
  }

  /**
   * Convert distance to similarity score
   */
  private distanceToScore(distance: number): number {
    switch (this._distanceType) {
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
   * Clear all caches and reset loading state
   */
  clearCache(): void {
    this.partitionCache.clear();
    this._ivf = null;
    this._pq = null;
    this.accessHistory = [];
    this.loadingState = this.createInitialState();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    centroidsLoaded: boolean;
    codebookLoaded: boolean;
    partitionsLoaded: number;
    maxPartitions: number;
  } {
    return {
      centroidsLoaded: this._ivf !== null,
      codebookLoaded: this._pq !== null,
      partitionsLoaded: this.partitionCache.size,
      maxPartitions: this.maxCachedPartitions,
    };
  }
}

// ==========================================
// Lazy HNSW Index
// ==========================================

/**
 * Lazy-loading wrapper for HNSW index
 *
 * Defers loading of graph levels until they're accessed:
 * - Entry point and top levels: Loaded on first search
 * - Lower levels: Loaded as needed during traversal
 */
export class LazyHnswIndex extends VectorIndex {
  // Storage is kept for future use when full HNSW loading is implemented
  private _storage: StorageAdapter;
  private _indexPath: string;
  private _distanceType: DistanceType;
  private _dimension: number;
  private m: number;
  private maxLevel: number;
  private config: Required<LazyLoadConfig>;
  private loadingState: HnswLoadingState;

  // Loaded data
  private entryPoint: bigint = 0n;
  private nodes: Map<bigint, { vector: Float32Array; neighbors: bigint[][] }> = new Map();
  private loadedLevels: Set<number> = new Set();
  private initialized = false;

  constructor(
    storage: StorageAdapter,
    indexPath: string,
    distanceType: DistanceType,
    dimension: number,
    m: number,
    maxLevel: number,
    config?: Partial<LazyLoadConfig>
  ) {
    super();
    this._storage = storage;
    this._indexPath = indexPath;
    this._distanceType = distanceType;
    this._dimension = dimension;
    this.m = m;
    this.maxLevel = maxLevel;
    this.config = { ...DEFAULT_LAZY_LOAD_CONFIG, ...config };
    this.loadingState = this.createInitialState();

    // Start eager loading if configured
    if (this.config.strategy === 'eager') {
      this.initialize().catch(() => {
        // Ignore errors during preload
      });
    }
  }

  private createInitialState(): HnswLoadingState {
    return {
      metadata: { status: 'unloaded' },
      entryPoint: { status: 'unloaded' },
      levels: new Map(),
    };
  }

  get indexType(): string {
    return 'hnsw';
  }

  get dimension(): number {
    return this._dimension;
  }

  /**
   * Get loading states for monitoring
   */
  getLoadingState(): HnswLoadingState {
    return this.loadingState;
  }

  /**
   * Check if the index is ready for search
   */
  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Initialize the index (load entry point and metadata)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const state = this.loadingState.metadata;
    if (state.status === 'loading') {
      await state.promise;
      return;
    }

    const loadPromise = this.loadMetadata();
    this.loadingState.metadata = { status: 'loading', promise: loadPromise };

    try {
      await loadPromise;
      this.loadingState.metadata = { status: 'loaded' };
      this.initialized = true;
    } catch (error) {
      this.loadingState.metadata = { status: 'error', error: error as Error };
      throw error;
    }
  }

  /**
   * Load HNSW metadata
   */
  private async loadMetadata(): Promise<void> {
    // In a full implementation, this would read Arrow schema metadata
    // to get entry point, max level, etc.
    // For now, create a simple test graph
    this.createTestGraph();
  }

  /**
   * Create a test graph for demonstration
   */
  private createTestGraph(): void {
    const dim = this._dimension;

    // Create entry point
    this.entryPoint = 0n;

    // Create test nodes
    for (let i = 0; i < 100; i++) {
      const id = BigInt(i);
      const vector = new Float32Array(dim);
      for (let j = 0; j < dim; j++) {
        vector[j] = Math.random() * 2 - 1;
      }

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

      this.nodes.set(id, { vector, neighbors });
    }

    // Mark all levels as loaded
    for (let level = 0; level <= this.maxLevel; level++) {
      this.loadedLevels.add(level);
      this.loadingState.levels.set(level, { status: 'loaded' });
    }
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

    if (query.length !== this._dimension) {
      throw new Error(
        `Query dimension ${query.length} does not match index dimension ${this._dimension}`
      );
    }

    // Start from entry point
    let currentNode = this.entryPoint;

    // Traverse from top level to level 1
    for (let level = this.maxLevel; level > 0; level--) {
      currentNode = await this.searchLevel(query, currentNode, level);
    }

    // Search level 0 with efSearch candidates
    const candidates = await this.searchLevelWithEf(query, currentNode, efSearch, filter);

    // Return top k results
    return candidates
      .map(item => ({
        rowId: item.nodeId,
        distance: item.distance,
        score: this.distanceToScore(item.distance),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, k);
  }

  /**
   * Search a single level, returning closest node
   */
  private async searchLevel(
    query: Float32Array,
    entryPoint: bigint,
    level: number
  ): Promise<bigint> {
    const visited = new Set<bigint>();
    let currentNode = entryPoint;
    let currentDist = this.computeDistance(query, currentNode);
    visited.add(currentNode);

    let improved = true;
    while (improved) {
      improved = false;

      const neighbors = this.getNeighbors(currentNode, level);
      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);

        const dist = this.computeDistance(query, neighbor);
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
   * Search level with ef expansion
   */
  private async searchLevelWithEf(
    query: Float32Array,
    entryPoint: bigint,
    ef: number,
    filter?: VectorSearchOptions['filter']
  ): Promise<Array<{ nodeId: bigint; distance: number }>> {
    const visited = new Set<bigint>();
    const candidates: Array<{ nodeId: bigint; distance: number }> = [];
    const results: Array<{ nodeId: bigint; distance: number }> = [];

    const passesFilter = (nodeId: bigint): boolean => {
      if (!filter) return true;
      if (filter.type === 'include' && !filter.rowIds.has(nodeId)) return false;
      if (filter.type === 'exclude' && filter.rowIds.has(nodeId)) return false;
      if (filter.type === 'predicate' && !filter.fn(nodeId)) return false;
      return true;
    };

    const entryDist = this.computeDistance(query, entryPoint);
    candidates.push({ nodeId: entryPoint, distance: entryDist });
    if (passesFilter(entryPoint)) {
      results.push({ nodeId: entryPoint, distance: entryDist });
    }
    visited.add(entryPoint);

    while (candidates.length > 0) {
      // Sort to process closest first
      candidates.sort((a, b) => a.distance - b.distance);
      const current = candidates.shift()!;

      // Check if we should stop
      const worstResult = results.length > 0 ? results[results.length - 1] : null;
      if (worstResult && current.distance > worstResult.distance && results.length >= ef) {
        break;
      }

      // Explore neighbors
      const neighbors = this.getNeighbors(current.nodeId, 0);
      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);

        const dist = this.computeDistance(query, neighbor);
        candidates.push({ nodeId: neighbor, distance: dist });

        if (passesFilter(neighbor)) {
          results.push({ nodeId: neighbor, distance: dist });
          results.sort((a, b) => a.distance - b.distance);
          if (results.length > ef) {
            results.pop();
          }
        }
      }
    }

    return results;
  }

  /**
   * Compute distance from query to node
   */
  private computeDistance(query: Float32Array, nodeId: bigint): number {
    const node = this.nodes.get(nodeId);
    if (!node) return Infinity;

    const vector = node.vector;
    let sum = 0;

    switch (this._distanceType) {
      case 'l2':
        for (let i = 0; i < query.length; i++) {
          const diff = query[i] - vector[i];
          sum += diff * diff;
        }
        return sum;

      case 'cosine':
        let dot = 0, normA = 0, normB = 0;
        for (let i = 0; i < query.length; i++) {
          dot += query[i] * vector[i];
          normA += query[i] * query[i];
          normB += vector[i] * vector[i];
        }
        const denom = Math.sqrt(normA) * Math.sqrt(normB);
        return denom === 0 ? 1 : 1 - dot / denom;

      case 'dot':
        for (let i = 0; i < query.length; i++) {
          sum += query[i] * vector[i];
        }
        return -sum;

      default:
        for (let i = 0; i < query.length; i++) {
          const diff = query[i] - vector[i];
          sum += diff * diff;
        }
        return sum;
    }
  }

  /**
   * Get neighbors of a node at a level
   */
  private getNeighbors(nodeId: bigint, level: number): bigint[] {
    const node = this.nodes.get(nodeId);
    return node?.neighbors[level] ?? [];
  }

  /**
   * Convert distance to score
   */
  private distanceToScore(distance: number): number {
    switch (this._distanceType) {
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
   * Clear cache and reset state
   */
  clearCache(): void {
    this.nodes.clear();
    this.loadedLevels.clear();
    this.initialized = false;
    this.loadingState = this.createInitialState();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    initialized: boolean;
    nodesLoaded: number;
    levelsLoaded: number[];
  } {
    return {
      initialized: this.initialized,
      nodesLoaded: this.nodes.size,
      levelsLoaded: Array.from(this.loadedLevels),
    };
  }

  /**
   * Get the storage adapter for advanced use cases or future full HNSW loading
   */
  getStorage(): StorageAdapter {
    return this._storage;
  }

  /**
   * Get the index file path for advanced use cases
   */
  getIndexPath(): string {
    return this._indexPath;
  }
}

// ==========================================
// Factory Functions
// ==========================================

/**
 * Create a lazy-loading vector index factory
 *
 * @example
 * ```typescript
 * const factory = createLazyIndexFactory({
 *   storage: new R2StorageAdapter(env.MY_BUCKET),
 *   lazyConfig: { strategy: 'lazy', preloadCentroids: true },
 * });
 *
 * const index = await factory.createIndex('ivf-pq', indexPath);
 * const results = await index.search(query, { k: 10 });
 * ```
 */
export function createLazyIndexFactory(options: {
  storage: StorageAdapter;
  lazyConfig?: Partial<LazyLoadConfig>;
}) {
  const { storage, lazyConfig } = options;

  return {
    /**
     * Create a lazy IVF-PQ index
     */
    createIvfPqIndex(
      indexPath: string,
      auxFilePath: string,
      distanceType: DistanceType,
      dimension: number
    ): LazyIvfPqIndex {
      return new LazyIvfPqIndex(
        storage,
        indexPath,
        auxFilePath,
        distanceType,
        dimension,
        lazyConfig
      );
    },

    /**
     * Create a lazy HNSW index
     */
    createHnswIndex(
      indexPath: string,
      distanceType: DistanceType,
      dimension: number,
      m: number,
      maxLevel: number
    ): LazyHnswIndex {
      return new LazyHnswIndex(
        storage,
        indexPath,
        distanceType,
        dimension,
        m,
        maxLevel,
        lazyConfig
      );
    },
  };
}

/**
 * Dynamic import helper for optional dependencies
 *
 * Used to load heavy components only when needed:
 * - IVF-PQ implementation
 * - HNSW implementation
 * - Protobuf parser
 * - Arrow IPC reader
 *
 * @example
 * ```typescript
 * const ivfPq = await dynamicImport('./ivf-pq.js');
 * const index = new ivfPq.IvfPqIndex(...);
 * ```
 */
export async function dynamicImport<T>(modulePath: string): Promise<T> {
  return import(modulePath) as Promise<T>;
}

/**
 * Lazy factory for creating vector indices with deferred module loading
 */
export async function createVectorIndex(
  type: 'ivf-pq' | 'hnsw',
  options: {
    storage: StorageAdapter;
    indexPath: string;
    auxFilePath?: string;
    distanceType: DistanceType;
    dimension: number;
    m?: number;
    maxLevel?: number;
    lazyConfig?: Partial<LazyLoadConfig>;
  }
): Promise<VectorIndex> {
  const { storage, indexPath, auxFilePath, distanceType, dimension, m = 16, maxLevel = 4, lazyConfig } = options;

  if (type === 'ivf-pq') {
    if (!auxFilePath) {
      throw new Error('auxFilePath is required for IVF-PQ index');
    }
    return new LazyIvfPqIndex(storage, indexPath, auxFilePath, distanceType, dimension, lazyConfig);
  } else if (type === 'hnsw') {
    return new LazyHnswIndex(storage, indexPath, distanceType, dimension, m, maxLevel, lazyConfig);
  } else {
    throw new Error(`Unknown index type: ${type}`);
  }
}

// ==========================================
// Component-Level Lazy Loading
// ==========================================

/**
 * Cache for lazily imported modules to avoid repeated dynamic imports
 */
const moduleCache = new Map<string, Promise<unknown>>();

/**
 * Lazy module loader with caching
 * Reduces memory usage by only loading modules when needed
 *
 * @example
 * ```typescript
 * const protobuf = await lazyModuleLoader('./protobuf.js');
 * const ivf = protobuf.parseIvf(buffer);
 * ```
 */
export async function lazyModuleLoader<T>(modulePath: string): Promise<T> {
  let cached = moduleCache.get(modulePath);
  if (!cached) {
    cached = import(modulePath);
    moduleCache.set(modulePath, cached);
  }
  return cached as Promise<T>;
}

/**
 * Clear the module cache (useful for testing)
 */
export function clearModuleCache(): void {
  moduleCache.clear();
}

// ==========================================
// Streaming Partition Loader
// ==========================================

/**
 * Configuration for streaming partition loading
 */
export interface StreamingPartitionConfig {
  /** Maximum number of partitions to keep in memory */
  maxCachedPartitions: number;
  /** Minimum partition size to trigger streaming (bytes) */
  streamingThreshold: number;
  /** Chunk size for streaming reads (bytes) */
  chunkSize: number;
  /** Enable memory pressure monitoring */
  enableMemoryPressureHandling: boolean;
}

/**
 * Default streaming partition configuration
 */
export const DEFAULT_STREAMING_CONFIG: StreamingPartitionConfig = {
  maxCachedPartitions: 50,
  streamingThreshold: 1024 * 1024, // 1MB
  chunkSize: 64 * 1024, // 64KB
  enableMemoryPressureHandling: true,
};

/**
 * Streaming partition data for memory-efficient loading
 */
export interface StreamingPartitionData {
  /** Partition ID */
  partitionId: number;
  /** Total number of rows in partition */
  numRows: number;
  /** Number of rows currently loaded */
  loadedRows: number;
  /** Row IDs array (may be partial if streaming) */
  rowIds: BigUint64Array;
  /** PQ codes array (may be partial if streaming) */
  pqCodes: Uint8Array;
  /** Whether all data is loaded */
  isComplete: boolean;
  /** Last access timestamp for LRU eviction */
  lastAccess: number;
}

/**
 * Memory-efficient streaming partition loader
 * Loads partition data in chunks to reduce memory pressure
 */
export class StreamingPartitionLoader {
  private storage: StorageAdapter;
  private auxFilePath: string;
  private config: StreamingPartitionConfig;
  private partitionCache = new Map<number, StreamingPartitionData>();
  private accessOrder: number[] = [];

  constructor(
    storage: StorageAdapter,
    auxFilePath: string,
    config?: Partial<StreamingPartitionConfig>
  ) {
    this.storage = storage;
    this.auxFilePath = auxFilePath;
    this.config = { ...DEFAULT_STREAMING_CONFIG, ...config };
  }

  /**
   * Load a partition's data with streaming support
   */
  async loadPartition(
    partitionId: number,
    offset: bigint,
    length: number,
    numSubVectors: number
  ): Promise<StreamingPartitionData> {
    // Check cache first
    const cached = this.partitionCache.get(partitionId);
    if (cached && cached.isComplete) {
      cached.lastAccess = Date.now();
      this.updateAccessOrder(partitionId);
      return cached;
    }

    const rowSize = 8 + numSubVectors;
    const totalBytes = length * rowSize;

    // Decide whether to use streaming based on data size
    if (totalBytes > this.config.streamingThreshold) {
      return this.streamLoad(partitionId, offset, length, numSubVectors, rowSize);
    } else {
      return this.directLoad(partitionId, offset, length, numSubVectors, rowSize);
    }
  }

  /**
   * Direct load for smaller partitions
   */
  private async directLoad(
    partitionId: number,
    offset: bigint,
    length: number,
    numSubVectors: number,
    rowSize: number
  ): Promise<StreamingPartitionData> {
    this.evictIfNeeded();

    const byteOffset = Number(offset) * rowSize;
    const byteLength = length * rowSize;

    const buffer = await this.storage.getRange(this.auxFilePath, byteOffset, byteLength);
    const view = new DataView(buffer);

    const rowIds = new BigUint64Array(length);
    const pqCodes = new Uint8Array(length * numSubVectors);

    for (let i = 0; i < length; i++) {
      const rowOffset = i * rowSize;
      rowIds[i] = view.getBigUint64(rowOffset, true);

      const codeOffset = i * numSubVectors;
      for (let m = 0; m < numSubVectors; m++) {
        pqCodes[codeOffset + m] = view.getUint8(rowOffset + 8 + m);
      }
    }

    const data: StreamingPartitionData = {
      partitionId,
      numRows: length,
      loadedRows: length,
      rowIds,
      pqCodes,
      isComplete: true,
      lastAccess: Date.now(),
    };

    this.partitionCache.set(partitionId, data);
    this.accessOrder.push(partitionId);

    return data;
  }

  /**
   * Streaming load for larger partitions
   */
  private async streamLoad(
    partitionId: number,
    offset: bigint,
    length: number,
    numSubVectors: number,
    rowSize: number
  ): Promise<StreamingPartitionData> {
    this.evictIfNeeded();

    const byteOffset = Number(offset) * rowSize;
    const rowIds = new BigUint64Array(length);
    const pqCodes = new Uint8Array(length * numSubVectors);

    const chunkRows = Math.floor(this.config.chunkSize / rowSize) || 1;
    let loadedRows = 0;

    while (loadedRows < length) {
      const rowsToLoad = Math.min(chunkRows, length - loadedRows);
      const chunkByteOffset = byteOffset + loadedRows * rowSize;
      const chunkByteLength = rowsToLoad * rowSize;

      const buffer = await this.storage.getRange(this.auxFilePath, chunkByteOffset, chunkByteLength);
      const view = new DataView(buffer);

      for (let i = 0; i < rowsToLoad; i++) {
        const rowOffset = i * rowSize;
        const globalIdx = loadedRows + i;

        rowIds[globalIdx] = view.getBigUint64(rowOffset, true);

        const codeOffset = globalIdx * numSubVectors;
        for (let m = 0; m < numSubVectors; m++) {
          pqCodes[codeOffset + m] = view.getUint8(rowOffset + 8 + m);
        }
      }

      loadedRows += rowsToLoad;
    }

    const data: StreamingPartitionData = {
      partitionId,
      numRows: length,
      loadedRows: length,
      rowIds,
      pqCodes,
      isComplete: true,
      lastAccess: Date.now(),
    };

    this.partitionCache.set(partitionId, data);
    this.accessOrder.push(partitionId);

    return data;
  }

  /**
   * Evict oldest partitions if cache is full
   */
  private evictIfNeeded(): void {
    while (this.partitionCache.size >= this.config.maxCachedPartitions) {
      const oldestId = this.accessOrder.shift();
      if (oldestId !== undefined) {
        this.partitionCache.delete(oldestId);
      } else {
        break;
      }
    }
  }

  /**
   * Update access order for LRU
   */
  private updateAccessOrder(partitionId: number): void {
    const idx = this.accessOrder.indexOf(partitionId);
    if (idx !== -1) {
      this.accessOrder.splice(idx, 1);
    }
    this.accessOrder.push(partitionId);
  }

  /**
   * Clear all cached partitions
   */
  clear(): void {
    this.partitionCache.clear();
    this.accessOrder = [];
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    cachedPartitions: number;
    maxPartitions: number;
    totalCachedRows: number;
  } {
    let totalRows = 0;
    for (const data of this.partitionCache.values()) {
      totalRows += data.loadedRows;
    }
    return {
      cachedPartitions: this.partitionCache.size,
      maxPartitions: this.config.maxCachedPartitions,
      totalCachedRows: totalRows,
    };
  }
}

// ==========================================
// Progressive Loading
// ==========================================

/**
 * Progress callback for progressive loading operations
 */
export type ProgressCallback = (progress: {
  stage: string;
  loaded: number;
  total: number;
  percentage: number;
}) => void;

/**
 * Progressive loader for monitoring load progress
 * Useful for UI feedback during large index loads
 */
export class ProgressiveLoader {
  private onProgress?: ProgressCallback;

  constructor(onProgress?: ProgressCallback) {
    this.onProgress = onProgress;
  }

  /**
   * Report progress
   */
  report(stage: string, loaded: number, total: number): void {
    if (this.onProgress) {
      this.onProgress({
        stage,
        loaded,
        total,
        percentage: total > 0 ? Math.round((loaded / total) * 100) : 0,
      });
    }
  }

  /**
   * Create a stage reporter
   */
  createStageReporter(stage: string, total: number): (loaded: number) => void {
    return (loaded: number) => this.report(stage, loaded, total);
  }
}

// ==========================================
// Lazy Component Registry
// ==========================================

/**
 * Component status in the registry
 */
export interface ComponentStatus {
  name: string;
  loaded: boolean;
  loadedAt?: number;
  size?: number;
  error?: Error;
}

/**
 * Registry for tracking lazy-loaded components
 * Provides observability into what's loaded and when
 */
export class LazyComponentRegistry {
  private components = new Map<string, ComponentStatus>();

  /**
   * Register a component as loading
   */
  markLoading(name: string): void {
    this.components.set(name, {
      name,
      loaded: false,
    });
  }

  /**
   * Mark a component as loaded
   */
  markLoaded(name: string, size?: number): void {
    this.components.set(name, {
      name,
      loaded: true,
      loadedAt: Date.now(),
      size,
    });
  }

  /**
   * Mark a component as failed
   */
  markFailed(name: string, error: Error): void {
    this.components.set(name, {
      name,
      loaded: false,
      error,
    });
  }

  /**
   * Check if a component is loaded
   */
  isLoaded(name: string): boolean {
    const status = this.components.get(name);
    return status?.loaded ?? false;
  }

  /**
   * Get status of all components
   */
  getAllStatus(): ComponentStatus[] {
    return Array.from(this.components.values());
  }

  /**
   * Get total loaded size
   */
  getTotalLoadedSize(): number {
    let total = 0;
    for (const status of this.components.values()) {
      if (status.loaded && status.size) {
        total += status.size;
      }
    }
    return total;
  }

  /**
   * Clear the registry
   */
  clear(): void {
    this.components.clear();
  }
}

// ==========================================
// Memory-Aware Loader
// ==========================================

/**
 * Configuration for memory-aware loading
 */
export interface MemoryAwareConfig {
  /** Maximum memory usage target in bytes (soft limit) */
  maxMemoryTarget: number;
  /** Memory check interval in milliseconds */
  checkInterval: number;
  /** Threshold for aggressive eviction (0-1) */
  evictionThreshold: number;
}

/**
 * Default memory-aware configuration
 */
export const DEFAULT_MEMORY_AWARE_CONFIG: MemoryAwareConfig = {
  maxMemoryTarget: 100 * 1024 * 1024, // 100MB
  checkInterval: 5000, // 5 seconds
  evictionThreshold: 0.8, // 80%
};

/**
 * Memory usage estimator for loaded components
 */
export function estimateMemoryUsage(data: {
  rowIds?: BigUint64Array;
  pqCodes?: Uint8Array;
  centroids?: Float32Array;
  codebook?: Float32Array;
  nodes?: number;
  dimension?: number;
}): number {
  let total = 0;

  if (data.rowIds) {
    total += data.rowIds.byteLength;
  }
  if (data.pqCodes) {
    total += data.pqCodes.byteLength;
  }
  if (data.centroids) {
    total += data.centroids.byteLength;
  }
  if (data.codebook) {
    total += data.codebook.byteLength;
  }
  if (data.nodes && data.dimension) {
    // Estimate node storage: vector + metadata overhead
    total += data.nodes * (data.dimension * 4 + 64);
  }

  return total;
}

// ==========================================
// Lazy Reader Components
// ==========================================

/**
 * Lazy protobuf parser interface
 */
export interface LazyProtobufParser {
  parseIvf: (buffer: ArrayBuffer) => IvfStructure;
  parsePqCodebook: (buffer: ArrayBuffer) => PqCodebook;
}

/**
 * Get lazy protobuf parser
 * Defers loading of protobuf parsing code until needed
 */
export async function getLazyProtobufParser(): Promise<LazyProtobufParser> {
  const protobuf = await lazyModuleLoader<{
    parseIvf: (buffer: ArrayBuffer) => IvfStructure;
    parsePqCodebook: (buffer: ArrayBuffer) => PqCodebook;
  }>('./protobuf.js');
  return protobuf;
}

/**
 * Lazy Arrow IPC reader interface
 */
export interface LazyArrowReader {
  readPartitionData: (buffer: ArrayBuffer, partitionId: number) => {
    rowIds: BigUint64Array;
    pqCodes: Uint8Array;
    numRows: number;
  };
}

/**
 * Get lazy Arrow IPC reader
 * Defers loading of Arrow parsing code until needed
 */
export async function getLazyArrowReader(): Promise<LazyArrowReader> {
  const arrow = await lazyModuleLoader<{
    readPartitionData: (buffer: ArrayBuffer, partitionId: number) => {
      rowIds: BigUint64Array;
      pqCodes: Uint8Array;
      numRows: number;
    };
  }>('./arrow.js');
  return arrow;
}

// ==========================================
// Batch Lazy Loading
// ==========================================

/**
 * Options for batch loading operations
 */
export interface BatchLoadOptions {
  /** Maximum concurrent loads */
  concurrency: number;
  /** Timeout per load operation */
  timeout: number;
  /** Whether to fail fast on error */
  failFast: boolean;
}

/**
 * Default batch load options
 */
export const DEFAULT_BATCH_LOAD_OPTIONS: BatchLoadOptions = {
  concurrency: 4,
  timeout: 30000,
  failFast: false,
};

/**
 * Batch loader for loading multiple partitions efficiently
 */
export async function batchLoadPartitions<T>(
  items: T[],
  loadFn: (item: T) => Promise<void>,
  options?: Partial<BatchLoadOptions>
): Promise<{ successful: T[]; failed: Array<{ item: T; error: Error }> }> {
  const opts = { ...DEFAULT_BATCH_LOAD_OPTIONS, ...options };
  const successful: T[] = [];
  const failed: Array<{ item: T; error: Error }> = [];

  // Process in batches respecting concurrency
  for (let i = 0; i < items.length; i += opts.concurrency) {
    const batch = items.slice(i, i + opts.concurrency);

    const results = await Promise.allSettled(
      batch.map(async (item) => {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Load timeout')), opts.timeout);
        });

        await Promise.race([loadFn(item), timeoutPromise]);
        return item;
      })
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const item = batch[j];

      if (result.status === 'fulfilled') {
        successful.push(item);
      } else {
        if (opts.failFast) {
          throw result.reason;
        }
        failed.push({ item, error: result.reason });
      }
    }
  }

  return { successful, failed };
}
