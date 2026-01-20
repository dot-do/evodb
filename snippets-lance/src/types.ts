/**
 * Type definitions for Snippets-optimized Lance vector search
 * Designed for Cloudflare Snippets constraints: 5ms CPU, 32MB RAM, 5 subrequests
 *
 * @module @evodb/snippets-lance/types
 */

// ==========================================
// Snippets Constraints
// ==========================================

/**
 * Cloudflare Snippets resource constraints
 */
export interface SnippetsConstraints {
  /** Maximum CPU time in milliseconds (5ms) */
  maxCpuMs: 5;
  /** Maximum memory in bytes (32MB) */
  maxMemoryBytes: 33_554_432;
  /** Maximum subrequests (5) */
  maxSubrequests: 5;
}

export const SNIPPETS_CONSTRAINTS: SnippetsConstraints = {
  maxCpuMs: 5,
  maxMemoryBytes: 33_554_432,
  maxSubrequests: 5,
};

// ==========================================
// Allocation Bounds (security limits)
// ==========================================

/**
 * Maximum reasonable sizes for allocations based on header values.
 * These limits prevent OOM attacks from malicious/corrupted files.
 *
 * All limits are designed to be well under the 32MB Snippets memory limit
 * while still supporting legitimate large indices.
 */
export const ALLOCATION_LIMITS = {
  /** Maximum number of partitions (16K is very large for IVF) */
  MAX_PARTITIONS: 16_384,

  /** Maximum vector dimension (4096 covers most embedding models) */
  MAX_DIMENSION: 4_096,

  /** Maximum number of sub-vectors (256 is extremely granular) */
  MAX_SUB_VECTORS: 256,

  /** Maximum sub-dimension (typically dimension / numSubVectors) */
  MAX_SUB_DIM: 256,

  /** Maximum PQ bits (8 is standard, 16 would be unusual) */
  MAX_NUM_BITS: 16,

  /** Maximum vectors per partition (1M is very large) */
  MAX_VECTORS_PER_PARTITION: 1_000_000,

  /** Maximum centroid size in bytes (16K partitions * 4096 dim * 4 bytes = 256MB, cap at 64MB) */
  MAX_CENTROID_SIZE_BYTES: 67_108_864,

  /** Maximum PQ codebook size in bytes (256 codes * 256 subvectors * 256 subdim * 4 = 64MB, cap at 16MB) */
  MAX_PQ_CODEBOOK_SIZE_BYTES: 16_777_216,

  /** Maximum partition meta size in bytes (16K partitions * 20 bytes = 320KB, cap at 1MB) */
  MAX_PARTITION_META_SIZE_BYTES: 1_048_576,

  /** Maximum partition data size in bytes per partition (cap at 32MB) */
  MAX_PARTITION_DATA_SIZE_BYTES: 33_554_432,
} as const;

/**
 * Validate that a size is within reasonable bounds before allocation.
 * Uses safe BigInt to Number conversion to prevent precision loss for large values.
 * @throws Error if size exceeds limit or if BigInt value exceeds Number.MAX_SAFE_INTEGER
 */
export function validateAllocationSize(
  size: number | bigint,
  limit: number,
  context: string
): void {
  let sizeNum: number;

  if (typeof size === 'bigint') {
    // Check for precision loss before converting
    if (size > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(
        `${context} exceeds Number.MAX_SAFE_INTEGER (${size} > ${Number.MAX_SAFE_INTEGER}). ` +
        `Values this large are not supported.`
      );
    }
    if (size < 0n) {
      throw new Error(`Invalid ${context}: size must be non-negative, got ${size}`);
    }
    sizeNum = Number(size);
  } else {
    sizeNum = size;
  }

  if (!Number.isFinite(sizeNum) || sizeNum < 0) {
    throw new Error(`Invalid ${context}: size must be a non-negative finite number, got ${size}`);
  }

  if (sizeNum > limit) {
    throw new Error(
      `${context} exceeds maximum allowed size: ${sizeNum.toLocaleString()} > ${limit.toLocaleString()} bytes. ` +
      `This may indicate a corrupted or malicious file.`
    );
  }
}

/**
 * Validate a count value is within reasonable bounds
 * @throws Error if count exceeds limit
 */
export function validateCount(
  count: number,
  limit: number,
  context: string
): void {
  if (!Number.isFinite(count) || count < 0 || !Number.isInteger(count)) {
    throw new Error(`Invalid ${context}: must be a non-negative integer, got ${count}`);
  }

  if (count > limit) {
    throw new Error(
      `${context} exceeds maximum allowed: ${count.toLocaleString()} > ${limit.toLocaleString()}. ` +
      `This may indicate a corrupted or malicious file.`
    );
  }
}

// ==========================================
// Edge Cache Types
// ==========================================

/**
 * Edge cache adapter interface for cached Lance files
 * Uses cdn.workers.do for edge caching (up to 5GB per file, unlimited total)
 */
export interface EdgeCacheAdapter {
  /** Fetch a byte range from the cached Lance file */
  getRange(url: string, offset: number, length: number): Promise<ArrayBuffer>;
  /** Check if URL is cached */
  isCached?(url: string): Promise<boolean>;
}

/**
 * Configuration for edge-cached Lance reader
 */
export interface CachedLanceConfig {
  /** Base URL for edge-cached Lance files (e.g., https://cdn.workers.do/lance/) */
  baseUrl: string;
  /** Dataset name */
  dataset: string;
  /** Optional custom cache adapter */
  cacheAdapter?: EdgeCacheAdapter;
}

// ==========================================
// Index Segment Types
// ==========================================

/**
 * Pre-computed centroid index for IVF search
 * This small index is loaded into memory once and reused
 */
export interface CentroidIndex {
  /** Number of partitions (clusters) */
  numPartitions: number;
  /** Vector dimension */
  dimension: number;
  /** Centroid vectors as flat Float32Array [numPartitions * dimension] */
  centroids: Float32Array;
  /** Distance type used */
  distanceType: 'l2' | 'cosine' | 'dot';
  /** Byte size of this index (for memory tracking) */
  byteSize: number;
}

/**
 * PQ codebook for distance computation
 * Loaded once, reused for all queries
 */
export interface PQCodebook {
  /** Number of sub-vectors */
  numSubVectors: number;
  /** Sub-vector dimension */
  subDim: number;
  /** Number of bits per code (8 = 256 codes) */
  numBits: number;
  /** Codebook data [numCodes * numSubVectors * subDim] */
  codebook: Float32Array;
  /** Byte size of this codebook */
  byteSize: number;
}

/**
 * Partition metadata for lazy loading
 */
export interface PartitionMeta {
  /** Partition ID */
  id: number;
  /** Byte offset in partition data file */
  byteOffset: number;
  /** Byte length of partition data */
  byteLength: number;
  /** Number of vectors in partition */
  numVectors: number;
}

/**
 * Loaded partition data for search
 */
export interface PartitionData {
  /** Row IDs in this partition */
  rowIds: BigUint64Array;
  /** PQ codes [numVectors * numSubVectors] */
  pqCodes: Uint8Array;
  /** Number of vectors */
  numVectors: number;
}

// ==========================================
// Search Types
// ==========================================

/**
 * Vector search options optimized for Snippets
 */
export interface SnippetsSearchOptions {
  /** Number of results to return (default: 10) */
  k?: number;
  /** Number of partitions to probe (default: 1, max recommended: 3 for 5ms) */
  nprobes?: number;
  /** Include distance scores in results */
  includeDistance?: boolean;
}

/**
 * Search result
 */
export interface SearchResult {
  /** Row ID in the dataset */
  rowId: bigint;
  /** Distance to query vector (lower is closer) */
  distance: number;
  /** Normalized similarity score (0-1, higher is better) */
  score: number;
}

// ==========================================
// Benchmark Types
// ==========================================

/**
 * Timing breakdown for benchmark
 */
export interface BenchmarkTiming {
  /** Total CPU time in microseconds */
  totalUs: number;
  /** Time to find nearest centroids */
  centroidSearchUs: number;
  /** Time to build PQ lookup tables */
  lookupTableUs: number;
  /** Time to search partitions */
  partitionSearchUs: number;
  /** Time to sort results */
  sortUs: number;
}

/**
 * Memory usage breakdown
 */
export interface MemoryUsage {
  /** Total bytes allocated */
  totalBytes: number;
  /** Centroid index size */
  centroidIndexBytes: number;
  /** PQ codebook size */
  pqCodebookBytes: number;
  /** Partition data loaded */
  partitionDataBytes: number;
  /** Query vector and lookup tables */
  queryOverheadBytes: number;
}

/**
 * Benchmark result
 */
export interface BenchmarkResult {
  /** Search results */
  results: SearchResult[];
  /** Timing breakdown */
  timing: BenchmarkTiming;
  /** Memory usage */
  memory: MemoryUsage;
  /** Whether within Snippets constraints */
  withinConstraints: boolean;
  /** Number of subrequests made */
  subrequestCount: number;
}
