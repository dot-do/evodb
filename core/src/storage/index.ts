/**
 * @evodb/core/storage - Storage adapters
 *
 * This submodule exports storage adapter implementations for:
 * - Durable Object SQLite
 * - Durable Object KV
 * - R2 Object Storage
 * - In-memory (for testing)
 *
 * RECOMMENDED: Use the StorageProvider interface for new code.
 * It consolidates all storage interfaces into a single, consistent API.
 *
 * @module storage
 */

// ==========================================================================
// UNIFIED STORAGE PROVIDER (Issue evodb-v3l)
// The canonical storage interface - USE THIS FOR NEW CODE
// ==========================================================================
export {
  // Core interface
  type StorageProvider,
  // Implementations
  R2StorageProvider,
  InMemoryStorageProvider,
  // Factory functions
  createStorageProvider,
  createInMemoryProvider,
  // Error classes
  StorageProviderError,
  NotFoundError,
  // Adapter functions - bridge to legacy interfaces
  providerToStorage,
  providerToObjectAdapter,
  storageToProvider,
  objectAdapterToProvider,
  // R2 types (also used by R2StorageProvider)
  type R2BucketLike as StorageProviderR2BucketLike,
  type R2ObjectLike as StorageProviderR2ObjectLike,
  type R2ObjectsLike as StorageProviderR2ObjectsLike,
  type R2PutOptionsLike as StorageProviderR2PutOptionsLike,
  type R2ListOptionsLike as StorageProviderR2ListOptionsLike,
} from '../storage-provider.js';

export {
  // DO adapters (original)
  createDOAdapter,
  createDOKVAdapter,
  createMemoryAdapter,
  makeBlockId,
  parseBlockId,
  makeWalId,
  parseWalId,
  // SQL injection prevention
  validateTableName,
  // Path validation
  validateStoragePath,
  validateKeyPrefix,
  // ==========================================================================
  // LEGACY: Storage interface (Issue evodb-pyo)
  // @deprecated Use StorageProvider interface instead.
  // ==========================================================================
  /**
   * @deprecated Use StorageProvider interface instead.
   * The Storage interface is maintained for backward compatibility.
   *
   * Migration guide:
   * - read() -> get()
   * - write() -> put()
   * - list() returns string[] instead of { paths: string[] }
   */
  type Storage,
  type StorageMetadata,
  MemoryStorage,
  R2Storage,
  createStorage,
  createMemoryStorage,
  // Adapter functions - convert between interfaces
  storageToObjectAdapter,
  objectAdapterToStorage,
  // ==========================================================================
  // LEGACY: ObjectStorageAdapter (deprecated, use StorageProvider instead)
  // ==========================================================================
  /**
   * @deprecated Use StorageProvider interface instead.
   * The ObjectStorageAdapter interface is maintained for backward compatibility.
   */
  type ObjectStorageAdapter,
  type ObjectMetadata,
  type R2BucketLike,
  type R2ObjectLike,
  type R2ObjectsLike,
  type R2PutOptionsLike,
  type R2ListOptionsLike,
  R2ObjectStorageAdapter,
  MemoryObjectStorageAdapter,
  createR2ObjectAdapter,
  createMemoryObjectAdapter,
  wrapStorageBackend,
} from '../storage.js';

// ==========================================================================
// CIRCUIT BREAKER (Issue evodb-9t6)
// ==========================================================================
export {
  CircuitBreaker,
  CircuitBreakerStorage,
  CircuitState,
  CircuitBreakerError,
  createCircuitBreakerStorage,
  type CircuitBreakerOptions,
  type CircuitBreakerStats,
} from '../circuit-breaker.js';

// ==========================================================================
// CHAOS TESTING UTILITIES (Issue evodb-187)
// ==========================================================================
export {
  // Chaos wrappers
  ChaosR2Bucket,
  ChaosStorage,
  DelayInjector,
  PartialWriteSimulator,
  ConcurrencyConflictSimulator,
  MemoryPressureSimulator,
  ClockSkewSimulator,
  // Seeded random for reproducibility
  SeededRandom,
  // Error classes
  ChaosNetworkError,
  PartialWriteError,
  CorruptionDetectedError,
  MemoryPressureError,
  ConflictError,
  ETagMismatchError,
  TimeoutError,
  // Factory function
  createChaosStack,
  // Types
  type ChaosConfig,
  type FailureMode,
  type AffectedOperation,
  type CorruptionMode,
  type DelayMode,
  type ConflictMode,
  type ChaosR2BucketOptions,
  type ChaosStorageOptions,
  type DelayInjectorOptions,
  type PartialWriteSimulatorOptions,
  type ConcurrencyConflictSimulatorOptions,
  type MemoryPressureSimulatorOptions,
  type ClockSkewSimulatorOptions,
} from '../chaos-testing.js';
