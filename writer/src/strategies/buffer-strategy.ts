/**
 * CDC Buffer Strategy Implementations
 *
 * Provides different buffering strategies for CDC entries:
 * - SizeBasedBufferStrategy: Flushes when size threshold is reached
 * - TimeBasedBufferStrategy: Flushes when time threshold is reached
 * - HybridBufferStrategy: Combines size, count, and time thresholds (default)
 */

import type { WalEntry } from '@evodb/core';
import type { BufferState, BufferStats, ResolvedWriterOptions } from '../types.js';
import type { CDCBufferStrategy } from './interfaces.js';

/**
 * Options for buffer strategies
 */
export interface BufferStrategyOptions {
  /** Max entries before automatic flush */
  maxEntries: number;
  /** Max milliseconds before automatic flush */
  maxAgeMs: number;
  /** Target size in bytes before flush */
  targetSizeBytes: number;
}

/**
 * Estimate the serialized size of a WAL entry
 */
function estimateEntrySize(entry: WalEntry): number {
  // WAL header (24 bytes) + data length + checksum (4 bytes)
  return 24 + entry.data.length + 4;
}

// =============================================================================
// Size-Based Buffer Strategy
// =============================================================================

/**
 * Buffer strategy that flushes based on size thresholds
 */
export class SizeBasedBufferStrategy implements CDCBufferStrategy {
  private entries: WalEntry[] = [];
  private currentSize = 0;
  private minLsn: bigint = BigInt(Number.MAX_SAFE_INTEGER);
  private maxLsn: bigint = 0n;
  private firstEntryTime: number | null = null;
  private sourceCursors: Map<string, bigint> = new Map();

  constructor(
    private readonly targetSize: number,
    private readonly maxSize: number
  ) {}

  /**
   * Create from resolved writer options
   */
  static fromWriterOptions(options: ResolvedWriterOptions): SizeBasedBufferStrategy {
    return new SizeBasedBufferStrategy(
      options.targetBlockSize,
      options.maxBlockSize
    );
  }

  append(sourceDoId: string, entries: WalEntry[]): boolean {
    if (entries.length === 0) return false;

    if (this.entries.length === 0) {
      this.firstEntryTime = Date.now();
    }

    // Track the maximum LSN seen in this batch for cursor update
    let batchMaxLsn = entries[0].lsn;

    for (const entry of entries) {
      this.entries.push(entry);
      this.currentSize += estimateEntrySize(entry);

      if (entry.lsn < this.minLsn) this.minLsn = entry.lsn;
      if (entry.lsn > this.maxLsn) this.maxLsn = entry.lsn;

      // Track max LSN in this batch
      if (entry.lsn > batchMaxLsn) batchMaxLsn = entry.lsn;
    }

    // Update source cursor atomically - only advances if batch max > current cursor
    const currentCursor = this.sourceCursors.get(sourceDoId);
    if (currentCursor === undefined || batchMaxLsn > currentCursor) {
      this.sourceCursors.set(sourceDoId, batchMaxLsn);
    }

    return this.currentSize >= this.targetSize;
  }

  flush(): { entries: WalEntry[]; state: BufferState } {
    const state: BufferState = {
      entries: this.entries,
      estimatedSize: this.currentSize,
      minLsn: this.entries.length > 0 ? this.minLsn : 0n,
      maxLsn: this.entries.length > 0 ? this.maxLsn : 0n,
      firstEntryTime: this.firstEntryTime ?? Date.now(),
      sourceCursors: new Map(this.sourceCursors),
    };

    const entries = this.entries;
    this.clear();

    return { entries, state };
  }

  stats(): BufferStats {
    const ageMs = this.firstEntryTime !== null ? Date.now() - this.firstEntryTime : 0;

    return {
      entryCount: this.entries.length,
      estimatedSize: this.currentSize,
      ageMs,
      sourceCount: this.sourceCursors.size,
      readyToFlush: this.shouldFlush(),
    };
  }

  clear(): void {
    this.entries = [];
    this.currentSize = 0;
    this.minLsn = BigInt(Number.MAX_SAFE_INTEGER);
    this.maxLsn = 0n;
    this.firstEntryTime = null;
    // Keep source cursors for acknowledgment tracking
  }

  isEmpty(): boolean {
    return this.entries.length === 0;
  }

  shouldFlush(): boolean {
    return this.currentSize >= this.targetSize;
  }

  getTimeToFlush(): number | null {
    // Size-based doesn't have a time component
    return null;
  }

  getSourceCursors(): Map<string, bigint> {
    return new Map(this.sourceCursors);
  }

  /**
   * Check if buffer is at max capacity
   */
  isAtMaxCapacity(): boolean {
    return this.currentSize >= this.maxSize;
  }
}

// =============================================================================
// Time-Based Buffer Strategy
// =============================================================================

/**
 * Buffer strategy that flushes based on time thresholds
 */
export class TimeBasedBufferStrategy implements CDCBufferStrategy {
  private entries: WalEntry[] = [];
  private estimatedSize = 0;
  private minLsn: bigint = BigInt(Number.MAX_SAFE_INTEGER);
  private maxLsn: bigint = 0n;
  private firstEntryTime: number | null = null;
  private sourceCursors: Map<string, bigint> = new Map();

  constructor(private readonly maxAgeMs: number) {}

  /**
   * Create from resolved writer options
   */
  static fromWriterOptions(options: ResolvedWriterOptions): TimeBasedBufferStrategy {
    return new TimeBasedBufferStrategy(options.bufferTimeout);
  }

  append(sourceDoId: string, entries: WalEntry[]): boolean {
    if (entries.length === 0) return false;

    if (this.entries.length === 0) {
      this.firstEntryTime = Date.now();
    }

    // Track the maximum LSN seen in this batch for cursor update
    let batchMaxLsn = entries[0].lsn;

    for (const entry of entries) {
      this.entries.push(entry);
      this.estimatedSize += estimateEntrySize(entry);

      if (entry.lsn < this.minLsn) this.minLsn = entry.lsn;
      if (entry.lsn > this.maxLsn) this.maxLsn = entry.lsn;

      // Track max LSN in this batch
      if (entry.lsn > batchMaxLsn) batchMaxLsn = entry.lsn;
    }

    // Update source cursor atomically - only advances if batch max > current cursor
    const currentCursor = this.sourceCursors.get(sourceDoId);
    if (currentCursor === undefined || batchMaxLsn > currentCursor) {
      this.sourceCursors.set(sourceDoId, batchMaxLsn);
    }

    return this.shouldFlush();
  }

  flush(): { entries: WalEntry[]; state: BufferState } {
    const state: BufferState = {
      entries: this.entries,
      estimatedSize: this.estimatedSize,
      minLsn: this.entries.length > 0 ? this.minLsn : 0n,
      maxLsn: this.entries.length > 0 ? this.maxLsn : 0n,
      firstEntryTime: this.firstEntryTime ?? Date.now(),
      sourceCursors: new Map(this.sourceCursors),
    };

    const entries = this.entries;
    this.clear();

    return { entries, state };
  }

  stats(): BufferStats {
    const ageMs = this.firstEntryTime !== null ? Date.now() - this.firstEntryTime : 0;

    return {
      entryCount: this.entries.length,
      estimatedSize: this.estimatedSize,
      ageMs,
      sourceCount: this.sourceCursors.size,
      readyToFlush: this.shouldFlush(),
    };
  }

  clear(): void {
    this.entries = [];
    this.estimatedSize = 0;
    this.minLsn = BigInt(Number.MAX_SAFE_INTEGER);
    this.maxLsn = 0n;
    this.firstEntryTime = null;
  }

  isEmpty(): boolean {
    return this.entries.length === 0;
  }

  shouldFlush(): boolean {
    if (this.firstEntryTime === null) return false;
    return Date.now() - this.firstEntryTime >= this.maxAgeMs;
  }

  getTimeToFlush(): number | null {
    if (this.firstEntryTime === null) return null;
    const age = Date.now() - this.firstEntryTime;
    return Math.max(0, this.maxAgeMs - age);
  }

  getSourceCursors(): Map<string, bigint> {
    return new Map(this.sourceCursors);
  }
}

// =============================================================================
// Hybrid Buffer Strategy (Default)
// =============================================================================

/**
 * Buffer strategy that combines size, count, and time thresholds
 * This is the default strategy used by LakehouseWriter
 */
export class HybridBufferStrategy implements CDCBufferStrategy {
  private entries: WalEntry[] = [];
  private estimatedSize = 0;
  private minLsn: bigint = BigInt(Number.MAX_SAFE_INTEGER);
  private maxLsn: bigint = 0n;
  private firstEntryTime: number | null = null;
  private sourceCursors: Map<string, bigint> = new Map();

  constructor(private readonly options: BufferStrategyOptions) {}

  /**
   * Create from resolved writer options
   */
  static fromWriterOptions(options: ResolvedWriterOptions): HybridBufferStrategy {
    return new HybridBufferStrategy({
      maxEntries: options.bufferSize,
      maxAgeMs: options.bufferTimeout,
      targetSizeBytes: options.targetBlockSize,
    });
  }

  append(sourceDoId: string, entries: WalEntry[]): boolean {
    if (entries.length === 0) return false;

    if (this.entries.length === 0) {
      this.firstEntryTime = Date.now();
    }

    // Track the maximum LSN seen in this batch for cursor update
    let batchMaxLsn = entries[0].lsn;

    for (const entry of entries) {
      this.entries.push(entry);
      this.estimatedSize += estimateEntrySize(entry);

      if (entry.lsn < this.minLsn) this.minLsn = entry.lsn;
      if (entry.lsn > this.maxLsn) this.maxLsn = entry.lsn;

      // Track max LSN in this batch
      if (entry.lsn > batchMaxLsn) batchMaxLsn = entry.lsn;
    }

    // Update source cursor atomically - only advances if batch max > current cursor
    const currentCursor = this.sourceCursors.get(sourceDoId);
    if (currentCursor === undefined || batchMaxLsn > currentCursor) {
      this.sourceCursors.set(sourceDoId, batchMaxLsn);
    }

    return this.shouldFlush();
  }

  flush(): { entries: WalEntry[]; state: BufferState } {
    const state: BufferState = {
      entries: this.entries,
      estimatedSize: this.estimatedSize,
      minLsn: this.entries.length > 0 ? this.minLsn : 0n,
      maxLsn: this.entries.length > 0 ? this.maxLsn : 0n,
      firstEntryTime: this.firstEntryTime ?? Date.now(),
      sourceCursors: new Map(this.sourceCursors),
    };

    const entries = this.entries;
    this.clear();

    return { entries, state };
  }

  stats(): BufferStats {
    const ageMs = this.firstEntryTime !== null ? Date.now() - this.firstEntryTime : 0;

    return {
      entryCount: this.entries.length,
      estimatedSize: this.estimatedSize,
      ageMs,
      sourceCount: this.sourceCursors.size,
      readyToFlush: this.shouldFlush(),
    };
  }

  clear(): void {
    this.entries = [];
    this.estimatedSize = 0;
    this.minLsn = BigInt(Number.MAX_SAFE_INTEGER);
    this.maxLsn = 0n;
    this.firstEntryTime = null;
  }

  isEmpty(): boolean {
    return this.entries.length === 0;
  }

  shouldFlush(): boolean {
    if (this.entries.length === 0) return false;

    // Check entry count threshold
    if (this.entries.length >= this.options.maxEntries) {
      return true;
    }

    // Check size threshold
    if (this.estimatedSize >= this.options.targetSizeBytes) {
      return true;
    }

    // Check time threshold
    if (this.firstEntryTime !== null) {
      const age = Date.now() - this.firstEntryTime;
      if (age >= this.options.maxAgeMs) {
        return true;
      }
    }

    return false;
  }

  getTimeToFlush(): number | null {
    if (this.firstEntryTime === null) return null;
    const age = Date.now() - this.firstEntryTime;
    return Math.max(0, this.options.maxAgeMs - age);
  }

  getSourceCursors(): Map<string, bigint> {
    return new Map(this.sourceCursors);
  }

  /**
   * Get the LSN range of buffered entries
   */
  getLsnRange(): { min: bigint; max: bigint } | null {
    if (this.entries.length === 0) return null;
    return { min: this.minLsn, max: this.maxLsn };
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a buffer strategy from writer options
 * Defaults to HybridBufferStrategy
 */
export function createBufferStrategy(options: ResolvedWriterOptions): CDCBufferStrategy {
  return HybridBufferStrategy.fromWriterOptions(options);
}

/**
 * Buffer strategy type for factory
 */
export type BufferStrategyType = 'size' | 'time' | 'hybrid';

/**
 * Create a specific buffer strategy type
 */
export function createBufferStrategyOfType(
  type: BufferStrategyType,
  options: ResolvedWriterOptions
): CDCBufferStrategy {
  switch (type) {
    case 'size':
      return SizeBasedBufferStrategy.fromWriterOptions(options);
    case 'time':
      return TimeBasedBufferStrategy.fromWriterOptions(options);
    case 'hybrid':
    default:
      return HybridBufferStrategy.fromWriterOptions(options);
  }
}
