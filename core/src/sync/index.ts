/**
 * Sync Submodule
 *
 * Provides offline-first synchronization with conflict resolution.
 *
 * @example
 * ```typescript
 * import {
 *   SyncManager,
 *   HybridLogicalClock,
 *   ConflictResolution,
 *   LWWRegister,
 *   GCounter,
 *   SelectiveSync,
 * } from '@evodb/core/sync';
 * ```
 *
 * @module sync
 */

export {
  // Core classes
  SyncManager,
  HybridLogicalClock,
  VectorClockImpl,
  OfflineQueue,
  NetworkStatusMonitor,
  ConflictResolverImpl,
  SyncError,

  // CRDT classes
  LWWRegister,
  LWWMap,
  GCounter,
  PNCounter,

  // Selective sync
  SelectiveSync,

  // Enums
  ConflictResolution,
  NetworkStatus,
  SyncState,
  SyncMode,
} from '../sync.js';

// Re-export types
export type {
  SyncManagerOptions,
  SyncStorage,
  SyncResult,
  PushResult,
  PullResult,
  TrackedChange,
  RemoteChange,
  SyncConflict,
  ConflictResolver,
  RemoteConfig,
  HLCTimestamp,
  VectorClock,
  SyncOperationType,
  TableSyncConfig,
  SelectiveSyncConfig,
  SyncFilter,
} from '../sync.js';
