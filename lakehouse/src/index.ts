/**
 * @dotdo/poc-lakehouse-manifest
 * JSON Iceberg-inspired manifest management optimized for Cloudflare R2
 *
 * This package provides:
 * - Table manifest management with snapshots for time-travel
 * - Schema evolution with compatibility checking
 * - Partition specification and pruning
 * - URL-based R2 path organization (reverse hostname)
 * - Integration with columnar-json-lite block format
 */

// =============================================================================
// Types
// =============================================================================

export type {
  // Core table types
  TableManifest,
  SchemaRef,
  SnapshotRef,
  TableStats,

  // Schema types
  Schema,
  SchemaColumn,
  ColumnType,

  // Snapshot types
  Snapshot,
  SnapshotSummary,

  // Manifest file types
  ManifestFile,
  DataFileFormat,
  FileStats,
  ColumnStats,
  LsnRange,

  // Partition types
  PartitionSpec,
  PartitionField,
  PartitionTransform,
  PartitionValue,

  // Query types
  QueryFilter,
  PartitionFilter,
  ColumnFilter,

  // Operation options
  CreateTableOptions,
  AppendFilesOptions,
  CompactOptions,

  // Storage types
  R2StorageAdapter,
  FileMetadata,
} from './types.js';

export {
  TablePaths,
  schemaPath,
  snapshotPath,
  dataFilePath,
  // Manifest versioning
  CURRENT_MANIFEST_VERSION,
  VersionMismatchError,
} from './types.js';

// =============================================================================
// Path Utilities
// =============================================================================

export {
  // URL conversion
  parseUrl,
  urlToR2Path,
  r2PathToUrl,

  // Table paths
  manifestPath,
  schemaDir,
  schemaFilePath,
  dataDir,
  snapshotsDir,
  snapshotFilePath,
  fullDataFilePath,

  // Path manipulation
  joinPath,
  parentPath,
  basename,
  isChildOf,
  relativePath,

  // Partition paths
  buildPartitionPath,
  parsePartitionPath,

  // Time partitioning
  timePartitionValues,
  generateBlockFilename,
} from './path.js';

// =============================================================================
// Schema Operations
// =============================================================================

export {
  createSchema,
  createSchemaRef,
  evolveSchema,
  isCompatible,
  inferSchema,
  serializeSchema,
  deserializeSchema,
  SchemaError,
  type SchemaChange,
  type CompatibilityMode,
} from './schema.js';

// =============================================================================
// Partition Operations
// =============================================================================

export {
  // Spec creation
  createPartitionSpec,
  identityField,
  yearField,
  monthField,
  dayField,
  hourField,
  bucketField,
  truncateField,

  // Partition values
  computePartitionValues,

  // Pruning
  pruneByPartition,
  pruneByColumnStats,
  pruneFiles,
  estimateSelectivity,

  // Optimized pruning
  PartitionIndex,
  createPartitionIndex,
  pruneFilesOptimized,
  analyzePruning,
  type PruningStats,

  // Statistics
  getPartitionDistribution,
  getPartitionRange,
} from './partition.js';

// =============================================================================
// Snapshot Operations
// =============================================================================

export {
  // ID generation
  generateSnapshotId,

  // Snapshot creation
  createAppendSnapshot,
  createOverwriteSnapshot,
  createDeleteSnapshot,
  createCompactSnapshot,
  createSnapshotRef,
  snapshotFilePath as buildSnapshotPath,

  // Time-travel
  findSnapshotById,
  findSnapshotAsOf,
  getSnapshotHistory,
  getAncestorIds,
  isAncestorOf,

  // Diff
  diffSnapshots,
  type SnapshotDiff,

  // Query
  getFilesForQuery,
  getSnapshotRowCount,
  getSnapshotSizeBytes,

  // Retention
  getExpiredSnapshots,
  getOrphanedFiles,
  type ExpireSnapshotsOptions,

  // Serialization
  serializeSnapshot,
  deserializeSnapshot,

  // Time-travel optimizations
  SnapshotCache,
  createSnapshotCache,
  SnapshotChainTraverser,
  createSnapshotTraverser,
  TimeTravelQuery,

  // Manifest delta compression
  computeManifestDelta,
  applyManifestDelta,
  serializeManifestDelta,
  deserializeManifestDelta,
  analyzeDeltaChain,
  type ManifestDelta,
  type DeltaChainStats,
} from './snapshot.js';

// =============================================================================
// Manifest Operations
// =============================================================================

export {
  // Table creation
  generateTableId,
  createTable,

  // File operations
  createManifestFile,
  createFileStats,
  appendFiles,
  overwriteFiles,

  // Schema operations
  addSchema,
  setCurrentSchema,

  // Compaction (basic)
  selectFilesForCompaction,
  compact,

  // Enhanced compaction
  generateCompactionPlan,
  planGroupCompaction,
  analyzeCompaction,
  createCompactionCommit,
  type CompactionPlan,
  type CompactionGroup,
  type CompactionPlanOptions,
  type CompactionResult,
  type CompactionAnalysis,

  // Query
  queryFiles,
  getSnapshot,

  // Properties
  setProperty,
  removeProperty,
  setProperties,

  // Statistics
  recomputeStats,

  // Serialization
  serializeManifest,
  deserializeManifest,
  validateManifest,

  // Helpers
  generateDataFilePath,
  generateTimePartitionedPath,
  ManifestError,
} from './manifest.js';

// =============================================================================
// R2 Storage
// =============================================================================

export {
  // High-level adapter creation (R2StorageAdapter)
  createR2Adapter,
  createMemoryAdapter,
  createR2AdapterFromObjectStorage,
  normalizeStorageBackend,

  // Low-level object storage adapters (legacy)
  type ObjectStorageAdapter,
  type ObjectMetadata,
  R2ObjectStorageAdapter,
  MemoryObjectStorageAdapter,
  createR2ObjectAdapter,
  createMemoryObjectAdapter,
  wrapStorageBackend,

  // Table storage
  TableStorage,
  createMemoryTableStorage,

  // Atomic operations
  atomicCommit,

  // Error types and utilities
  JsonParseError,
  parseJsonWithContext,

  // Type for flexible backend input
  type StorageBackend,

  // R2 types
  type R2BucketLike,
  type R2ObjectLike,
  type R2ObjectsLike,
  type R2PutOptions,
  type R2ListOptions,
} from './r2.js';

// =============================================================================
// UNIFIED STORAGE INTERFACE (Issue evodb-pyo)
// Re-exported from @evodb/core for convenience
// =============================================================================

export {
  // The canonical unified Storage interface
  type Storage,
  type StorageMetadata,
  MemoryStorage,
  R2Storage,
  createStorage,
  createMemoryStorage,
  // Adapter functions - convert between interfaces
  storageToObjectAdapter,
  objectAdapterToStorage,
} from '@evodb/core';
