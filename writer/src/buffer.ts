/**
 * CDC Buffer Management
 *
 * Buffers incoming CDC entries from child DOs until:
 * - Buffer reaches size threshold
 * - Buffer reaches time threshold
 * - Manual flush is triggered
 */

import type { WalEntry } from '@evodb/core';
import { EvoDBError, ErrorCode, captureStackTrace } from '@evodb/core';
import type { BufferState, BufferStats, ResolvedWriterOptions } from './types.js';

/**
 * Default maximum buffer size (128MB)
 * This provides a hard limit to prevent unbounded memory growth
 * when flush operations fail repeatedly.
 */
export const DEFAULT_MAX_BUFFER_SIZE = 128 * 1024 * 1024;

/**
 * Error thrown when buffer exceeds maximum size limit.
 * This prevents unbounded memory growth when flush operations fail.
 * Extends EvoDBError for consistent error hierarchy.
 *
 * @example
 * ```typescript
 * import { EvoDBError, ErrorCode } from '@evodb/core';
 *
 * try {
 *   buffer.add(entries);
 * } catch (e) {
 *   if (e instanceof BufferOverflowError) {
 *     console.log(`Current: ${e.currentSize}, Max: ${e.maxSize}`);
 *   }
 *   // Or catch all EvoDB errors
 *   if (e instanceof EvoDBError && e.code === ErrorCode.BUFFER_OVERFLOW) {
 *     // Handle buffer overflow
 *   }
 * }
 * ```
 */
export class BufferOverflowError extends EvoDBError {
  public readonly currentSize: number;
  public readonly maxSize: number;

  constructor(currentSize: number, maxSize: number) {
    super(
      `BufferOverflowError: Buffer size (${currentSize} bytes) would exceed maximum (${maxSize} bytes). Consider draining the buffer or increasing maxBufferSize.`,
      ErrorCode.BUFFER_OVERFLOW,
      { currentSize, maxSize },
      'Consider draining the buffer or increasing maxBufferSize.'
    );
    this.name = 'BufferOverflowError';
    this.currentSize = currentSize;
    this.maxSize = maxSize;
    captureStackTrace(this, BufferOverflowError);
  }
}

/**
 * Buffer options extracted from writer options
 */
export interface BufferOptions {
  /** Max entries before automatic flush */
  bufferSize: number;
  /** Max milliseconds before automatic flush */
  bufferTimeout: number;
  /** Target block size in bytes */
  targetBlockSize: number;
  /** Hard limit on buffer size in bytes (default: 128MB) */
  maxBufferSize?: number;
}

/**
 * Callback function type for LSN update logging.
 * Called after every cursor update attempt (successful or not).
 *
 * @param sourceDoId - The source DO identifier
 * @param previousLsn - The previous cursor value (undefined if new source)
 * @param newLsn - The LSN that was attempted to be set
 * @param updated - Whether the cursor was actually updated
 */
export type LsnUpdateLogger = (
  sourceDoId: string,
  previousLsn: bigint | undefined,
  newLsn: bigint,
  updated: boolean
) => void;

/**
 * Record of a cursor update attempt for debugging.
 */
export interface CursorUpdateRecord {
  /** Previous cursor value (undefined if new source) */
  previousLsn: bigint | undefined;
  /** The LSN that was attempted to be set */
  newLsn: bigint;
  /** Whether the cursor was actually updated */
  updated: boolean;
  /** Timestamp when the update was attempted */
  timestamp: number;
}

/**
 * CDC Buffer for accumulating WAL entries before block write
 */
/** Maximum value for signed 64-bit integer, used as initial minLsn sentinel */
const MAX_BIGINT_64 = 9223372036854775807n;

/**
 * Validate that a buffer option value is a positive number
 * @throws Error if value is not positive or is NaN
 */
function validatePositive(value: number, name: string): void {
  if (!(value > 0)) {
    throw new Error(`${name} must be positive`);
  }
}

/**
 * Validate all buffer options
 * @throws Error if any option is invalid
 */
function validateBufferOptions(options: BufferOptions): void {
  validatePositive(options.bufferSize, 'bufferSize');
  validatePositive(options.bufferTimeout, 'bufferTimeout');
  validatePositive(options.targetBlockSize, 'targetBlockSize');
  if (options.maxBufferSize !== undefined) {
    validatePositive(options.maxBufferSize, 'maxBufferSize');
  }
}

/**
 * CDC Buffer for accumulating WAL entries before block write.
 *
 * Thread Safety: This class is designed to be used in a single-threaded
 * environment (like Cloudflare Workers Durable Objects). The add() method
 * is synchronous and maintains cursor consistency through atomic operations.
 *
 * IMPORTANT: Do not introduce await points between reading and updating
 * sourceCursors. If async operations are needed, use the updateSourceCursor()
 * method which provides an atomic compare-and-set operation.
 */
export class CDCBuffer {
  private entries: WalEntry[] = [];
  private estimatedSize = 0;
  private minLsn: bigint = MAX_BIGINT_64;
  private maxLsn: bigint = 0n;
  private firstEntryTime: number | null = null;
  private sourceCursors: Map<string, bigint> = new Map();
  private readonly maxBufferSize: number;

  /**
   * Optional callback for logging LSN update attempts.
   * Useful for debugging race conditions and cursor tracking issues.
   */
  private lsnUpdateLogger: LsnUpdateLogger | null = null;

  /**
   * Map of source DO IDs to their last cursor update record.
   * Used for debugging to inspect the last update attempt for each source.
   */
  private lastCursorUpdates: Map<string, CursorUpdateRecord> = new Map();

  constructor(private readonly options: BufferOptions) {
    validateBufferOptions(options);
    this.maxBufferSize = options.maxBufferSize ?? DEFAULT_MAX_BUFFER_SIZE;
  }

  /**
   * Set a callback function to be notified of all LSN cursor update attempts.
   * This is useful for debugging and monitoring cursor updates.
   *
   * @param logger - Callback function called on each cursor update attempt
   */
  setLsnUpdateLogger(logger: LsnUpdateLogger): void {
    this.lsnUpdateLogger = logger;
  }

  /**
   * Get the last cursor update record for a source.
   * Returns undefined if no updates have been made for this source.
   *
   * @param sourceDoId - The source DO identifier
   * @returns The last cursor update record or undefined
   */
  getLastCursorUpdate(sourceDoId: string): CursorUpdateRecord | undefined {
    return this.lastCursorUpdates.get(sourceDoId);
  }

  /**
   * Atomically update source cursor if new LSN is greater than current.
   * This method provides a safe way to update cursors without race conditions.
   *
   * The update uses compare-and-swap semantics:
   * - Reads current cursor value
   * - Only updates if newLsn > currentCursor (or cursor doesn't exist)
   * - Records the update attempt for debugging
   * - Calls the logger callback if configured
   *
   * @param sourceDoId - The source DO identifier
   * @param newLsn - The new LSN to potentially set as cursor
   * @returns true if cursor was updated, false if current cursor was already >= newLsn
   * @throws Error if newLsn is negative (invalid LSN)
   */
  private updateSourceCursor(sourceDoId: string, newLsn: bigint): boolean {
    // Validate LSN is non-negative (defensive check for BigInt edge cases)
    if (newLsn < 0n) {
      throw new Error(`Invalid LSN: ${newLsn}. LSN must be non-negative.`);
    }

    const currentCursor = this.sourceCursors.get(sourceDoId);
    const timestamp = Date.now();

    // Use strict comparison: only update if newLsn is strictly greater
    // This handles undefined (new source) and existing cursor cases
    const shouldUpdate = currentCursor === undefined || newLsn > currentCursor;

    if (shouldUpdate) {
      this.sourceCursors.set(sourceDoId, newLsn);
    }

    // Record the update attempt for debugging
    const updateRecord: CursorUpdateRecord = {
      previousLsn: currentCursor,
      newLsn,
      updated: shouldUpdate,
      timestamp,
    };
    this.lastCursorUpdates.set(sourceDoId, updateRecord);

    // Call the logger if configured
    if (this.lsnUpdateLogger) {
      this.lsnUpdateLogger(sourceDoId, currentCursor, newLsn, shouldUpdate);
    }

    return shouldUpdate;
  }

  /**
   * Atomic compare-and-set operation for source cursor.
   * Only updates the cursor if the current value matches the expected value
   * AND the new value is greater than the current value.
   *
   * This is useful for external coordination where the caller needs to
   * ensure they are updating from a known state.
   *
   * @param sourceDoId - The source DO identifier
   * @param expectedLsn - The expected current cursor value (undefined for new sources)
   * @param newLsn - The new LSN to set if conditions are met
   * @returns true if cursor was updated, false otherwise
   * @throws Error if newLsn is negative (invalid LSN)
   */
  compareAndSetCursor(
    sourceDoId: string,
    expectedLsn: bigint | undefined,
    newLsn: bigint
  ): boolean {
    // Validate LSN is non-negative (defensive check for BigInt edge cases)
    if (newLsn < 0n) {
      throw new Error(`Invalid LSN: ${newLsn}. LSN must be non-negative.`);
    }

    const currentCursor = this.sourceCursors.get(sourceDoId);
    const timestamp = Date.now();

    // Check if current value matches expected
    if (currentCursor !== expectedLsn) {
      // Record failed update attempt
      const updateRecord: CursorUpdateRecord = {
        previousLsn: currentCursor,
        newLsn,
        updated: false,
        timestamp,
      };
      this.lastCursorUpdates.set(sourceDoId, updateRecord);

      if (this.lsnUpdateLogger) {
        this.lsnUpdateLogger(sourceDoId, currentCursor, newLsn, false);
      }
      return false;
    }

    // Check monotonicity: new value must be greater than current (if current exists)
    if (currentCursor !== undefined && newLsn <= currentCursor) {
      // Record failed update attempt due to non-monotonic update
      const updateRecord: CursorUpdateRecord = {
        previousLsn: currentCursor,
        newLsn,
        updated: false,
        timestamp,
      };
      this.lastCursorUpdates.set(sourceDoId, updateRecord);

      if (this.lsnUpdateLogger) {
        this.lsnUpdateLogger(sourceDoId, currentCursor, newLsn, false);
      }
      return false;
    }

    // Perform the update
    this.sourceCursors.set(sourceDoId, newLsn);

    // Record successful update
    const updateRecord: CursorUpdateRecord = {
      previousLsn: currentCursor,
      newLsn,
      updated: true,
      timestamp,
    };
    this.lastCursorUpdates.set(sourceDoId, updateRecord);

    if (this.lsnUpdateLogger) {
      this.lsnUpdateLogger(sourceDoId, currentCursor, newLsn, true);
    }

    return true;
  }

  /**
   * Create a buffer from resolved writer options
   */
  static fromWriterOptions(options: ResolvedWriterOptions): CDCBuffer {
    return new CDCBuffer({
      bufferSize: options.bufferSize,
      bufferTimeout: options.bufferTimeout,
      targetBlockSize: options.targetBlockSize,
      maxBufferSize: options.maxBufferSize,
    });
  }

  /**
   * Add WAL entries from a source.
   *
   * This method is synchronous and safe for concurrent calls in a single-threaded
   * environment. The cursor update uses an atomic compare-and-set pattern to ensure
   * monotonicity even if entries arrive out of order.
   *
   * @param sourceDoId - The source DO identifier
   * @param entries - WAL entries to add (must be non-empty for any effect)
   * @throws {BufferOverflowError} if adding entries would exceed maxBufferSize
   */
  add(sourceDoId: string, entries: WalEntry[]): void {
    if (entries.length === 0) return;

    // Calculate the size of incoming entries before adding
    let incomingSize = 0;
    for (const entry of entries) {
      incomingSize += this.estimateEntrySize(entry);
    }

    // Check if adding these entries would exceed the hard buffer limit
    const projectedSize = this.estimatedSize + incomingSize;
    if (projectedSize > this.maxBufferSize) {
      throw new BufferOverflowError(projectedSize, this.maxBufferSize);
    }

    // Set first entry time if buffer was empty
    if (this.entries.length === 0) {
      this.firstEntryTime = Date.now();
    }

    // Track the maximum LSN seen in this batch for cursor update
    let batchMaxLsn = entries[0].lsn;

    // Add entries and track LSN range
    for (const entry of entries) {
      this.entries.push(entry);
      this.estimatedSize += this.estimateEntrySize(entry);

      if (entry.lsn < this.minLsn) this.minLsn = entry.lsn;
      if (entry.lsn > this.maxLsn) this.maxLsn = entry.lsn;

      // Track max LSN in this batch
      if (entry.lsn > batchMaxLsn) batchMaxLsn = entry.lsn;
    }

    // Update source cursor atomically - only advances if batch max > current cursor
    this.updateSourceCursor(sourceDoId, batchMaxLsn);
  }

  /**
   * Estimate the serialized size of a WAL entry
   * @throws Error if entry or entry.data is null/undefined
   */
  private estimateEntrySize(entry: WalEntry): number {
    // Defensive null checks for malformed entries
    if (entry == null) {
      throw new Error('Invalid WAL entry: entry is null or undefined');
    }
    if (entry.data == null) {
      throw new Error('Invalid WAL entry: entry.data is null or undefined');
    }
    // WAL header (24 bytes) + data length + checksum (4 bytes)
    return 24 + entry.data.length + 4;
  }

  /**
   * Check if buffer should be flushed
   */
  shouldFlush(): boolean {
    if (this.entries.length === 0) return false;

    // Check entry count threshold
    if (this.entries.length >= this.options.bufferSize) {
      return true;
    }

    // Check size threshold (target block size)
    if (this.estimatedSize >= this.options.targetBlockSize) {
      return true;
    }

    // Check time threshold
    if (this.firstEntryTime !== null) {
      const age = Date.now() - this.firstEntryTime;
      if (age >= this.options.bufferTimeout) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get buffer statistics
   */
  getStats(): BufferStats {
    const ageMs = this.firstEntryTime !== null ? Date.now() - this.firstEntryTime : 0;

    return {
      entryCount: this.entries.length,
      estimatedSize: this.estimatedSize,
      ageMs,
      sourceCount: this.sourceCursors.size,
      readyToFlush: this.shouldFlush(),
    };
  }

  /**
   * Get current buffer state
   */
  getState(): BufferState {
    return {
      entries: this.entries,
      estimatedSize: this.estimatedSize,
      minLsn: this.entries.length > 0 ? this.minLsn : 0n,
      maxLsn: this.entries.length > 0 ? this.maxLsn : 0n,
      firstEntryTime: this.firstEntryTime ?? Date.now(),
      sourceCursors: new Map(this.sourceCursors),
    };
  }

  /**
   * Drain the buffer (returns entries and clears buffer)
   */
  drain(): { entries: WalEntry[]; state: BufferState } {
    const state = this.getState();
    const entries = this.entries;

    // Clear buffer
    this.entries = [];
    this.estimatedSize = 0;
    this.minLsn = MAX_BIGINT_64;
    this.maxLsn = 0n;
    this.firstEntryTime = null;
    // Keep source cursors for acknowledgment tracking

    return { entries, state };
  }

  /**
   * Check if buffer is empty
   */
  isEmpty(): boolean {
    return this.entries.length === 0;
  }

  /**
   * Get the number of entries
   */
  size(): number {
    return this.entries.length;
  }

  /**
   * Get estimated size in bytes
   */
  getEstimatedSize(): number {
    return this.estimatedSize;
  }

  /**
   * Get source cursors for acknowledgment
   */
  getSourceCursors(): Map<string, bigint> {
    return new Map(this.sourceCursors);
  }

  /**
   * Clear source cursor after acknowledgment
   */
  acknowledgeSource(_sourceDoId: string): void {
    // Cursor persists for tracking, but we could clear if needed
  }

  /**
   * Get time until next timeout flush (ms)
   * Returns null if buffer is empty
   */
  getTimeToFlush(): number | null {
    if (this.firstEntryTime === null) return null;

    const age = Date.now() - this.firstEntryTime;
    const remaining = this.options.bufferTimeout - age;

    return Math.max(0, remaining);
  }

  /**
   * Get the LSN range of buffered entries
   */
  getLsnRange(): { min: bigint; max: bigint } | null {
    if (this.entries.length === 0) return null;
    return { min: this.minLsn, max: this.maxLsn };
  }
}

/**
 * Multi-table buffer manager
 * Routes entries to per-table buffers
 */
export class MultiTableBuffer {
  private buffers: Map<string, CDCBuffer> = new Map();

  constructor(private readonly options: BufferOptions) {
    validateBufferOptions(options);
  }

  /**
   * Get or create buffer for a table
   */
  getBuffer(tableLocation: string): CDCBuffer {
    let buffer = this.buffers.get(tableLocation);
    if (!buffer) {
      buffer = new CDCBuffer(this.options);
      this.buffers.set(tableLocation, buffer);
    }
    return buffer;
  }

  /**
   * Add entries to a specific table's buffer
   */
  add(tableLocation: string, sourceDoId: string, entries: WalEntry[]): void {
    this.getBuffer(tableLocation).add(sourceDoId, entries);
  }

  /**
   * Get all tables with buffers ready to flush
   */
  getReadyToFlush(): string[] {
    const ready: string[] = [];
    for (const [table, buffer] of this.buffers) {
      if (buffer.shouldFlush()) {
        ready.push(table);
      }
    }
    return ready;
  }

  /**
   * Get minimum time until any buffer needs flushing
   */
  getMinTimeToFlush(): number | null {
    let minTime: number | null = null;

    for (const buffer of this.buffers.values()) {
      const time = buffer.getTimeToFlush();
      if (time !== null && (minTime === null || time < minTime)) {
        minTime = time;
      }
    }

    return minTime;
  }

  /**
   * Get stats for all tables
   */
  getAllStats(): Map<string, BufferStats> {
    const stats = new Map<string, BufferStats>();
    for (const [table, buffer] of this.buffers) {
      stats.set(table, buffer.getStats());
    }
    return stats;
  }

  /**
   * Remove buffer for a table (after flush/cleanup)
   */
  removeBuffer(tableLocation: string): void {
    this.buffers.delete(tableLocation);
  }

  /**
   * Check if any buffer has data
   */
  hasData(): boolean {
    for (const buffer of this.buffers.values()) {
      if (!buffer.isEmpty()) return true;
    }
    return false;
  }

  /**
   * Get total entry count across all buffers
   */
  getTotalEntryCount(): number {
    let total = 0;
    for (const buffer of this.buffers.values()) {
      total += buffer.size();
    }
    return total;
  }

  /**
   * Get total estimated size across all buffers
   */
  getTotalEstimatedSize(): number {
    let total = 0;
    for (const buffer of this.buffers.values()) {
      total += buffer.getEstimatedSize();
    }
    return total;
  }
}

/**
 * Backpressure controller
 * Signals when to slow down CDC ingestion
 */
export class BackpressureController {
  private currentPressure = 0;
  private readonly maxPressure: number;
  private readonly highWaterMark: number;
  private readonly lowWaterMark: number;

  constructor(options?: { maxPressure?: number; highWaterMark?: number; lowWaterMark?: number }) {
    this.maxPressure = options?.maxPressure ?? 100;
    this.highWaterMark = options?.highWaterMark ?? 80;
    this.lowWaterMark = options?.lowWaterMark ?? 40;
  }

  /**
   * Update pressure based on buffer state
   */
  update(stats: BufferStats, pendingBlockCount: number): void {
    // Calculate pressure from multiple factors
    const entryPressure = (stats.entryCount / 10000) * 50;  // 50% weight
    const sizePressure = (stats.estimatedSize / (4 * 1024 * 1024)) * 30;  // 30% weight
    const pendingPressure = (pendingBlockCount / 10) * 20;  // 20% weight

    this.currentPressure = Math.min(this.maxPressure, entryPressure + sizePressure + pendingPressure);
  }

  /**
   * Check if backpressure should be applied
   */
  shouldApplyBackpressure(): boolean {
    return this.currentPressure >= this.highWaterMark;
  }

  /**
   * Check if backpressure can be released
   */
  canReleaseBackpressure(): boolean {
    return this.currentPressure <= this.lowWaterMark;
  }

  /**
   * Get current pressure level (0-100)
   */
  getPressure(): number {
    return this.currentPressure;
  }

  /**
   * Get suggested delay for backpressure (ms)
   */
  getSuggestedDelay(): number {
    if (!this.shouldApplyBackpressure()) return 0;

    // Exponential backoff based on pressure
    const excess = this.currentPressure - this.highWaterMark;
    const maxExcess = this.maxPressure - this.highWaterMark;
    const ratio = excess / maxExcess;

    // 10ms to 1000ms based on pressure
    return Math.floor(10 + (990 * ratio));
  }

  /**
   * Reset pressure to zero
   */
  reset(): void {
    this.currentPressure = 0;
  }
}

/**
 * Size-based buffer that flushes at specific size thresholds
 * Useful for partition mode configurations
 */
export class SizeBasedBuffer {
  private entries: WalEntry[] = [];
  private currentSize = 0;

  constructor(
    private readonly targetSize: number,
    private readonly maxSize: number
  ) {}

  /**
   * Add entries and check if buffer should flush
   * Returns true if buffer is at or over target size
   * @throws Error if any entry or entry.data is null/undefined
   */
  add(entries: WalEntry[]): boolean {
    for (const entry of entries) {
      // Defensive null checks for malformed entries
      if (entry == null) {
        throw new Error('Invalid WAL entry: entry is null or undefined');
      }
      if (entry.data == null) {
        throw new Error('Invalid WAL entry: entry.data is null or undefined');
      }
      this.entries.push(entry);
      this.currentSize += 24 + entry.data.length + 4;
    }
    return this.currentSize >= this.targetSize;
  }

  /**
   * Check if buffer is at max capacity
   */
  isAtMaxCapacity(): boolean {
    return this.currentSize >= this.maxSize;
  }

  /**
   * Drain buffer
   */
  drain(): WalEntry[] {
    const result = this.entries;
    this.entries = [];
    this.currentSize = 0;
    return result;
  }

  /**
   * Get current size
   */
  getSize(): number {
    return this.currentSize;
  }

  /**
   * Get entry count
   */
  getEntryCount(): number {
    return this.entries.length;
  }

  /**
   * Check if empty
   */
  isEmpty(): boolean {
    return this.entries.length === 0;
  }
}
