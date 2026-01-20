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
