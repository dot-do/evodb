/**
 * Fallback Storage
 *
 * Local DO storage fallback when R2 is unavailable.
 * Provides durability for CDC data until R2 becomes available again.
 *
 * Strategy:
 * 1. When R2 write fails, store entries in DO's local SQLite storage
 * 2. Periodically attempt to recover entries to R2
 * 3. Maintain ordering via sequence numbers
 * 4. Respect size limits to prevent DO storage exhaustion
 */

import type { WalEntry } from './types.js';

// =============================================================================
// Storage Interface
// =============================================================================

/**
 * DO Storage interface (subset of DurableObjectStorage)
 */
export interface DOStorage {
  get<T>(key: string): Promise<T | undefined>;
  get<T>(keys: string[]): Promise<Map<string, T>>;
  put<T>(key: string, value: T): Promise<void>;
  put<T>(entries: Map<string, T>): Promise<void>;
  delete(key: string): Promise<boolean>;
  delete(keys: string[]): Promise<number>;
  list<T>(options?: { prefix?: string; limit?: number }): Promise<Map<string, T>>;
}

// =============================================================================
// Fallback Entry
// =============================================================================

/**
 * Entry stored in fallback storage
 */
interface FallbackEntry {
  /** Original WAL entry */
  entry: WalEntry;

  /** When the entry was stored in fallback */
  storedAt: number;

  /** Number of recovery attempts */
  recoveryAttempts: number;

  /** Last recovery attempt time */
  lastRecoveryAttempt?: number;
}

/**
 * Fallback storage metadata
 */
interface FallbackMetadata {
  /** Number of entries stored */
  entryCount: number;

  /** Total size in bytes (approximate) */
  totalSizeBytes: number;

  /** First sequence number stored */
  firstSequence?: number;

  /** Last sequence number stored */
  lastSequence?: number;

  /** When the first entry was stored */
  firstStoredAt?: number;

  /** When the last entry was stored */
  lastStoredAt?: number;
}

// =============================================================================
// Fallback Storage Implementation
// =============================================================================

/**
 * Fallback storage for CDC entries when R2 is unavailable
 */
export class FallbackStorage {
  private readonly storage: DOStorage;
  private readonly maxSizeBytes: number;
  private metadata: FallbackMetadata;

  /** Prefix for entry keys */
  private static readonly ENTRY_PREFIX = 'fallback:entry:';

  /** Key for metadata */
  private static readonly METADATA_KEY = 'fallback:metadata';

  constructor(storage: DOStorage, maxSizeBytes: number = 64 * 1024 * 1024) {
    this.storage = storage;
    this.maxSizeBytes = maxSizeBytes;
    this.metadata = {
      entryCount: 0,
      totalSizeBytes: 0,
    };
  }

  // ===========================================================================
  // Storage Operations
  // ===========================================================================

  /**
   * Store WAL entries in fallback storage
   */
  async store(entries: WalEntry[]): Promise<void> {
    if (entries.length === 0) return;

    // Load current metadata
    await this.loadMetadata();

    // Calculate size of new entries
    const newSize = entries.reduce((sum, e) => sum + this.estimateSize(e), 0);

    // Check if we would exceed size limit
    if (this.metadata.totalSizeBytes + newSize > this.maxSizeBytes) {
      // Try to make room by removing oldest entries
      await this.makeRoom(newSize);

      // Check again
      if (this.metadata.totalSizeBytes + newSize > this.maxSizeBytes) {
        throw new Error(
          `Fallback storage full: would need ${newSize} bytes but only ${this.maxSizeBytes - this.metadata.totalSizeBytes} available`
        );
      }
    }

    // Store entries
    const now = Date.now();
    const entriesToStore = new Map<string, FallbackEntry>();

    for (const entry of entries) {
      const key = this.entryKey(entry.sequence, entry.timestamp);
      entriesToStore.set(key, {
        entry,
        storedAt: now,
        recoveryAttempts: 0,
      });
    }

    await this.storage.put(entriesToStore);

    // Update metadata
    this.metadata.entryCount += entries.length;
    this.metadata.totalSizeBytes += newSize;

    const firstEntry = entries[0];
    const lastEntry = entries[entries.length - 1];

    if (!this.metadata.firstSequence || firstEntry.sequence < this.metadata.firstSequence) {
      this.metadata.firstSequence = firstEntry.sequence;
    }
    if (!this.metadata.lastSequence || lastEntry.sequence > this.metadata.lastSequence) {
      this.metadata.lastSequence = lastEntry.sequence;
    }
    if (!this.metadata.firstStoredAt) {
      this.metadata.firstStoredAt = now;
    }
    this.metadata.lastStoredAt = now;

    await this.saveMetadata();
  }

  /**
   * Retrieve all entries from fallback storage
   */
  async retrieve(): Promise<WalEntry[]> {
    const entries: WalEntry[] = [];

    // List all entry keys
    const stored = await this.storage.list<FallbackEntry>({
      prefix: FallbackStorage.ENTRY_PREFIX,
    });

    for (const fallbackEntry of stored.values()) {
      entries.push(fallbackEntry.entry);
    }

    // Sort by sequence number
    return entries.sort((a, b) => a.sequence - b.sequence);
  }

  /**
   * Retrieve entries in batches (for large recovery operations)
   */
  async *retrieveBatched(batchSize: number = 1000): AsyncGenerator<WalEntry[]> {
    let done = false;

    while (!done) {
      const batch: WalEntry[] = [];
      const stored = await this.storage.list<FallbackEntry>({
        prefix: FallbackStorage.ENTRY_PREFIX,
        limit: batchSize,
      });

      if (stored.size === 0) {
        done = true;
        continue;
      }

      for (const [_key, fallbackEntry] of stored) {
        batch.push(fallbackEntry.entry);
      }

      if (batch.length < batchSize) {
        done = true;
      }

      if (batch.length > 0) {
        // Sort batch by sequence
        yield batch.sort((a, b) => a.sequence - b.sequence);
      }
    }
  }

  /**
   * Clear all entries from fallback storage
   */
  async clear(): Promise<void> {
    // Get all entry keys
    const stored = await this.storage.list<FallbackEntry>({
      prefix: FallbackStorage.ENTRY_PREFIX,
    });

    const keys = Array.from(stored.keys());

    // Delete in batches
    const batchSize = 128;
    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);
      await this.storage.delete(batch);
    }

    // Reset metadata
    this.metadata = {
      entryCount: 0,
      totalSizeBytes: 0,
    };
    await this.saveMetadata();
  }

  /**
   * Remove specific entries by sequence numbers
   */
  async remove(sequences: number[]): Promise<void> {
    const sequenceSet = new Set(sequences);

    // Find keys to remove
    const stored = await this.storage.list<FallbackEntry>({
      prefix: FallbackStorage.ENTRY_PREFIX,
    });

    const keysToRemove: string[] = [];
    let sizeFreed = 0;

    for (const [key, fallbackEntry] of stored) {
      if (sequenceSet.has(fallbackEntry.entry.sequence)) {
        keysToRemove.push(key);
        sizeFreed += this.estimateSize(fallbackEntry.entry);
      }
    }

    if (keysToRemove.length > 0) {
      await this.storage.delete(keysToRemove);

      // Update metadata
      this.metadata.entryCount -= keysToRemove.length;
      this.metadata.totalSizeBytes -= sizeFreed;
      await this.saveMetadata();
    }
  }

  /**
   * Mark entries as attempted recovery
   */
  async markRecoveryAttempt(sequences: number[]): Promise<void> {
    const sequenceSet = new Set(sequences);
    const now = Date.now();

    // Find and update entries
    const stored = await this.storage.list<FallbackEntry>({
      prefix: FallbackStorage.ENTRY_PREFIX,
    });

    const updates = new Map<string, FallbackEntry>();

    for (const [key, fallbackEntry] of stored) {
      if (sequenceSet.has(fallbackEntry.entry.sequence)) {
        fallbackEntry.recoveryAttempts++;
        fallbackEntry.lastRecoveryAttempt = now;
        updates.set(key, fallbackEntry);
      }
    }

    if (updates.size > 0) {
      await this.storage.put(updates);
    }
  }

  // ===========================================================================
  // Status Methods
  // ===========================================================================

  /**
   * Check if there's data in fallback storage
   */
  hasData(): boolean {
    return this.metadata.entryCount > 0;
  }

  /**
   * Get metadata about fallback storage
   */
  getMetadata(): FallbackMetadata {
    return { ...this.metadata };
  }

  /**
   * Get storage utilization (0-1)
   */
  getUtilization(): number {
    return this.metadata.totalSizeBytes / this.maxSizeBytes;
  }

  /**
   * Get count of stored entries
   */
  getEntryCount(): number {
    return this.metadata.entryCount;
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Generate key for an entry
   */
  private entryKey(sequence: number, timestamp: number): string {
    // Use timestamp first for ordering, then sequence for uniqueness
    return `${FallbackStorage.ENTRY_PREFIX}${timestamp.toString(36).padStart(12, '0')}_${sequence.toString(36).padStart(12, '0')}`;
  }

  /**
   * Estimate size of an entry in bytes
   */
  private estimateSize(entry: WalEntry): number {
    let size = 200; // Base overhead
    size += entry.table.length * 2;
    size += entry.rowId.length * 2;
    if (entry.before) size += JSON.stringify(entry.before).length;
    if (entry.after) size += JSON.stringify(entry.after).length;
    if (entry.metadata) size += JSON.stringify(entry.metadata).length;
    return size;
  }

  /**
   * Load metadata from storage
   */
  private async loadMetadata(): Promise<void> {
    const stored = await this.storage.get<FallbackMetadata>(
      FallbackStorage.METADATA_KEY
    );
    if (stored) {
      this.metadata = stored;
    }
  }

  /**
   * Save metadata to storage
   */
  private async saveMetadata(): Promise<void> {
    await this.storage.put(FallbackStorage.METADATA_KEY, this.metadata);
  }

  /**
   * Make room for new entries by removing oldest
   */
  private async makeRoom(neededBytes: number): Promise<void> {
    const stored = await this.storage.list<FallbackEntry>({
      prefix: FallbackStorage.ENTRY_PREFIX,
    });

    // Sort by stored time (oldest first)
    const entries = Array.from(stored.entries()).sort(
      ([, a], [, b]) => a.storedAt - b.storedAt
    );

    const keysToRemove: string[] = [];
    let freedBytes = 0;

    for (const [key, fallbackEntry] of entries) {
      if (this.metadata.totalSizeBytes - freedBytes + neededBytes <= this.maxSizeBytes) {
        break;
      }

      keysToRemove.push(key);
      freedBytes += this.estimateSize(fallbackEntry.entry);
    }

    if (keysToRemove.length > 0) {
      await this.storage.delete(keysToRemove);
      this.metadata.entryCount -= keysToRemove.length;
      this.metadata.totalSizeBytes -= freedBytes;
    }
  }
}

// =============================================================================
// Retry Manager
// =============================================================================

/**
 * Configuration for fallback recovery
 */
export interface RecoveryConfig {
  /** Maximum retry attempts before giving up */
  maxRetries: number;

  /** Delay between retries (ms) */
  retryDelayMs: number;

  /** Exponential backoff multiplier */
  backoffMultiplier: number;

  /** Maximum delay between retries (ms) */
  maxDelayMs: number;
}

/**
 * Default recovery configuration
 */
export const DEFAULT_RECOVERY_CONFIG: RecoveryConfig = {
  maxRetries: 10,
  retryDelayMs: 1000,
  backoffMultiplier: 2,
  maxDelayMs: 60000,
};

/**
 * Recovery manager for fallback storage
 */
export class FallbackRecoveryManager {
  private readonly fallback: FallbackStorage;
  private readonly config: RecoveryConfig;
  private recovering: boolean = false;

  constructor(
    fallback: FallbackStorage,
    config: Partial<RecoveryConfig> = {}
  ) {
    this.fallback = fallback;
    this.config = { ...DEFAULT_RECOVERY_CONFIG, ...config };
  }

  /**
   * Attempt recovery with retry logic
   *
   * @param recoverFn Function to attempt recovery (should write to R2)
   * @returns Number of entries recovered, or -1 if still has data
   */
  async attemptRecovery(
    recoverFn: (entries: WalEntry[]) => Promise<void>
  ): Promise<number> {
    if (this.recovering) {
      return -1;
    }

    if (!this.fallback.hasData()) {
      return 0;
    }

    this.recovering = true;
    let totalRecovered = 0;

    try {
      // Process in batches
      for await (const batch of this.fallback.retrieveBatched(1000)) {
        let retries = 0;
        let delay = this.config.retryDelayMs;
        let success = false;

        while (retries < this.config.maxRetries && !success) {
          try {
            await recoverFn(batch);
            success = true;

            // Remove recovered entries
            const sequences = batch.map((e) => e.sequence);
            await this.fallback.remove(sequences);
            totalRecovered += batch.length;
          } catch {
            retries++;

            if (retries < this.config.maxRetries) {
              // Mark retry attempt
              const sequences = batch.map((e) => e.sequence);
              await this.fallback.markRecoveryAttempt(sequences);

              // Wait before retry
              await this.sleep(delay);
              delay = Math.min(delay * this.config.backoffMultiplier, this.config.maxDelayMs);
            }
          }
        }

        if (!success) {
          // Failed to recover this batch after max retries
          // Leave it in fallback storage for later
          break;
        }
      }

      return totalRecovered;
    } finally {
      this.recovering = false;
    }
  }

  /**
   * Check if recovery is in progress
   */
  isRecovering(): boolean {
    return this.recovering;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
