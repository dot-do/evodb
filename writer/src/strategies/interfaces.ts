/**
 * Strategy Interfaces for LakehouseWriter
 *
 * This module defines the core interfaces for the strategy pattern
 * used to separate concerns in the LakehouseWriter:
 * - CDCBufferStrategy: Entry buffering
 * - BlockWriter: R2 writes
 * - CompactionStrategy: Block compaction
 * - ManifestManager: Manifest updates
 */

import type { WalEntry } from '@evodb/core';
import type {
  BlockMetadata,
  BufferStats,
  BufferState,
  CompactResult,
  ColumnZoneMap,
} from '../types.js';

// =============================================================================
// CDC Buffer Strategy
// =============================================================================

/**
 * Strategy for buffering CDC entries before flush
 */
export interface CDCBufferStrategy {
  /**
   * Append entries from a source to the buffer
   * @param sourceDoId - Source DO identifier
   * @param entries - WAL entries to append
   * @returns true if buffer should be flushed
   */
  append(sourceDoId: string, entries: WalEntry[]): boolean;

  /**
   * Flush the buffer and return all entries
   * @returns Buffered entries and their state
   */
  flush(): { entries: WalEntry[]; state: BufferState };

  /**
   * Get current buffer statistics
   */
  stats(): BufferStats;

  /**
   * Clear the buffer without returning entries
   */
  clear(): void;

  /**
   * Check if buffer is empty
   */
  isEmpty(): boolean;

  /**
   * Check if buffer should be flushed based on thresholds
   */
  shouldFlush(): boolean;

  /**
   * Get time until next scheduled flush (ms), or null if empty
   */
  getTimeToFlush(): number | null;

  /**
   * Get source cursors for acknowledgment tracking
   */
  getSourceCursors(): Map<string, bigint>;
}

// =============================================================================
// Block Writer
// =============================================================================

/**
 * Result of a block write operation
 */
export interface BlockWriteResult {
  success: true;
  metadata: BlockMetadata;
} | {
  success: false;
  error: string;
}

/**
 * Strategy for writing blocks to storage (R2 or other)
 */
export interface BlockWriter {
  /**
   * Write WAL entries as a block
   * @param entries - Entries to write
   * @param minLsn - Minimum LSN in the block
   * @param maxLsn - Maximum LSN in the block
   * @param seq - Block sequence number
   */
  write(
    entries: WalEntry[],
    minLsn: bigint,
    maxLsn: bigint,
    seq: number
  ): Promise<BlockWriteResult>;

  /**
   * Write raw block data (for compaction)
   * @param r2Key - Storage key
   * @param data - Raw block data
   * @param metadata - Block metadata
   */
  writeRaw(
    r2Key: string,
    data: Uint8Array,
    metadata: { rowCount: number; compacted: boolean; mergedCount?: number }
  ): Promise<void>;

  /**
   * Read a block from storage
   * @param r2Key - Storage key
   */
  read(r2Key: string): Promise<Uint8Array | null>;

  /**
   * Delete blocks from storage
   * @param r2Keys - Keys to delete
   */
  delete(r2Keys: string[]): Promise<void>;

  /**
   * Check if a block exists
   * @param r2Key - Storage key
   */
  exists(r2Key: string): Promise<boolean>;
}

// =============================================================================
// Compaction Strategy
// =============================================================================

/**
 * Strategy for determining when and how to compact blocks
 */
export interface CompactionStrategy {
  /**
   * Check if compaction should be performed
   * @param blocks - Current block index
   */
  shouldCompact(blocks: BlockMetadata[]): boolean;

  /**
   * Select blocks for compaction
   * @param blocks - Current block index
   * @returns Blocks selected for compaction (empty if none)
   */
  selectBlocks(blocks: BlockMetadata[]): BlockMetadata[];

  /**
   * Perform compaction on selected blocks
   * @param blocks - Blocks to compact
   * @param newSeq - Sequence number for the new block
   */
  compact(blocks: BlockMetadata[], newSeq: number): Promise<CompactResult>;

  /**
   * Get compaction metrics
   * @param blocks - Current block index
   */
  getMetrics(blocks: BlockMetadata[]): CompactionMetrics;
}

/**
 * Compaction metrics for monitoring
 */
export interface CompactionMetrics {
  /** Total blocks in index */
  totalBlocks: number;
  /** Blocks eligible for compaction */
  smallBlocks: number;
  /** Already compacted blocks */
  compactedBlocks: number;
  /** Whether compaction threshold is met */
  eligibleForCompaction: boolean;
  /** Target size for compacted blocks */
  targetSize: number;
  /** Maximum size for compacted blocks */
  maxSize: number;
}

// =============================================================================
// Manifest Manager
// =============================================================================

/**
 * Manifest entry for tracking blocks
 */
export interface ManifestBlockEntry {
  blockId: string;
  r2Key: string;
  rowCount: number;
  sizeBytes: number;
  minLsn: bigint;
  maxLsn: bigint;
  columnStats: ColumnZoneMap[];
}

/**
 * Strategy for managing block manifests
 */
export interface ManifestManager {
  /**
   * Add a block to the manifest
   * @param entry - Block entry to add
   */
  addBlock(entry: ManifestBlockEntry): Promise<void>;

  /**
   * Remove blocks from the manifest
   * @param blockIds - Block IDs to remove
   */
  removeBlocks(blockIds: string[]): Promise<void>;

  /**
   * Get all blocks in the manifest
   */
  getBlocks(): Promise<ManifestBlockEntry[]>;

  /**
   * Get the current snapshot ID
   */
  getSnapshotId(): number;

  /**
   * Write manifest to storage
   */
  persist(): Promise<void>;
}

// =============================================================================
// Writer Orchestrator Interface
// =============================================================================

/**
 * Configuration for the writer orchestrator
 */
export interface WriterOrchestratorConfig {
  /** Buffer strategy */
  buffer: CDCBufferStrategy;
  /** Block writer */
  writer: BlockWriter;
  /** Compaction strategy */
  compactor: CompactionStrategy;
  /** Optional manifest manager */
  manifest?: ManifestManager;
}

/**
 * Metrics tracked by the writer
 */
export interface WriterMetrics {
  /** Total CDC entries received */
  cdcEntriesReceived: number;
  /** Total flushes performed */
  flushCount: number;
  /** Total compactions performed */
  compactCount: number;
  /** R2 write failures */
  r2WriteFailures: number;
  /** Retry attempts */
  retryCount: number;
}
