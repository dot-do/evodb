/**
 * CDC Buffer Management
 *
 * Buffers incoming CDC entries from child DOs until:
 * - Buffer reaches size threshold
 * - Buffer reaches time threshold
 * - Manual flush is triggered
 */

import type { WalEntry } from '@evodb/core';
import type { BufferState, BufferStats, ResolvedWriterOptions } from './types.js';

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
}

/**
 * CDC Buffer for accumulating WAL entries before block write
 */
/** Maximum value for unsigned 64-bit integer, used as initial minLsn sentinel */
const MAX_BIGINT_64 = 18446744073709551615n;

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

  constructor(private readonly options: BufferOptions) {
    validateBufferOptions(options);
  }

  /**
   * Atomically update source cursor if new LSN is greater than current.
   * This method provides a safe way to update cursors without race conditions.
   *
   * @param sourceDoId - The source DO identifier
   * @param newLsn - The new LSN to potentially set as cursor
   * @returns true if cursor was updated, false if current cursor was already >= newLsn
   */
  private updateSourceCursor(sourceDoId: string, newLsn: bigint): boolean {
    const currentCursor = this.sourceCursors.get(sourceDoId);
    // Use strict comparison: only update if newLsn is strictly greater
    // This handles undefined (new source) and existing cursor cases
    if (currentCursor === undefined || newLsn > currentCursor) {
      this.sourceCursors.set(sourceDoId, newLsn);
      return true;
    }
    return false;
  }

  /**
   * Create a buffer from resolved writer options
   */
  static fromWriterOptions(options: ResolvedWriterOptions): CDCBuffer {
    return new CDCBuffer({
      bufferSize: options.bufferSize,
      bufferTimeout: options.bufferTimeout,
      targetBlockSize: options.targetBlockSize,
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
   */
  add(sourceDoId: string, entries: WalEntry[]): void {
    if (entries.length === 0) return;

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
   */
  private estimateEntrySize(entry: WalEntry): number {
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
   */
  add(entries: WalEntry[]): boolean {
    for (const entry of entries) {
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
