/**
 * Types for @evodb/writer
 * Parent DO that buffers CDC from child DOs and writes columnar blocks to R2
 */

import type { WalOp, WalEntry as CoreWalEntry, Schema as CoreSchema, BlockOptions as CoreBlockOptions } from '@evodb/core';
import {
  BUFFER_SIZE_2MB,
  BUFFER_SIZE_4MB,
  BUFFER_SIZE_16MB,
  BUFFER_SIZE_32MB,
  BUFFER_SIZE_128MB,
  BUFFER_SIZE_256MB,
  BUFFER_SIZE_500MB,
  BUFFER_SIZE_512MB,
  BUFFER_SIZE_1GB,
  BUFFER_SIZE_2GB,
  BUFFER_SIZE_5GB,
  DEFAULT_BUFFER_SIZE,
  TIMEOUT_5S,
  MIN_COMPACT_BLOCKS,
  DEFAULT_MAX_RETRIES,
  TIMEOUT_100MS,
} from '@evodb/core';

// Re-export types for consumers
export type WalEntry = CoreWalEntry;
export type Schema = CoreSchema;
export type BlockOptions = CoreBlockOptions;

// =============================================================================
// Partition Size Modes
// =============================================================================

/**
 * Partition size modes for different use cases:
 * - 'do-sqlite': 2MB blocks for DO SQLite blob storage
 * - 'edge-cache': 500MB blocks for standard edge cache
 * - 'enterprise': 5GB blocks for enterprise edge cache
 */
export type PartitionMode = 'do-sqlite' | 'edge-cache' | 'enterprise';

/**
 * Partition mode configurations
 */
export const PARTITION_MODES: Record<PartitionMode, PartitionModeConfig> = {
  'do-sqlite': {
    targetBlockSize: BUFFER_SIZE_2MB,
    maxBlockSize: BUFFER_SIZE_4MB,
    targetCompactSize: BUFFER_SIZE_16MB,
    maxCompactSize: BUFFER_SIZE_32MB,
    description: 'Optimized for DO SQLite blob storage',
  },
  'edge-cache': {
    targetBlockSize: BUFFER_SIZE_128MB,
    maxBlockSize: BUFFER_SIZE_256MB,
    targetCompactSize: BUFFER_SIZE_500MB,
    maxCompactSize: BUFFER_SIZE_512MB,
    description: 'Optimized for standard Cloudflare edge cache',
  },
  'enterprise': {
    targetBlockSize: BUFFER_SIZE_1GB,
    maxBlockSize: BUFFER_SIZE_2GB,
    targetCompactSize: BUFFER_SIZE_5GB,
    maxCompactSize: BUFFER_SIZE_5GB,
    description: 'Optimized for enterprise edge cache (5GB limit)',
  },
};

/**
 * Partition mode configuration
 */
export interface PartitionModeConfig {
  /** Target block size in bytes */
  targetBlockSize: number;
  /** Maximum block size in bytes */
  maxBlockSize: number;
  /** Target size after compaction */
  targetCompactSize: number;
  /** Maximum size after compaction */
  maxCompactSize: number;
  /** Human-readable description */
  description: string;
}

// =============================================================================
// Writer Configuration
// =============================================================================

/**
 * Configuration options for LakehouseWriter
 */
export interface WriterOptions {
  /** R2 bucket for block storage */
  r2Bucket: R2Bucket;

  /** Table location path in R2 (e.g., 'com/example/api/users') */
  tableLocation: string;

  /** Schema ID for blocks */
  schemaId?: number;

  /** Partition mode (default: 'do-sqlite') */
  partitionMode?: PartitionMode;

  // Buffer settings
  /** Max entries before automatic flush (default: 10000) */
  bufferSize: number;
  /** Max milliseconds before automatic flush (default: 5000) */
  bufferTimeout: number;

  // Block settings (override partition mode if provided)
  /** Target block size in bytes */
  targetBlockSize?: number;
  /** Maximum block size in bytes */
  maxBlockSize?: number;

  // Compaction settings (override partition mode if provided)
  /** Minimum small blocks to trigger compaction (default: 4) */
  minCompactBlocks: number;
  /** Target size after compaction in bytes */
  targetCompactSize?: number;

  // Retry settings
  /** Maximum retry attempts for R2 writes (default: 3) */
  maxRetries: number;
  /** Retry backoff base in milliseconds (default: 100) */
  retryBackoffMs: number;
}

/**
 * Resolved writer options with partition mode applied
 */
export interface ResolvedWriterOptions extends Omit<WriterOptions, 'partitionMode' | 'targetBlockSize' | 'maxBlockSize' | 'targetCompactSize'> {
  targetBlockSize: number;
  maxBlockSize: number;
  targetCompactSize: number;
  partitionMode: PartitionMode;
}

/**
 * Default writer options
 */
export const DEFAULT_WRITER_OPTIONS: Omit<WriterOptions, 'r2Bucket' | 'tableLocation'> = {
  schemaId: 0,
  partitionMode: 'do-sqlite',
  bufferSize: DEFAULT_BUFFER_SIZE,
  bufferTimeout: TIMEOUT_5S,
  minCompactBlocks: MIN_COMPACT_BLOCKS,
  maxRetries: DEFAULT_MAX_RETRIES,
  retryBackoffMs: TIMEOUT_100MS,
};

/**
 * Resolve writer options with partition mode defaults
 */
export function resolveWriterOptions(
  options: Partial<WriterOptions> & Pick<WriterOptions, 'r2Bucket' | 'tableLocation'>
): ResolvedWriterOptions {
  const mode = options.partitionMode ?? DEFAULT_WRITER_OPTIONS.partitionMode ?? 'do-sqlite';
  const modeConfig = PARTITION_MODES[mode];

  return {
    r2Bucket: options.r2Bucket,
    tableLocation: options.tableLocation,
    schemaId: options.schemaId ?? DEFAULT_WRITER_OPTIONS.schemaId,
    partitionMode: mode,
    bufferSize: options.bufferSize ?? DEFAULT_WRITER_OPTIONS.bufferSize,
    bufferTimeout: options.bufferTimeout ?? DEFAULT_WRITER_OPTIONS.bufferTimeout,
    targetBlockSize: options.targetBlockSize ?? modeConfig.targetBlockSize,
    maxBlockSize: options.maxBlockSize ?? modeConfig.maxBlockSize,
    minCompactBlocks: options.minCompactBlocks ?? DEFAULT_WRITER_OPTIONS.minCompactBlocks,
    targetCompactSize: options.targetCompactSize ?? modeConfig.targetCompactSize,
    maxRetries: options.maxRetries ?? DEFAULT_WRITER_OPTIONS.maxRetries,
    retryBackoffMs: options.retryBackoffMs ?? DEFAULT_WRITER_OPTIONS.retryBackoffMs,
  };
}

// =============================================================================
// CDC Types
// =============================================================================

/**
 * CDC entry received from child DO
 */
export interface CDCEntry {
  /** Log sequence number (unique, monotonically increasing) */
  lsn: bigint;
  /** Timestamp when the change occurred */
  timestamp: bigint;
  /** Operation type */
  op: WalOp;
  /** Source DO ID that generated this entry */
  sourceDoId: string;
  /** Document data (JSON-serializable) */
  data: unknown;
}

/**
 * Batch of CDC entries from a single source
 */
export interface CDCBatch {
  /** Source DO ID */
  sourceDoId: string;
  /** Sequence number for acknowledgment */
  sequenceNumber: bigint;
  /** WAL entries */
  entries: WalEntry[];
}

/**
 * CDC message format (for WebSocket/RPC)
 */
export interface CDCMessage {
  /** Message type */
  type: 'cdc' | 'ack' | 'heartbeat';
  /** Source DO ID */
  sourceDoId: string;
  /** Sequence number */
  sequenceNumber: bigint;
  /** Entries (for cdc type) */
  entries?: WalEntry[];
}

// =============================================================================
// Buffer Types
// =============================================================================

/**
 * Buffer state
 */
export interface BufferState {
  /** Current entries in buffer */
  entries: WalEntry[];
  /** Estimated size in bytes */
  estimatedSize: number;
  /** Minimum LSN in buffer */
  minLsn: bigint;
  /** Maximum LSN in buffer */
  maxLsn: bigint;
  /** Time when first entry was added */
  firstEntryTime: number;
  /** Per-source tracking for acknowledgment */
  sourceCursors: Map<string, bigint>;
}

/**
 * Buffer statistics
 */
export interface BufferStats {
  /** Number of entries in buffer */
  entryCount: number;
  /** Estimated size in bytes */
  estimatedSize: number;
  /** Time since first entry (ms) */
  ageMs: number;
  /** Number of unique sources */
  sourceCount: number;
  /** Whether buffer is ready to flush */
  readyToFlush: boolean;
}

// =============================================================================
// Block Types
// =============================================================================

/**
 * Block metadata
 */
export interface BlockMetadata {
  /** Unique block ID */
  id: string;
  /** R2 key path */
  r2Key: string;
  /** Row count */
  rowCount: number;
  /** Size in bytes */
  sizeBytes: number;
  /** Minimum LSN */
  minLsn: bigint;
  /** Maximum LSN */
  maxLsn: bigint;
  /** Creation timestamp */
  createdAt: number;
  /** Whether block has been compacted */
  compacted: boolean;
  /** Column statistics for zone maps */
  columnStats?: ColumnZoneMap[];
}

/**
 * Column zone map for predicate pushdown
 */
export interface ColumnZoneMap {
  /** Column path */
  path: string;
  /** Minimum value */
  min: unknown;
  /** Maximum value */
  max: unknown;
  /** Null count */
  nullCount: number;
  /** Distinct value estimate */
  distinctEst: number;
}

/**
 * Block location (R2 or DO storage)
 */
export type BlockLocation = 'r2' | 'do';

// =============================================================================
// Flush Result Types
// =============================================================================

/**
 * Result of a flush operation
 */
export interface FlushResult {
  /** Status of the flush */
  status: 'persisted' | 'buffered' | 'empty';
  /** Where the block was written */
  location?: BlockLocation;
  /** Block metadata (if written) */
  block?: BlockMetadata;
  /** Number of entries flushed */
  entryCount: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Whether a retry is scheduled */
  retryScheduled?: boolean;
  /** Error message (if buffered due to failure) */
  error?: string;
}

/**
 * Result of a compaction operation
 */
export interface CompactResult {
  /** Status of the compaction */
  status: 'completed' | 'skipped' | 'failed';
  /** Blocks merged */
  blocksMerged: number;
  /** New block created (if completed) */
  newBlock?: BlockMetadata;
  /** Blocks deleted */
  blocksDeleted: string[];
  /** Duration in milliseconds */
  durationMs: number;
  /** Error message (if failed) */
  error?: string;
}

// =============================================================================
// Writer Statistics
// =============================================================================

/**
 * Comprehensive writer statistics
 */
export interface WriterStats {
  /** Buffer statistics */
  buffer: BufferStats;

  /** Partition mode in use */
  partitionMode: PartitionMode;

  /** Block statistics */
  blocks: {
    /** Total blocks written to R2 */
    r2BlockCount: number;
    /** Total blocks in DO storage (pending) */
    pendingBlockCount: number;
    /** Small blocks eligible for compaction */
    smallBlockCount: number;
    /** Total rows written */
    totalRows: number;
    /** Total bytes written to R2 */
    totalBytesR2: number;
  };

  /** Operation statistics */
  operations: {
    /** Total CDC entries received */
    cdcEntriesReceived: number;
    /** Total flushes performed */
    flushCount: number;
    /** Total compactions performed */
    compactCount: number;
    /** Total R2 write failures */
    r2WriteFailures: number;
    /** Total retries performed */
    retryCount: number;
  };

  /** Timing statistics */
  timing: {
    /** Last flush time */
    lastFlushTime: number | null;
    /** Last compaction time */
    lastCompactTime: number | null;
    /** Average flush duration (ms) */
    avgFlushDurationMs: number;
    /** Average compaction duration (ms) */
    avgCompactDurationMs: number;
  };

  /** Per-source statistics */
  sources: Map<string, SourceStats>;
}

/**
 * Per-source statistics
 */
export interface SourceStats {
  /** Source DO ID */
  sourceDoId: string;
  /** Total entries received */
  entriesReceived: number;
  /** Last LSN received */
  lastLsn: bigint;
  /** Last entry timestamp */
  lastEntryTime: number;
  /** Connection status */
  connected: boolean;
}

// =============================================================================
// Manifest Types (integration with @evodb/lakehouse)
// =============================================================================

/**
 * Manifest entry for a block
 */
export interface ManifestEntry {
  /** Block ID */
  blockId: string;
  /** R2 key */
  r2Key: string;
  /** Row count */
  rowCount: number;
  /** Size in bytes */
  sizeBytes: number;
  /** LSN range */
  lsnRange: { min: bigint; max: bigint };
  /** Partition values */
  partitionValues?: Record<string, unknown>;
  /** Column stats for zone maps */
  columnStats: ColumnZoneMap[];
}

/**
 * Manifest update operation
 */
export interface ManifestUpdate {
  /** Added blocks */
  added: ManifestEntry[];
  /** Deleted block IDs */
  deleted: string[];
  /** Snapshot ID */
  snapshotId: number;
  /** Timestamp */
  timestamp: number;
}

// =============================================================================
// Durable Object Types
// =============================================================================

/**
 * Environment bindings for Parent DO
 */
export interface ParentDOEnv {
  /** R2 bucket for block storage */
  R2_BUCKET: R2Bucket;
  /** Optional: Child DO namespace for routing */
  CHILD_DO?: DurableObjectNamespace;
}

/**
 * Persistent state stored in DO
 */
export interface PersistentState {
  /** Last assigned block sequence number */
  lastBlockSeq: number;
  /** Pending blocks in DO storage (failed R2 writes) */
  pendingBlocks: string[];
  /** Per-source cursors for acknowledgment */
  sourceCursors: Record<string, string>; // bigint as string
  /** Block index for querying */
  blockIndex: BlockMetadata[];
  /** Last snapshot ID */
  lastSnapshotId: number;
  /** Partition mode */
  partitionMode: PartitionMode;
  /** Writer stats (persisted for recovery) */
  stats: {
    cdcEntriesReceived: number;
    flushCount: number;
    compactCount: number;
    r2WriteFailures: number;
  };
}

// =============================================================================
// RPC Types (integration with @evodb/rpc)
// =============================================================================

/**
 * RPC message envelope
 */
export interface RPCMessage<T = unknown> {
  /** Message ID for correlation */
  id: string;
  /** Message type */
  type: string;
  /** Payload */
  payload: T;
  /** Timestamp */
  timestamp: number;
}

/**
 * CDC RPC payload
 */
export interface CDCRPCPayload {
  /** Source DO ID */
  sourceDoId: string;
  /** Sequence number */
  sequenceNumber: string; // bigint as string
  /** Serialized WAL entries */
  entries: Uint8Array;
}

/**
 * Acknowledgment RPC payload
 */
export interface AckRPCPayload {
  /** Source DO ID */
  sourceDoId: string;
  /** Acknowledged sequence number */
  sequenceNumber: string; // bigint as string;
  /** Success flag */
  success: boolean;
  /** Error message */
  error?: string;
}

// =============================================================================
// R2 Types
// =============================================================================

/**
 * R2 bucket interface (from @cloudflare/workers-types)
 */
export interface R2Bucket {
  put(key: string, value: ArrayBuffer | Uint8Array | string | ReadableStream | Blob, options?: R2PutOptions): Promise<R2Object>;
  get(key: string, options?: R2GetOptions): Promise<R2ObjectBody | null>;
  delete(keys: string | string[]): Promise<void>;
  list(options?: R2ListOptions): Promise<R2Objects>;
  head(key: string): Promise<R2Object | null>;
}

export interface R2PutOptions {
  httpMetadata?: R2HTTPMetadata;
  customMetadata?: Record<string, string>;
  md5?: string;
  onlyIf?: R2Conditional;
}

export interface R2GetOptions {
  range?: R2Range;
  onlyIf?: R2Conditional;
}

export interface R2ListOptions {
  limit?: number;
  prefix?: string;
  cursor?: string;
  delimiter?: string;
  include?: ('httpMetadata' | 'customMetadata')[];
}

export interface R2HTTPMetadata {
  contentType?: string;
  contentLanguage?: string;
  contentDisposition?: string;
  contentEncoding?: string;
  cacheControl?: string;
  cacheExpiry?: Date;
}

export interface R2Conditional {
  etagMatches?: string;
  etagDoesNotMatch?: string;
  uploadedBefore?: Date;
  uploadedAfter?: Date;
}

export interface R2Range {
  offset?: number;
  length?: number;
  suffix?: number;
}

export interface R2Object {
  key: string;
  version: string;
  size: number;
  etag: string;
  httpEtag: string;
  checksums: R2Checksums;
  uploaded: Date;
  httpMetadata?: R2HTTPMetadata;
  customMetadata?: Record<string, string>;
}

export interface R2ObjectBody extends R2Object {
  body: ReadableStream;
  bodyUsed: boolean;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  json<T>(): Promise<T>;
  blob(): Promise<Blob>;
}

export interface R2Objects {
  objects: R2Object[];
  truncated: boolean;
  cursor?: string;
  delimitedPrefixes: string[];
}

export interface R2Checksums {
  md5?: ArrayBuffer;
  sha1?: ArrayBuffer;
  sha256?: ArrayBuffer;
  sha384?: ArrayBuffer;
  sha512?: ArrayBuffer;
}
