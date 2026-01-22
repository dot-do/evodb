/**
 * Offline-First Sync Module for EvoDB
 *
 * TDD Issue: evodb-bjfg
 *
 * This module provides:
 * - SyncManager interface with push/pull/sync methods
 * - Conflict detection and resolution strategies
 * - Change tracking with Hybrid Logical Clocks (HLC)
 * - Network status detection and offline queue management
 * - Bidirectional sync with remote servers
 *
 * @example
 * ```typescript
 * import { SyncManager, ConflictResolution, HybridLogicalClock } from '@evodb/core';
 *
 * const sync = new SyncManager({
 *   remote: { url: 'https://api.example.com/sync' },
 *   conflictResolution: ConflictResolution.LastWriteWins,
 * });
 *
 * // Track local changes
 * sync.trackChange('users', 'user-1', { name: 'Alice' }, 'update');
 *
 * // Sync with remote when online
 * const result = await sync.sync();
 * ```
 *
 * @module sync
 */

import { EvoDBError } from './errors.js';
import { captureStackTrace } from './stack-trace.js';
import { withRetry, type RetryOptions, isRetryableError } from './retry.js';

// =============================================================================
// Types and Interfaces
// =============================================================================

/**
 * Hybrid Logical Clock timestamp
 *
 * Combines physical time with a logical counter to provide:
 * - Monotonically increasing timestamps
 * - Causal ordering across distributed nodes
 * - Convergence with physical time when possible
 */
export interface HLCTimestamp {
  /** Physical time component (ms since epoch) */
  wallTime: number;
  /** Logical counter for events at the same wall time */
  counter: number;
  /** Node identifier for tie-breaking */
  nodeId: string;
}

/**
 * Vector clock for tracking causality across multiple nodes
 */
export interface VectorClock {
  /** Map of node ID to logical timestamp */
  clocks: Map<string, number>;
}

/**
 * Conflict resolution strategies
 */
export enum ConflictResolution {
  /** Last write wins based on HLC timestamp */
  LastWriteWins = 'last_write_wins',
  /** Merge changes field-by-field */
  Merge = 'merge',
  /** Use custom resolver function */
  Custom = 'custom',
  /** Keep both versions (for manual resolution) */
  KeepBoth = 'keep_both',
  /** Server always wins */
  ServerWins = 'server_wins',
  /** Client always wins */
  ClientWins = 'client_wins',
}

/**
 * Sync operation type
 */
export type SyncOperationType = 'insert' | 'update' | 'delete';

/**
 * A tracked change in the local database
 */
export interface TrackedChange<T = unknown> {
  /** Unique change identifier */
  id: string;
  /** Table or collection name */
  table: string;
  /** Primary key of the record */
  key: string;
  /** Type of operation */
  operation: SyncOperationType;
  /** Data before the change (for updates and deletes) */
  before?: T;
  /** Data after the change (for inserts and updates) */
  after?: T;
  /** HLC timestamp when change was made */
  timestamp: HLCTimestamp;
  /** Vector clock at time of change */
  vectorClock: VectorClock;
  /** Whether this change has been synced */
  synced: boolean;
  /** Number of sync attempts */
  attempts: number;
  /** Last sync attempt error */
  lastError?: string;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Remote change received from server
 */
export interface RemoteChange<T = unknown> {
  /** Unique change identifier */
  id: string;
  /** Table or collection name */
  table: string;
  /** Primary key of the record */
  key: string;
  /** Type of operation */
  operation: SyncOperationType;
  /** Data before the change */
  before?: T;
  /** Data after the change */
  after?: T;
  /** HLC timestamp from server */
  timestamp: HLCTimestamp;
  /** Vector clock from server */
  vectorClock: VectorClock;
  /** Server-assigned version */
  version: number;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Detected conflict between local and remote changes
 */
export interface SyncConflict<T = unknown> {
  /** Conflict identifier */
  id: string;
  /** Table where conflict occurred */
  table: string;
  /** Key of the conflicting record */
  key: string;
  /** Local change */
  local: TrackedChange<T>;
  /** Remote change */
  remote: RemoteChange<T>;
  /** Resolved value (after resolution strategy applied) */
  resolved?: T;
  /** Resolution strategy used */
  resolution?: ConflictResolution;
  /** Whether conflict was auto-resolved */
  autoResolved: boolean;
}

/**
 * Custom conflict resolver function
 */
export type ConflictResolver<T = unknown> = (
  conflict: SyncConflict<T>
) => Promise<T | undefined>;

/**
 * Network status
 */
export enum NetworkStatus {
  /** Device is online and can sync */
  Online = 'online',
  /** Device is offline */
  Offline = 'offline',
  /** Network status is unknown */
  Unknown = 'unknown',
}

/**
 * Sync state
 */
export enum SyncState {
  /** Sync is idle */
  Idle = 'idle',
  /** Currently pushing local changes */
  Pushing = 'pushing',
  /** Currently pulling remote changes */
  Pulling = 'pulling',
  /** Full bidirectional sync in progress */
  Syncing = 'syncing',
  /** Sync encountered an error */
  Error = 'error',
}

/**
 * Configuration for remote sync endpoint
 */
export interface RemoteConfig {
  /** Base URL of the sync server */
  url: string;
  /** Authentication headers or token */
  auth?: {
    type: 'bearer' | 'basic' | 'custom';
    token?: string;
    username?: string;
    password?: string;
    headers?: Record<string, string>;
  };
  /** Request timeout in ms */
  timeout?: number;
  /** Custom fetch implementation */
  fetch?: typeof fetch;
}

/**
 * SyncManager configuration options
 */
export interface SyncManagerOptions {
  /** Unique node identifier for this client */
  nodeId?: string;
  /** Remote server configuration */
  remote?: RemoteConfig;
  /** Default conflict resolution strategy */
  conflictResolution?: ConflictResolution;
  /** Custom conflict resolver */
  conflictResolver?: ConflictResolver;
  /** Retry options for network requests */
  retryOptions?: RetryOptions;
  /** Maximum number of changes to batch per sync */
  batchSize?: number;
  /** Sync interval in ms (0 = manual only) */
  syncInterval?: number;
  /** Whether to persist queue to storage */
  persistQueue?: boolean;
  /** Storage adapter for queue persistence */
  storage?: SyncStorage;
  /** Callback when network status changes */
  onNetworkChange?: (status: NetworkStatus) => void;
  /** Callback when sync state changes */
  onSyncStateChange?: (state: SyncState) => void;
  /** Callback when conflicts are detected */
  onConflict?: (conflicts: SyncConflict[]) => void;
}

/**
 * Storage adapter for persisting sync queue
 */
export interface SyncStorage {
  /** Get a value by key */
  get<T>(key: string): Promise<T | undefined>;
  /** Set a value */
  set<T>(key: string, value: T): Promise<void>;
  /** Delete a value */
  delete(key: string): Promise<void>;
  /** List all keys with a prefix */
  list(prefix: string): Promise<string[]>;
}

/**
 * Result of a sync operation
 */
export interface SyncResult {
  /** Whether sync was successful */
  success: boolean;
  /** Number of changes pushed */
  pushed: number;
  /** Number of changes pulled */
  pulled: number;
  /** Conflicts that were detected */
  conflicts: SyncConflict[];
  /** Errors that occurred */
  errors: SyncError[];
  /** Duration of sync in ms */
  duration: number;
  /** Last sync timestamp */
  lastSyncTimestamp: HLCTimestamp;
}

/**
 * Push result
 */
export interface PushResult {
  /** Whether push was successful */
  success: boolean;
  /** Number of changes pushed */
  pushed: number;
  /** Changes that failed to push */
  failed: TrackedChange[];
  /** Errors that occurred */
  errors: SyncError[];
}

/**
 * Pull result
 */
export interface PullResult {
  /** Whether pull was successful */
  success: boolean;
  /** Number of changes pulled */
  pulled: number;
  /** Conflicts that were detected */
  conflicts: SyncConflict[];
  /** Errors that occurred */
  errors: SyncError[];
}

// =============================================================================
// SyncError
// =============================================================================

/**
 * Error thrown during sync operations
 */
export class SyncError extends EvoDBError {
  /** The change that caused the error, if applicable */
  public readonly change?: TrackedChange | RemoteChange;

  constructor(
    message: string,
    code: string = 'SYNC_ERROR',
    details?: Record<string, unknown>,
    change?: TrackedChange | RemoteChange
  ) {
    super(message, code, details);
    this.name = 'SyncError';
    this.change = change;
    captureStackTrace(this, SyncError);
  }
}

// =============================================================================
// Hybrid Logical Clock
// =============================================================================

/**
 * Hybrid Logical Clock implementation
 *
 * Provides monotonically increasing timestamps that combine physical time
 * with a logical counter for ordering events across distributed nodes.
 *
 * @example
 * ```typescript
 * const clock = new HybridLogicalClock('node-1');
 * const ts1 = clock.now();
 * const ts2 = clock.now();
 * // ts2 is guaranteed to be > ts1
 *
 * // Receive timestamp from another node
 * clock.receive(remoteTimestamp);
 * const ts3 = clock.now();
 * // ts3 is guaranteed to be > remoteTimestamp
 * ```
 */
export class HybridLogicalClock {
  private wallTime: number;
  private counter: number;
  public readonly nodeId: string;

  constructor(nodeId: string) {
    this.nodeId = nodeId;
    this.wallTime = Date.now();
    this.counter = 0;
  }

  /**
   * Generate a new timestamp
   */
  now(): HLCTimestamp {
    const physicalTime = Date.now();

    if (physicalTime > this.wallTime) {
      // Physical time has advanced, reset counter
      this.wallTime = physicalTime;
      this.counter = 0;
    } else {
      // Same or earlier physical time, increment counter
      this.counter++;
    }

    return {
      wallTime: this.wallTime,
      counter: this.counter,
      nodeId: this.nodeId,
    };
  }

  /**
   * Update clock based on received timestamp
   * Ensures causality is maintained
   */
  receive(remote: HLCTimestamp): HLCTimestamp {
    const physicalTime = Date.now();

    if (physicalTime > this.wallTime && physicalTime > remote.wallTime) {
      // Physical time is ahead of both, use it
      this.wallTime = physicalTime;
      this.counter = 0;
    } else if (remote.wallTime > this.wallTime) {
      // Remote is ahead, catch up
      this.wallTime = remote.wallTime;
      this.counter = remote.counter + 1;
    } else if (this.wallTime === remote.wallTime) {
      // Same wall time, increment counter
      this.counter = Math.max(this.counter, remote.counter) + 1;
    } else {
      // We're ahead, just increment
      this.counter++;
    }

    return {
      wallTime: this.wallTime,
      counter: this.counter,
      nodeId: this.nodeId,
    };
  }

  /**
   * Compare two timestamps
   * @returns negative if a < b, 0 if equal, positive if a > b
   */
  static compare(a: HLCTimestamp, b: HLCTimestamp): number {
    if (a.wallTime !== b.wallTime) {
      return a.wallTime - b.wallTime;
    }
    if (a.counter !== b.counter) {
      return a.counter - b.counter;
    }
    return a.nodeId.localeCompare(b.nodeId);
  }

  /**
   * Check if timestamp a is before timestamp b
   */
  static isBefore(a: HLCTimestamp, b: HLCTimestamp): boolean {
    return HybridLogicalClock.compare(a, b) < 0;
  }

  /**
   * Check if timestamp a is after timestamp b
   */
  static isAfter(a: HLCTimestamp, b: HLCTimestamp): boolean {
    return HybridLogicalClock.compare(a, b) > 0;
  }

  /**
   * Serialize timestamp to string
   */
  static serialize(ts: HLCTimestamp): string {
    return `${ts.wallTime.toString(36)}-${ts.counter.toString(36)}-${ts.nodeId}`;
  }

  /**
   * Deserialize timestamp from string
   */
  static deserialize(str: string): HLCTimestamp {
    const parts = str.split('-');
    if (parts.length < 3) {
      throw new SyncError(`Invalid HLC timestamp format: ${str}`, 'INVALID_TIMESTAMP');
    }
    return {
      wallTime: parseInt(parts[0], 36),
      counter: parseInt(parts[1], 36),
      nodeId: parts.slice(2).join('-'), // nodeId might contain dashes
    };
  }
}

// =============================================================================
// Vector Clock
// =============================================================================

/**
 * Vector Clock implementation for tracking causality
 *
 * @example
 * ```typescript
 * const vc = new VectorClockImpl('node-1');
 * vc.increment();
 * vc.merge(otherVectorClock);
 * ```
 */
export class VectorClockImpl implements VectorClock {
  public clocks: Map<string, number>;
  private nodeId: string;

  constructor(nodeId: string, clocks?: Map<string, number>) {
    this.nodeId = nodeId;
    this.clocks = clocks ?? new Map([[nodeId, 0]]);
  }

  /**
   * Increment this node's counter
   */
  increment(): VectorClock {
    const current = this.clocks.get(this.nodeId) ?? 0;
    this.clocks.set(this.nodeId, current + 1);
    return { clocks: new Map(this.clocks) };
  }

  /**
   * Merge with another vector clock
   */
  merge(other: VectorClock): VectorClock {
    for (const [nodeId, counter] of other.clocks) {
      const current = this.clocks.get(nodeId) ?? 0;
      this.clocks.set(nodeId, Math.max(current, counter));
    }
    return { clocks: new Map(this.clocks) };
  }

  /**
   * Get current state as VectorClock
   */
  getClock(): VectorClock {
    return { clocks: new Map(this.clocks) };
  }

  /**
   * Check if this clock is causally before another
   */
  isBefore(other: VectorClock): boolean {
    let atLeastOneLess = false;

    for (const [nodeId, counter] of this.clocks) {
      const otherCounter = other.clocks.get(nodeId) ?? 0;
      if (counter > otherCounter) {
        return false;
      }
      if (counter < otherCounter) {
        atLeastOneLess = true;
      }
    }

    // Check for nodes in other that we don't have
    for (const [nodeId, counter] of other.clocks) {
      if (!this.clocks.has(nodeId) && counter > 0) {
        atLeastOneLess = true;
      }
    }

    return atLeastOneLess;
  }

  /**
   * Check if this clock is concurrent with another (neither before nor after)
   */
  isConcurrent(other: VectorClock): boolean {
    return !this.isBefore(other) && !this.isAfter(other);
  }

  /**
   * Check if this clock is causally after another
   */
  isAfter(other: VectorClock): boolean {
    const otherImpl = new VectorClockImpl(this.nodeId, new Map(other.clocks));
    return otherImpl.isBefore(this.getClock());
  }

  /**
   * Serialize to JSON-compatible object
   */
  static serialize(vc: VectorClock): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [key, value] of vc.clocks) {
      result[key] = value;
    }
    return result;
  }

  /**
   * Deserialize from JSON-compatible object
   */
  static deserialize(obj: Record<string, number>, nodeId: string): VectorClockImpl {
    const clocks = new Map(Object.entries(obj));
    return new VectorClockImpl(nodeId, clocks);
  }
}

// =============================================================================
// Network Status Monitor
// =============================================================================

/**
 * Network status monitor
 *
 * Tracks online/offline status and notifies listeners
 */
export class NetworkStatusMonitor {
  private status: NetworkStatus = NetworkStatus.Unknown;
  private listeners: Set<(status: NetworkStatus) => void> = new Set();
  private pingUrl?: string;
  private pingInterval?: ReturnType<typeof setInterval>;

  constructor(options?: { pingUrl?: string; pingIntervalMs?: number }) {
    this.pingUrl = options?.pingUrl;

    // Initialize status based on navigator.onLine if available (browser only)
    // Note: navigator and window are not available in Cloudflare Workers
    if (typeof globalThis !== 'undefined') {
      const nav = (globalThis as { navigator?: { onLine?: boolean } }).navigator;
      const win = globalThis as { addEventListener?: (event: string, handler: () => void) => void };

      if (nav && 'onLine' in nav) {
        this.status = nav.onLine ? NetworkStatus.Online : NetworkStatus.Offline;

        // Listen for online/offline events (browser only)
        if (win.addEventListener) {
          win.addEventListener('online', () => this.setStatus(NetworkStatus.Online));
          win.addEventListener('offline', () => this.setStatus(NetworkStatus.Offline));
        }
      }
    }

    // Optional ping-based status checking
    if (options?.pingUrl && options?.pingIntervalMs) {
      this.startPingCheck(options.pingIntervalMs);
    }
  }

  /**
   * Get current network status
   */
  getStatus(): NetworkStatus {
    return this.status;
  }

  /**
   * Check if currently online
   */
  isOnline(): boolean {
    return this.status === NetworkStatus.Online;
  }

  /**
   * Subscribe to status changes
   */
  subscribe(listener: (status: NetworkStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Manually set status (e.g., after a failed network request)
   */
  setStatus(status: NetworkStatus): void {
    if (this.status !== status) {
      this.status = status;
      for (const listener of this.listeners) {
        listener(status);
      }
    }
  }

  /**
   * Start periodic ping checks
   */
  private startPingCheck(intervalMs: number): void {
    this.pingInterval = setInterval(async () => {
      if (!this.pingUrl) return;

      try {
        const response = await fetch(this.pingUrl, {
          method: 'HEAD',
        });
        this.setStatus(response.ok ? NetworkStatus.Online : NetworkStatus.Offline);
      } catch {
        this.setStatus(NetworkStatus.Offline);
      }
    }, intervalMs);
  }

  /**
   * Stop monitoring and clean up
   */
  destroy(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    this.listeners.clear();
  }
}

// =============================================================================
// Offline Queue
// =============================================================================

/**
 * Queue for storing changes while offline
 */
export class OfflineQueue<T = unknown> {
  private queue: TrackedChange<T>[] = [];
  private storage?: SyncStorage;
  private storageKey: string;

  constructor(options?: { storage?: SyncStorage; storageKey?: string }) {
    this.storage = options?.storage;
    this.storageKey = options?.storageKey ?? 'evodb:sync:queue';
  }

  /**
   * Initialize queue from persistent storage
   */
  async initialize(): Promise<void> {
    if (this.storage) {
      const stored = await this.storage.get<TrackedChange<T>[]>(this.storageKey);
      if (stored) {
        this.queue = stored;
      }
    }
  }

  /**
   * Add a change to the queue
   */
  async enqueue(change: TrackedChange<T>): Promise<void> {
    this.queue.push(change);
    await this.persist();
  }

  /**
   * Get all pending changes
   */
  getPending(): TrackedChange<T>[] {
    return this.queue.filter(c => !c.synced);
  }

  /**
   * Get all changes
   */
  getAll(): TrackedChange<T>[] {
    return [...this.queue];
  }

  /**
   * Mark changes as synced
   */
  async markSynced(ids: string[]): Promise<void> {
    const idSet = new Set(ids);
    for (const change of this.queue) {
      if (idSet.has(change.id)) {
        change.synced = true;
      }
    }
    await this.persist();
  }

  /**
   * Remove synced changes
   */
  async compact(): Promise<number> {
    const before = this.queue.length;
    this.queue = this.queue.filter(c => !c.synced);
    await this.persist();
    return before - this.queue.length;
  }

  /**
   * Remove a specific change
   */
  async remove(id: string): Promise<void> {
    this.queue = this.queue.filter(c => c.id !== id);
    await this.persist();
  }

  /**
   * Clear all changes
   */
  async clear(): Promise<void> {
    this.queue = [];
    await this.persist();
  }

  /**
   * Get queue size
   */
  get size(): number {
    return this.queue.length;
  }

  /**
   * Get pending count
   */
  get pendingCount(): number {
    return this.queue.filter(c => !c.synced).length;
  }

  /**
   * Update a change's attempt count and error
   */
  async updateAttempt(id: string, error?: string): Promise<void> {
    const change = this.queue.find(c => c.id === id);
    if (change) {
      change.attempts++;
      change.lastError = error;
      await this.persist();
    }
  }

  /**
   * Persist queue to storage
   */
  private async persist(): Promise<void> {
    if (this.storage) {
      await this.storage.set(this.storageKey, this.queue);
    }
  }
}

// =============================================================================
// Conflict Resolver
// =============================================================================

/**
 * Resolves conflicts between local and remote changes
 */
export class ConflictResolverImpl<T = unknown> {
  private strategy: ConflictResolution;
  private customResolver?: ConflictResolver<T>;

  constructor(strategy: ConflictResolution, customResolver?: ConflictResolver<T>) {
    this.strategy = strategy;
    this.customResolver = customResolver;
  }

  /**
   * Resolve a conflict
   */
  async resolve(conflict: SyncConflict<T>): Promise<T | undefined> {
    switch (this.strategy) {
      case ConflictResolution.LastWriteWins:
        return this.resolveLastWriteWins(conflict);

      case ConflictResolution.Merge:
        return this.resolveMerge(conflict);

      case ConflictResolution.ServerWins:
        return this.resolveServerWins(conflict);

      case ConflictResolution.ClientWins:
        return this.resolveClientWins(conflict);

      case ConflictResolution.Custom:
        if (!this.customResolver) {
          throw new SyncError(
            'Custom conflict resolution selected but no resolver provided',
            'MISSING_RESOLVER'
          );
        }
        return this.customResolver(conflict);

      case ConflictResolution.KeepBoth:
        // Return undefined to indicate manual resolution needed
        return undefined;

      default:
        throw new SyncError(`Unknown conflict resolution strategy: ${this.strategy}`, 'INVALID_STRATEGY');
    }
  }

  /**
   * Last-write-wins based on HLC timestamp
   */
  private resolveLastWriteWins(conflict: SyncConflict<T>): T | undefined {
    const localTs = conflict.local.timestamp;
    const remoteTs = conflict.remote.timestamp;

    if (HybridLogicalClock.isAfter(localTs, remoteTs)) {
      return conflict.local.after as T;
    } else {
      return conflict.remote.after as T;
    }
  }

  /**
   * Field-by-field merge
   */
  private resolveMerge(conflict: SyncConflict<T>): T | undefined {
    const localAfter = conflict.local.after as Record<string, unknown> | undefined;
    const remoteAfter = conflict.remote.after as Record<string, unknown> | undefined;
    const localBefore = conflict.local.before as Record<string, unknown> | undefined;

    if (!localAfter || !remoteAfter) {
      // Can't merge deletes, use last-write-wins
      return this.resolveLastWriteWins(conflict);
    }

    // Start with remote as base
    const merged: Record<string, unknown> = { ...remoteAfter };

    // Apply local changes that are different from before
    if (localBefore) {
      for (const key of Object.keys(localAfter)) {
        if (localAfter[key] !== localBefore[key]) {
          // This field was changed locally
          if (remoteAfter[key] === localBefore[key]) {
            // Remote didn't change this field, use local
            merged[key] = localAfter[key];
          } else {
            // Both changed this field, use most recent
            const localTs = conflict.local.timestamp;
            const remoteTs = conflict.remote.timestamp;
            if (HybridLogicalClock.isAfter(localTs, remoteTs)) {
              merged[key] = localAfter[key];
            }
            // else keep remote (already in merged)
          }
        }
      }
    } else {
      // No before state, just overlay local on remote
      Object.assign(merged, localAfter);
    }

    return merged as T;
  }

  /**
   * Server always wins
   */
  private resolveServerWins(conflict: SyncConflict<T>): T | undefined {
    return conflict.remote.after as T;
  }

  /**
   * Client always wins
   */
  private resolveClientWins(conflict: SyncConflict<T>): T | undefined {
    return conflict.local.after as T;
  }
}

// =============================================================================
// SyncManager
// =============================================================================

/**
 * Main sync manager for offline-first synchronization
 *
 * @example
 * ```typescript
 * const sync = new SyncManager({
 *   nodeId: 'client-123',
 *   remote: { url: 'https://api.example.com/sync' },
 *   conflictResolution: ConflictResolution.LastWriteWins,
 * });
 *
 * // Track a change
 * sync.trackChange('users', 'user-1', { name: 'Alice', age: 30 }, 'update', { name: 'Alice', age: 29 });
 *
 * // Sync with remote
 * const result = await sync.sync();
 * console.log(`Pushed ${result.pushed}, pulled ${result.pulled}`);
 * ```
 */
export class SyncManager<T = unknown> {
  private readonly nodeId: string;
  private readonly clock: HybridLogicalClock;
  private readonly vectorClock: VectorClockImpl;
  private readonly queue: OfflineQueue<T>;
  private readonly resolver: ConflictResolverImpl<T>;
  private readonly network: NetworkStatusMonitor;
  private readonly options: SyncManagerOptions;

  private state: SyncState = SyncState.Idle;
  private lastSyncTimestamp?: HLCTimestamp;
  private syncInterval?: ReturnType<typeof setInterval>;
  private changeCounter = 0;

  /** Event listeners */
  private readonly stateListeners: Set<(state: SyncState) => void> = new Set();
  private readonly conflictListeners: Set<(conflicts: SyncConflict<T>[]) => void> = new Set();

  constructor(options: SyncManagerOptions = {}) {
    this.options = options;
    this.nodeId = options.nodeId ?? this.generateNodeId();
    this.clock = new HybridLogicalClock(this.nodeId);
    this.vectorClock = new VectorClockImpl(this.nodeId);
    this.queue = new OfflineQueue<T>({
      storage: options.storage,
      storageKey: `evodb:sync:queue:${this.nodeId}`,
    });
    this.resolver = new ConflictResolverImpl<T>(
      options.conflictResolution ?? ConflictResolution.LastWriteWins,
      options.conflictResolver as ConflictResolver<T> | undefined
    );
    this.network = new NetworkStatusMonitor();

    // Subscribe to network changes
    if (options.onNetworkChange) {
      this.network.subscribe(options.onNetworkChange);
    }

    // Set up automatic sync interval
    if (options.syncInterval && options.syncInterval > 0) {
      this.startAutoSync(options.syncInterval);
    }
  }

  /**
   * Initialize the sync manager (load persisted queue)
   */
  async initialize(): Promise<void> {
    await this.queue.initialize();

    // Load last sync timestamp from storage
    if (this.options.storage) {
      const stored = await this.options.storage.get<string>(`evodb:sync:lastSync:${this.nodeId}`);
      if (stored) {
        this.lastSyncTimestamp = HybridLogicalClock.deserialize(stored);
      }
    }
  }

  /**
   * Track a local change
   */
  async trackChange(
    table: string,
    key: string,
    after: T | undefined,
    operation: SyncOperationType,
    before?: T,
    metadata?: Record<string, unknown>
  ): Promise<TrackedChange<T>> {
    const timestamp = this.clock.now();
    const vectorClock = this.vectorClock.increment();

    const change: TrackedChange<T> = {
      id: this.generateChangeId(),
      table,
      key,
      operation,
      before,
      after,
      timestamp,
      vectorClock,
      synced: false,
      attempts: 0,
      metadata,
    };

    await this.queue.enqueue(change);
    return change;
  }

  /**
   * Push local changes to remote
   */
  async push(): Promise<PushResult> {
    if (!this.options.remote) {
      return {
        success: false,
        pushed: 0,
        failed: [],
        errors: [new SyncError('No remote configured', 'NO_REMOTE')],
      };
    }

    if (!this.network.isOnline()) {
      return {
        success: false,
        pushed: 0,
        failed: this.queue.getPending(),
        errors: [new SyncError('Device is offline', 'OFFLINE')],
      };
    }

    this.setState(SyncState.Pushing);

    const pending = this.queue.getPending();
    const batchSize = this.options.batchSize ?? 100;
    const batches = this.chunk(pending, batchSize);

    let totalPushed = 0;
    const allFailed: TrackedChange<T>[] = [];
    const allErrors: SyncError[] = [];

    try {
      for (const batch of batches) {
        const result = await this.pushBatch(batch);
        totalPushed += result.pushed;
        allFailed.push(...(result.failed as TrackedChange<T>[]));
        allErrors.push(...result.errors);
      }

      this.setState(SyncState.Idle);

      return {
        success: allErrors.length === 0,
        pushed: totalPushed,
        failed: allFailed,
        errors: allErrors,
      };
    } catch (error) {
      this.setState(SyncState.Error);
      const syncError = error instanceof SyncError ? error : new SyncError(
        error instanceof Error ? error.message : String(error),
        'PUSH_ERROR'
      );
      return {
        success: false,
        pushed: totalPushed,
        failed: allFailed,
        errors: [...allErrors, syncError],
      };
    }
  }

  /**
   * Pull changes from remote
   */
  async pull(): Promise<PullResult> {
    if (!this.options.remote) {
      return {
        success: false,
        pulled: 0,
        conflicts: [],
        errors: [new SyncError('No remote configured', 'NO_REMOTE')],
      };
    }

    if (!this.network.isOnline()) {
      return {
        success: false,
        pulled: 0,
        conflicts: [],
        errors: [new SyncError('Device is offline', 'OFFLINE')],
      };
    }

    this.setState(SyncState.Pulling);

    try {
      const remoteChanges = await this.fetchRemoteChanges();
      const conflicts: SyncConflict<T>[] = [];
      let pulled = 0;

      for (const remoteChange of remoteChanges) {
        // Check for conflicts with local pending changes
        const conflict = this.detectConflict(remoteChange);

        if (conflict) {
          // Resolve conflict
          const resolved = await this.resolver.resolve(conflict);
          conflict.resolved = resolved;
          conflict.autoResolved = resolved !== undefined;
          conflicts.push(conflict);
        }

        // Update local clock
        this.clock.receive(remoteChange.timestamp);

        pulled++;
      }

      // Update last sync timestamp
      if (remoteChanges.length > 0) {
        this.lastSyncTimestamp = this.clock.now();
        await this.persistLastSyncTimestamp();
      }

      // Notify conflict listeners
      if (conflicts.length > 0) {
        this.notifyConflicts(conflicts);
      }

      this.setState(SyncState.Idle);

      return {
        success: true,
        pulled,
        conflicts,
        errors: [],
      };
    } catch (error) {
      this.setState(SyncState.Error);
      const syncError = error instanceof SyncError ? error : new SyncError(
        error instanceof Error ? error.message : String(error),
        'PULL_ERROR'
      );
      return {
        success: false,
        pulled: 0,
        conflicts: [],
        errors: [syncError],
      };
    }
  }

  /**
   * Full bidirectional sync
   */
  async sync(): Promise<SyncResult> {
    const startTime = Date.now();
    this.setState(SyncState.Syncing);

    // Push first, then pull
    const pushResult = await this.push();
    const pullResult = await this.pull();

    const result: SyncResult = {
      success: pushResult.success && pullResult.success,
      pushed: pushResult.pushed,
      pulled: pullResult.pulled,
      conflicts: pullResult.conflicts,
      errors: [...pushResult.errors, ...pullResult.errors],
      duration: Date.now() - startTime,
      lastSyncTimestamp: this.lastSyncTimestamp ?? this.clock.now(),
    };

    this.setState(result.success ? SyncState.Idle : SyncState.Error);

    return result;
  }

  /**
   * Get current sync state
   */
  getState(): SyncState {
    return this.state;
  }

  /**
   * Get network status
   */
  getNetworkStatus(): NetworkStatus {
    return this.network.getStatus();
  }

  /**
   * Get pending changes count
   */
  getPendingCount(): number {
    return this.queue.pendingCount;
  }

  /**
   * Get all pending changes
   */
  getPendingChanges(): TrackedChange<T>[] {
    return this.queue.getPending();
  }

  /**
   * Get last sync timestamp
   */
  getLastSyncTimestamp(): HLCTimestamp | undefined {
    return this.lastSyncTimestamp;
  }

  /**
   * Get current HLC timestamp
   */
  getCurrentTimestamp(): HLCTimestamp {
    return this.clock.now();
  }

  /**
   * Subscribe to state changes
   */
  onStateChange(listener: (state: SyncState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  /**
   * Subscribe to conflict events
   */
  onConflict(listener: (conflicts: SyncConflict<T>[]) => void): () => void {
    this.conflictListeners.add(listener);
    return () => this.conflictListeners.delete(listener);
  }

  /**
   * Manually retry failed changes
   */
  async retryFailed(): Promise<PushResult> {
    const failed = this.queue.getPending().filter(c => c.attempts > 0);
    if (failed.length === 0) {
      return { success: true, pushed: 0, failed: [], errors: [] };
    }
    return this.pushBatch(failed);
  }

  /**
   * Compact the queue (remove synced changes)
   */
  async compactQueue(): Promise<number> {
    return this.queue.compact();
  }

  /**
   * Clear all pending changes
   */
  async clearQueue(): Promise<void> {
    return this.queue.clear();
  }

  /**
   * Stop auto-sync and clean up resources
   */
  destroy(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    this.network.destroy();
    this.stateListeners.clear();
    this.conflictListeners.clear();
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  private generateNodeId(): string {
    return `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private generateChangeId(): string {
    return `${this.nodeId}-${Date.now().toString(36)}-${(++this.changeCounter).toString(36)}`;
  }

  private setState(state: SyncState): void {
    if (this.state !== state) {
      this.state = state;
      for (const listener of this.stateListeners) {
        listener(state);
      }
      this.options.onSyncStateChange?.(state);
    }
  }

  private notifyConflicts(conflicts: SyncConflict<T>[]): void {
    for (const listener of this.conflictListeners) {
      listener(conflicts);
    }
    this.options.onConflict?.(conflicts);
  }

  private startAutoSync(intervalMs: number): void {
    this.syncInterval = setInterval(async () => {
      if (this.state === SyncState.Idle && this.network.isOnline()) {
        await this.sync();
      }
    }, intervalMs);
  }

  private async pushBatch(changes: TrackedChange<T>[]): Promise<PushResult> {
    if (!this.options.remote) {
      throw new SyncError('No remote configured', 'NO_REMOTE');
    }

    const headers = this.buildHeaders();
    const body = JSON.stringify({
      nodeId: this.nodeId,
      changes: changes.map(c => ({
        ...c,
        timestamp: HybridLogicalClock.serialize(c.timestamp),
        vectorClock: VectorClockImpl.serialize(c.vectorClock),
      })),
    });

    try {
      const result = await withRetry(
        async () => {
          const fetchFn = this.options.remote!.fetch ?? fetch;
          const response = await fetchFn(`${this.options.remote!.url}/push`, {
            method: 'POST',
            headers,
            body,
          });

          if (!response.ok) {
            const error = await response.text();
            throw new SyncError(`Push failed: ${response.status} ${error}`, 'PUSH_FAILED', {
              status: response.status,
            });
          }

          return response.json() as Promise<{ synced: string[]; failed: string[] }>;
        },
        this.options.retryOptions
      );

      // Mark synced changes
      await this.queue.markSynced(result.synced);

      // Update attempt counts for failed
      for (const id of result.failed) {
        await this.queue.updateAttempt(id, 'Server rejected');
      }

      const failedChanges = changes.filter(c => result.failed.includes(c.id));

      return {
        success: result.failed.length === 0,
        pushed: result.synced.length,
        failed: failedChanges,
        errors: result.failed.length > 0
          ? [new SyncError(`${result.failed.length} changes failed to sync`, 'PARTIAL_FAILURE')]
          : [],
      };
    } catch (error) {
      // Update attempt counts on error
      for (const change of changes) {
        await this.queue.updateAttempt(
          change.id,
          error instanceof Error ? error.message : String(error)
        );
      }

      // Check if error indicates we're offline
      if (error instanceof Error && isRetryableError(error)) {
        this.network.setStatus(NetworkStatus.Offline);
      }

      throw error;
    }
  }

  private async fetchRemoteChanges(): Promise<RemoteChange<T>[]> {
    if (!this.options.remote) {
      throw new SyncError('No remote configured', 'NO_REMOTE');
    }

    const headers = this.buildHeaders();
    const since = this.lastSyncTimestamp
      ? HybridLogicalClock.serialize(this.lastSyncTimestamp)
      : '';

    const result = await withRetry(
      async () => {
        const fetchFn = this.options.remote!.fetch ?? fetch;
        const response = await fetchFn(
          `${this.options.remote!.url}/pull?since=${encodeURIComponent(since)}&nodeId=${encodeURIComponent(this.nodeId)}`,
          {
            method: 'GET',
            headers,
          }
        );

        if (!response.ok) {
          const error = await response.text();
          throw new SyncError(`Pull failed: ${response.status} ${error}`, 'PULL_FAILED', {
            status: response.status,
          });
        }

        return response.json() as Promise<{
          changes: Array<{
            id: string;
            table: string;
            key: string;
            operation: SyncOperationType;
            before?: T;
            after?: T;
            timestamp: string;
            vectorClock: Record<string, number>;
            version: number;
            metadata?: Record<string, unknown>;
          }>;
        }>;
      },
      this.options.retryOptions
    );

    // Deserialize timestamps and vector clocks
    return result.changes.map(c => ({
      ...c,
      timestamp: HybridLogicalClock.deserialize(c.timestamp),
      vectorClock: { clocks: new Map(Object.entries(c.vectorClock)) },
    }));
  }

  private detectConflict(remoteChange: RemoteChange<T>): SyncConflict<T> | undefined {
    // Check if we have a pending local change for the same key
    const pending = this.queue.getPending();
    const localChange = pending.find(
      c => c.table === remoteChange.table && c.key === remoteChange.key && !c.synced
    );

    if (!localChange) {
      return undefined;
    }

    // Check if changes are concurrent using vector clocks
    const localVc = new VectorClockImpl(this.nodeId, localChange.vectorClock.clocks);
    const isConcurrent = localVc.isConcurrent(remoteChange.vectorClock);

    if (!isConcurrent) {
      // Not a conflict - one causally happened before the other
      return undefined;
    }

    return {
      id: `conflict-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      table: remoteChange.table,
      key: remoteChange.key,
      local: localChange,
      remote: remoteChange,
      autoResolved: false,
    };
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const auth = this.options.remote?.auth;
    if (auth) {
      switch (auth.type) {
        case 'bearer':
          if (auth.token) {
            headers['Authorization'] = `Bearer ${auth.token}`;
          }
          break;
        case 'basic':
          if (auth.username && auth.password) {
            const credentials = btoa(`${auth.username}:${auth.password}`);
            headers['Authorization'] = `Basic ${credentials}`;
          }
          break;
        case 'custom':
          if (auth.headers) {
            Object.assign(headers, auth.headers);
          }
          break;
      }
    }

    return headers;
  }

  private async persistLastSyncTimestamp(): Promise<void> {
    if (this.options.storage && this.lastSyncTimestamp) {
      await this.options.storage.set(
        `evodb:sync:lastSync:${this.nodeId}`,
        HybridLogicalClock.serialize(this.lastSyncTimestamp)
      );
    }
  }

  private chunk<U>(array: U[], size: number): U[][] {
    const chunks: U[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

// =============================================================================
// CRDT Implementations
// =============================================================================

/**
 * Last-Write-Wins Register CRDT
 *
 * A register that resolves concurrent writes by keeping the value with the
 * highest timestamp. Uses node ID as a tiebreaker when timestamps are equal.
 *
 * @example
 * ```typescript
 * const reg = new LWWRegister('node-1', 'initial', Date.now());
 * const updated = reg.set('new value', Date.now());
 * const merged = reg.merge(otherRegister);
 * console.log(merged.get()); // Returns winning value
 * ```
 */
export class LWWRegister<T> {
  constructor(
    private readonly nodeId: string,
    private value: T,
    private timestamp: number
  ) {}

  /**
   * Get the current value
   */
  get(): T {
    return this.value;
  }

  /**
   * Get the current timestamp
   */
  getTimestamp(): number {
    return this.timestamp;
  }

  /**
   * Get the node ID
   */
  getNodeId(): string {
    return this.nodeId;
  }

  /**
   * Set a new value with a timestamp
   * Returns a new register if the new timestamp wins, otherwise returns this
   */
  set(value: T, timestamp: number, nodeId?: string): LWWRegister<T> {
    const effectiveNodeId = nodeId ?? this.nodeId;

    if (timestamp > this.timestamp ||
        (timestamp === this.timestamp && effectiveNodeId > this.nodeId)) {
      return new LWWRegister(effectiveNodeId, value, timestamp);
    }
    return this;
  }

  /**
   * Merge with another register
   * Returns a new register with the winning value
   */
  merge(other: LWWRegister<T>): LWWRegister<T> {
    if (other.timestamp > this.timestamp ||
        (other.timestamp === this.timestamp && other.nodeId > this.nodeId)) {
      return new LWWRegister(other.nodeId, other.value, other.timestamp);
    }
    return this;
  }

  /**
   * Serialize to JSON-compatible object
   */
  toJSON(): { value: T; timestamp: number; nodeId: string } {
    return {
      value: this.value,
      timestamp: this.timestamp,
      nodeId: this.nodeId,
    };
  }

  /**
   * Create from JSON object
   */
  static fromJSON<T>(json: { value: T; timestamp: number; nodeId: string }): LWWRegister<T> {
    return new LWWRegister(json.nodeId, json.value, json.timestamp);
  }
}

/**
 * Last-Write-Wins Map CRDT
 *
 * A map where each key is a LWW register. Deletions are handled using
 * tombstones (null values).
 *
 * @example
 * ```typescript
 * const map = new LWWMap<string>('node-1');
 * map.set('key1', 'value1', Date.now());
 * map.delete('key1', Date.now() + 1);
 * const merged = map.merge(otherMap);
 * ```
 */
export class LWWMap<V> {
  private registers = new Map<string, LWWRegister<V | null>>();
  private readonly nodeId: string;

  constructor(nodeId: string) {
    this.nodeId = nodeId;
  }

  /**
   * Internal method to set a value (including null for tombstones)
   */
  private setInternal(key: string, value: V | null, timestamp: number, nodeId?: string): void {
    const effectiveNodeId = nodeId ?? this.nodeId;
    const existing = this.registers.get(key);

    if (existing) {
      this.registers.set(key, existing.set(value, timestamp, effectiveNodeId));
    } else {
      this.registers.set(key, new LWWRegister(effectiveNodeId, value, timestamp));
    }
  }

  /**
   * Set a value for a key
   */
  set(key: string, value: V, timestamp: number, nodeId?: string): void {
    this.setInternal(key, value, timestamp, nodeId);
  }

  /**
   * Delete a key (sets tombstone)
   */
  delete(key: string, timestamp: number, nodeId?: string): void {
    this.setInternal(key, null, timestamp, nodeId);
  }

  /**
   * Get a value for a key
   * Returns undefined if key doesn't exist or has been deleted
   */
  get(key: string): V | undefined {
    const register = this.registers.get(key);
    const value = register?.get();
    return value === null ? undefined : value;
  }

  /**
   * Check if a key exists and is not deleted
   */
  has(key: string): boolean {
    const register = this.registers.get(key);
    return register !== undefined && register.get() !== null;
  }

  /**
   * Get all keys that are not deleted
   */
  keys(): string[] {
    const result: string[] = [];
    for (const [key, register] of this.registers) {
      if (register.get() !== null) {
        result.push(key);
      }
    }
    return result;
  }

  /**
   * Get all non-deleted entries
   */
  entries(): Array<[string, V]> {
    const result: Array<[string, V]> = [];
    for (const [key, register] of this.registers) {
      const value = register.get();
      if (value !== null) {
        result.push([key, value]);
      }
    }
    return result;
  }

  /**
   * Get size (non-deleted entries)
   */
  get size(): number {
    let count = 0;
    for (const register of this.registers.values()) {
      if (register.get() !== null) {
        count++;
      }
    }
    return count;
  }

  /**
   * Merge with another LWW map
   * Returns a new map with merged registers
   */
  merge(other: LWWMap<V>): LWWMap<V> {
    const result = new LWWMap<V>(this.nodeId);

    // Copy all registers from this map
    for (const [key, register] of this.registers) {
      result.registers.set(key, register);
    }

    // Merge registers from other map
    for (const [key, otherRegister] of other.registers) {
      const existing = result.registers.get(key);
      if (existing) {
        result.registers.set(key, existing.merge(otherRegister));
      } else {
        result.registers.set(key, otherRegister);
      }
    }

    return result;
  }

  /**
   * Serialize to JSON-compatible object
   */
  toJSON(): Record<string, { value: V | null; timestamp: number; nodeId: string }> {
    const result: Record<string, { value: V | null; timestamp: number; nodeId: string }> = {};
    for (const [key, register] of this.registers) {
      result[key] = register.toJSON();
    }
    return result;
  }

  /**
   * Create from JSON object
   */
  static fromJSON<V>(
    nodeId: string,
    json: Record<string, { value: V | null; timestamp: number; nodeId: string }>
  ): LWWMap<V> {
    const map = new LWWMap<V>(nodeId);
    for (const [key, data] of Object.entries(json)) {
      map.registers.set(key, LWWRegister.fromJSON(data));
    }
    return map;
  }
}

/**
 * Grow-Only Counter CRDT
 *
 * A counter that can only increment. Each node maintains its own count,
 * and the total is the sum of all node counts.
 *
 * @example
 * ```typescript
 * const counter = new GCounter('node-1');
 * counter.increment(5);
 * const merged = counter.merge(otherCounter);
 * console.log(merged.value()); // Sum of all node counts
 * ```
 */
export class GCounter {
  private counts = new Map<string, number>();
  private readonly nodeId: string;

  constructor(nodeId: string) {
    this.nodeId = nodeId;
    this.counts.set(nodeId, 0);
  }

  /**
   * Increment the counter by amount (default 1)
   */
  increment(amount: number = 1): void {
    if (amount < 0) {
      throw new SyncError('GCounter cannot decrement', 'INVALID_OPERATION');
    }
    const current = this.counts.get(this.nodeId) ?? 0;
    this.counts.set(this.nodeId, current + amount);
  }

  /**
   * Get the total count across all nodes
   */
  value(): number {
    let sum = 0;
    for (const count of this.counts.values()) {
      sum += count;
    }
    return sum;
  }

  /**
   * Get count for a specific node
   */
  getNodeCount(nodeId: string): number {
    return this.counts.get(nodeId) ?? 0;
  }

  /**
   * Merge with another G-Counter
   * Takes the maximum count for each node
   */
  merge(other: GCounter): GCounter {
    const result = new GCounter(this.nodeId);
    result.counts = new Map(this.counts);

    for (const [nodeId, count] of other.counts) {
      const existing = result.counts.get(nodeId) ?? 0;
      result.counts.set(nodeId, Math.max(existing, count));
    }

    return result;
  }

  /**
   * Serialize to JSON-compatible object
   */
  toJSON(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [key, value] of this.counts) {
      result[key] = value;
    }
    return result;
  }

  /**
   * Create from JSON object
   */
  static fromJSON(nodeId: string, json: Record<string, number>): GCounter {
    const counter = new GCounter(nodeId);
    counter.counts = new Map(Object.entries(json));
    return counter;
  }
}

/**
 * Positive-Negative Counter CRDT
 *
 * A counter that supports both increment and decrement operations.
 * Internally uses two G-Counters: one for increments and one for decrements.
 *
 * @example
 * ```typescript
 * const counter = new PNCounter('node-1');
 * counter.increment(10);
 * counter.decrement(3);
 * console.log(counter.value()); // 7
 * ```
 */
export class PNCounter {
  private p: GCounter; // Positive counter
  private n: GCounter; // Negative counter

  constructor(nodeId: string) {
    this.p = new GCounter(nodeId);
    this.n = new GCounter(nodeId);
  }

  /**
   * Increment the counter
   */
  increment(amount: number = 1): void {
    if (amount < 0) {
      throw new SyncError('Use decrement for negative values', 'INVALID_OPERATION');
    }
    this.p.increment(amount);
  }

  /**
   * Decrement the counter
   */
  decrement(amount: number = 1): void {
    if (amount < 0) {
      throw new SyncError('Use increment for negative values', 'INVALID_OPERATION');
    }
    this.n.increment(amount);
  }

  /**
   * Get the current value (positive - negative)
   */
  value(): number {
    return this.p.value() - this.n.value();
  }

  /**
   * Merge with another PN-Counter
   */
  merge(other: PNCounter): PNCounter {
    const nodeId = this.p['nodeId'];
    const result = new PNCounter(nodeId);
    result.p = this.p.merge(other.p);
    result.n = this.n.merge(other.n);
    return result;
  }

  /**
   * Serialize to JSON-compatible object
   */
  toJSON(): { p: Record<string, number>; n: Record<string, number> } {
    return {
      p: this.p.toJSON(),
      n: this.n.toJSON(),
    };
  }

  /**
   * Create from JSON object
   */
  static fromJSON(
    nodeId: string,
    json: { p: Record<string, number>; n: Record<string, number> }
  ): PNCounter {
    const counter = new PNCounter(nodeId);
    counter.p = GCounter.fromJSON(nodeId, json.p);
    counter.n = GCounter.fromJSON(nodeId, json.n);
    return counter;
  }
}

// =============================================================================
// Selective Sync
// =============================================================================

/**
 * Sync mode for a table
 */
export enum SyncMode {
  /** Full sync - all rows and columns */
  Full = 'full',
  /** Partial sync with filter */
  Filtered = 'filtered',
  /** Only sync specific columns */
  Columns = 'columns',
  /** Don't sync this table */
  None = 'none',
  /** Lazy sync - only when accessed */
  Lazy = 'lazy',
}

/**
 * Filter function for selective sync
 */
export type SyncFilter<T = unknown> = (row: T) => boolean;

/**
 * Configuration for a single table's sync behavior
 */
export interface TableSyncConfig<T = unknown> {
  /** Sync mode */
  mode?: SyncMode;
  /** Filter function for partial sync */
  filter?: SyncFilter<T>;
  /** Specific columns to sync (when mode is Columns) */
  columns?: string[];
  /** Sync priority (higher = sync first) */
  priority?: number;
  /** Whether to sync lazily (only when accessed) */
  lazy?: boolean;
  /** Custom conflict resolution for this table */
  conflictResolution?: ConflictResolution;
}

/**
 * Configuration for selective sync
 */
export interface SelectiveSyncConfig {
  /** Table-specific configurations */
  tables: Map<string, TableSyncConfig>;
  /** Default sync mode for unconfigured tables */
  defaultMode: SyncMode;
}

/**
 * Selective Sync Manager
 *
 * Allows configuring which tables, rows, and columns to sync,
 * with support for priorities and lazy loading.
 *
 * @example
 * ```typescript
 * const selectiveSync = new SelectiveSync('node-1');
 *
 * // Only sync users for current tenant
 * selectiveSync.setFilter('users', (user) => user.tenantId === currentTenant);
 *
 * // Only sync specific columns for messages
 * selectiveSync.setColumns('messages', ['id', 'text', 'createdAt']);
 *
 * // High priority for critical data
 * selectiveSync.setPriority('settings', 100);
 *
 * // Lazy sync for large tables
 * selectiveSync.setLazy('analytics', true);
 *
 * // Get tables sorted by priority
 * const orderedTables = selectiveSync.getTablesInPriorityOrder();
 * ```
 */
export class SelectiveSync<T = unknown> {
  private config: SelectiveSyncConfig = {
    tables: new Map(),
    defaultMode: SyncMode.Full,
  };

  constructor(_nodeId: string) {
    // nodeId reserved for future use (e.g., per-node sync state)
  }

  /**
   * Configure sync behavior for a table
   */
  configure(table: string, config: TableSyncConfig<T>): void {
    const existing = this.config.tables.get(table) ?? {};
    this.config.tables.set(table, { ...existing, ...config } as TableSyncConfig);
  }

  /**
   * Set a filter for a table
   * Only rows matching the filter will be synced
   */
  setFilter(table: string, filter: SyncFilter<T>): void {
    this.configure(table, { filter, mode: SyncMode.Filtered });
  }

  /**
   * Set specific columns to sync for a table
   */
  setColumns(table: string, columns: string[]): void {
    this.configure(table, { columns, mode: SyncMode.Columns });
  }

  /**
   * Set sync priority for a table
   * Higher priority tables are synced first
   */
  setPriority(table: string, priority: number): void {
    this.configure(table, { priority });
  }

  /**
   * Set lazy sync for a table
   * Lazy tables are only synced when their data is accessed
   */
  setLazy(table: string, lazy: boolean): void {
    this.configure(table, { lazy, mode: lazy ? SyncMode.Lazy : SyncMode.Full });
  }

  /**
   * Set sync mode for a table
   */
  setMode(table: string, mode: SyncMode): void {
    this.configure(table, { mode });
  }

  /**
   * Disable sync for a table
   */
  disable(table: string): void {
    this.configure(table, { mode: SyncMode.None });
  }

  /**
   * Get configuration for a table
   */
  getConfig(table: string): TableSyncConfig<T> {
    return this.config.tables.get(table) ?? { mode: this.config.defaultMode };
  }

  /**
   * Check if a table should be synced
   */
  shouldSync(table: string): boolean {
    const config = this.getConfig(table);
    return config.mode !== SyncMode.None && !config.lazy;
  }

  /**
   * Check if a row should be synced (applies filter if configured)
   */
  shouldSyncRow(table: string, row: T): boolean {
    const config = this.getConfig(table);
    if (config.mode === SyncMode.None) return false;
    if (config.filter) return config.filter(row);
    return true;
  }

  /**
   * Get columns to sync for a table (undefined means all columns)
   */
  getColumnsToSync(table: string): string[] | undefined {
    const config = this.getConfig(table);
    return config.columns;
  }

  /**
   * Get all configured tables
   */
  getTables(): string[] {
    return Array.from(this.config.tables.keys());
  }

  /**
   * Get tables sorted by priority (highest first)
   * Excludes lazy and disabled tables
   */
  getTablesInPriorityOrder(): string[] {
    return Array.from(this.config.tables.entries())
      .filter(([_, config]) => {
        return config.mode !== SyncMode.None && !config.lazy;
      })
      .sort((a, b) => {
        const priorityA = a[1].priority ?? 0;
        const priorityB = b[1].priority ?? 0;
        return priorityB - priorityA;
      })
      .map(([table]) => table);
  }

  /**
   * Get lazy tables
   */
  getLazyTables(): string[] {
    return Array.from(this.config.tables.entries())
      .filter(([_, config]) => config.lazy)
      .map(([table]) => table);
  }

  /**
   * Set default sync mode for unconfigured tables
   */
  setDefaultMode(mode: SyncMode): void {
    this.config.defaultMode = mode;
  }

  /**
   * Clear all configuration
   */
  clear(): void {
    this.config.tables.clear();
    this.config.defaultMode = SyncMode.Full;
  }

  /**
   * Serialize configuration to JSON
   */
  toJSON(): {
    tables: Record<string, Omit<TableSyncConfig, 'filter'>>;
    defaultMode: SyncMode;
  } {
    const tables: Record<string, Omit<TableSyncConfig, 'filter'>> = {};
    for (const [table, config] of this.config.tables) {
      const { filter, ...rest } = config;
      tables[table] = rest;
    }
    return {
      tables,
      defaultMode: this.config.defaultMode,
    };
  }
}

// Types are exported inline where they are defined
