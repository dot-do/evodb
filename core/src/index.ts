// @dotdo/poc-columnar-json-lite
// Ultra-minimal columnar JSON storage for Cloudflare DO SQLite blobs

// Types
export {
  Type,
  Encoding,
  WalOp,
  MAGIC,
  VERSION,
  HEADER_SIZE,
  FOOTER_SIZE,
  type Column,
  type EncodedColumn,
  type ColumnStats,
  type BlockHeader,
  type BlockOptions,
  type WalEntry,
  type Schema,
  type SchemaColumn,
  type StorageAdapter,
  // Branded Types for compile-time ID safety
  type BlockId,
  type SnapshotId,
  type BatchId,
  type WalId,
  type SchemaId,
  type TableId,
  // Branded type constructors (validated)
  blockId,
  snapshotId,
  batchId,
  walId,
  schemaId,
  tableId,
  // Branded type constructors (unvalidated, for internal use)
  unsafeBlockId,
  unsafeSnapshotId,
  unsafeBatchId,
  unsafeWalId,
  unsafeSchemaId,
  unsafeTableId,
  // Type guards
  isValidBlockId,
  isValidSnapshotId,
  isValidBatchId,
  isValidWalId,
  isValidSchemaId,
  isValidTableId,
  // Exhaustiveness helper
  assertNever,
} from './types.js';

// JSON Shredding
export {
  shred,
  unshred,
  extractPath,
  extractPaths,
  coerceToType,
  appendRows,
  buildPathIndex,
} from './shred.js';

// Encoding
export {
  encode,
  decode,
  unpackBits,
  encodeDict,
  encodeDelta,
  // Fast decode paths for snippet constraints
  fastDecodeInt32,
  fastDecodeFloat64,
  fastDecodeDeltaInt32,
  iterateNonNullIndices,
  batchDecode,
  type FastDecodeOptions,
} from './encode.js';

// String Intern Pool (LRU)
export {
  LRUStringPool,
  internString,
  getStringPoolStats,
  resetStringPool,
  type StringPoolStats,
} from './string-intern-pool.js';

// Block Format
export { writeBlock, readBlock, getBlockStats } from './block.js';

// WAL
export {
  createWalEntry,
  serializeWalEntry,
  deserializeWalEntry,
  batchWalEntries,
  unbatchWalEntries,
  getWalRange,
} from './wal.js';

// Schema
export {
  inferSchema,
  serializeSchema,
  deserializeSchema,
  isCompatible,
  migrateColumns,
  schemaDiff,
  type SchemaDiff,
} from './schema.js';

// Storage
export {
  // DO adapters (original)
  createDOAdapter,
  createDOKVAdapter,
  createMemoryAdapter,
  makeBlockId,
  parseBlockId,
  makeWalId,
  parseWalId,
  // Object storage adapters (R2-compatible)
  type ObjectStorageAdapter,
  type ObjectMetadata,
  type R2BucketLike,
  type R2ObjectLike,
  type R2ObjectsLike,
  type R2PutOptionsLike,
  type R2ListOptionsLike,
  R2ObjectStorageAdapter,
  MemoryObjectStorageAdapter,
  createR2ObjectAdapter,
  createMemoryObjectAdapter,
  wrapStorageBackend,
} from './storage.js';

// Merge/Compaction
export {
  shouldMerge,
  selectBlocksForMerge,
  mergeBlocks,
  createMergeScheduler,
  getMergeStats,
  type MergeConfig,
  type MergeState,
} from './merge.js';

// Partition Modes
// Three deployment targets: DO-SQLite (2MB), Standard (500MB), Enterprise (5GB)
export {
  // Types
  type PartitionMode,
  type AccountTier,
  type PartitionModeConfig,
  type PartitionCalculation,
  type PartitionPathInfo,
  type ModeSelectionResult,
  // Constants
  DO_SQLITE_MAX_BYTES,
  STANDARD_MAX_BYTES,
  ENTERPRISE_MAX_BYTES,
  DO_SQLITE_BLOCK_SIZE,
  STANDARD_BLOCK_SIZE,
  ENTERPRISE_BLOCK_SIZE,
  DO_SQLITE_CONFIG,
  STANDARD_CONFIG,
  ENTERPRISE_CONFIG,
  PARTITION_MODE_CONFIGS,
  // Config getters
  getPartitionModeConfig,
  // Core functions
  calculatePartitions,
  getPartitionPath,
  getAllPartitionPaths,
  parsePartitionPath,
  selectPartitionMode,
  // Utilities
  formatBytes,
  fitsInSinglePartition,
  getRecommendedBlockSize,
  validateModeForDataSize,
  calculatePartitionBoundaries,
  estimateDataSize,
  getModeByMaxSize,
} from './partition-modes.js';

// Query Operations (shared across @evodb/query and @evodb/reader)
export {
  // Types
  type FilterOperator,
  type FilterPredicate,
  type SortDirection,
  type SortSpec,
  type AggregateFunction,
  type AggregateSpec,
  type FilterEvaluator,
  type AggregationEngine,
  type ResultProcessor,
  // Filter operations
  evaluateFilter,
  evaluateFilters,
  createFilterEvaluator,
  // Sort operations
  sortRows,
  limitRows,
  compareForSort,
  compareValues,
  createResultProcessor,
  // Aggregation operations
  computeAggregate,
  computeAggregations,
  createAggregationEngine,
  // Utilities
  getNestedValue,
  setNestedValue,
  likePatternToRegex,
  // All-in-one namespace
  queryOps,
} from './query-ops.js';

// Snippet-Optimized Format
// Optimized for Cloudflare Snippets: 5ms CPU, 32MB RAM, 5 subrequests
export {
  // Constants
  SNIPPET_MAGIC,
  SNIPPET_VERSION,
  CHUNK_SIZE,
  SNIPPET_HEADER_SIZE,
  ZONE_MAP_SIZE,
  COLUMN_DIR_ENTRY_SIZE,
  BLOOM_BITS_PER_ELEMENT,
  BLOOM_HASH_COUNT,
  MAX_DICT_SIZE,
  BIT_WIDTHS,
  // Types
  SnippetEncoding,
  type SnippetHeader,
  type ColumnDirEntry,
  type ZoneMap,
  type SnippetColumn,
  type DecodeOptions,
  type DecodedColumn,
  // Encoding helpers
  computeBitWidth,
  bitPack,
  bitUnpack,
  deltaEncode,
  deltaDecode,
  // Bloom filter
  BloomFilter,
  // Zone map
  computeZoneMap,
  canSkipByZoneMap,
  // Dictionary encoding
  buildSortedDict,
  dictBinarySearch,
  encodeSortedDict,
  decodeSortedDict,
  // Column encoding/decoding
  encodeSnippetColumn,
  decodeSnippetColumn,
  // Bitmap
  packBitmap,
  unpackBitmap,
  // Zero-copy decode
  zeroCopyDecodeInt32,
  zeroCopyDecodeFloat64,
  // Chunk I/O
  writeSnippetChunk,
  readSnippetHeader,
  readSnippetChunk,
} from './snippet-format.js';
