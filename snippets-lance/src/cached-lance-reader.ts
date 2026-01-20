/**
 * Edge-cache-aware Lance reader for Cloudflare Snippets
 *
 * Key design principles for Snippets constraints:
 * 1. Load only IVF centroids into memory (small fixed size)
 * 2. Use edge cache for partition data (lazy load on search)
 * 3. Pre-compute PQ lookup tables once per query
 * 4. Use typed arrays for zero-copy operations
 *
 * @module @evodb/snippets-lance/cached-lance-reader
 */

import type {
  EdgeCacheAdapter,
  CachedLanceConfig,
  CentroidIndex,
  PQCodebook,
  PartitionMeta,
  PartitionData,
} from './types.js';
import {
  ALLOCATION_LIMITS,
  validateAllocationSize,
  validateCount,
} from './types.js';

// ==========================================
// Safe BigInt to Number Conversion
// ==========================================

/**
 * Safely convert a BigInt to a Number, throwing if precision would be lost.
 * JavaScript's Number.MAX_SAFE_INTEGER is 2^53 - 1 (9,007,199,254,740,991).
 * For file offsets beyond this (~9 PB), precision loss would cause incorrect reads.
 *
 * @param value - The BigInt value to convert
 * @param context - Description of what the value represents (for error messages)
 * @returns The value as a Number
 * @throws Error if the value exceeds Number.MAX_SAFE_INTEGER
 */
export function safeBigIntToNumber(value: bigint, context: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(
      `${context} exceeds Number.MAX_SAFE_INTEGER (${value} > ${Number.MAX_SAFE_INTEGER}). ` +
      `File offsets this large (>${Number.MAX_SAFE_INTEGER} bytes / ~9 PB) are not supported.`
    );
  }
  if (value < 0n) {
    throw new Error(`${context} cannot be negative (got ${value})`);
  }
  return Number(value);
}

// ==========================================
// Default Edge Cache Adapter (fetch-based)
// ==========================================

/**
 * Default edge cache adapter using fetch with Range requests
 * Works with cdn.workers.do or any HTTP endpoint supporting range requests
 */
export class FetchEdgeCacheAdapter implements EdgeCacheAdapter {
  async getRange(url: string, offset: number, length: number): Promise<ArrayBuffer> {
    const headers: HeadersInit = {
      Range: `bytes=${offset}-${offset + length - 1}`,
    };

    const response = await fetch(url, { headers });

    if (!response.ok && response.status !== 206) {
      throw new Error(`Failed to fetch range from ${url}: ${response.status}`);
    }

    return response.arrayBuffer();
  }

  async isCached(url: string): Promise<boolean> {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// ==========================================
// Lance Index Header Format
// ==========================================

/**
 * Cached Lance index header structure
 * This is a simplified header format for pre-processed Lance indices
 *
 * Header layout (64 bytes):
 * - [0-3]   magic: "LCIX" (Lance Cached Index)
 * - [4-5]   version: uint16
 * - [6-7]   distanceType: uint16 (0=l2, 1=cosine, 2=dot)
 * - [8-11]  numPartitions: uint32
 * - [12-15] dimension: uint32
 * - [16-19] numSubVectors: uint32
 * - [20-23] subDim: uint32
 * - [24-27] numBits: uint32
 * - [28-35] centroidOffset: uint64
 * - [36-43] centroidSize: uint64
 * - [44-51] pqCodebookOffset: uint64
 * - [52-59] pqCodebookSize: uint64
 * - [60-63] partitionMetaOffset: uint32
 */
export interface CachedIndexHeader {
  magic: string;
  version: number;
  distanceType: 'l2' | 'cosine' | 'dot';
  numPartitions: number;
  dimension: number;
  numSubVectors: number;
  subDim: number;
  numBits: number;
  centroidOffset: bigint;
  centroidSize: bigint;
  pqCodebookOffset: bigint;
  pqCodebookSize: bigint;
  partitionMetaOffset: number;
}

const CACHED_INDEX_MAGIC = 'LCIX';
const CACHED_INDEX_HEADER_SIZE = 64;

// ==========================================
// Cached Lance Reader
// ==========================================

/**
 * Edge-cache-aware Lance reader optimized for Snippets
 *
 * Memory budget analysis for 32MB limit:
 * - Centroids: numPartitions * dimension * 4 bytes
 *   - 1024 partitions, 384 dim = 1.5MB
 *   - 4096 partitions, 384 dim = 6MB
 * - PQ Codebook: 256 * numSubVectors * subDim * 4 bytes
 *   - 48 sub-vectors, 8 subDim = 384KB
 * - Partition data: numVectors * (8 + numSubVectors) bytes
 *   - 1000 vectors, 48 sub-vectors = 56KB
 * - Query overhead: dimension * 4 + 256 * numSubVectors * 4
 *   - 384 dim, 48 sub-vectors = ~50KB
 *
 * Total for 1024 partitions, 384 dim, 1 probe: ~2MB
 * Total for 4096 partitions, 384 dim, 3 probes: ~8MB
 */
export class CachedLanceReader {
  private config: CachedLanceConfig;
  private cacheAdapter: EdgeCacheAdapter;

  // Cached index components (loaded once)
  private header: CachedIndexHeader | null = null;
  private centroids: CentroidIndex | null = null;
  private pqCodebook: PQCodebook | null = null;
  private partitionMeta: PartitionMeta[] | null = null;

  // Memory tracking
  private memoryUsed = 0;

  constructor(config: CachedLanceConfig) {
    this.config = config;
    this.cacheAdapter = config.cacheAdapter ?? new FetchEdgeCacheAdapter();
  }

  /**
   * Get the URL for the index file
   */
  private getIndexUrl(): string {
    return `${this.config.baseUrl}/${this.config.dataset}/index.lcix`;
  }

  /**
   * Get the URL for the partition data file
   */
  private getPartitionDataUrl(): string {
    return `${this.config.baseUrl}/${this.config.dataset}/partitions.bin`;
  }

  /**
   * Load the index header
   */
  async loadHeader(): Promise<CachedIndexHeader> {
    if (this.header) return this.header;

    const buffer = await this.cacheAdapter.getRange(
      this.getIndexUrl(),
      0,
      CACHED_INDEX_HEADER_SIZE
    );

    const view = new DataView(buffer);

    // Verify magic
    const magic = String.fromCharCode(
      view.getUint8(0),
      view.getUint8(1),
      view.getUint8(2),
      view.getUint8(3)
    );

    if (magic !== CACHED_INDEX_MAGIC) {
      throw new Error(`Invalid cached index: expected magic "${CACHED_INDEX_MAGIC}", got "${magic}"`);
    }

    const distanceTypeNum = view.getUint16(6, true);
    const distanceType: 'l2' | 'cosine' | 'dot' =
      distanceTypeNum === 0 ? 'l2' :
      distanceTypeNum === 1 ? 'cosine' : 'dot';

    // Parse header fields
    const numPartitions = view.getUint32(8, true);
    const dimension = view.getUint32(12, true);
    const numSubVectors = view.getUint32(16, true);
    const subDim = view.getUint32(20, true);
    const numBits = view.getUint32(24, true);
    const centroidSize = view.getBigUint64(36, true);
    const pqCodebookSize = view.getBigUint64(52, true);

    // Validate header fields to prevent OOM from malicious/corrupted files
    validateCount(numPartitions, ALLOCATION_LIMITS.MAX_PARTITIONS, 'numPartitions');
    validateCount(dimension, ALLOCATION_LIMITS.MAX_DIMENSION, 'dimension');
    validateCount(numSubVectors, ALLOCATION_LIMITS.MAX_SUB_VECTORS, 'numSubVectors');
    validateCount(subDim, ALLOCATION_LIMITS.MAX_SUB_DIM, 'subDim');
    validateCount(numBits, ALLOCATION_LIMITS.MAX_NUM_BITS, 'numBits');
    validateAllocationSize(centroidSize, ALLOCATION_LIMITS.MAX_CENTROID_SIZE_BYTES, 'centroidSize');
    validateAllocationSize(pqCodebookSize, ALLOCATION_LIMITS.MAX_PQ_CODEBOOK_SIZE_BYTES, 'pqCodebookSize');

    this.header = {
      magic,
      version: view.getUint16(4, true),
      distanceType,
      numPartitions,
      dimension,
      numSubVectors,
      subDim,
      numBits,
      centroidOffset: view.getBigUint64(28, true),
      centroidSize,
      pqCodebookOffset: view.getBigUint64(44, true),
      pqCodebookSize,
      partitionMetaOffset: view.getUint32(60, true),
    };

    return this.header;
  }

  /**
   * Load centroids into memory
   * This is the most memory-efficient way to do IVF search
   */
  async loadCentroids(): Promise<CentroidIndex> {
    if (this.centroids) return this.centroids;

    const header = await this.loadHeader();

    const buffer = await this.cacheAdapter.getRange(
      this.getIndexUrl(),
      safeBigIntToNumber(header.centroidOffset, 'Centroid offset'),
      safeBigIntToNumber(header.centroidSize, 'Centroid size')
    );

    const centroids = new Float32Array(buffer);
    const byteSize = centroids.byteLength;
    this.memoryUsed += byteSize;

    this.centroids = {
      numPartitions: header.numPartitions,
      dimension: header.dimension,
      centroids,
      distanceType: header.distanceType,
      byteSize,
    };

    return this.centroids;
  }

  /**
   * Load PQ codebook into memory
   */
  async loadPQCodebook(): Promise<PQCodebook> {
    if (this.pqCodebook) return this.pqCodebook;

    const header = await this.loadHeader();

    const buffer = await this.cacheAdapter.getRange(
      this.getIndexUrl(),
      safeBigIntToNumber(header.pqCodebookOffset, 'PQ codebook offset'),
      safeBigIntToNumber(header.pqCodebookSize, 'PQ codebook size')
    );

    const codebook = new Float32Array(buffer);
    const byteSize = codebook.byteLength;
    this.memoryUsed += byteSize;

    this.pqCodebook = {
      numSubVectors: header.numSubVectors,
      subDim: header.subDim,
      numBits: header.numBits,
      codebook,
      byteSize,
    };

    return this.pqCodebook;
  }

  /**
   * Load partition metadata
   * Each partition meta is 20 bytes: id (4) + offset (8) + length (4) + numVectors (4)
   */
  async loadPartitionMeta(): Promise<PartitionMeta[]> {
    if (this.partitionMeta) return this.partitionMeta;

    const header = await this.loadHeader();

    // Calculate partition meta size and validate
    const metaSize = header.numPartitions * 20;
    validateAllocationSize(metaSize, ALLOCATION_LIMITS.MAX_PARTITION_META_SIZE_BYTES, 'partition meta size');

    const buffer = await this.cacheAdapter.getRange(
      this.getIndexUrl(),
      header.partitionMetaOffset,
      metaSize
    );

    const view = new DataView(buffer);
    this.partitionMeta = [];

    for (let i = 0; i < header.numPartitions; i++) {
      const offset = i * 20;
      const partitionByteOffset = view.getBigUint64(offset + 4, true);
      const byteLength = view.getUint32(offset + 12, true);
      const numVectors = view.getUint32(offset + 16, true);

      // Validate partition data sizes to prevent OOM
      validateAllocationSize(byteLength, ALLOCATION_LIMITS.MAX_PARTITION_DATA_SIZE_BYTES, `partition ${i} byteLength`);
      validateCount(numVectors, ALLOCATION_LIMITS.MAX_VECTORS_PER_PARTITION, `partition ${i} numVectors`);

      this.partitionMeta.push({
        id: view.getUint32(offset, true),
        byteOffset: safeBigIntToNumber(partitionByteOffset, `Partition ${i} byte offset`),
        byteLength,
        numVectors,
      });
    }

    this.memoryUsed += metaSize;
    return this.partitionMeta;
  }

  /**
   * Load a specific partition's data from edge cache
   * This is where lazy loading happens - only load partitions we need to search
   */
  async loadPartition(partitionId: number): Promise<PartitionData> {
    const meta = (await this.loadPartitionMeta())[partitionId];
    if (!meta) {
      throw new Error(`Invalid partition ID: ${partitionId}`);
    }

    if (meta.numVectors === 0) {
      return {
        rowIds: new BigUint64Array(0),
        pqCodes: new Uint8Array(0),
        numVectors: 0,
      };
    }

    const buffer = await this.cacheAdapter.getRange(
      this.getPartitionDataUrl(),
      meta.byteOffset,
      meta.byteLength
    );

    return this.parsePartitionData(buffer, meta.numVectors);
  }

  /**
   * Parse partition data from buffer
   * Format: [rowId (8 bytes) + pqCodes (numSubVectors bytes)] * numVectors
   */
  private parsePartitionData(buffer: ArrayBuffer, numVectors: number): PartitionData {
    if (!this.header) {
      throw new Error('Header not loaded. Call loadHeader() first.');
    }
    const header = this.header;
    const numSubVectors = header.numSubVectors;
    const rowSize = 8 + numSubVectors;

    // Validate allocation sizes before creating typed arrays
    // Note: numVectors was already validated in loadPartitionMeta()
    const rowIdsBytes = numVectors * 8;
    const pqCodesBytes = numVectors * numSubVectors;
    validateAllocationSize(rowIdsBytes, ALLOCATION_LIMITS.MAX_PARTITION_DATA_SIZE_BYTES, 'rowIds allocation');
    validateAllocationSize(pqCodesBytes, ALLOCATION_LIMITS.MAX_PARTITION_DATA_SIZE_BYTES, 'pqCodes allocation');

    const view = new DataView(buffer);
    const rowIds = new BigUint64Array(numVectors);
    const pqCodes = new Uint8Array(numVectors * numSubVectors);

    for (let i = 0; i < numVectors; i++) {
      const rowOffset = i * rowSize;
      rowIds[i] = view.getBigUint64(rowOffset, true);

      const codeOffset = i * numSubVectors;
      for (let m = 0; m < numSubVectors; m++) {
        pqCodes[codeOffset + m] = view.getUint8(rowOffset + 8 + m);
      }
    }

    return { rowIds, pqCodes, numVectors };
  }

  /**
   * Get current memory usage
   */
  getMemoryUsage(): number {
    return this.memoryUsed;
  }

  /**
   * Get header (must be loaded first)
   */
  getHeader(): CachedIndexHeader | null {
    return this.header;
  }

  /**
   * Get centroids (must be loaded first)
   */
  getCentroids(): CentroidIndex | null {
    return this.centroids;
  }

  /**
   * Get PQ codebook (must be loaded first)
   */
  getPQCodebook(): PQCodebook | null {
    return this.pqCodebook;
  }

  /**
   * Clear loaded data to free memory
   */
  clear(): void {
    this.header = null;
    this.centroids = null;
    this.pqCodebook = null;
    this.partitionMeta = null;
    this.memoryUsed = 0;
  }
}

// ==========================================
// In-Memory Index Builder (for testing)
// ==========================================

/**
 * Build an in-memory cached index for testing
 * This simulates what would be pre-processed and stored at edge
 */
export interface BuildCachedIndexOptions {
  numPartitions: number;
  dimension: number;
  numSubVectors: number;
  distanceType: 'l2' | 'cosine' | 'dot';
  vectors: Float32Array[];
}

/**
 * Build a cached index from vectors
 * For production, this would be done offline and uploaded to edge cache
 */
export function buildCachedIndex(options: BuildCachedIndexOptions): {
  header: CachedIndexHeader;
  centroids: CentroidIndex;
  pqCodebook: PQCodebook;
  partitionMeta: PartitionMeta[];
  partitionData: PartitionData[];
} {
  const { numPartitions, dimension, numSubVectors, distanceType, vectors } = options;

  if (vectors.length === 0) {
    throw new Error('Cannot build index from empty vectors');
  }

  if (dimension % numSubVectors !== 0) {
    throw new Error(`Dimension ${dimension} must be divisible by numSubVectors ${numSubVectors}`);
  }

  const subDim = dimension / numSubVectors;
  const numCodes = 256; // 8-bit PQ

  // Step 1: K-means clustering to find centroids
  const centroidVectors = kMeans(vectors, numPartitions, distanceType);
  const centroids = flattenVectors(centroidVectors);

  // Step 2: Assign vectors to partitions
  const assignments = assignToPartitions(vectors, centroidVectors, distanceType);

  // Step 3: Build PQ codebook from residuals
  const codebook = buildPQCodebook(vectors, centroidVectors, assignments, numSubVectors);

  // Step 4: Encode vectors and build partition data
  const partitionData = encodePartitions(vectors, centroidVectors, assignments, codebook, numSubVectors);

  // Step 5: Build partition metadata
  let offset = 0;
  const partitionMeta: PartitionMeta[] = partitionData.map((p, id) => {
    const rowSize = 8 + numSubVectors;
    const byteLength = p.numVectors * rowSize;
    const meta: PartitionMeta = {
      id,
      byteOffset: offset,
      byteLength,
      numVectors: p.numVectors,
    };
    offset += byteLength;
    return meta;
  });

  // Build header
  const centroidSize = numPartitions * dimension * 4;
  const pqCodebookSize = numCodes * numSubVectors * subDim * 4;

  const header: CachedIndexHeader = {
    magic: CACHED_INDEX_MAGIC,
    version: 1,
    distanceType,
    numPartitions,
    dimension,
    numSubVectors,
    subDim,
    numBits: 8,
    centroidOffset: BigInt(CACHED_INDEX_HEADER_SIZE),
    centroidSize: BigInt(centroidSize),
    pqCodebookOffset: BigInt(CACHED_INDEX_HEADER_SIZE + centroidSize),
    pqCodebookSize: BigInt(pqCodebookSize),
    partitionMetaOffset: CACHED_INDEX_HEADER_SIZE + centroidSize + pqCodebookSize,
  };

  const centroidIndex: CentroidIndex = {
    numPartitions,
    dimension,
    centroids,
    distanceType,
    byteSize: centroids.byteLength,
  };

  const pqCodebook: PQCodebook = {
    numSubVectors,
    subDim,
    numBits: 8,
    codebook,
    byteSize: codebook.byteLength,
  };

  return { header, centroids: centroidIndex, pqCodebook, partitionMeta, partitionData };
}

// ==========================================
// K-Means Clustering
// ==========================================

function kMeans(
  vectors: Float32Array[],
  k: number,
  distanceType: 'l2' | 'cosine' | 'dot',
  maxIterations = 20
): Float32Array[] {
  const dimension = vectors[0].length;
  const distFn = getDistanceFunction(distanceType);

  // Initialize centroids randomly from input vectors
  const centroids: Float32Array[] = [];
  const usedIndices = new Set<number>();
  const actualK = Math.min(k, vectors.length);

  for (let i = 0; i < actualK; i++) {
    let idx: number;
    do {
      idx = Math.floor(Math.random() * vectors.length);
    } while (usedIndices.has(idx) && usedIndices.size < vectors.length);
    usedIndices.add(idx);
    centroids.push(new Float32Array(vectors[idx]));
  }

  // Run k-means iterations
  for (let iter = 0; iter < maxIterations; iter++) {
    const counts = new Uint32Array(actualK);
    const sums = centroids.map(() => new Float32Array(dimension));

    // Assign and accumulate
    for (const vec of vectors) {
      let bestDist = Infinity;
      let bestCentroid = 0;

      for (let c = 0; c < centroids.length; c++) {
        const dist = distFn(vec, centroids[c]);
        if (dist < bestDist) {
          bestDist = dist;
          bestCentroid = c;
        }
      }

      counts[bestCentroid]++;
      for (let d = 0; d < dimension; d++) {
        sums[bestCentroid][d] += vec[d];
      }
    }

    // Update centroids
    for (let c = 0; c < actualK; c++) {
      if (counts[c] > 0) {
        for (let d = 0; d < dimension; d++) {
          centroids[c][d] = sums[c][d] / counts[c];
        }
      }
    }
  }

  return centroids;
}

function assignToPartitions(
  vectors: Float32Array[],
  centroids: Float32Array[],
  distanceType: 'l2' | 'cosine' | 'dot'
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

function buildPQCodebook(
  vectors: Float32Array[],
  centroids: Float32Array[],
  assignments: Uint32Array,
  numSubVectors: number
): Float32Array {
  const dimension = vectors[0].length;
  const subDim = dimension / numSubVectors;
  const numCodes = 256;

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
    const subVectors = residuals.map(r => {
      const sub = new Float32Array(subDim);
      for (let d = 0; d < subDim; d++) {
        sub[d] = r[m * subDim + d];
      }
      return sub;
    });

    // Cluster sub-vectors
    const subCentroids = kMeans(subVectors, numCodes, 'l2', 10);

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

function encodePartitions(
  vectors: Float32Array[],
  centroids: Float32Array[],
  assignments: Uint32Array,
  codebook: Float32Array,
  numSubVectors: number
): PartitionData[] {
  const dimension = vectors[0].length;
  const subDim = dimension / numSubVectors;
  const numCodes = 256;

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

  for (let p = 0; p < centroids.length; p++) {
    const vecs = partitionVectors.get(p) || [];
    const numVectors = vecs.length;

    const rowIds = new BigUint64Array(numVectors);
    const pqCodes = new Uint8Array(numVectors * numSubVectors);

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

        for (let c = 0; c < numCodes; c++) {
          const offset = (c * numSubVectors + m) * subDim;
          let dist = 0;
          for (let d = 0; d < subDim; d++) {
            const diff = residual[m * subDim + d] - codebook[offset + d];
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

    partitionData.push({ rowIds, pqCodes, numVectors });
  }

  return partitionData;
}

function flattenVectors(vectors: Float32Array[]): Float32Array {
  if (vectors.length === 0) return new Float32Array(0);
  const dimension = vectors[0].length;
  const flat = new Float32Array(vectors.length * dimension);
  for (let i = 0; i < vectors.length; i++) {
    flat.set(vectors[i], i * dimension);
  }
  return flat;
}

function getDistanceFunction(type: 'l2' | 'cosine' | 'dot'): (a: Float32Array, b: Float32Array) => number {
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

function l2DistanceSquared(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return sum;
}

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

function dotDistance(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return -dot;
}
