/**
 * @evodb/core/storage - Storage adapters
 *
 * This submodule exports storage adapter implementations for:
 * - Durable Object SQLite
 * - Durable Object KV
 * - R2 Object Storage
 * - In-memory (for testing)
 *
 * @module storage
 */

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
  // ==========================================================================
  // UNIFIED STORAGE INTERFACE (Issue evodb-pyo)
  // ==========================================================================
  // The canonical Storage interface - use this for new code
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
  // LEGACY: ObjectStorageAdapter (deprecated, use Storage instead)
  // ==========================================================================
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
