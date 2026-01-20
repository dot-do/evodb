/**
 * IVF-PQ Index Loader
 *
 * Handles loading IVF-PQ indices from Lance format files.
 * Supports both eager loading (load entire index) and lazy loading
 * (load partitions on demand).
 *
 * @module @evodb/lance-reader/ivf-pq-loader
 */

import type { StorageAdapter, DistanceType } from './types.js';
import type {
  IvfIndex,
  IvfConfig,
  IvfCentroids,
  IvfPartitionMeta,
  PqCodebook,
  PqConfig,
  PartitionRawData,
  IvfPqIndexMeta,
  IvfPqConfig,
} from './ivf-pq-index.js';
import {
  calculatePartitionRowSize,
} from './ivf-pq-index.js';
import { parseIvf, parsePqCodebook } from './protobuf.js';

// ==========================================
// Loader Configuration
// ==========================================

/**
 * Configuration for IVF-PQ index loading
 */
export interface IvfPqLoaderConfig {
  /** Storage adapter for reading files */
  storage: StorageAdapter;
  /** Path to index file */
  indexPath: string;
  /** Path to auxiliary file (PQ data) */
  auxiliaryPath: string;
  /** Whether to eagerly load all partitions */
  eagerLoad?: boolean;
  /** Maximum partitions to keep in cache */
  maxCachedPartitions?: number;
  /** Pre-load centroids on initialization */
  preloadCentroids?: boolean;
}

/**
 * Lance index file structure locations
 */
export interface LanceIndexLocations {
  /** Global buffer index for IVF data */
  ivfBufferIndex: number;
  /** Global buffer index for PQ codebook */
  pqBufferIndex: number;
  /** Partition data start offset */
  partitionDataOffset: number;
}

// ==========================================
// IVF-PQ Loader Class
// ==========================================

/**
 * Loader for IVF-PQ indices from Lance format
 *
 * The Lance format stores IVF-PQ indices as:
 * - Index file: Contains IVF centroids in a global buffer
 * - Auxiliary file: Contains PQ codebook and encoded partition data
 *
 * @example
 * ```typescript
 * const loader = new IvfPqLoader({
 *   storage,
 *   indexPath: 'indices/abc123/index.idx',
 *   auxiliaryPath: 'indices/abc123/auxiliary.idx',
 * });
 *
 * await loader.initialize();
 *
 * const ivf = loader.getIvfIndex();
 * const pq = loader.getPqCodebook();
 * ```
 */
export class IvfPqLoader {
  private storage: StorageAdapter;
  private indexPath: string;
  private auxiliaryPath: string;
  private maxCachedPartitions: number;

  // Loaded index structures
  private ivfIndex: IvfIndex | null = null;
  private pqCodebook: PqCodebook | null = null;

  // Partition cache (LRU)
  private partitionCache = new Map<number, PartitionRawData>();

  // Metadata
  private indexMeta: IvfPqIndexMeta | null = null;
  private initialized = false;

  constructor(config: IvfPqLoaderConfig) {
    this.storage = config.storage;
    this.indexPath = config.indexPath;
    this.auxiliaryPath = config.auxiliaryPath;
    this.maxCachedPartitions = config.maxCachedPartitions ?? 50;
    // Note: preloadCentroids config is accepted but not yet implemented
  }

  // ==========================================
  // Initialization
  // ==========================================

  /**
   * Initialize the loader by reading index metadata and structures
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Load IVF structure from index file
    await this.loadIvfIndex();

    // Load PQ codebook from auxiliary file
    await this.loadPqCodebook();

    this.initialized = true;
  }

  /**
   * Check if loader is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  // ==========================================
  // IVF Loading
  // ==========================================

  /**
   * Load IVF index structure from index file
   */
  private async loadIvfIndex(): Promise<void> {
    // Read index file to get global buffers
    // The IVF data is stored in a global buffer (typically index 0)

    // First, read the file footer to get global buffer offsets
    const footerBuffer = await this.storage.getRange(this.indexPath, -4096, 4096);
    const footer = this.parseFooter(footerBuffer);

    if (footer.numGlobalBuffers === 0) {
      throw new Error('Index file has no global buffers');
    }

    // Read GBO table to get buffer locations
    const gboTableSize = footer.numGlobalBuffers * 16;
    const gboTableBuffer = await this.storage.getRange(
      this.indexPath,
      Number(footer.gboTableOffset),
      gboTableSize
    );

    const gboEntries = this.parseGboTable(gboTableBuffer, footer.numGlobalBuffers);

    // Read IVF buffer (typically at index 0)
    const ivfEntry = gboEntries[0];
    const ivfBuffer = await this.storage.getRange(
      this.indexPath,
      Number(ivfEntry.position),
      Number(ivfEntry.size)
    );

    // Parse IVF structure from protobuf
    const ivfRaw = parseIvf(ivfBuffer);

    // Convert to our IVF index structure
    this.ivfIndex = this.buildIvfIndex(ivfRaw);
  }

  /**
   * Convert raw IVF data to structured IVF index
   */
  private buildIvfIndex(raw: {
    centroids: Float32Array;
    offsets: BigUint64Array;
    lengths: Uint32Array;
    numPartitions: number;
    dimension: number;
    loss?: number;
  }): IvfIndex {
    const config: IvfConfig = {
      numPartitions: raw.numPartitions,
      dimension: raw.dimension,
      distanceType: 'l2', // Default, will be overridden by index metadata
      loss: raw.loss,
    };

    const centroids: IvfCentroids = {
      data: raw.centroids,
      numPartitions: raw.numPartitions,
      dimension: raw.dimension,
    };

    let totalRows = 0;
    for (let i = 0; i < raw.lengths.length; i++) {
      totalRows += raw.lengths[i];
    }

    const partitions: IvfPartitionMeta = {
      offsets: raw.offsets,
      lengths: raw.lengths,
      totalRows,
    };

    return { centroids, partitions, config };
  }

  // ==========================================
  // PQ Loading
  // ==========================================

  /**
   * Load PQ codebook from auxiliary file
   */
  private async loadPqCodebook(): Promise<void> {
    // Read auxiliary file footer
    const footerBuffer = await this.storage.getRange(this.auxiliaryPath, -4096, 4096);
    const footer = this.parseFooter(footerBuffer);

    if (footer.numGlobalBuffers === 0) {
      throw new Error('Auxiliary file has no global buffers');
    }

    // Read GBO table
    const gboTableSize = footer.numGlobalBuffers * 16;
    const gboTableBuffer = await this.storage.getRange(
      this.auxiliaryPath,
      Number(footer.gboTableOffset),
      gboTableSize
    );

    const gboEntries = this.parseGboTable(gboTableBuffer, footer.numGlobalBuffers);

    // Read PQ buffer (typically at index 0)
    const pqEntry = gboEntries[0];
    const pqBuffer = await this.storage.getRange(
      this.auxiliaryPath,
      Number(pqEntry.position),
      Number(pqEntry.size)
    );

    // Parse PQ codebook from protobuf
    const pqRaw = parsePqCodebook(pqBuffer);

    // Convert to our PQ codebook structure
    this.pqCodebook = this.buildPqCodebook(pqRaw);
  }

  /**
   * Convert raw PQ data to structured codebook
   */
  private buildPqCodebook(raw: {
    codebook: Float32Array;
    numSubVectors: number;
    numBits: number;
    distanceType: DistanceType;
    subDim: number;
  }): PqCodebook {
    const numCodes = 1 << raw.numBits;

    const config: PqConfig = {
      numSubVectors: raw.numSubVectors,
      numBits: raw.numBits,
      subDim: raw.subDim,
      numCodes,
      distanceType: raw.distanceType,
    };

    return {
      data: raw.codebook,
      config,
    };
  }

  // ==========================================
  // Partition Loading
  // ==========================================

  /**
   * Load partition data by partition ID
   */
  async loadPartition(partitionId: number): Promise<PartitionRawData> {
    if (!this.initialized) {
      throw new Error('Loader not initialized. Call initialize() first.');
    }

    // Check cache first
    const cached = this.partitionCache.get(partitionId);
    if (cached) {
      // Move to end of cache (LRU)
      this.partitionCache.delete(partitionId);
      this.partitionCache.set(partitionId, cached);
      return cached;
    }

    // Load from storage
    const partitionData = await this.loadPartitionFromStorage(partitionId);

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
   * Load partition data from auxiliary file
   */
  private async loadPartitionFromStorage(partitionId: number): Promise<PartitionRawData> {
    const ivf = this.ivfIndex!;
    const pq = this.pqCodebook!;

    const offset = Number(ivf.partitions.offsets[partitionId]);
    const numRows = ivf.partitions.lengths[partitionId];

    if (numRows === 0) {
      return {
        rowIds: new BigUint64Array(0),
        pqCodes: new Uint8Array(0),
        numRows: 0,
        partitionId,
      };
    }

    // Calculate byte range for this partition
    const rowSize = calculatePartitionRowSize(pq.config.numSubVectors);
    const byteOffset = offset * rowSize;
    const byteLength = numRows * rowSize;

    // Read partition data from auxiliary file
    // Note: Partition data starts after the global buffers in the auxiliary file
    // The exact offset depends on Lance file format version

    const buffer = await this.storage.getRange(this.auxiliaryPath, byteOffset, byteLength);

    return this.parsePartitionData(buffer, numRows, partitionId);
  }

  /**
   * Parse raw partition data into structured format
   */
  private parsePartitionData(
    buffer: ArrayBuffer,
    numRows: number,
    partitionId: number
  ): PartitionRawData {
    const pq = this.pqCodebook!;
    const numSubVectors = pq.config.numSubVectors;
    const rowSize = calculatePartitionRowSize(numSubVectors);

    const view = new DataView(buffer);
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

    return { rowIds, pqCodes, numRows, partitionId };
  }

  /**
   * Load multiple partitions in parallel
   */
  async loadPartitions(partitionIds: number[]): Promise<PartitionRawData[]> {
    return Promise.all(partitionIds.map(id => this.loadPartition(id)));
  }

  /**
   * Preload partitions into cache
   */
  async preloadPartitions(partitionIds: number[]): Promise<void> {
    await this.loadPartitions(partitionIds);
  }

  // ==========================================
  // Footer Parsing
  // ==========================================

  /**
   * Parse Lance file footer from buffer
   */
  private parseFooter(buffer: ArrayBuffer): {
    columnMeta0Offset: bigint;
    cmoTableOffset: bigint;
    gboTableOffset: bigint;
    numGlobalBuffers: number;
    numColumns: number;
    majorVersion: number;
    minorVersion: number;
  } {
    const footerSize = 40;
    const footerOffset = buffer.byteLength - footerSize;
    const view = new DataView(buffer, footerOffset, footerSize);

    // Verify magic bytes
    const magic = String.fromCharCode(
      view.getUint8(36),
      view.getUint8(37),
      view.getUint8(38),
      view.getUint8(39)
    );

    if (magic !== 'LANC') {
      throw new Error(`Invalid Lance file: expected magic "LANC", got "${magic}"`);
    }

    return {
      columnMeta0Offset: view.getBigUint64(0, true),
      cmoTableOffset: view.getBigUint64(8, true),
      gboTableOffset: view.getBigUint64(16, true),
      numGlobalBuffers: view.getUint32(24, true),
      numColumns: view.getUint32(28, true),
      majorVersion: view.getUint16(32, true),
      minorVersion: view.getUint16(34, true),
    };
  }

  /**
   * Parse Global Buffer Offset table
   */
  private parseGboTable(
    buffer: ArrayBuffer,
    numEntries: number
  ): Array<{ position: bigint; size: bigint }> {
    const view = new DataView(buffer);
    const entries: Array<{ position: bigint; size: bigint }> = [];

    for (let i = 0; i < numEntries; i++) {
      const offset = i * 16;
      entries.push({
        position: view.getBigUint64(offset, true),
        size: view.getBigUint64(offset + 8, true),
      });
    }

    return entries;
  }

  // ==========================================
  // Getters
  // ==========================================

  /**
   * Get loaded IVF index
   */
  getIvfIndex(): IvfIndex {
    if (!this.ivfIndex) {
      throw new Error('IVF index not loaded');
    }
    return this.ivfIndex;
  }

  /**
   * Get loaded PQ codebook
   */
  getPqCodebook(): PqCodebook {
    if (!this.pqCodebook) {
      throw new Error('PQ codebook not loaded');
    }
    return this.pqCodebook;
  }

  /**
   * Get index metadata
   */
  getIndexMeta(): IvfPqIndexMeta | null {
    return this.indexMeta;
  }

  /**
   * Get combined configuration
   */
  getConfig(): IvfPqConfig {
    const ivf = this.getIvfIndex();
    const pq = this.getPqCodebook();

    return {
      ivf: ivf.config,
      pq: pq.config,
    };
  }

  // ==========================================
  // Cache Management
  // ==========================================

  /**
   * Clear partition cache
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
   * Set maximum cache size
   */
  setMaxCacheSize(maxSize: number): void {
    this.maxCachedPartitions = maxSize;

    // Evict excess entries
    while (this.partitionCache.size > maxSize) {
      const oldestKey = this.partitionCache.keys().next().value;
      if (oldestKey !== undefined) {
        this.partitionCache.delete(oldestKey);
      }
    }
  }

  // ==========================================
  // Storage Access
  // ==========================================

  /**
   * Get underlying storage adapter
   */
  getStorage(): StorageAdapter {
    return this.storage;
  }

  /**
   * Get index file path
   */
  getIndexPath(): string {
    return this.indexPath;
  }

  /**
   * Get auxiliary file path
   */
  getAuxiliaryPath(): string {
    return this.auxiliaryPath;
  }
}

// ==========================================
// Factory Functions
// ==========================================

/**
 * Create an IVF-PQ loader from Lance dataset
 */
export function createIvfPqLoader(config: IvfPqLoaderConfig): IvfPqLoader {
  return new IvfPqLoader(config);
}

/**
 * Load an IVF-PQ index completely into memory
 */
export async function loadIvfPqIndex(
  storage: StorageAdapter,
  indexPath: string,
  auxiliaryPath: string
): Promise<{ ivf: IvfIndex; pq: PqCodebook }> {
  const loader = new IvfPqLoader({
    storage,
    indexPath,
    auxiliaryPath,
  });

  await loader.initialize();

  return {
    ivf: loader.getIvfIndex(),
    pq: loader.getPqCodebook(),
  };
}

// ==========================================
// In-Memory Index Builder
// ==========================================

/**
 * Build IVF-PQ index from vectors in memory
 * Useful for creating test fixtures and small indices
 */
export class InMemoryIvfPqBuilder {
  private vectors: Float32Array[] = [];
  private dimension: number;
  private numPartitions: number;
  private numSubVectors: number;
  private numBits: number;
  private distanceType: DistanceType;

  constructor(options: {
    dimension: number;
    numPartitions: number;
    numSubVectors: number;
    numBits?: number;
    distanceType?: DistanceType;
  }) {
    this.dimension = options.dimension;
    this.numPartitions = options.numPartitions;
    this.numSubVectors = options.numSubVectors;
    this.numBits = options.numBits ?? 8;
    this.distanceType = options.distanceType ?? 'l2';

    if (this.dimension % this.numSubVectors !== 0) {
      throw new Error(
        `Dimension ${this.dimension} must be divisible by numSubVectors ${this.numSubVectors}`
      );
    }
  }

  /**
   * Add vectors to the index
   */
  addVectors(vectors: Float32Array[]): void {
    for (const v of vectors) {
      if (v.length !== this.dimension) {
        throw new Error(`Vector dimension ${v.length} does not match index dimension ${this.dimension}`);
      }
      this.vectors.push(v);
    }
  }

  /**
   * Build the index
   */
  async build(): Promise<{ ivf: IvfIndex; pq: PqCodebook; partitionData: PartitionRawData[] }> {
    if (this.vectors.length === 0) {
      throw new Error('No vectors to index');
    }

    // Run k-means clustering to find centroids
    const centroids = this.kMeansClustering(this.vectors, this.numPartitions);

    // Assign vectors to partitions
    const assignments = this.assignToPartitions(this.vectors, centroids);

    // Build PQ codebook from residuals
    const codebook = this.buildPqCodebook(this.vectors, centroids, assignments);

    // Encode vectors using PQ
    const partitionData = this.encodeVectors(this.vectors, centroids, assignments, codebook);

    // Build IVF structure
    const ivfConfig: IvfConfig = {
      numPartitions: this.numPartitions,
      dimension: this.dimension,
      distanceType: this.distanceType,
    };

    const ivfCentroids: IvfCentroids = {
      data: this.flattenCentroids(centroids),
      numPartitions: this.numPartitions,
      dimension: this.dimension,
    };

    let totalRows = 0;
    const offsets = new BigUint64Array(this.numPartitions);
    const lengths = new Uint32Array(this.numPartitions);
    let offset = 0n;

    for (let p = 0; p < this.numPartitions; p++) {
      offsets[p] = offset;
      lengths[p] = partitionData[p].numRows;
      offset += BigInt(partitionData[p].numRows);
      totalRows += partitionData[p].numRows;
    }

    const ivf: IvfIndex = {
      centroids: ivfCentroids,
      partitions: { offsets, lengths, totalRows },
      config: ivfConfig,
    };

    const subDim = Math.floor(this.dimension / this.numSubVectors);
    const numCodes = 1 << this.numBits;

    const pqConfig: PqConfig = {
      numSubVectors: this.numSubVectors,
      numBits: this.numBits,
      subDim,
      numCodes,
      distanceType: this.distanceType,
    };

    const pq: PqCodebook = {
      data: codebook,
      config: pqConfig,
    };

    return { ivf, pq, partitionData };
  }

  /**
   * Simple k-means clustering
   */
  private kMeansClustering(
    vectors: Float32Array[],
    k: number,
    maxIterations: number = 20
  ): Float32Array[] {
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

    // K-means iterations
    for (let iter = 0; iter < maxIterations; iter++) {
      const assignments = new Uint32Array(vectors.length);
      const counts = new Uint32Array(k);
      const sums = centroids.map(() => new Float32Array(this.dimension));

      for (let i = 0; i < vectors.length; i++) {
        let bestDist = Infinity;
        let bestCentroid = 0;

        for (let c = 0; c < centroids.length; c++) {
          const dist = this.l2Distance(vectors[i], centroids[c]);
          if (dist < bestDist) {
            bestDist = dist;
            bestCentroid = c;
          }
        }

        assignments[i] = bestCentroid;
        counts[bestCentroid]++;

        for (let d = 0; d < this.dimension; d++) {
          sums[bestCentroid][d] += vectors[i][d];
        }
      }

      // Update centroids
      for (let c = 0; c < k; c++) {
        if (counts[c] > 0) {
          for (let d = 0; d < this.dimension; d++) {
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
  private assignToPartitions(
    vectors: Float32Array[],
    centroids: Float32Array[]
  ): Uint32Array {
    const assignments = new Uint32Array(vectors.length);

    for (let i = 0; i < vectors.length; i++) {
      let bestDist = Infinity;
      let bestCentroid = 0;

      for (let c = 0; c < centroids.length; c++) {
        const dist = this.l2Distance(vectors[i], centroids[c]);
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
  private buildPqCodebook(
    vectors: Float32Array[],
    centroids: Float32Array[],
    assignments: Uint32Array
  ): Float32Array {
    const subDim = Math.floor(this.dimension / this.numSubVectors);
    const numCodes = 1 << this.numBits;

    // Codebook layout: [numCodes, numSubVectors, subDim]
    const codebook = new Float32Array(numCodes * this.numSubVectors * subDim);

    // Compute residuals
    const residuals = vectors.map((v, i) => {
      const residual = new Float32Array(this.dimension);
      const centroid = centroids[assignments[i]];
      for (let d = 0; d < this.dimension; d++) {
        residual[d] = v[d] - centroid[d];
      }
      return residual;
    });

    // Train sub-quantizers for each sub-vector
    for (let m = 0; m < this.numSubVectors; m++) {
      // Extract sub-vectors
      const subVectors = residuals.map(r =>
        new Float32Array(r.subarray(m * subDim, (m + 1) * subDim))
      );

      // Cluster sub-vectors
      const subCentroids = this.kMeansClustering(subVectors, numCodes, 10);

      // Store in codebook
      for (let c = 0; c < subCentroids.length; c++) {
        const offset = (c * this.numSubVectors + m) * subDim;
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
  private encodeVectors(
    vectors: Float32Array[],
    centroids: Float32Array[],
    assignments: Uint32Array,
    codebook: Float32Array
  ): PartitionRawData[] {
    const subDim = Math.floor(this.dimension / this.numSubVectors);
    const numCodes = 1 << this.numBits;

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
    const partitionData: PartitionRawData[] = [];

    for (let p = 0; p < this.numPartitions; p++) {
      const vecs = partitionVectors.get(p) || [];
      const numRows = vecs.length;

      const rowIds = new BigUint64Array(numRows);
      const pqCodes = new Uint8Array(numRows * this.numSubVectors);

      for (let i = 0; i < vecs.length; i++) {
        rowIds[i] = BigInt(vecs[i].idx);

        // Compute residual
        const residual = new Float32Array(this.dimension);
        for (let d = 0; d < this.dimension; d++) {
          residual[d] = vecs[i].vec[d] - centroids[p][d];
        }

        // Encode each sub-vector
        for (let m = 0; m < this.numSubVectors; m++) {
          let bestCode = 0;
          let bestDist = Infinity;

          const subResidual = residual.subarray(m * subDim, (m + 1) * subDim);

          for (let c = 0; c < numCodes; c++) {
            const offset = (c * this.numSubVectors + m) * subDim;
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

          pqCodes[i * this.numSubVectors + m] = bestCode;
        }
      }

      partitionData.push({ rowIds, pqCodes, numRows, partitionId: p });
    }

    return partitionData;
  }

  /**
   * Flatten centroids to single Float32Array
   */
  private flattenCentroids(centroids: Float32Array[]): Float32Array {
    const flat = new Float32Array(centroids.length * this.dimension);
    for (let i = 0; i < centroids.length; i++) {
      flat.set(centroids[i], i * this.dimension);
    }
    return flat;
  }

  /**
   * Compute L2 squared distance
   */
  private l2Distance(a: Float32Array, b: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }
    return sum;
  }
}
