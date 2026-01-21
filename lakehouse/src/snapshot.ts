/**
 * Snapshot management and time-travel
 * Enables point-in-time queries and historical data access
 */

import type {
  Snapshot,
  SnapshotRef,
  ManifestFile,
  TableManifest,
  QueryFilter,
} from './types.js';
import { snapshotPath } from './types.js';
import { pruneFiles } from './partition.js';
import { parseJsonWithContext } from './r2.js';

// =============================================================================
// Snapshot Creation
// =============================================================================

/**
 * Generate a unique snapshot ID (ULID-like for time-sortability)
 */
export function generateSnapshotId(): string {
  const timestamp = Date.now().toString(36).padStart(10, '0');
  const random = Math.random().toString(36).slice(2, 10);
  return `${timestamp}-${random}`;
}

/**
 * Create a new snapshot for an append operation
 */
export function createAppendSnapshot(
  parentSnapshotId: string | null,
  schemaId: number,
  addedFiles: ManifestFile[],
  existingFiles: ManifestFile[],
  metadata?: Record<string, string>
): Snapshot {
  const snapshotId = generateSnapshotId();

  const addedRows = addedFiles.reduce((sum, f) => sum + f.stats.rowCount, 0);

  return {
    snapshotId,
    parentSnapshotId,
    timestamp: Date.now(),
    schemaId,
    manifestList: [...existingFiles, ...addedFiles],
    summary: {
      operation: 'append',
      addedFiles: addedFiles.length,
      deletedFiles: 0,
      addedRows,
      deletedRows: 0,
      sourceDoIds: extractSourceDoIds(addedFiles),
    },
    metadata,
  };
}

/**
 * Create a snapshot for an overwrite operation
 */
export function createOverwriteSnapshot(
  parentSnapshotId: string | null,
  schemaId: number,
  newFiles: ManifestFile[],
  oldFiles: ManifestFile[],
  metadata?: Record<string, string>
): Snapshot {
  const snapshotId = generateSnapshotId();

  const addedRows = newFiles.reduce((sum, f) => sum + f.stats.rowCount, 0);
  const deletedRows = oldFiles.reduce((sum, f) => sum + f.stats.rowCount, 0);

  return {
    snapshotId,
    parentSnapshotId,
    timestamp: Date.now(),
    schemaId,
    manifestList: newFiles,
    summary: {
      operation: 'overwrite',
      addedFiles: newFiles.length,
      deletedFiles: oldFiles.length,
      addedRows,
      deletedRows,
      sourceDoIds: extractSourceDoIds(newFiles),
    },
    metadata,
  };
}

/**
 * Create a snapshot for a delete operation
 */
export function createDeleteSnapshot(
  parentSnapshotId: string | null,
  schemaId: number,
  remainingFiles: ManifestFile[],
  deletedFiles: ManifestFile[],
  metadata?: Record<string, string>
): Snapshot {
  const snapshotId = generateSnapshotId();

  const deletedRows = deletedFiles.reduce((sum, f) => sum + f.stats.rowCount, 0);

  return {
    snapshotId,
    parentSnapshotId,
    timestamp: Date.now(),
    schemaId,
    manifestList: remainingFiles,
    summary: {
      operation: 'delete',
      addedFiles: 0,
      deletedFiles: deletedFiles.length,
      addedRows: 0,
      deletedRows,
    },
    metadata,
  };
}

/**
 * Create a snapshot for a compaction operation
 */
export function createCompactSnapshot(
  parentSnapshotId: string | null,
  schemaId: number,
  compactedFiles: ManifestFile[],
  originalFiles: ManifestFile[],
  allFiles: ManifestFile[],
  metadata?: Record<string, string>
): Snapshot {
  const snapshotId = generateSnapshotId();

  // Replace original files with compacted files
  const originalPaths = new Set(originalFiles.map(f => f.path));
  const remainingFiles = allFiles.filter(f => !originalPaths.has(f.path));
  const newManifestList = [...remainingFiles, ...compactedFiles];

  return {
    snapshotId,
    parentSnapshotId,
    timestamp: Date.now(),
    schemaId,
    manifestList: newManifestList,
    summary: {
      operation: 'compact',
      addedFiles: compactedFiles.length,
      deletedFiles: originalFiles.length,
      addedRows: 0, // Compaction doesn't add rows
      deletedRows: 0, // Compaction doesn't delete rows
    },
    metadata,
  };
}

/**
 * Extract source DO IDs from files
 */
function extractSourceDoIds(files: ManifestFile[]): string[] | undefined {
  const doIds = new Set<string>();
  for (const file of files) {
    if (file.sourceDoId) {
      doIds.add(file.sourceDoId);
    }
  }
  return doIds.size > 0 ? [...doIds] : undefined;
}

// =============================================================================
// Snapshot Reference Management
// =============================================================================

/**
 * Create a snapshot reference for manifest
 */
export function createSnapshotRef(snapshot: Snapshot): SnapshotRef {
  return {
    snapshotId: snapshot.snapshotId,
    timestamp: snapshot.timestamp,
    parentSnapshotId: snapshot.parentSnapshotId,
  };
}

/**
 * Build snapshot path from ID
 */
export function snapshotFilePath(snapshotId: string): string {
  return snapshotPath(snapshotId);
}

// =============================================================================
// Time-Travel Operations
// =============================================================================

/**
 * Find snapshot by ID
 */
export function findSnapshotById(
  manifest: TableManifest,
  snapshotId: string
): SnapshotRef | null {
  return manifest.snapshots.find(s => s.snapshotId === snapshotId) ?? null;
}

/**
 * Find snapshot at or before a given timestamp
 */
export function findSnapshotAsOf(
  manifest: TableManifest,
  timestamp: number
): SnapshotRef | null {
  // Snapshots are ordered by time, find the latest one <= timestamp
  const candidates = manifest.snapshots
    .filter(s => s.timestamp <= timestamp)
    .sort((a, b) => b.timestamp - a.timestamp);

  return candidates[0] ?? null;
}

/**
 * Get snapshot history (chain from current to first)
 */
export function getSnapshotHistory(manifest: TableManifest): SnapshotRef[] {
  const snapshotMap = new Map(manifest.snapshots.map(s => [s.snapshotId, s]));
  const history: SnapshotRef[] = [];

  let currentId = manifest.currentSnapshotId;
  while (currentId) {
    const snapshot = snapshotMap.get(currentId);
    if (!snapshot) break;
    history.push(snapshot);
    currentId = snapshot.parentSnapshotId;
  }

  return history;
}

/**
 * Get ancestor snapshot IDs
 */
export function getAncestorIds(manifest: TableManifest, snapshotId: string): string[] {
  const snapshotMap = new Map(manifest.snapshots.map(s => [s.snapshotId, s]));
  const ancestors: string[] = [];

  let snapshot = snapshotMap.get(snapshotId);
  while (snapshot?.parentSnapshotId) {
    ancestors.push(snapshot.parentSnapshotId);
    snapshot = snapshotMap.get(snapshot.parentSnapshotId);
  }

  return ancestors;
}

/**
 * Check if one snapshot is an ancestor of another
 */
export function isAncestorOf(
  manifest: TableManifest,
  ancestorId: string,
  descendantId: string
): boolean {
  const ancestors = getAncestorIds(manifest, descendantId);
  return ancestors.includes(ancestorId);
}

// =============================================================================
// Snapshot Diff
// =============================================================================

/**
 * Compute diff between two snapshots
 */
export function diffSnapshots(
  olderSnapshot: Snapshot,
  newerSnapshot: Snapshot
): SnapshotDiff {
  const olderPaths = new Set(olderSnapshot.manifestList.map(f => f.path));
  const newerPaths = new Set(newerSnapshot.manifestList.map(f => f.path));

  const addedFiles = newerSnapshot.manifestList.filter(f => !olderPaths.has(f.path));
  const removedFiles = olderSnapshot.manifestList.filter(f => !newerPaths.has(f.path));
  const unchangedFiles = newerSnapshot.manifestList.filter(f => olderPaths.has(f.path));

  return {
    olderSnapshotId: olderSnapshot.snapshotId,
    newerSnapshotId: newerSnapshot.snapshotId,
    addedFiles,
    removedFiles,
    unchangedFiles,
    addedRows: addedFiles.reduce((sum, f) => sum + f.stats.rowCount, 0),
    removedRows: removedFiles.reduce((sum, f) => sum + f.stats.rowCount, 0),
  };
}

export interface SnapshotDiff {
  olderSnapshotId: string;
  newerSnapshotId: string;
  addedFiles: ManifestFile[];
  removedFiles: ManifestFile[];
  unchangedFiles: ManifestFile[];
  addedRows: number;
  removedRows: number;
}

// =============================================================================
// Snapshot Query Operations
// =============================================================================

/**
 * Get files for a query, respecting time-travel parameters
 */
export function getFilesForQuery(
  snapshot: Snapshot,
  filter?: QueryFilter
): ManifestFile[] {
  let files = snapshot.manifestList;

  if (filter) {
    files = pruneFiles(files, filter);
  }

  return files;
}

/**
 * Get total row count for a snapshot
 */
export function getSnapshotRowCount(snapshot: Snapshot): number {
  return snapshot.manifestList.reduce((sum, f) => sum + f.stats.rowCount, 0);
}

/**
 * Get total size for a snapshot
 */
export function getSnapshotSizeBytes(snapshot: Snapshot): number {
  return snapshot.manifestList.reduce((sum, f) => sum + f.length, 0);
}

// =============================================================================
// Snapshot Retention
// =============================================================================

/**
 * Options for snapshot expiration
 */
export interface ExpireSnapshotsOptions {
  /** Keep snapshots newer than this (ms since epoch) */
  olderThan?: number;

  /** Keep at least this many snapshots */
  retainLast?: number;

  /** Keep snapshots with these IDs */
  retainIds?: string[];
}

/**
 * Determine which snapshots to expire
 */
export function getExpiredSnapshots(
  manifest: TableManifest,
  options: ExpireSnapshotsOptions
): SnapshotRef[] {
  const { olderThan, retainLast = 1, retainIds = [] } = options;

  // Sort by timestamp descending
  const sorted = [...manifest.snapshots].sort((a, b) => b.timestamp - a.timestamp);

  const retain = new Set<string>();

  // Always retain current snapshot
  if (manifest.currentSnapshotId) {
    retain.add(manifest.currentSnapshotId);
  }

  // Retain specified IDs
  for (const id of retainIds) {
    retain.add(id);
  }

  // Retain last N snapshots
  for (let i = 0; i < retainLast && i < sorted.length; i++) {
    retain.add(sorted[i].snapshotId);
  }

  // Filter out retained and those newer than olderThan
  return sorted.filter(s => {
    if (retain.has(s.snapshotId)) return false;
    if (olderThan && s.timestamp >= olderThan) return false;
    return true;
  });
}

/**
 * Get files that are only referenced by expired snapshots
 */
export function getOrphanedFiles(
  allSnapshots: Snapshot[],
  expiredSnapshotIds: Set<string>
): ManifestFile[] {
  const activeSnapshots = allSnapshots.filter(s => !expiredSnapshotIds.has(s.snapshotId));
  const expiredSnapshots = allSnapshots.filter(s => expiredSnapshotIds.has(s.snapshotId));

  // Collect all files referenced by active snapshots
  const activeFiles = new Set<string>();
  for (const snapshot of activeSnapshots) {
    for (const file of snapshot.manifestList) {
      activeFiles.add(file.path);
    }
  }

  // Find files only in expired snapshots
  const orphanedFiles: ManifestFile[] = [];
  const seen = new Set<string>();

  for (const snapshot of expiredSnapshots) {
    for (const file of snapshot.manifestList) {
      if (!activeFiles.has(file.path) && !seen.has(file.path)) {
        orphanedFiles.push(file);
        seen.add(file.path);
      }
    }
  }

  return orphanedFiles;
}

// =============================================================================
// Serialization
// =============================================================================

/**
 * Serialize snapshot to JSON
 */
export function serializeSnapshot(snapshot: Snapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

/**
 * Deserialize snapshot from JSON
 * @throws JsonParseError if the JSON is invalid
 */
export function deserializeSnapshot(json: string): Snapshot {
  return parseJsonWithContext<Snapshot>(json, 'snapshot');
}

// =============================================================================
// Snapshot Cache for Time-Travel Optimization
// =============================================================================

/**
 * LRU cache for snapshot data
 * Optimizes repeated time-travel queries
 */
export class SnapshotCache {
  private readonly cache: Map<string, { snapshot: Snapshot; lastAccess: number }>;
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(options: { maxSize?: number; ttlMs?: number } = {}) {
    this.cache = new Map();
    this.maxSize = options.maxSize ?? 100;
    this.ttlMs = options.ttlMs ?? 5 * 60 * 1000; // 5 minutes default
  }

  /**
   * Get snapshot from cache
   */
  get(snapshotId: string): Snapshot | null {
    const entry = this.cache.get(snapshotId);
    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.lastAccess > this.ttlMs) {
      this.cache.delete(snapshotId);
      return null;
    }

    // Update access time (LRU)
    entry.lastAccess = Date.now();
    return entry.snapshot;
  }

  /**
   * Put snapshot in cache
   */
  put(snapshot: Snapshot): void {
    // Evict if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(snapshot.snapshotId)) {
      this.evictOldest();
    }

    this.cache.set(snapshot.snapshotId, {
      snapshot,
      lastAccess: Date.now(),
    });
  }

  /**
   * Evict oldest entry (LRU)
   */
  private evictOldest(): void {
    let oldestId: string | null = null;
    let oldestTime = Infinity;

    for (const [id, entry] of this.cache) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldestId = id;
      }
    }

    if (oldestId) {
      this.cache.delete(oldestId);
    }
  }

  /**
   * Invalidate a snapshot
   */
  invalidate(snapshotId: string): void {
    this.cache.delete(snapshotId);
  }

  /**
   * Clear all cached snapshots
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  stats(): { size: number; maxSize: number; hitRate?: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
    };
  }

  /**
   * Preload snapshots into cache
   */
  preload(snapshots: Snapshot[]): void {
    for (const snapshot of snapshots) {
      if (this.cache.size < this.maxSize) {
        this.put(snapshot);
      }
    }
  }
}

/**
 * Create a snapshot cache
 */
export function createSnapshotCache(
  options?: { maxSize?: number; ttlMs?: number }
): SnapshotCache {
  return new SnapshotCache(options);
}

// =============================================================================
// Efficient Snapshot Chain Traversal
// =============================================================================

/**
 * Snapshot chain traverser for efficient history navigation
 */
export class SnapshotChainTraverser {
  private readonly snapshotMap: Map<string, SnapshotRef>;
  private readonly childMap: Map<string, string[]>;
  private readonly rootSnapshots: string[];

  constructor(snapshots: SnapshotRef[]) {
    this.snapshotMap = new Map(snapshots.map(s => [s.snapshotId, s]));
    this.childMap = new Map();
    this.rootSnapshots = [];

    // Build child map for forward traversal
    for (const snapshot of snapshots) {
      if (snapshot.parentSnapshotId) {
        const children = this.childMap.get(snapshot.parentSnapshotId) ?? [];
        children.push(snapshot.snapshotId);
        this.childMap.set(snapshot.parentSnapshotId, children);
      } else {
        this.rootSnapshots.push(snapshot.snapshotId);
      }
    }
  }

  /**
   * Get ancestors (backward traversal) with limit
   */
  getAncestors(snapshotId: string, limit?: number): SnapshotRef[] {
    const ancestors: SnapshotRef[] = [];
    let currentId = this.snapshotMap.get(snapshotId)?.parentSnapshotId;
    let count = 0;

    while (currentId && (limit === undefined || count < limit)) {
      const snapshot = this.snapshotMap.get(currentId);
      if (!snapshot) break;
      ancestors.push(snapshot);
      currentId = snapshot.parentSnapshotId;
      count++;
    }

    return ancestors;
  }

  /**
   * Get descendants (forward traversal) with limit
   */
  getDescendants(snapshotId: string, limit?: number): SnapshotRef[] {
    const descendants: SnapshotRef[] = [];
    const queue = [snapshotId];
    let count = 0;

    while (queue.length > 0 && (limit === undefined || count < limit)) {
      const currentId = queue.shift()!;
      const children = this.childMap.get(currentId) ?? [];

      for (const childId of children) {
        const child = this.snapshotMap.get(childId);
        if (child) {
          descendants.push(child);
          queue.push(childId);
          count++;
          if (limit !== undefined && count >= limit) break;
        }
      }
    }

    return descendants;
  }

  /**
   * Find common ancestor of two snapshots
   */
  findCommonAncestor(snapshotId1: string, snapshotId2: string): SnapshotRef | null {
    const ancestors1 = new Set<string>([snapshotId1]);
    let current = snapshotId1;

    // Build ancestor set for first snapshot
    while (true) {
      const snapshot = this.snapshotMap.get(current);
      if (!snapshot?.parentSnapshotId) break;
      ancestors1.add(snapshot.parentSnapshotId);
      current = snapshot.parentSnapshotId;
    }

    // Walk up second snapshot's ancestry
    current = snapshotId2;
    while (true) {
      if (ancestors1.has(current)) {
        return this.snapshotMap.get(current) ?? null;
      }
      const snapshot = this.snapshotMap.get(current);
      if (!snapshot?.parentSnapshotId) break;
      current = snapshot.parentSnapshotId;
    }

    return null;
  }

  /**
   * Get path between two snapshots
   */
  getPath(fromId: string, toId: string): SnapshotRef[] {
    const commonAncestor = this.findCommonAncestor(fromId, toId);
    if (!commonAncestor) return [];

    // Path from 'from' to ancestor
    const pathUp: SnapshotRef[] = [];
    let current = fromId;
    while (current !== commonAncestor.snapshotId) {
      const snapshot = this.snapshotMap.get(current);
      if (!snapshot) break;
      pathUp.push(snapshot);
      if (!snapshot.parentSnapshotId) break;
      current = snapshot.parentSnapshotId;
    }

    // Path from ancestor to 'to'
    const pathDown: SnapshotRef[] = [];
    current = toId;
    while (current !== commonAncestor.snapshotId) {
      const snapshot = this.snapshotMap.get(current);
      if (!snapshot) break;
      pathDown.unshift(snapshot);
      if (!snapshot.parentSnapshotId) break;
      current = snapshot.parentSnapshotId;
    }

    return [...pathUp, commonAncestor, ...pathDown];
  }

  /**
   * Get snapshot chain depth
   */
  getDepth(snapshotId: string): number {
    let depth = 0;
    let currentId = snapshotId;

    while (true) {
      const snapshot = this.snapshotMap.get(currentId);
      if (!snapshot?.parentSnapshotId) break;
      depth++;
      currentId = snapshot.parentSnapshotId;
    }

    return depth;
  }

  /**
   * Get all root snapshots (no parent)
   */
  getRoots(): SnapshotRef[] {
    return this.rootSnapshots
      .map(id => this.snapshotMap.get(id))
      .filter((s): s is SnapshotRef => s !== undefined);
  }

  /**
   * Get snapshot by ID
   */
  getSnapshot(snapshotId: string): SnapshotRef | null {
    return this.snapshotMap.get(snapshotId) ?? null;
  }
}

/**
 * Create a snapshot chain traverser
 */
export function createSnapshotTraverser(snapshots: SnapshotRef[]): SnapshotChainTraverser {
  return new SnapshotChainTraverser(snapshots);
}

// =============================================================================
// Manifest Delta Compression
// =============================================================================

/**
 * Delta-encoded manifest representation
 * Stores only changes between snapshots to reduce storage
 */
export interface ManifestDelta {
  baseSnapshotId: string;
  targetSnapshotId: string;
  addedPaths: string[];
  removedPaths: string[];
  timestamp: number;
}

/**
 * Compute delta between two manifest file lists
 */
export function computeManifestDelta(
  baseSnapshot: Snapshot,
  targetSnapshot: Snapshot
): ManifestDelta {
  const basePaths = new Set(baseSnapshot.manifestList.map(f => f.path));
  const targetPaths = new Set(targetSnapshot.manifestList.map(f => f.path));

  const addedPaths: string[] = [];
  const removedPaths: string[] = [];

  for (const path of targetPaths) {
    if (!basePaths.has(path)) {
      addedPaths.push(path);
    }
  }

  for (const path of basePaths) {
    if (!targetPaths.has(path)) {
      removedPaths.push(path);
    }
  }

  return {
    baseSnapshotId: baseSnapshot.snapshotId,
    targetSnapshotId: targetSnapshot.snapshotId,
    addedPaths,
    removedPaths,
    timestamp: Date.now(),
  };
}

/**
 * Apply delta to reconstruct manifest file list
 */
export function applyManifestDelta(
  baseFiles: ManifestFile[],
  delta: ManifestDelta,
  addedFiles: ManifestFile[]
): ManifestFile[] {
  const removedSet = new Set(delta.removedPaths);
  const remaining = baseFiles.filter(f => !removedSet.has(f.path));
  return [...remaining, ...addedFiles];
}

/**
 * Serialize delta for storage
 */
export function serializeManifestDelta(delta: ManifestDelta): string {
  return JSON.stringify(delta);
}

/**
 * Deserialize delta from storage
 * @throws JsonParseError if the JSON is invalid
 */
export function deserializeManifestDelta(json: string): ManifestDelta {
  return parseJsonWithContext<ManifestDelta>(json, 'manifest-delta');
}

/**
 * Compute delta chain statistics
 */
export interface DeltaChainStats {
  chainLength: number;
  totalAddedPaths: number;
  totalRemovedPaths: number;
  estimatedSavings: number; // Percentage reduction vs full snapshots
}

/**
 * Analyze delta chain efficiency
 */
export function analyzeDeltaChain(deltas: ManifestDelta[]): DeltaChainStats {
  let totalAdded = 0;
  let totalRemoved = 0;

  for (const delta of deltas) {
    totalAdded += delta.addedPaths.length;
    totalRemoved += delta.removedPaths.length;
  }

  // Estimate savings (rough approximation)
  const avgPathSize = 100; // bytes
  const avgFileEntrySize = 500; // bytes for full manifest entry
  const deltaSize = (totalAdded + totalRemoved) * avgPathSize;
  const fullSize = totalAdded * avgFileEntrySize;
  const savings = fullSize > 0 ? (1 - deltaSize / fullSize) * 100 : 0;

  return {
    chainLength: deltas.length,
    totalAddedPaths: totalAdded,
    totalRemovedPaths: totalRemoved,
    estimatedSavings: Math.max(0, savings),
  };
}

// =============================================================================
// Time-Travel Query Helper
// =============================================================================

/**
 * Cached time-travel query executor
 */
export class TimeTravelQuery {
  private readonly cache: SnapshotCache;
  private readonly traverser: SnapshotChainTraverser;
  private readonly loadSnapshot: (snapshotId: string) => Promise<Snapshot | null>;

  constructor(
    manifest: TableManifest,
    loadSnapshot: (snapshotId: string) => Promise<Snapshot | null>,
    cacheOptions?: { maxSize?: number; ttlMs?: number }
  ) {
    this.cache = new SnapshotCache(cacheOptions);
    this.traverser = new SnapshotChainTraverser(manifest.snapshots);
    this.loadSnapshot = loadSnapshot;
  }

  /**
   * Get snapshot with caching
   */
  async getSnapshot(snapshotId: string): Promise<Snapshot | null> {
    // Check cache first
    let snapshot = this.cache.get(snapshotId);
    if (snapshot) return snapshot;

    // Load from storage
    snapshot = await this.loadSnapshot(snapshotId);
    if (snapshot) {
      this.cache.put(snapshot);
    }

    return snapshot;
  }

  /**
   * Get snapshot at or before timestamp
   */
  async getSnapshotAsOf(timestamp: number): Promise<Snapshot | null> {
    const ref = this.traverser.getSnapshot(
      this.findSnapshotRefAsOf(timestamp)
    );
    if (!ref) return null;
    return this.getSnapshot(ref.snapshotId);
  }

  /**
   * Find snapshot ref at or before timestamp
   */
  private findSnapshotRefAsOf(timestamp: number): string {
    let best: SnapshotRef | null = null;

    for (const root of this.traverser.getRoots()) {
      // Walk forward from root
      let current: SnapshotRef | null = root;
      while (current && current.timestamp <= timestamp) {
        if (!best || current.timestamp > best.timestamp) {
          best = current;
        }
        // Find children
        const children = this.traverser.getDescendants(current.snapshotId, 1);
        current = children[0] ?? null;
      }
    }

    return best?.snapshotId ?? '';
  }

  /**
   * Get files for time-travel query
   */
  async getFilesAsOf(
    timestamp: number,
    filter?: QueryFilter
  ): Promise<ManifestFile[]> {
    const snapshot = await this.getSnapshotAsOf(timestamp);
    if (!snapshot) return [];
    return getFilesForQuery(snapshot, filter);
  }

  /**
   * Preload recent snapshots into cache
   */
  async preloadRecent(count = 10): Promise<void> {
    const recent: SnapshotRef[] = [];

    // Get most recent snapshots by walking back from roots
    for (const root of this.traverser.getRoots()) {
      const descendants = this.traverser.getDescendants(root.snapshotId);
      recent.push(root, ...descendants.slice(-count));
    }

    // Sort by timestamp descending
    recent.sort((a, b) => b.timestamp - a.timestamp);

    // Load and cache
    for (const ref of recent.slice(0, count)) {
      await this.getSnapshot(ref.snapshotId);
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number } {
    return this.cache.stats();
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
