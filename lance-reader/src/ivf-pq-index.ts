/**
 * IVF-PQ Index Structure and Types
 *
 * This module defines the core data structures for IVF-PQ (Inverted File with
 * Product Quantization) indices. IVF-PQ is the standard algorithm for large-scale
 * approximate nearest neighbor (ANN) search.
 *
 * @module @evodb/lance-reader/ivf-pq-index
 */

import type { DistanceType } from './types.js';

// ==========================================
// IVF (Inverted File) Index Types
// ==========================================

/**
 * IVF index configuration parameters
 */
export interface IvfConfig {
  /** Number of partitions (clusters) */
  numPartitions: number;
  /** Vector dimension */
  dimension: number;
  /** Distance metric type */
  distanceType: DistanceType;
  /** K-means training loss (optional, for diagnostics) */
  loss?: number;
}

/**
 * IVF centroids storage
 * Centroids are stored as a flat Float32Array: [numPartitions x dimension]
 */
export interface IvfCentroids {
  /** Flat array of centroid vectors */
  data: Float32Array;
  /** Number of partitions */
  numPartitions: number;
  /** Dimension of each centroid */
  dimension: number;
}

/**
 * IVF partition metadata
 * Maps partition ID to its location in the data file
 */
export interface IvfPartitionMeta {
  /** Starting row offset for each partition */
  offsets: BigUint64Array;
  /** Number of rows in each partition */
  lengths: Uint32Array;
  /** Total number of indexed rows */
  totalRows: number;
}

/**
 * Complete IVF structure combining centroids and partition metadata
 */
export interface IvfIndex {
  /** Centroid vectors */
  centroids: IvfCentroids;
  /** Partition metadata */
  partitions: IvfPartitionMeta;
  /** Index configuration */
  config: IvfConfig;
}

// ==========================================
// PQ (Product Quantization) Types
// ==========================================

/**
 * PQ configuration parameters
 */
export interface PqConfig {
  /** Number of sub-vectors (M) */
  numSubVectors: number;
  /** Bits per sub-quantizer (typically 8) */
  numBits: number;
  /** Dimension of each sub-vector */
  subDim: number;
  /** Number of codewords per sub-quantizer (2^numBits) */
  numCodes: number;
  /** Distance metric type */
  distanceType: DistanceType;
}

/**
 * PQ codebook storage
 * Codebook layout: [numCodes x numSubVectors x subDim]
 *
 * To access codeword c for sub-vector m:
 * offset = (c * numSubVectors + m) * subDim
 */
export interface PqCodebook {
  /** Flat array of codebook vectors */
  data: Float32Array;
  /** Configuration */
  config: PqConfig;
}

/**
 * Pre-computed distance lookup tables for ADC (Asymmetric Distance Computation)
 * Layout: [numSubVectors][numCodes]
 *
 * table[m][c] = distance(query_subvector[m], codebook[c][m])
 */
export interface PqLookupTables {
  /** Array of lookup tables, one per sub-vector */
  tables: Float32Array[];
  /** Total number of sub-vectors */
  numSubVectors: number;
  /** Number of codes per table */
  numCodes: number;
}

// ==========================================
// Partition Data Types
// ==========================================

/**
 * Raw partition data loaded from storage
 */
export interface PartitionRawData {
  /** Row IDs in this partition */
  rowIds: BigUint64Array;
  /** PQ codes for all rows [numRows x numSubVectors] */
  pqCodes: Uint8Array;
  /** Number of rows in partition */
  numRows: number;
  /** Partition ID */
  partitionId: number;
}

/**
 * Partition data with optional original vectors (for reranking)
 */
export interface PartitionDataWithVectors extends PartitionRawData {
  /** Original vectors (optional, for exact reranking) */
  vectors?: Float32Array;
  /** Vector dimension (if vectors are present) */
  dimension?: number;
}

// ==========================================
// Search Types
// ==========================================

/**
 * IVF-PQ search parameters
 */
export interface IvfPqSearchParams {
  /** Number of nearest neighbors to return */
  k: number;
  /** Number of partitions to probe */
  nprobes: number;
  /** Pre-filter predicate (optional) */
  preFilter?: (rowId: bigint) => boolean;
  /** Include row IDs only (no reranking) */
  includeRowIds?: Set<bigint>;
  /** Exclude row IDs (deleted rows) */
  excludeRowIds?: Set<bigint>;
  /** Early termination distance threshold */
  maxDistance?: number;
}

/**
 * Single search result
 */
export interface IvfPqSearchResult {
  /** Row ID in the dataset */
  rowId: bigint;
  /** Distance to query (lower is closer) */
  distance: number;
  /** Partition ID where this result was found */
  partitionId: number;
  /** Normalized similarity score (0-1) */
  score?: number;
}

/**
 * Batch search results (for multiple queries)
 */
export interface IvfPqBatchResults {
  /** Results for each query */
  results: IvfPqSearchResult[][];
  /** Search statistics */
  stats: IvfPqSearchStats;
}

/**
 * Search statistics for performance monitoring
 */
export interface IvfPqSearchStats {
  /** Total partitions probed */
  partitionsProbed: number;
  /** Total rows scanned */
  rowsScanned: number;
  /** Time to compute centroid distances (ms) */
  centroidDistanceTimeMs: number;
  /** Time to build lookup tables (ms) */
  lookupTableBuildTimeMs: number;
  /** Time to scan partitions (ms) */
  partitionScanTimeMs: number;
  /** Total search time (ms) */
  totalTimeMs: number;
  /** Cache hits for partition data */
  cacheHits: number;
  /** Cache misses for partition data */
  cacheMisses: number;
}

// ==========================================
// Index Metadata Types
// ==========================================

/**
 * Complete IVF-PQ index metadata
 */
export interface IvfPqIndexMeta {
  /** Index UUID */
  uuid: string;
  /** Index name */
  name: string;
  /** Field IDs indexed */
  fieldIds: number[];
  /** Dataset version when index was created */
  datasetVersion: bigint;
  /** Index configuration */
  config: IvfPqConfig;
  /** File paths */
  files: IvfPqIndexFiles;
}

/**
 * Combined IVF-PQ configuration
 */
export interface IvfPqConfig {
  /** IVF configuration */
  ivf: IvfConfig;
  /** PQ configuration */
  pq: PqConfig;
}

/**
 * File paths for IVF-PQ index
 */
export interface IvfPqIndexFiles {
  /** Path to index file (contains IVF centroids) */
  indexFile: string;
  /** Path to auxiliary file (contains PQ codebook and encoded data) */
  auxiliaryFile: string;
}

// ==========================================
// Memory Layout Constants
// ==========================================

/**
 * Partition data row size calculator
 * Each row in partition data consists of:
 * - rowId: 8 bytes (uint64)
 * - pqCodes: numSubVectors bytes (uint8 per sub-vector)
 */
export function calculatePartitionRowSize(numSubVectors: number): number {
  return 8 + numSubVectors;
}

/**
 * Calculate memory required for partition cache
 */
export function estimatePartitionCacheSize(
  numPartitions: number,
  avgRowsPerPartition: number,
  numSubVectors: number
): number {
  const rowSize = calculatePartitionRowSize(numSubVectors);
  return numPartitions * avgRowsPerPartition * rowSize;
}

/**
 * Calculate memory required for PQ lookup tables
 */
export function estimateLookupTableSize(numSubVectors: number, numBits: number): number {
  const numCodes = 1 << numBits;
  return numSubVectors * numCodes * 4; // Float32 per entry
}

/**
 * Calculate memory required for centroids
 */
export function estimateCentroidsSize(numPartitions: number, dimension: number): number {
  return numPartitions * dimension * 4; // Float32 per element
}

/**
 * Calculate memory required for codebook
 */
export function estimateCodebookSize(
  numSubVectors: number,
  numBits: number,
  subDim: number
): number {
  const numCodes = 1 << numBits;
  return numCodes * numSubVectors * subDim * 4; // Float32 per element
}

// ==========================================
// Type Guards
// ==========================================

/**
 * Check if an object is a valid IVF index
 */
export function isValidIvfIndex(obj: unknown): obj is IvfIndex {
  if (!obj || typeof obj !== 'object') return false;
  const ivf = obj as Partial<IvfIndex>;
  return (
    ivf.centroids !== undefined &&
    ivf.centroids.data instanceof Float32Array &&
    ivf.partitions !== undefined &&
    ivf.partitions.offsets instanceof BigUint64Array &&
    ivf.partitions.lengths instanceof Uint32Array &&
    ivf.config !== undefined &&
    typeof ivf.config.numPartitions === 'number'
  );
}

/**
 * Check if an object is a valid PQ codebook
 */
export function isValidPqCodebook(obj: unknown): obj is PqCodebook {
  if (!obj || typeof obj !== 'object') return false;
  const pq = obj as Partial<PqCodebook>;
  return (
    pq.data instanceof Float32Array &&
    pq.config !== undefined &&
    typeof pq.config.numSubVectors === 'number' &&
    typeof pq.config.numBits === 'number'
  );
}

// ==========================================
// Factory Functions
// ==========================================

/**
 * Create an empty IVF index structure
 */
export function createEmptyIvfIndex(config: IvfConfig): IvfIndex {
  const { numPartitions, dimension } = config;

  return {
    centroids: {
      data: new Float32Array(numPartitions * dimension),
      numPartitions,
      dimension,
    },
    partitions: {
      offsets: new BigUint64Array(numPartitions),
      lengths: new Uint32Array(numPartitions),
      totalRows: 0,
    },
    config,
  };
}

/**
 * Create an empty PQ codebook structure
 */
export function createEmptyPqCodebook(config: PqConfig): PqCodebook {
  const { numSubVectors, numCodes, subDim } = config;

  return {
    data: new Float32Array(numCodes * numSubVectors * subDim),
    config,
  };
}

/**
 * Create empty lookup tables
 */
export function createEmptyLookupTables(numSubVectors: number, numCodes: number): PqLookupTables {
  const tables: Float32Array[] = new Array(numSubVectors);
  for (let m = 0; m < numSubVectors; m++) {
    tables[m] = new Float32Array(numCodes);
  }
  return { tables, numSubVectors, numCodes };
}

/**
 * Create search stats object
 */
export function createSearchStats(): IvfPqSearchStats {
  return {
    partitionsProbed: 0,
    rowsScanned: 0,
    centroidDistanceTimeMs: 0,
    lookupTableBuildTimeMs: 0,
    partitionScanTimeMs: 0,
    totalTimeMs: 0,
    cacheHits: 0,
    cacheMisses: 0,
  };
}
