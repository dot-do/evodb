/**
 * Core type definitions for Lance format reader
 * @module @evodb/lance-reader/types
 */

// ==========================================
// Storage Adapter Interface
// ==========================================

/**
 * Abstract storage interface for reading Lance files.
 * Allows pluggable backends (R2, S3, filesystem, etc.)
 *
 * @deprecated Use StorageProvider from @evodb/core for new code.
 * This interface is maintained for backward compatibility with existing
 * lance-reader code. The lance-reader uses ArrayBuffer (for zero-copy from R2)
 * while StorageProvider uses Uint8Array (for consistency).
 *
 * Migration guide:
 * - get() -> Convert: new Uint8Array(await provider.get()).buffer
 * - list() -> provider.list() (same API)
 * - exists() -> provider.exists() (same API)
 * - getRange() -> Not available in StorageProvider (use full get() and slice)
 *
 * @example
 * ```typescript
 * // Old code using lance-reader StorageAdapter
 * import { R2StorageAdapter } from '@evodb/lance-reader/r2';
 * const storage: StorageAdapter = new R2StorageAdapter(env.MY_BUCKET);
 *
 * // New code using StorageProvider
 * import { createStorageProvider, StorageProvider } from '@evodb/core';
 * const provider: StorageProvider = createStorageProvider(env.MY_BUCKET);
 * // For ArrayBuffer compatibility:
 * const data = await provider.get(key);
 * const buffer = data ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : null;
 * ```
 */
export interface StorageAdapter {
  /** Read entire object */
  get(key: string): Promise<ArrayBuffer | null>;
  /** Read a byte range from an object */
  getRange(key: string, offset: number, length: number): Promise<ArrayBuffer>;
  /** List objects with a given prefix */
  list(prefix: string): Promise<string[]>;
  /** Check if an object exists */
  exists?(key: string): Promise<boolean>;
}

// ==========================================
// Lance File Format Types
// ==========================================

/**
 * Lance file footer structure (40 bytes)
 * Located at the end of every .lance file
 */
export interface LanceFooter {
  /** Offset to first column metadata */
  columnMeta0Offset: bigint;
  /** Offset to column metadata offset table */
  cmoTableOffset: bigint;
  /** Offset to global buffer offset table */
  gboTableOffset: bigint;
  /** Number of global buffers */
  numGlobalBuffers: number;
  /** Number of columns */
  numColumns: number;
  /** Major version number */
  majorVersion: number;
  /** Minor version number */
  minorVersion: number;
}

/**
 * Lance file format magic bytes
 */
export const LANCE_MAGIC = 'LANC';
export const LANCE_FOOTER_SIZE = 40;

// ==========================================
// Manifest Types (from protobuf)
// ==========================================

/**
 * Field definition in schema
 */
export interface LanceField {
  /** Field ID */
  id: number;
  /** Parent field ID (-1 for root) */
  parentId: number;
  /** Field name */
  name: string;
  /** Logical data type */
  logicalType: LanceLogicalType;
  /** Physical encoding type */
  encoding?: LanceEncoding;
  /** Whether field is nullable */
  nullable: boolean;
  /** Child field IDs for nested types */
  children?: number[];
  /** Field metadata as key-value pairs */
  metadata?: Map<string, string>;
  /** Dictionary type info for dictionary-encoded fields */
  dictionary?: LanceDictionary;
}

/**
 * Logical data types supported by Lance
 */
export type LanceLogicalType =
  | { type: 'null' }
  | { type: 'int'; bits: 8 | 16 | 32 | 64; signed: boolean }
  | { type: 'float'; bits: 16 | 32 | 64 }
  | { type: 'binary' }
  | { type: 'utf8' }
  | { type: 'date32' }
  | { type: 'date64' }
  | { type: 'timestamp'; unit: 'second' | 'millisecond' | 'microsecond' | 'nanosecond'; timezone?: string }
  | { type: 'duration'; unit: 'second' | 'millisecond' | 'microsecond' | 'nanosecond' }
  | { type: 'decimal'; precision: number; scale: number; bitWidth: 128 | 256 }
  | { type: 'list'; valueType: LanceLogicalType }
  | { type: 'fixed_size_list'; valueType: LanceLogicalType; dimension: number }
  | { type: 'struct'; fields: LanceField[] }
  | { type: 'blob' };

/**
 * Physical encoding types
 */
export type LanceEncoding =
  | 'plain'
  | 'var_binary'
  | 'dictionary'
  | 'rle'
  | 'miniblock'
  | 'binary';

/**
 * Dictionary encoding info
 */
export interface LanceDictionary {
  /** Offset to dictionary data */
  offset: number;
  /** Dictionary length */
  length: number;
}

/**
 * Data file reference
 */
export interface LanceDataFile {
  /** File path relative to dataset root */
  path: string;
  /** Column IDs contained in file */
  fields: number[];
  /** Metadata about column storage */
  columnIndices: number[];
}

/**
 * Deletion file reference
 */
export interface LanceDeletionFile {
  /** Deletion file type */
  fileType: 'arrow_array' | 'bitmap';
  /** File path */
  path: string;
  /** Read version */
  readVersion: bigint;
  /** Number of deleted rows */
  numDeletedRows: number;
}

/**
 * Data fragment (partition) in a Lance dataset
 */
export interface LanceFragment {
  /** Fragment ID */
  id: number;
  /** Data files in fragment */
  files: LanceDataFile[];
  /** Optional deletion file */
  deletionFile?: LanceDeletionFile;
  /** Physical row count (before deletions) */
  physicalRows: bigint;
}

/**
 * Index metadata
 */
export interface LanceIndexMetadata {
  /** Index UUID */
  uuid: Uint8Array;
  /** Name of the index */
  name: string;
  /** Field IDs indexed */
  fields: number[];
  /** Dataset version when index was created */
  datasetVersion: bigint;
  /** Fragment bitmap (which fragments are indexed) */
  fragmentBitmap?: Uint8Array;
  /** Index-specific details */
  indexDetails: LanceIndexDetails;
}

/**
 * Index type discriminator
 */
export type LanceIndexDetails =
  | { type: 'ivf_pq'; distanceType: DistanceType; numPartitions: number; numSubVectors: number; numBits: number }
  | { type: 'ivf_flat'; distanceType: DistanceType; numPartitions: number }
  | { type: 'hnsw'; distanceType: DistanceType; m: number; efConstruction: number; maxLevel: number };

/**
 * Distance metric types
 */
export type DistanceType = 'l2' | 'cosine' | 'dot';

/**
 * Writer version info
 */
export interface WriterVersion {
  library: string;
  version: string;
}

/**
 * Data storage format
 */
export type DataStorageFormat = 'lance' | 'legacy';

/**
 * Lance manifest structure
 */
export interface LanceManifest {
  /** Schema fields */
  fields: LanceField[];
  /** Data fragments */
  fragments: LanceFragment[];
  /** Snapshot version number */
  version: bigint;
  /** Writer library info */
  writerVersion?: WriterVersion;
  /** Reader feature flags */
  readerFeatureFlags: bigint;
  /** Writer feature flags */
  writerFeatureFlags: bigint;
  /** Offset to index section in manifest */
  indexSection?: number;
  /** Data storage format */
  dataFormat: DataStorageFormat;
  /** Index metadata (parsed from index section) */
  indices?: LanceIndexMetadata[];
}

// ==========================================
// Vector Index Types
// ==========================================

/**
 * IVF (Inverted File) structure
 */
export interface IvfStructure {
  /** Centroid vectors [numPartitions x dimension] */
  centroids: Float32Array;
  /** Starting offset for each partition */
  offsets: BigUint64Array;
  /** Row count per partition */
  lengths: Uint32Array;
  /** K-means training loss */
  loss?: number;
  /** Number of partitions */
  numPartitions: number;
  /** Vector dimension */
  dimension: number;
}

/**
 * Product Quantizer codebook
 */
export interface PqCodebook {
  /** Codebook data [256 x numSubVectors x subDim] */
  codebook: Float32Array;
  /** Number of sub-vectors */
  numSubVectors: number;
  /** Bits per code (usually 8) */
  numBits: number;
  /** Distance type used */
  distanceType: DistanceType;
  /** Sub-vector dimension */
  subDim: number;
}

/**
 * HNSW graph parameters
 */
export interface HnswParams {
  /** Entry point node ID */
  entryPoint: bigint;
  /** Maximum graph level */
  maxLevel: number;
  /** Number of connections per node */
  m: number;
  /** Construction-time search parameter */
  efConstruction: number;
  /** Level start offsets */
  levelOffsets: number[];
}

// ==========================================
// Search Types
// ==========================================

/**
 * Vector search options
 */
export interface VectorSearchOptions {
  /** Number of nearest neighbors to return */
  k: number;
  /** Number of IVF partitions to probe (IVF-PQ only) */
  nprobes?: number;
  /** Search expansion factor (HNSW only) */
  efSearch?: number;
  /** Optional row filter */
  filter?: RowFilter;
  /** Include distance in results */
  includeDistance?: boolean;
  /** Pre-load centroids before search */
  preloadCentroids?: boolean;
}

/**
 * Row filter for pre-filtering search
 */
export type RowFilter =
  | { type: 'include'; rowIds: Set<bigint> }
  | { type: 'exclude'; rowIds: Set<bigint> }
  | { type: 'predicate'; fn: (rowId: bigint) => boolean };

/**
 * Vector search result
 */
export interface SearchResult {
  /** Row ID in the dataset */
  rowId: bigint;
  /** Distance to query vector (lower is closer) */
  distance: number;
  /** Normalized similarity score (higher is closer, 0-1 range) */
  score: number;
}

// ==========================================
// Reader Configuration
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
 * LanceReader configuration options
 */
export interface LanceReaderConfig {
  /** Storage adapter for reading files */
  storage: StorageAdapter;
  /** Base path to dataset directory */
  basePath: string;
  /** Caching strategy */
  cacheStrategy?: 'none' | 'lru' | 'session';
  /** Maximum cache size in bytes */
  maxCacheSize?: number;
  /** Maximum number of vector indices to cache (default: 10) */
  maxIndexCacheSize?: number;
  /** Specific version to read (latest if not specified) */
  version?: number;
  /**
   * Lazy loading configuration for vector indices
   * Controls when and how index components are loaded
   */
  lazyLoad?: Partial<LazyLoadConfig>;
}

// ==========================================
// Partition Data Types
// ==========================================

/**
 * Partition data for IVF search
 */
export interface PartitionData {
  /** Row IDs in partition */
  rowIds: BigUint64Array;
  /** PQ codes [numRows x numSubVectors] */
  pqCodes: Uint8Array;
  /** Number of rows */
  numRows: number;
}

// ==========================================
// Internal Reader Types
// ==========================================

/**
 * Global buffer offset entry
 */
export interface GlobalBufferEntry {
  /** Position in file */
  position: bigint;
  /** Size of buffer */
  size: bigint;
}

/**
 * Column metadata offset entry
 */
export interface ColumnMetadataEntry {
  /** Position in file */
  position: bigint;
  /** Size of metadata */
  size: bigint;
}

// ==========================================
// Tensor Types (from protobuf)
// ==========================================

/**
 * Tensor data type
 */
export type TensorDataType =
  | 'float16'
  | 'float32'
  | 'float64'
  | 'int8'
  | 'int16'
  | 'int32'
  | 'int64'
  | 'uint8'
  | 'uint16'
  | 'uint32'
  | 'uint64';

/**
 * Tensor structure from protobuf
 */
export interface Tensor {
  /** Data type */
  dataType: TensorDataType;
  /** Shape dimensions */
  shape: number[];
  /** Raw data bytes */
  data: ArrayBuffer;
}
