/**
 * CDC Buffer Manager
 *
 * Manages the in-memory buffer for CDC batches in the Parent DO.
 * Handles batching, deduplication, and flush triggering.
 *
 * Buffer Strategy:
 * 1. Receive CDC batches from child DOs via WebSocket
 * 2. Buffer in memory with configurable thresholds
 * 3. Trigger flush when thresholds are exceeded
 * 4. Maintain ordering and deduplication
 */

import {
  type BufferedBatch,
  type BufferStats,
  type WalEntry,
  type ParentConfig,
  type FlushTrigger,
  DEFAULT_PARENT_CONFIG,
  BufferOverflowError,
  generateBatchId,
} from './types.js';

// =============================================================================
// Backpressure Controller
// =============================================================================

/**
 * Configuration for BackpressureController
 */
export interface BackpressureControllerConfig {
  maxBufferSize: number;
  highWaterMark: number;
  lowWaterMark: number;
  onHighWater?: () => void;
  onLowWater?: () => void;
}

/**
 * Backpressure Controller
 *
 * Tracks buffer utilization and signals when flow control should be applied.
 */
export class BackpressureController {
  private config: BackpressureControllerConfig;
  private currentBytes: number = 0;
  private wasHighWater: boolean = false;

  constructor(config: BackpressureControllerConfig) {
    this.config = config;
  }

  /**
   * Get current buffer utilization (0-1)
   */
  get utilization(): number {
    return this.currentBytes / this.config.maxBufferSize;
  }

  /**
   * Check if buffer is above high water mark
   */
  get isHighWater(): boolean {
    return this.utilization >= this.config.highWaterMark;
  }

  /**
   * Add bytes to the buffer
   * @throws BufferOverflowError if buffer is full
   */
  addBytes(bytes: number): void {
    if (this.currentBytes + bytes > this.config.maxBufferSize) {
      throw new BufferOverflowError('Buffer is full');
    }

    this.currentBytes += bytes;

    // Check if we crossed high water mark
    if (!this.wasHighWater && this.isHighWater) {
      this.wasHighWater = true;
      if (this.config.onHighWater) {
        this.config.onHighWater();
      }
    }
  }

  /**
   * Remove bytes from the buffer
   */
  removeBytes(bytes: number): void {
    this.currentBytes = Math.max(0, this.currentBytes - bytes);

    // Check if we crossed low water mark (after being high)
    if (this.wasHighWater && this.utilization <= this.config.lowWaterMark) {
      this.wasHighWater = false;
      if (this.config.onLowWater) {
        this.config.onLowWater();
      }
    }
  }

  /**
   * Get current buffer size in bytes
   */
  get currentSize(): number {
    return this.currentBytes;
  }

  /**
   * Reset the buffer
   */
  reset(): void {
    this.currentBytes = 0;
    this.wasHighWater = false;
  }
}

// =============================================================================
// Deduplication Tracker
// =============================================================================

/**
 * Configuration for deduplication limits
 */
export interface DedupConfig {
  windowMs: number;
  maxEntriesPerSource: number;
  maxSources: number;
}

/**
 * Default deduplication configuration
 */
export const DEFAULT_DEDUP_CONFIG: DedupConfig = {
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxEntriesPerSource: 10000,
  maxSources: 1000,
};

/**
 * Statistics about the deduplication state
 */
export interface DedupStats {
  sourceCount: number;
  totalEntries: number;
  entriesPerSource: Map<string, number>;
  oldestEntryAge?: number;
}

/**
 * Tracks seen batch and entry sequence numbers for deduplication with proper
 * time-based expiration within a 5-minute window.
 *
 * Key features:
 * - Per-source tracking (different sources don't interfere)
 * - Time-based expiration (entries older than windowMs are accepted again)
 * - Memory bounds (limits on entries per source and total sources)
 * - Entry-level deduplication (tracks individual entry sequences)
 */
class DeduplicationTracker {
  /** Per-source batch sequence tracking: sourceDoId -> Map<sequenceNumber, seenAt> */
  private readonly batchSeen: Map<string, Map<number, number>>;

  /** Per-source entry sequence tracking: sourceDoId -> Map<entrySequence, seenAt> */
  private readonly entrySeen: Map<string, Map<number, number>>;

  private readonly config: DedupConfig;
  private lastCleanup: number;

  constructor(config: Partial<DedupConfig> = {}) {
    this.config = { ...DEFAULT_DEDUP_CONFIG, ...config };
    this.batchSeen = new Map();
    this.entrySeen = new Map();
    this.lastCleanup = Date.now();
  }

  /**
   * Check if a batch sequence number has been seen before (within the window)
   *
   * An entry is considered a duplicate if it was seen within the last windowMs
   * milliseconds (inclusive at the boundary).
   */
  isBatchDuplicate(sourceDoId: string, sequenceNumber: number): boolean {
    const sourceMap = this.batchSeen.get(sourceDoId);
    if (!sourceMap) return false;

    const seenAt = sourceMap.get(sequenceNumber);
    if (seenAt === undefined) return false;

    // Check if within the deduplication window (inclusive at boundary)
    const now = Date.now();
    const age = now - seenAt;
    if (age > this.config.windowMs) {
      // Entry has expired, remove it
      sourceMap.delete(sequenceNumber);
      return false;
    }

    return true;
  }

  /**
   * Check if an entry sequence number has been seen before (within the window)
   */
  isEntryDuplicate(sourceDoId: string, entrySequence: number): boolean {
    const sourceMap = this.entrySeen.get(sourceDoId);
    if (!sourceMap) return false;

    const seenAt = sourceMap.get(entrySequence);
    if (seenAt === undefined) return false;

    const now = Date.now();
    if (now - seenAt > this.config.windowMs) {
      sourceMap.delete(entrySequence);
      return false;
    }

    return true;
  }

  /**
   * Mark a batch sequence number as seen
   */
  markBatchSeen(sourceDoId: string, sequenceNumber: number): void {
    let sourceMap = this.batchSeen.get(sourceDoId);
    if (!sourceMap) {
      // Check source limit before adding new source
      if (this.batchSeen.size >= this.config.maxSources) {
        this.evictOldestSource(this.batchSeen);
      }
      sourceMap = new Map();
      this.batchSeen.set(sourceDoId, sourceMap);
    }

    // Check entry limit before adding
    if (sourceMap.size >= this.config.maxEntriesPerSource) {
      this.evictOldestEntries(sourceMap, this.config.maxEntriesPerSource / 2);
    }

    sourceMap.set(sequenceNumber, Date.now());
  }

  /**
   * Mark an entry sequence number as seen
   */
  markEntrySeen(sourceDoId: string, entrySequence: number): void {
    let sourceMap = this.entrySeen.get(sourceDoId);
    if (!sourceMap) {
      if (this.entrySeen.size >= this.config.maxSources) {
        this.evictOldestSource(this.entrySeen);
      }
      sourceMap = new Map();
      this.entrySeen.set(sourceDoId, sourceMap);
    }

    if (sourceMap.size >= this.config.maxEntriesPerSource) {
      this.evictOldestEntries(sourceMap, this.config.maxEntriesPerSource / 2);
    }

    sourceMap.set(entrySequence, Date.now());
  }

  /**
   * Mark multiple entry sequences as seen (for batch)
   */
  markEntriesSeen(sourceDoId: string, entrySequences: number[]): void {
    for (const seq of entrySequences) {
      this.markEntrySeen(sourceDoId, seq);
    }
  }

  /**
   * Cleanup all entries that have expired beyond the deduplication window
   *
   * Entries are expired when their age is strictly greater than windowMs.
   * At exactly windowMs, entries are still valid (boundary is inclusive).
   */
  cleanupExpired(): void {
    const now = Date.now();
    const cutoff = now - this.config.windowMs;

    // Cleanup batch tracking
    // Use < instead of <= to keep entries at exactly the window boundary
    for (const [sourceId, sourceMap] of this.batchSeen) {
      for (const [seq, seenAt] of sourceMap) {
        if (seenAt < cutoff) {
          sourceMap.delete(seq);
        }
      }
      // Remove empty source maps
      if (sourceMap.size === 0) {
        this.batchSeen.delete(sourceId);
      }
    }

    // Cleanup entry tracking
    for (const [sourceId, sourceMap] of this.entrySeen) {
      for (const [seq, seenAt] of sourceMap) {
        if (seenAt < cutoff) {
          sourceMap.delete(seq);
        }
      }
      if (sourceMap.size === 0) {
        this.entrySeen.delete(sourceId);
      }
    }

    this.lastCleanup = now;
  }

  /**
   * Perform cleanup if enough time has passed since last cleanup
   */
  maybeCleanup(): void {
    const now = Date.now();
    // Cleanup every windowMs/4 or when adding entries
    if (now - this.lastCleanup >= this.config.windowMs / 4) {
      this.cleanupExpired();
    }
  }

  /**
   * Get statistics about the deduplication state
   */
  getStats(): DedupStats {
    const entriesPerSource = new Map<string, number>();
    let totalEntries = 0;
    let oldestTimestamp = Infinity;

    for (const [sourceId, sourceMap] of this.batchSeen) {
      const count = sourceMap.size;
      entriesPerSource.set(sourceId, (entriesPerSource.get(sourceId) || 0) + count);
      totalEntries += count;

      for (const seenAt of sourceMap.values()) {
        if (seenAt < oldestTimestamp) {
          oldestTimestamp = seenAt;
        }
      }
    }

    return {
      sourceCount: this.batchSeen.size,
      totalEntries,
      entriesPerSource,
      oldestEntryAge: oldestTimestamp === Infinity ? undefined : Date.now() - oldestTimestamp,
    };
  }

  /**
   * Clear all tracked entries for a specific source
   */
  clearSource(sourceDoId: string): void {
    this.batchSeen.delete(sourceDoId);
    this.entrySeen.delete(sourceDoId);
  }

  /**
   * Clear all tracked entries
   */
  clear(): void {
    this.batchSeen.clear();
    this.entrySeen.clear();
    this.lastCleanup = Date.now();
  }

  /**
   * Serialize dedup state for hibernation
   */
  serialize(): {
    batchSeen: Array<[string, Array<[number, number]>]>;
    entrySeen: Array<[string, Array<[number, number]>]>;
  } {
    return {
      batchSeen: Array.from(this.batchSeen.entries()).map(([sourceId, map]) => [
        sourceId,
        Array.from(map.entries()),
      ]),
      entrySeen: Array.from(this.entrySeen.entries()).map(([sourceId, map]) => [
        sourceId,
        Array.from(map.entries()),
      ]),
    };
  }

  /**
   * Restore dedup state from serialized data
   */
  restore(data: {
    batchSeen: Array<[string, Array<[number, number]>]>;
    entrySeen: Array<[string, Array<[number, number]>]>;
  }): void {
    this.batchSeen.clear();
    this.entrySeen.clear();

    for (const [sourceId, entries] of data.batchSeen) {
      this.batchSeen.set(sourceId, new Map(entries));
    }
    for (const [sourceId, entries] of data.entrySeen) {
      this.entrySeen.set(sourceId, new Map(entries));
    }

    // Cleanup any expired entries
    this.cleanupExpired();
  }

  /**
   * Evict the oldest source from the tracking map
   */
  private evictOldestSource(map: Map<string, Map<number, number>>): void {
    let oldestSourceId: string | null = null;
    let oldestTime = Infinity;

    for (const [sourceId, sourceMap] of map) {
      for (const seenAt of sourceMap.values()) {
        if (seenAt < oldestTime) {
          oldestTime = seenAt;
          oldestSourceId = sourceId;
        }
      }
    }

    if (oldestSourceId) {
      map.delete(oldestSourceId);
    }
  }

  /**
   * Evict oldest entries from a source map until size is below target
   */
  private evictOldestEntries(sourceMap: Map<number, number>, targetSize: number): void {
    // Sort entries by timestamp and keep only the most recent ones
    const entries = Array.from(sourceMap.entries()).sort((a, b) => a[1] - b[1]);
    const toRemove = entries.slice(0, entries.length - targetSize);

    for (const [seq] of toRemove) {
      sourceMap.delete(seq);
    }
  }
}

// =============================================================================
// Child Connection State
// =============================================================================

/**
 * State tracked per connected child DO
 */
export interface ChildConnectionState {
  /** Child DO ID */
  childDoId: string;

  /** Child shard name */
  childShardName?: string;

  /** Last received sequence number */
  lastReceivedSequence: number;

  /** Last acknowledged sequence number */
  lastAckedSequence: number;

  /** Connection timestamp */
  connectedAt: number;

  /** Last activity timestamp */
  lastActivityAt: number;

  /** Total batches received */
  batchesReceived: number;

  /** Total entries received */
  entriesReceived: number;

  /** WebSocket reference */
  ws?: WebSocket;
}

// =============================================================================
// CDC Buffer Manager
// =============================================================================

/**
 * Manages CDC batch buffering for the Parent DO
 */
export class CDCBufferManager {
  private readonly config: ParentConfig;
  private readonly batches: BufferedBatch[];
  private readonly childStates: Map<string, ChildConnectionState>;
  private readonly deduplication: DeduplicationTracker;

  private totalSizeBytes: number;
  private totalEntryCount: number;
  private oldestBatchTime: number | undefined;
  private newestBatchTime: number | undefined;
  private lastFlushTime: number;

  constructor(config: Partial<ParentConfig & { maxDedupEntriesPerSource?: number; maxDedupSources?: number }> = {}) {
    this.config = { ...DEFAULT_PARENT_CONFIG, ...config };
    this.batches = [];
    this.childStates = new Map();
    this.deduplication = new DeduplicationTracker({
      windowMs: this.config.deduplicationWindowMs,
      maxEntriesPerSource: config.maxDedupEntriesPerSource ?? DEFAULT_DEDUP_CONFIG.maxEntriesPerSource,
      maxSources: config.maxDedupSources ?? DEFAULT_DEDUP_CONFIG.maxSources,
    });

    this.totalSizeBytes = 0;
    this.totalEntryCount = 0;
    this.lastFlushTime = Date.now();
  }

  // ===========================================================================
  // Batch Management
  // ===========================================================================

  /**
   * Add a batch to the buffer
   *
   * @returns true if added, false if duplicate
   * @throws BufferOverflowError if buffer is full
   */
  addBatch(
    sourceDoId: string,
    entries: WalEntry[],
    sequenceNumber: number,
    sourceShardName?: string
  ): { added: boolean; batchId: string | null; isDuplicate: boolean } {
    // Periodically cleanup expired dedup entries
    if (this.config.enableDeduplication) {
      this.deduplication.maybeCleanup();
    }

    // Check for duplicate batch
    if (
      this.config.enableDeduplication &&
      this.deduplication.isBatchDuplicate(sourceDoId, sequenceNumber)
    ) {
      return { added: false, batchId: null, isDuplicate: true };
    }

    // Calculate batch size
    const sizeBytes = this.estimateBatchSize(entries);

    // Check buffer capacity
    if (this.totalSizeBytes + sizeBytes > this.config.maxBufferSize) {
      throw new BufferOverflowError(
        `Buffer overflow: adding ${sizeBytes} bytes would exceed max ${this.config.maxBufferSize}`
      );
    }

    const batchId = generateBatchId(sourceDoId, sequenceNumber);
    const now = Date.now();

    const batch: BufferedBatch = {
      batchId,
      sourceDoId,
      sourceShardName,
      entries,
      receivedAt: now,
      sequenceNumber,
      persisted: false,
      inFallback: false,
      sizeBytes,
    };

    this.batches.push(batch);
    this.totalSizeBytes += sizeBytes;
    this.totalEntryCount += entries.length;

    // Update timestamps
    if (!this.oldestBatchTime || now < this.oldestBatchTime) {
      this.oldestBatchTime = now;
    }
    this.newestBatchTime = now;

    // Mark batch and entries as seen for deduplication
    if (this.config.enableDeduplication) {
      this.deduplication.markBatchSeen(sourceDoId, sequenceNumber);
      // Also track individual entry sequences
      const entrySequences = entries.map(e => e.sequence);
      this.deduplication.markEntriesSeen(sourceDoId, entrySequences);
    }

    // Update child state
    this.updateChildState(sourceDoId, entries.length, sequenceNumber, sourceShardName);

    return { added: true, batchId, isDuplicate: false };
  }

  /**
   * Add a batch with entry-level deduplication
   *
   * Filters out individual entries that have already been seen,
   * only adding new entries to the buffer.
   *
   * @returns Result including how many entries were added vs filtered
   */
  addBatchWithEntryDedup(
    sourceDoId: string,
    entries: WalEntry[],
    sequenceNumber: number,
    sourceShardName?: string
  ): { added: boolean; batchId: string | null; isDuplicate: boolean; entriesAdded: number; entriesFiltered: number } {
    // Periodically cleanup expired dedup entries
    if (this.config.enableDeduplication) {
      this.deduplication.maybeCleanup();
    }

    // Filter out duplicate entries
    const newEntries: WalEntry[] = [];
    let filteredCount = 0;

    if (this.config.enableDeduplication) {
      for (const entry of entries) {
        if (this.deduplication.isEntryDuplicate(sourceDoId, entry.sequence)) {
          filteredCount++;
        } else {
          newEntries.push(entry);
        }
      }
    } else {
      newEntries.push(...entries);
    }

    // If all entries were duplicates, still mark batch as seen but don't add
    if (newEntries.length === 0) {
      if (this.config.enableDeduplication) {
        this.deduplication.markBatchSeen(sourceDoId, sequenceNumber);
      }
      return {
        added: true,
        batchId: null,
        isDuplicate: false,
        entriesAdded: 0,
        entriesFiltered: filteredCount,
      };
    }

    // Calculate batch size for filtered entries
    const sizeBytes = this.estimateBatchSize(newEntries);

    // Check buffer capacity
    if (this.totalSizeBytes + sizeBytes > this.config.maxBufferSize) {
      throw new BufferOverflowError(
        `Buffer overflow: adding ${sizeBytes} bytes would exceed max ${this.config.maxBufferSize}`
      );
    }

    const batchId = generateBatchId(sourceDoId, sequenceNumber);
    const now = Date.now();

    const batch: BufferedBatch = {
      batchId,
      sourceDoId,
      sourceShardName,
      entries: newEntries,
      receivedAt: now,
      sequenceNumber,
      persisted: false,
      inFallback: false,
      sizeBytes,
    };

    this.batches.push(batch);
    this.totalSizeBytes += sizeBytes;
    this.totalEntryCount += newEntries.length;

    // Update timestamps
    if (!this.oldestBatchTime || now < this.oldestBatchTime) {
      this.oldestBatchTime = now;
    }
    this.newestBatchTime = now;

    // Mark batch and entries as seen for deduplication
    if (this.config.enableDeduplication) {
      this.deduplication.markBatchSeen(sourceDoId, sequenceNumber);
      const entrySequences = newEntries.map(e => e.sequence);
      this.deduplication.markEntriesSeen(sourceDoId, entrySequences);
    }

    // Update child state
    this.updateChildState(sourceDoId, newEntries.length, sequenceNumber, sourceShardName);

    return {
      added: true,
      batchId,
      isDuplicate: false,
      entriesAdded: newEntries.length,
      entriesFiltered: filteredCount,
    };
  }

  /**
   * Get all batches ready for flush
   */
  getBatchesForFlush(): BufferedBatch[] {
    return this.batches.filter((b) => !b.persisted && !b.inFallback);
  }

  /**
   * Mark batches as persisted
   */
  markPersisted(batchIds: string[]): void {
    const idSet = new Set(batchIds);
    for (const batch of this.batches) {
      if (idSet.has(batch.batchId)) {
        batch.persisted = true;
      }
    }
  }

  /**
   * Mark batches as in fallback storage
   */
  markInFallback(batchIds: string[]): void {
    const idSet = new Set(batchIds);
    for (const batch of this.batches) {
      if (idSet.has(batch.batchId)) {
        batch.inFallback = true;
      }
    }
  }

  /**
   * Remove persisted and fallback batches from buffer
   */
  clearPersisted(): void {
    const toRemove = this.batches.filter((b) => b.persisted || b.inFallback);

    for (const batch of toRemove) {
      this.totalSizeBytes -= batch.sizeBytes;
      this.totalEntryCount -= batch.entries.length;
    }

    // Remove from array
    for (let i = this.batches.length - 1; i >= 0; i--) {
      if (this.batches[i].persisted || this.batches[i].inFallback) {
        this.batches.splice(i, 1);
      }
    }

    // Update timestamps
    this.updateTimestamps();
    this.lastFlushTime = Date.now();
  }

  /**
   * Get all entries merged and sorted by timestamp
   */
  getAllEntriesSorted(): WalEntry[] {
    const allEntries: WalEntry[] = [];

    for (const batch of this.batches) {
      if (!batch.persisted && !batch.inFallback) {
        allEntries.push(...batch.entries);
      }
    }

    // Sort by timestamp, then by sequence
    return allEntries.sort((a, b) => {
      if (a.timestamp !== b.timestamp) {
        return a.timestamp - b.timestamp;
      }
      return a.sequence - b.sequence;
    });
  }

  /**
   * Get entries grouped by source DO
   */
  getEntriesBySource(): Map<string, WalEntry[]> {
    const bySource = new Map<string, WalEntry[]>();

    for (const batch of this.batches) {
      if (!batch.persisted && !batch.inFallback) {
        const existing = bySource.get(batch.sourceDoId) ?? [];
        existing.push(...batch.entries);
        bySource.set(batch.sourceDoId, existing);
      }
    }

    // Sort each source's entries
    for (const [sourceId, entries] of bySource) {
      bySource.set(
        sourceId,
        entries.sort((a, b) => a.sequence - b.sequence)
      );
    }

    return bySource;
  }

  /**
   * Get entries grouped by table
   */
  getEntriesByTable(): Map<string, WalEntry[]> {
    const byTable = new Map<string, WalEntry[]>();

    for (const batch of this.batches) {
      if (!batch.persisted && !batch.inFallback) {
        for (const entry of batch.entries) {
          const existing = byTable.get(entry.table) ?? [];
          existing.push(entry);
          byTable.set(entry.table, existing);
        }
      }
    }

    // Sort each table's entries by timestamp
    for (const [table, entries] of byTable) {
      byTable.set(
        table,
        entries.sort((a, b) => a.timestamp - b.timestamp)
      );
    }

    return byTable;
  }

  // ===========================================================================
  // Flush Trigger Detection
  // ===========================================================================

  /**
   * Check if a flush should be triggered
   */
  shouldFlush(): FlushTrigger | null {
    // Entry count threshold
    if (this.totalEntryCount >= this.config.flushThresholdEntries) {
      return 'threshold_entries';
    }

    // Size threshold
    if (this.totalSizeBytes >= this.config.flushThresholdBytes) {
      return 'threshold_size';
    }

    // Time threshold
    const now = Date.now();
    if (this.oldestBatchTime) {
      const age = now - this.oldestBatchTime;
      if (age >= this.config.flushThresholdMs) {
        return 'threshold_time';
      }
    }

    return null;
  }

  /**
   * Get time until next scheduled flush
   */
  getTimeUntilFlush(): number {
    const now = Date.now();
    const timeSinceLastFlush = now - this.lastFlushTime;
    const remaining = this.config.flushIntervalMs - timeSinceLastFlush;
    return Math.max(0, remaining);
  }

  // ===========================================================================
  // Statistics
  // ===========================================================================

  /**
   * Get buffer statistics
   */
  getStats(): BufferStats {
    return {
      batchCount: this.batches.filter((b) => !b.persisted && !b.inFallback).length,
      entryCount: this.totalEntryCount,
      totalSizeBytes: this.totalSizeBytes,
      utilization: this.totalSizeBytes / this.config.maxBufferSize,
      oldestBatchTime: this.oldestBatchTime,
      newestBatchTime: this.newestBatchTime,
    };
  }

  /**
   * Get deduplication statistics
   */
  getDedupStats(): DedupStats {
    return this.deduplication.getStats();
  }

  /**
   * Explicitly cleanup expired deduplication entries
   *
   * This removes entries that are older than the deduplication window (5 minutes).
   * Entries are automatically cleaned up during addBatch calls, but this method
   * allows explicit cleanup when needed.
   */
  cleanupExpiredDedup(): void {
    this.deduplication.cleanupExpired();
  }

  /**
   * Get child connection states
   */
  getChildStates(): Map<string, ChildConnectionState> {
    return new Map(this.childStates);
  }

  /**
   * Get a specific child's state
   */
  getChildState(childDoId: string): ChildConnectionState | undefined {
    return this.childStates.get(childDoId);
  }

  /**
   * Update or create child connection state
   */
  updateChildState(
    childDoId: string,
    entriesReceived: number,
    lastSequence: number,
    shardName?: string
  ): void {
    const existing = this.childStates.get(childDoId);
    const now = Date.now();

    if (existing) {
      existing.lastReceivedSequence = Math.max(
        existing.lastReceivedSequence,
        lastSequence
      );
      existing.lastActivityAt = now;
      existing.batchesReceived++;
      existing.entriesReceived += entriesReceived;
      if (shardName) existing.childShardName = shardName;
    } else {
      this.childStates.set(childDoId, {
        childDoId,
        childShardName: shardName,
        lastReceivedSequence: lastSequence,
        lastAckedSequence: 0,
        connectedAt: now,
        lastActivityAt: now,
        batchesReceived: 1,
        entriesReceived: entriesReceived,
      });
    }
  }

  /**
   * Register a WebSocket for a child
   */
  registerChildWebSocket(childDoId: string, ws: WebSocket): void {
    const state = this.childStates.get(childDoId);
    if (state) {
      state.ws = ws;
    }
  }

  /**
   * Unregister a child's WebSocket
   */
  unregisterChildWebSocket(childDoId: string): void {
    const state = this.childStates.get(childDoId);
    if (state) {
      state.ws = undefined;
    }
  }

  /**
   * Remove child state
   */
  removeChild(childDoId: string): void {
    this.childStates.delete(childDoId);
    this.deduplication.clearSource(childDoId);
  }

  // ===========================================================================
  // Critical Memory Management
  // ===========================================================================

  /**
   * Drop oldest batches when memory utilization is critical
   *
   * @returns Number of entries dropped
   */
  dropOldestOnCritical(): number {
    const criticalThreshold = 0.95;
    const targetUtilization = 0.8;

    const currentUtilization = this.totalSizeBytes / this.config.maxBufferSize;
    if (currentUtilization < criticalThreshold) {
      return 0;
    }

    // Sort batches by receivedAt (oldest first)
    const sortedBatches = [...this.batches]
      .filter((b) => !b.persisted && !b.inFallback)
      .sort((a, b) => a.receivedAt - b.receivedAt);

    let dropped = 0;
    const targetBytes = this.config.maxBufferSize * targetUtilization;

    for (const batch of sortedBatches) {
      if (this.totalSizeBytes <= targetBytes) {
        break;
      }

      // Remove this batch
      const idx = this.batches.indexOf(batch);
      if (idx !== -1) {
        this.batches.splice(idx, 1);
        this.totalSizeBytes -= batch.sizeBytes;
        this.totalEntryCount -= batch.entries.length;
        dropped += batch.entries.length;
      }
    }

    this.updateTimestamps();
    return dropped;
  }

  // ===========================================================================
  // Serialization for Hibernation
  // ===========================================================================

  /**
   * Serialize buffer state for storage during hibernation
   *
   * Note: This creates a compact representation that can be stored in DO storage
   */
  serialize(): BufferSnapshot {
    return {
      batches: this.batches.map((b) => ({
        batchId: b.batchId,
        sourceDoId: b.sourceDoId,
        sourceShardName: b.sourceShardName,
        entries: b.entries,
        receivedAt: b.receivedAt,
        sequenceNumber: b.sequenceNumber,
        persisted: b.persisted,
        inFallback: b.inFallback,
        sizeBytes: b.sizeBytes,
      })),
      childStates: Array.from(this.childStates.entries()).map(([id, state]) => ({
        childDoId: id,
        childShardName: state.childShardName,
        lastReceivedSequence: state.lastReceivedSequence,
        lastAckedSequence: state.lastAckedSequence,
        connectedAt: state.connectedAt,
        lastActivityAt: state.lastActivityAt,
        batchesReceived: state.batchesReceived,
        entriesReceived: state.entriesReceived,
      })),
      totalSizeBytes: this.totalSizeBytes,
      totalEntryCount: this.totalEntryCount,
      lastFlushTime: this.lastFlushTime,
      dedupState: this.deduplication.serialize(),
    };
  }

  /**
   * Restore buffer state from serialized snapshot
   */
  static restore(snapshot: BufferSnapshot, config?: Partial<ParentConfig>): CDCBufferManager {
    const manager = new CDCBufferManager(config);

    // Restore batches
    for (const b of snapshot.batches) {
      manager.batches.push({
        batchId: b.batchId,
        sourceDoId: b.sourceDoId,
        sourceShardName: b.sourceShardName,
        entries: b.entries,
        receivedAt: b.receivedAt,
        sequenceNumber: b.sequenceNumber,
        persisted: b.persisted,
        inFallback: b.inFallback,
        sizeBytes: b.sizeBytes,
      });
    }

    // Restore child states
    for (const state of snapshot.childStates) {
      manager.childStates.set(state.childDoId, {
        childDoId: state.childDoId,
        childShardName: state.childShardName,
        lastReceivedSequence: state.lastReceivedSequence,
        lastAckedSequence: state.lastAckedSequence,
        connectedAt: state.connectedAt,
        lastActivityAt: state.lastActivityAt,
        batchesReceived: state.batchesReceived,
        entriesReceived: state.entriesReceived,
      });
    }

    // Restore dedup state
    if (snapshot.dedupState) {
      manager.deduplication.restore(snapshot.dedupState);
    }

    manager.totalSizeBytes = snapshot.totalSizeBytes;
    manager.totalEntryCount = snapshot.totalEntryCount;
    manager.lastFlushTime = snapshot.lastFlushTime;
    manager.updateTimestamps();

    return manager;
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Estimate the size of a batch in bytes
   */
  private estimateBatchSize(entries: WalEntry[]): number {
    // Rough estimate: JSON size * 1.1 for binary overhead
    let size = 0;
    for (const entry of entries) {
      size += 100; // Base overhead per entry
      size += entry.table.length * 2;
      size += entry.rowId.length * 2;
      if (entry.before) {
        size += JSON.stringify(entry.before).length;
      }
      if (entry.after) {
        size += JSON.stringify(entry.after).length;
      }
    }
    return Math.ceil(size * 1.1);
  }

  /**
   * Update oldest/newest batch timestamps
   */
  private updateTimestamps(): void {
    if (this.batches.length === 0) {
      this.oldestBatchTime = undefined;
      this.newestBatchTime = undefined;
      return;
    }

    let oldest = Infinity;
    let newest = 0;

    for (const batch of this.batches) {
      if (!batch.persisted && !batch.inFallback) {
        if (batch.receivedAt < oldest) oldest = batch.receivedAt;
        if (batch.receivedAt > newest) newest = batch.receivedAt;
      }
    }

    this.oldestBatchTime = oldest === Infinity ? undefined : oldest;
    this.newestBatchTime = newest === 0 ? undefined : newest;
  }

  /**
   * Clear all batches and state
   */
  clear(): void {
    this.batches.length = 0;
    this.childStates.clear();
    this.deduplication.clear();
    this.totalSizeBytes = 0;
    this.totalEntryCount = 0;
    this.oldestBatchTime = undefined;
    this.newestBatchTime = undefined;
    this.lastFlushTime = Date.now();
  }
}

// =============================================================================
// Serialization Types
// =============================================================================

/**
 * Snapshot of buffer state for serialization
 */
export interface BufferSnapshot {
  batches: Array<{
    batchId: string;
    sourceDoId: string;
    sourceShardName?: string;
    entries: WalEntry[];
    receivedAt: number;
    sequenceNumber: number;
    persisted: boolean;
    inFallback: boolean;
    sizeBytes: number;
  }>;
  childStates: Array<{
    childDoId: string;
    childShardName?: string;
    lastReceivedSequence: number;
    lastAckedSequence: number;
    connectedAt: number;
    lastActivityAt: number;
    batchesReceived: number;
    entriesReceived: number;
  }>;
  totalSizeBytes: number;
  totalEntryCount: number;
  lastFlushTime: number;
  /** Deduplication state for persistence across hibernation */
  dedupState?: {
    batchSeen: Array<[string, Array<[number, number]>]>;
    entrySeen: Array<[string, Array<[number, number]>]>;
  };
}
