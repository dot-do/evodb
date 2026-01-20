// @evodb/core
// Ultra-minimal columnar JSON storage for Cloudflare DO SQLite blobs

// =============================================================================
// EvoDB High-Level Facade
// =============================================================================

export {
  EvoDB,
  EvoDBError,
  QueryBuilder,
  SchemaManager,
  type EvoDBConfig,
  type EvoDBStorageBucket,
  type EvoDBStorageObject,
  type EvoDBPutOptions,
  type EvoDBListOptions,
  type EvoDBObjectList,
  type FieldDefinition,
  type SchemaDefinition,
  type RelationshipOptions,
  type EnforceOptions,
  type InferredSchema,
  type QueryResult,
  type UserFilterOperator,
} from './evodb.js';

// =============================================================================
// Core Types
// =============================================================================
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
  // Unified Table Schema Types (for lakehouse/manifest layer)
  type TableColumnType,
  type TableSchemaColumn,
  type TableSchema,
  // Unified RPC WAL Entry Types (for DO-to-DO communication)
  type RpcWalOperation,
  RpcWalOperationCode,
  type RpcWalOperationCodeValue,
  type RpcWalEntry,
  // Type conversion utilities
  typeEnumToString,
  stringToTypeEnum,
  schemaToTableSchema,
  tableSchemaToSchema,
  walEntryToRpcEntry,
  rpcEntryToWalEntry,
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

// QueryExecutor Interface (unified query execution across @evodb/reader and @evodb/query)
export {
  // Core interface
  type QueryExecutor,
  // Extended interfaces
  type StreamingQueryExecutor,
  type CacheableQueryExecutor,
  // Query types
  type ExecutorQuery,
  type ExecutorPredicate,
  type ExecutorAggregation,
  type ExecutorOrderBy,
  // Result types
  type ExecutorResult,
  type ExecutorStats,
  type StreamingExecutorResult,
  // Plan types
  type ExecutorPlan,
  type ExecutorCost,
  // Cache types
  type ExecutorCacheStats,
  // Type guards
  isStreamingExecutor,
  isCacheableExecutor,
  // Conversion utilities
  toReaderQueryRequest,
  toQueryEngineQuery,
} from './query-executor.js';

// Common Constants
export {
  // Byte sizes
  KB,
  MB,
  GB,
  BUFFER_SIZE_256KB,
  BUFFER_SIZE_1MB,
  BUFFER_SIZE_2MB,
  BUFFER_SIZE_4MB,
  BUFFER_SIZE_16MB,
  BUFFER_SIZE_32MB,
  BUFFER_SIZE_50MB,
  BUFFER_SIZE_64MB,
  BUFFER_SIZE_128MB,
  BUFFER_SIZE_256MB,
  BUFFER_SIZE_500MB,
  BUFFER_SIZE_512MB,
  BUFFER_SIZE_10MB,
  BUFFER_SIZE_100MB,
  BUFFER_SIZE_1GB,
  BUFFER_SIZE_2GB,
  BUFFER_SIZE_5GB,
  BUFFER_SIZE_10GB,
  // Timeout constants
  TIMEOUT_100MS,
  TIMEOUT_1S,
  TIMEOUT_3S,
  TIMEOUT_5S,
  TIMEOUT_10S,
  TIMEOUT_30S,
  TIMEOUT_60S,
  TIMEOUT_5MIN,
  // Count/limit constants
  CRC_TABLE_SIZE,
  DEFAULT_BATCH_SIZE,
  DEFAULT_BUFFER_SIZE,
  MAX_DICTIONARY_SIZE,
  // Retry constants
  DEFAULT_MAX_RETRIES,
  MAX_RECONNECT_ATTEMPTS,
  BACKOFF_MULTIPLIER,
  // Protocol constants
  MAX_MESSAGE_SIZE,
  MAX_FRAME_SIZE,
  RPC_HEADER_SIZE,
  FRAME_HEADER_SIZE,
  BATCH_HEADER_SIZE,
  // Merge/compaction constants
  MIN_COMPACT_BLOCKS,
  MAX_MERGE_BLOCKS,
  // Cache constants
  CACHE_TTL_NONE,
  CACHE_TTL_1H,
  CACHE_TTL_24H,
  // Snippet constraints
  SNIPPET_CPU_LIMIT_MS,
  SNIPPET_MEMORY_LIMIT_MB,
  SNIPPET_SUBREQUEST_LIMIT,
  // Timestamp constants
  MS_PER_SECOND,
  MS_PER_MINUTE,
  MS_PER_HOUR,
  MS_PER_DAY,
  MS_PER_WEEK,
  // Query constants
  MAX_COLUMN_NAME_LENGTH,
  DEFAULT_QUERY_TIMEOUT_MS,
  // Prefetch constants
  DEFAULT_MAX_CONCURRENT_PREFETCH,
  // Helpers
  mbToBytes,
  bytesToMb,
  secToMs,
  msToSec,
} from './constants.js';
