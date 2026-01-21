/**
 * @evodb/writer - Parent DO CDC Buffer to R2
 *
 * This package provides:
 * - CDC buffering from child DOs
 * - Block writing to R2 (columnar format)
 * - Compaction of small blocks
 * - Parent DO implementation with WebSocket support
 * - Partition modes for different use cases (2MB, 500MB, 5GB)
 *
 * @packageDocumentation
 */

// Types
export {
  // Writer configuration
  type WriterOptions,
  type ResolvedWriterOptions,
  DEFAULT_WRITER_OPTIONS,
  resolveWriterOptions,

  // Partition modes
  type PartitionMode,
  type PartitionModeConfig,
  PARTITION_MODES,

  // Block index limits
  type BlockIndexEvictionPolicy,
  DEFAULT_MAX_BLOCK_INDEX_SIZE,
  DEFAULT_BLOCK_INDEX_EVICTION_POLICY,

  // CDC types
  type CDCEntry,
  type CDCBatch,
  type CDCMessage,

  // Buffer types
  type BufferState,
  type BufferStats,

  // Block types
  type BlockMetadata,
  type ColumnZoneMap,
  type BlockLocation,

  // Result types
  type FlushResult,
  type CompactResult,

  // Statistics
  type WriterStats,
  type SourceStats,

  // Manifest types (for lakehouse integration)
  type ManifestEntry,
  type ManifestUpdate,

  // DO types
  type ParentDOEnv,
  type PersistentState,

  // RPC types
  type RPCMessage,
  type CDCRPCPayload,
  type AckRPCPayload,

  // R2 types (re-exports for convenience)
  type R2Bucket,
  type R2Object,
  type R2ObjectBody,
  type R2Objects,
  type R2PutOptions,
  type R2GetOptions,
  type R2ListOptions,
  type R2HTTPMetadata,
  type R2Conditional,
  type R2Range,
  type R2Checksums,
} from './types.js';

// Buffer management
export {
  CDCBuffer,
  MultiTableBuffer,
  BackpressureController,
  SizeBasedBuffer,
  BufferOverflowError,
  DEFAULT_MAX_BUFFER_SIZE,
  type BufferOptions,
} from './buffer.js';

// R2 writer
export {
  R2BlockWriter,
  BatchR2Writer,
  R2WriterWithManifest,
  makeR2BlockKey,
  parseR2BlockKey,
  generateBlockId,
  type R2WriterOptions,
} from './r2-writer.js';

// Compactor
export {
  BlockCompactor,
  CompactionScheduler,
  TieredCompactor,
  getDefaultCompactionConfig,
  type CompactionStrategy,
  type CompactionConfig,
} from './compactor.js';

// Main writer
export { LakehouseWriter, type DOStorage, type LakehouseWriterDeps } from './writer.js';

// Errors
export { BlockIndexLimitError, WriterError } from './errors.js';

// Atomic flush (crash-safe writes)
export {
  AtomicFlushWriter,
  type AtomicFlushWriterOptions,
  type AtomicFlushResult,
  type FlushRecoveryResult,
  type PendingFlush,
  type FlushStatus,
} from './atomic-flush.js';

// Strategy pattern exports
export {
  // Interfaces
  type CDCBufferStrategy,
  type BlockWriter,
  type BlockWriteResult,
  type CompactionStrategy as ICompactionStrategy, // Renamed to avoid conflict with compactor.js
  type CompactionMetrics,
  type ManifestManager,
  type ManifestBlockEntry,
  type WriterOrchestratorConfig,
  type WriterMetrics,
  // Buffer strategies
  SizeBasedBufferStrategy,
  TimeBasedBufferStrategy,
  HybridBufferStrategy,
  createBufferStrategy,
  createBufferStrategyOfType,
  type BufferStrategyOptions,
  type BufferStrategyType,
  // Block writers
  R2BlockWriterAdapter,
  InMemoryBlockWriter,
  createBlockWriter,
  // Compaction strategies
  SizeBasedCompaction,
  TimeBasedCompaction,
  LsnBasedCompaction,
  NoOpCompaction,
  createCompactionStrategy,
  createCompactionStrategyOfType,
  type CompactionStrategyOptions,
  type CompactionStrategyType,
} from './strategies/index.js';

// Parent DO
export {
  LakehouseParentDO,
  ExampleLakehouseParentDO,
  EdgeCacheParentDO,
  EnterpriseParentDO,
  createLakehouseParentDOClass,
} from './parent-do.js';

// Sharding for horizontal scaling
export {
  // ShardRouter - Hash-based routing to writer shards
  ShardRouter,
  createShardRouter,
  RECOMMENDED_SHARD_COUNTS,
  DEFAULT_SHARD_CONFIG,
  type ShardRouterConfig,
  type ShardKey,
  type ShardInfo,
  type ShardStats,
} from './shard-router.js';

export {
  // ShardRegistry - Shard discovery and metadata for readers
  ShardRegistry,
  createShardRegistry,
  type ShardMetadata,
  type ShardAssignment,
  type RegistryStats,
  type ShardQueryResult,
  type ShardedBlockLocation,
} from './shard-registry.js';

export {
  // ShardedParentDO - Sharded writer coordinator
  ShardCoordinator,
  ShardWriterDO,
  createShardCoordinatorClass,
  createShardWriterDOClass,
  type ShardedParentDOEnv,
  type ShardedParentDOConfig,
} from './sharded-parent-do.js';

// Re-export key types from @evodb/core for convenience
export {
  type WalEntry,
  type WalOp,
  type Schema,
  type Column,
  type EncodedColumn,
  type BlockHeader,
  createWalEntry,
  serializeWalEntry,
  deserializeWalEntry,
  batchWalEntries,
  unbatchWalEntries,
} from '@evodb/core';

/**
 * Version of the writer package
 */
export const VERSION = '0.1.0-rc.1';
