/**
 * @evodb/lance-reader
 *
 * Pure TypeScript Lance format reader for vector search in Cloudflare Workers.
 * No external dependencies, target bundle size <50KB minified.
 *
 * @example
 * ```typescript
 * import { LanceReader, R2StorageAdapter } from '@evodb/lance-reader';
 *
 * const reader = new LanceReader({
 *   storage: new R2StorageAdapter(env.MY_BUCKET),
 *   basePath: 'datasets/embeddings',
 * });
 *
 * await reader.open();
 *
 * const results = await reader.search('embedding', queryVector, {
 *   k: 10,
 *   nprobes: 20,
 * });
 * ```
 *
 * @packageDocumentation
 */

// ==========================================
// Core Types
// ==========================================

export type {
  // Storage
  StorageAdapter,

  // Lance File Format
  LanceFooter,
  LanceManifest,
  LanceField,
  LanceFragment,
  LanceDataFile,
  LanceDeletionFile,
  LanceIndexMetadata,
  LanceIndexDetails,
  LanceLogicalType,
  LanceEncoding,
  LanceDictionary,
  WriterVersion,
  DataStorageFormat,

  // Vector Index
  IvfStructure,
  PqCodebook,
  HnswParams,
  DistanceType,

  // Search
  VectorSearchOptions,
  SearchResult,
  RowFilter,
  PartitionData,

  // Configuration
  LanceReaderConfig,
  LazyLoadConfig,

  // Internal
  GlobalBufferEntry,
  ColumnMetadataEntry,
  Tensor,
  TensorDataType,
} from './types.js';

export {
  LANCE_MAGIC,
  LANCE_FOOTER_SIZE,
} from './types.js';

// ==========================================
// Main Reader
// ==========================================

export {
  LanceReader,
  LanceFileReader,
  VectorIndex,
  createLanceReader,
  searchLanceDataset,
} from './reader.js';

// ==========================================
// Vector Indices
// ==========================================

export {
  IvfPqIndex,
  normalizeVector,
  computeL2Distance,
  computeCosineSimilarity,
  computeDotProduct,
  buildIvfPqIndex,
} from './ivf-pq.js';

export type { BuildIvfPqOptions } from './ivf-pq.js';

export { HnswIndex } from './hnsw.js';

// ==========================================
// Storage Adapters
// ==========================================

export {
  R2StorageAdapter,
  MemoryStorageAdapter,
  FetchStorageAdapter,
  CachingStorageAdapter,
  // Adapter for @evodb/core unified Storage interface (Issue evodb-pyo)
  createLanceStorageAdapter,
} from './r2-adapter.js';

export type {
  R2Bucket,
  R2Range,
  R2Object,
  R2ObjectBody,
  R2Checksums,
  R2HTTPMetadata,
  R2ListOptions,
  R2Objects,
} from './r2-adapter.js';

// ==========================================
// Protobuf Parser
// ==========================================

export {
  ProtobufReader,
  parseManifest,
  parseIndexSection,
  parseIvf,
  parsePqCodebook,
  parseSchemaMetadata,
  parseColumnStatistics,
  readDeletionFile,
} from './protobuf.js';

export type { ColumnStatistics } from './protobuf.js';

// ==========================================
// Arrow IPC Reader
// ==========================================

export {
  ArrowIpcReader,
  ArrowType,
  readPartitionData,
  readSchemaMetadata as readArrowSchemaMetadata,
  getLanceIvfBufferIndex,
  parseLanceIndexMetadata,
} from './arrow.js';

export type {
  ArrowField,
  ArrowSchema,
  ArrowRecordBatch,
} from './arrow.js';

// ==========================================
// Lazy Loading
// ==========================================

export {
  // Core lazy loading classes
  LazyIvfPqIndex,
  LazyHnswIndex,
  LazyLoader,
  createLazyIndexFactory,
  createVectorIndex,
  dynamicImport,
  DEFAULT_LAZY_LOAD_CONFIG,

  // Component-level lazy loading
  lazyModuleLoader,
  clearModuleCache,

  // Streaming partition loading
  StreamingPartitionLoader,
  DEFAULT_STREAMING_CONFIG,

  // Progressive loading
  ProgressiveLoader,

  // Component registry
  LazyComponentRegistry,

  // Memory-aware loading
  DEFAULT_MEMORY_AWARE_CONFIG,
  estimateMemoryUsage,

  // Lazy reader components
  getLazyProtobufParser,
  getLazyArrowReader,

  // Batch loading
  batchLoadPartitions,
  DEFAULT_BATCH_LOAD_OPTIONS,
} from './lazy-loader.js';

export type {
  // Configuration types
  LazyLoadConfig as LazyLoaderConfig,
  LoadingState,
  IvfPqLoadingState,
  HnswLoadingState,

  // Streaming types
  StreamingPartitionConfig,
  StreamingPartitionData,

  // Progress types
  ProgressCallback,

  // Component registry types
  ComponentStatus,

  // Memory-aware types
  MemoryAwareConfig,

  // Lazy reader interfaces
  LazyProtobufParser,
  LazyArrowReader,

  // Batch loading types
  BatchLoadOptions,
} from './lazy-loader.js';
