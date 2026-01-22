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
  // Note: R2*Like types are now exported from types/r2.ts (Issue evodb-sdgz)
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
  // Note: R2*Like types are now exported from types/r2.ts (Issue evodb-sdgz)
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
  type MonotonicTimeProvider,
} from '../circuit-breaker.js';

// ==========================================================================
// CHAOS TESTING UTILITIES (Issue evodb-187)
// MOVED TO @evodb/test-utils (Issue evodb-6zh)
// Import from '@evodb/test-utils' instead of '@evodb/core/storage'
// ==========================================================================
