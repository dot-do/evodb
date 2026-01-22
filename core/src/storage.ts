// DO Storage Adapter (~1KB budget)

import { type StorageAdapter, type BlockId, type WalId, unsafeBlockId } from './types.js';
import { STORAGE_LIST_PAGE_SIZE } from './constants.js';
import { StorageError, ValidationError, ErrorCode } from './errors.js';

// =============================================================================
// UNIFIED STORAGE INTERFACE (Issue evodb-pyo)
// Consolidates 4 overlapping storage abstractions into one canonical interface
//
// NOTE (Issue evodb-v3l): The StorageProvider interface in storage-provider.ts
// is the new canonical interface. This Storage interface is maintained for
// backward compatibility but should be considered deprecated for new code.
// =============================================================================

/**
 * Unified Storage interface - the single source of truth for storage operations.
 *
 * @deprecated Use StorageProvider from @evodb/core/storage instead.
 * This interface is maintained for backward compatibility.
 *
 * Migration guide:
 * - read() -> get()
 * - write() -> put()
 * - list() returns string[] instead of { paths: string[] }
 * - delete() -> delete() (same)
 * - exists() -> exists() (same, but required in StorageProvider)
 *
 * This interface consolidates the following overlapping abstractions:
 * 1. StorageAdapter (core/types.ts) - DO block storage (writeBlock/readBlock)
 * 2. ObjectStorageAdapter (core/storage.ts) - R2-compatible (put/get)
 * 3. R2StorageAdapter (lakehouse/types.ts) - High-level JSON/binary
 * 4. StorageAdapter (lance-reader/types.ts) - Read-only lance files
 *
 * Design principles:
 * - Simple, minimal interface (4 core methods)
 * - Matches common object storage semantics (R2, S3, GCS)
 * - Uses Uint8Array for binary data (not ArrayBuffer) for consistency
 * - Optional methods for advanced use cases (exists, head, readRange)
 *
 * @example
 * ```typescript
 * // New code should use StorageProvider:
 * import { StorageProvider, createInMemoryProvider } from '@evodb/core';
 * const provider: StorageProvider = createInMemoryProvider();
 * await provider.put('test.bin', new Uint8Array([1, 2, 3]));
 *
 * // Legacy code using Storage (deprecated):
 * const storage = new MemoryStorage();
 * await storage.write('test.bin', new Uint8Array([1, 2, 3]));
 * ```
 */
export interface Storage {
  /** Read data from a path, returns null if not found */
  read(path: string): Promise<Uint8Array | null>;

  /** Write data to a path */
  write(path: string, data: Uint8Array): Promise<void>;

  /** List objects with a prefix, returns array of paths */
  list(prefix: string): Promise<{ paths: string[] }>;

  /** Delete an object at path */
  delete(path: string): Promise<void>;

  // ==========================================================================
  // Optional methods for advanced use cases
  // ==========================================================================

  /** Check if an object exists (optional - can be derived from read) */
  exists?(path: string): Promise<boolean>;

  /** Get object metadata without reading body (optional) */
  head?(path: string): Promise<StorageMetadata | null>;

  /** Read a byte range from an object (optional - for efficient partial reads) */
  readRange?(path: string, offset: number, length: number): Promise<Uint8Array>;
}

/**
 * Storage metadata returned by head() operation
 */
export interface StorageMetadata {
  /** Size in bytes */
  size: number;
  /** ETag for cache validation */
  etag: string;
  /** Last modification time */
  lastModified?: Date;
}

// =============================================================================
// LEGACY: ObjectStorageAdapter (kept for backward compatibility)
// Use the new Storage interface for new code
// =============================================================================

/**
 * File/object metadata returned by storage operations
 * @deprecated Use StorageMetadata instead
 */
export interface ObjectMetadata {
  size: number;
  etag: string;
  lastModified?: Date;
}

/**
 * Object storage adapter interface for R2, S3, filesystem, etc.
 * Designed for testability - use MemoryObjectStorageAdapter for unit tests.
 *
 * @deprecated Use the unified Storage interface instead. This interface is
 * maintained for backward compatibility with existing code.
 *
 * Migration guide:
 * - put() -> write()
 * - get() -> read()
 * - list() -> list() (returns { paths: string[] } now)
 * - delete() -> delete()
 * - head() -> head() (returns StorageMetadata now)
 * - exists() -> exists()
 * - getRange() -> readRange()
 */
export interface ObjectStorageAdapter {
  /** Write data to a path */
  put(path: string, data: Uint8Array | ArrayBuffer): Promise<void>;

  /** Read data from a path, returns null if not found */
  get(path: string): Promise<Uint8Array | null>;

  /** Delete an object at path */
  delete(path: string): Promise<void>;

  /** List objects with a prefix */
  list(prefix: string): Promise<string[]>;

  /** Get object metadata without reading body */
  head(path: string): Promise<ObjectMetadata | null>;

  /** Check if an object exists */
  exists?(path: string): Promise<boolean>;

  /** Read a byte range from an object (for efficient partial reads) */
  getRange?(path: string, offset: number, length: number): Promise<Uint8Array>;
}

// =============================================================================
// R2 Storage Adapter
// =============================================================================

// R2 types are now centralized in types/r2.ts (Issue evodb-sdgz)
// Re-export for backward compatibility
export type {
  R2BucketLike,
  R2ObjectLike,
  R2ObjectsLike,
  R2PutOptionsLike,
  R2ListOptionsLike,
} from './types/r2.js';

// Import types for use in this file
import type { R2BucketLike } from './types/r2.js';

/**
 * R2 storage adapter implementation.
 *
 * Wraps a Cloudflare R2 bucket binding to implement the ObjectStorageAdapter interface.
 * This adapter handles key prefixing, path validation, and pagination for list operations.
 *
 * @deprecated Use R2StorageProvider from @evodb/core/storage instead for new code.
 *
 * @example Basic usage in a Cloudflare Worker
 * ```typescript
 * import { R2ObjectStorageAdapter } from '@evodb/core';
 *
 * export default {
 *   async fetch(request: Request, env: Env) {
 *     const adapter = new R2ObjectStorageAdapter(env.MY_BUCKET);
 *
 *     // Write data
 *     await adapter.put('data/file.bin', new Uint8Array([1, 2, 3]));
 *
 *     // Read data
 *     const data = await adapter.get('data/file.bin');
 *   }
 * };
 * ```
 *
 * @example With key prefix for multi-tenancy
 * ```typescript
 * // All operations will be prefixed with "tenant-123/"
 * const adapter = new R2ObjectStorageAdapter(env.MY_BUCKET, 'tenant-123');
 *
 * // Actually writes to "tenant-123/data.bin"
 * await adapter.put('data.bin', data);
 * ```
 */
export class R2ObjectStorageAdapter implements ObjectStorageAdapter {
  /**
   * Create a new R2ObjectStorageAdapter.
   *
   * @param bucket - R2Bucket binding or R2BucketLike interface
   * @param keyPrefix - Optional prefix to prepend to all keys (for multi-tenancy)
   * @throws ValidationError if keyPrefix contains path traversal patterns
   *
   * @example
   * ```typescript
   * // Without prefix
   * const adapter = new R2ObjectStorageAdapter(env.MY_BUCKET);
   *
   * // With prefix for isolation
   * const tenantAdapter = new R2ObjectStorageAdapter(env.MY_BUCKET, 'tenant-123');
   * ```
   */
  constructor(private bucket: R2BucketLike, private keyPrefix: string = '') {
    // Validate keyPrefix to prevent path traversal attacks
    validateKeyPrefix(keyPrefix);
  }

  private getFullKey(key: string): string {
    if (this.keyPrefix) {
      return `${this.keyPrefix}/${key}`.replace(/\/+/g, '/');
    }
    return key;
  }

  async put(path: string, data: Uint8Array | ArrayBuffer): Promise<void> {
    validateStoragePath(path);
    const fullKey = this.getFullKey(path);
    // Ensure data is an ArrayBuffer for R2
    const buffer = data instanceof ArrayBuffer ? data : (data.buffer as ArrayBuffer).slice(data.byteOffset, data.byteOffset + data.byteLength);
    await this.bucket.put(fullKey, buffer);
  }

  async get(path: string): Promise<Uint8Array | null> {
    validateStoragePath(path);
    const fullKey = this.getFullKey(path);
    const obj = await this.bucket.get(fullKey);
    if (!obj) return null;
    const buffer = await obj.arrayBuffer();
    return new Uint8Array(buffer);
  }

  async delete(path: string): Promise<void> {
    validateStoragePath(path);
    const fullKey = this.getFullKey(path);
    await this.bucket.delete(fullKey);
  }

  async list(prefix: string): Promise<string[]> {
    validateStoragePath(prefix);
    const fullPrefix = this.getFullKey(prefix);
    const keys: string[] = [];
    let cursor: string | undefined;

    do {
      const result = await this.bucket.list({ prefix: fullPrefix, cursor, limit: STORAGE_LIST_PAGE_SIZE });
      for (const obj of result.objects) {
        let key = obj.key;
        if (this.keyPrefix && key.startsWith(this.keyPrefix)) {
          key = key.slice(this.keyPrefix.length).replace(/^\/+/, '');
        }
        keys.push(key);
      }
      cursor = result.truncated ? result.cursor : undefined;
    } while (cursor);

    return keys;
  }

  async head(path: string): Promise<ObjectMetadata | null> {
    validateStoragePath(path);
    const fullKey = this.getFullKey(path);
    const obj = await this.bucket.head(fullKey);
    if (!obj) return null;
    return {
      size: obj.size,
      etag: obj.etag,
      lastModified: obj.uploaded,
    };
  }

  async exists(path: string): Promise<boolean> {
    const meta = await this.head(path);
    return meta !== null;
  }
}

// =============================================================================
// Memory Storage Adapter (for testing)
// =============================================================================

/**
 * In-memory storage adapter for testing.
 *
 * Implements the ObjectStorageAdapter interface with in-memory storage,
 * making it ideal for unit tests that don't need real R2 access.
 *
 * Features:
 * - Full ObjectStorageAdapter interface support
 * - ETag generation for cache validation testing
 * - Range read support via getRange()
 * - Utility methods: clear(), size, keys()
 *
 * @deprecated Use InMemoryStorageProvider from @evodb/core/storage instead for new code.
 *
 * @example Unit testing
 * ```typescript
 * import { MemoryObjectStorageAdapter } from '@evodb/core';
 *
 * describe('MyService', () => {
 *   let adapter: MemoryObjectStorageAdapter;
 *
 *   beforeEach(() => {
 *     adapter = new MemoryObjectStorageAdapter();
 *   });
 *
 *   afterEach(() => {
 *     adapter.clear();
 *   });
 *
 *   it('should store data', async () => {
 *     await adapter.put('test.bin', new Uint8Array([1, 2, 3]));
 *     const data = await adapter.get('test.bin');
 *     expect(data).toEqual(new Uint8Array([1, 2, 3]));
 *   });
 * });
 * ```
 *
 * @example Inspecting stored data
 * ```typescript
 * const adapter = new MemoryObjectStorageAdapter();
 * await adapter.put('a.bin', new Uint8Array([1]));
 * await adapter.put('b.bin', new Uint8Array([2]));
 *
 * console.log(adapter.size);  // 2
 * console.log(adapter.keys()); // ['a.bin', 'b.bin']
 * ```
 */
export class MemoryObjectStorageAdapter implements ObjectStorageAdapter {
  private storage = new Map<string, { data: Uint8Array; metadata: ObjectMetadata }>();

  async put(path: string, data: Uint8Array | ArrayBuffer): Promise<void> {
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    this.storage.set(path, {
      data: bytes.slice(), // Copy to prevent mutation
      metadata: {
        size: bytes.length,
        etag: `"${this.computeEtag(bytes)}"`,
        lastModified: new Date(),
      },
    });
  }

  async get(path: string): Promise<Uint8Array | null> {
    const entry = this.storage.get(path);
    return entry ? entry.data.slice() : null;
  }

  async delete(path: string): Promise<void> {
    this.storage.delete(path);
  }

  async list(prefix: string): Promise<string[]> {
    return [...this.storage.keys()]
      .filter(k => k.startsWith(prefix))
      .sort();
  }

  async head(path: string): Promise<ObjectMetadata | null> {
    const entry = this.storage.get(path);
    return entry ? { ...entry.metadata } : null;
  }

  async exists(path: string): Promise<boolean> {
    return this.storage.has(path);
  }

  async getRange(path: string, offset: number, length: number): Promise<Uint8Array> {
    const entry = this.storage.get(path);
    if (!entry) {
      throw StorageError.notFound(path, { operation: 'getRange', offset, length });
    }
    const start = validateRangeBounds(entry.data.length, offset, length);
    return entry.data.slice(start, start + length);
  }

  /** Clear all stored data (useful for test cleanup) */
  clear(): void {
    this.storage.clear();
  }

  /** Get number of stored objects */
  get size(): number {
    return this.storage.size;
  }

  /** Get all keys (for debugging) */
  keys(): string[] {
    return [...this.storage.keys()];
  }

  private computeEtag(data: Uint8Array): string {
    // Simple hash for testing - in production this would be MD5 or similar
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      hash = ((hash << 5) - hash + data[i]) | 0;
    }
    return hash.toString(16);
  }
}

// =============================================================================
// UNIFIED STORAGE IMPLEMENTATIONS
// =============================================================================

/**
 * In-memory implementation of the unified Storage interface.
 * Use for unit testing storage-dependent code.
 *
 * @example
 * ```typescript
 * const storage = new MemoryStorage();
 * await storage.write('test.bin', new Uint8Array([1, 2, 3]));
 * const data = await storage.read('test.bin');
 * ```
 */
export class MemoryStorage implements Storage {
  private data = new Map<string, { bytes: Uint8Array; metadata: StorageMetadata }>();

  async read(path: string): Promise<Uint8Array | null> {
    const entry = this.data.get(path);
    return entry ? entry.bytes.slice() : null;
  }

  async write(path: string, data: Uint8Array): Promise<void> {
    this.data.set(path, {
      bytes: data.slice(), // Copy to prevent mutation
      metadata: {
        size: data.length,
        etag: `"${this.computeEtag(data)}"`,
        lastModified: new Date(),
      },
    });
  }

  async list(prefix: string): Promise<{ paths: string[] }> {
    const paths = [...this.data.keys()]
      .filter(k => k.startsWith(prefix))
      .sort();
    return { paths };
  }

  async delete(path: string): Promise<void> {
    this.data.delete(path);
  }

  async exists(path: string): Promise<boolean> {
    return this.data.has(path);
  }

  async head(path: string): Promise<StorageMetadata | null> {
    const entry = this.data.get(path);
    return entry ? { ...entry.metadata } : null;
  }

  async readRange(path: string, offset: number, length: number): Promise<Uint8Array> {
    const entry = this.data.get(path);
    if (!entry) {
      throw StorageError.notFound(path, { operation: 'readRange', offset, length });
    }
    const start = validateRangeBounds(entry.bytes.length, offset, length);
    return entry.bytes.slice(start, start + length);
  }

  /** Clear all stored data (useful for test cleanup) */
  clear(): void {
    this.data.clear();
  }

  /** Get number of stored objects */
  get size(): number {
    return this.data.size;
  }

  /** Get all keys (for debugging) */
  keys(): string[] {
    return [...this.data.keys()];
  }

  private computeEtag(data: Uint8Array): string {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      hash = ((hash << 5) - hash + data[i]) | 0;
    }
    return hash.toString(16);
  }
}

/**
 * R2 implementation of the unified Storage interface.
 * Wraps an R2Bucket binding to provide the Storage interface.
 *
 * @example
 * ```typescript
 * // In a Cloudflare Worker
 * const storage = new R2Storage(env.MY_BUCKET);
 * await storage.write('data/file.bin', new Uint8Array([1, 2, 3]));
 * ```
 */
export class R2Storage implements Storage {
  constructor(private bucket: R2BucketLike, private keyPrefix: string = '') {
    // Validate keyPrefix to prevent path traversal attacks
    validateKeyPrefix(keyPrefix);
  }

  private getFullKey(key: string): string {
    if (this.keyPrefix) {
      return `${this.keyPrefix}/${key}`.replace(/\/+/g, '/');
    }
    return key;
  }

  async read(path: string): Promise<Uint8Array | null> {
    validateStoragePath(path);
    const fullKey = this.getFullKey(path);
    const obj = await this.bucket.get(fullKey);
    if (!obj) return null;
    const buffer = await obj.arrayBuffer();
    return new Uint8Array(buffer);
  }

  async write(path: string, data: Uint8Array): Promise<void> {
    validateStoragePath(path);
    const fullKey = this.getFullKey(path);
    const buffer = (data.buffer as ArrayBuffer).slice(data.byteOffset, data.byteOffset + data.byteLength);
    await this.bucket.put(fullKey, buffer);
  }

  async list(prefix: string): Promise<{ paths: string[] }> {
    validateStoragePath(prefix);
    const fullPrefix = this.getFullKey(prefix);
    const paths: string[] = [];
    let cursor: string | undefined;

    do {
      const result = await this.bucket.list({ prefix: fullPrefix, cursor, limit: STORAGE_LIST_PAGE_SIZE });
      for (const obj of result.objects) {
        let key = obj.key;
        if (this.keyPrefix && key.startsWith(this.keyPrefix)) {
          key = key.slice(this.keyPrefix.length).replace(/^\/+/, '');
        }
        paths.push(key);
      }
      cursor = result.truncated ? result.cursor : undefined;
    } while (cursor);

    return { paths };
  }

  async delete(path: string): Promise<void> {
    validateStoragePath(path);
    const fullKey = this.getFullKey(path);
    await this.bucket.delete(fullKey);
  }

  async exists(path: string): Promise<boolean> {
    const meta = await this.head(path);
    return meta !== null;
  }

  async head(path: string): Promise<StorageMetadata | null> {
    validateStoragePath(path);
    const fullKey = this.getFullKey(path);
    const obj = await this.bucket.head(fullKey);
    if (!obj) return null;
    return {
      size: obj.size,
      etag: obj.etag,
      lastModified: obj.uploaded,
    };
  }
}

// =============================================================================
// ADAPTER FUNCTIONS - Convert between interfaces
// =============================================================================

/**
 * Wrap a unified Storage implementation to provide the legacy ObjectStorageAdapter interface.
 * Use this when you need to pass a Storage to code that expects ObjectStorageAdapter.
 */
export function storageToObjectAdapter(storage: Storage): ObjectStorageAdapter {
  return {
    async put(path: string, data: Uint8Array | ArrayBuffer): Promise<void> {
      const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
      await storage.write(path, bytes);
    },
    async get(path: string): Promise<Uint8Array | null> {
      return storage.read(path);
    },
    async delete(path: string): Promise<void> {
      await storage.delete(path);
    },
    async list(prefix: string): Promise<string[]> {
      const result = await storage.list(prefix);
      return result.paths;
    },
    async head(path: string): Promise<ObjectMetadata | null> {
      if (storage.head) {
        return storage.head(path);
      }
      const data = await storage.read(path);
      if (!data) return null;
      return { size: data.length, etag: '' };
    },
    async exists(path: string): Promise<boolean> {
      if (storage.exists) {
        return storage.exists(path);
      }
      const data = await storage.read(path);
      return data !== null;
    },
    async getRange(path: string, offset: number, length: number): Promise<Uint8Array> {
      if (storage.readRange) {
        return storage.readRange(path, offset, length);
      }
      const data = await storage.read(path);
      if (!data) {
        throw StorageError.notFound(path, { operation: 'getRange', offset, length });
      }
      const start = validateRangeBounds(data.length, offset, length);
      return data.slice(start, start + length);
    },
  };
}

/**
 * Wrap a legacy ObjectStorageAdapter to provide the unified Storage interface.
 * Use this when migrating existing code to the new interface.
 */
export function objectAdapterToStorage(adapter: ObjectStorageAdapter): Storage {
  return {
    async read(path: string): Promise<Uint8Array | null> {
      return adapter.get(path);
    },
    async write(path: string, data: Uint8Array): Promise<void> {
      await adapter.put(path, data);
    },
    async list(prefix: string): Promise<{ paths: string[] }> {
      const paths = await adapter.list(prefix);
      return { paths };
    },
    async delete(path: string): Promise<void> {
      await adapter.delete(path);
    },
    async exists(path: string): Promise<boolean> {
      if (adapter.exists) {
        return adapter.exists(path);
      }
      const meta = await adapter.head(path);
      return meta !== null;
    },
    async head(path: string): Promise<StorageMetadata | null> {
      return adapter.head(path);
    },
    async readRange(path: string, offset: number, length: number): Promise<Uint8Array> {
      if (adapter.getRange) {
        return adapter.getRange(path, offset, length);
      }
      const data = await adapter.get(path);
      if (!data) {
        throw StorageError.notFound(path, { operation: 'readRange', offset, length });
      }
      const start = validateRangeBounds(data.length, offset, length);
      return data.slice(start, start + length);
    },
  };
}

/**
 * Create a unified Storage from an R2 bucket binding
 */
export function createStorage(bucket: R2BucketLike, keyPrefix?: string): Storage {
  return new R2Storage(bucket, keyPrefix);
}

/**
 * Create an in-memory Storage for testing
 */
export function createMemoryStorage(): MemoryStorage {
  return new MemoryStorage();
}

// =============================================================================
// Factory Functions (Legacy - kept for backward compatibility)
// =============================================================================

/**
 * Create an R2 storage adapter from a bucket binding
 * @param bucket - R2Bucket binding or R2BucketLike interface
 * @param keyPrefix - Optional prefix to prepend to all keys
 */
export function createR2ObjectAdapter(bucket: R2BucketLike, keyPrefix?: string): ObjectStorageAdapter {
  return new R2ObjectStorageAdapter(bucket, keyPrefix);
}

/**
 * Create an in-memory storage adapter for testing
 */
export function createMemoryObjectAdapter(): MemoryObjectStorageAdapter {
  return new MemoryObjectStorageAdapter();
}

/**
 * Wrap a raw R2Bucket (or R2BucketLike) in an ObjectStorageAdapter
 * Provides backward compatibility - accepts either an adapter or a raw bucket
 */
export function wrapStorageBackend(
  backend: ObjectStorageAdapter | R2BucketLike,
  keyPrefix?: string
): ObjectStorageAdapter {
  // Check if it's already an ObjectStorageAdapter (has our interface)
  if ('put' in backend && 'get' in backend && 'list' in backend && 'head' in backend && 'delete' in backend) {
    // Could be either interface - check for R2-specific method signatures
    const maybeBucket = backend as R2BucketLike;
    if (typeof maybeBucket.put === 'function') {
      // Check the function signature - R2Bucket.put returns R2Object, our adapter returns void
      // We detect R2Bucket by checking if 'head' returns an R2ObjectLike (has arrayBuffer method)
      // Simple heuristic: if it has an 'uploaded' property pattern, it's likely R2
      // Since we can't inspect return types at runtime, use a property check
      if (!('storage' in backend) && !('bucket' in backend)) {
        // Likely a raw R2BucketLike, wrap it
        return new R2ObjectStorageAdapter(maybeBucket, keyPrefix);
      }
    }
    // It's already an ObjectStorageAdapter
    return backend as ObjectStorageAdapter;
  }
  // Assume it's an R2BucketLike
  return new R2ObjectStorageAdapter(backend as R2BucketLike, keyPrefix);
}

// =============================================================================
// DO Storage Adapters (original implementation)
// =============================================================================

/** Durable Object SQL storage interface */
interface DOSqlStorage {
  exec(query: string, ...bindings: unknown[]): { results: unknown[] };
}

// =============================================================================
// SQL Injection Prevention
// Issue: evodb-ofu - Table names must be validated before SQL interpolation
// =============================================================================

/** Valid table name regex: only alphanumeric characters and underscores */
const VALID_TABLE_NAME_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Validate a table name to prevent SQL injection.
 *
 * Table names must:
 * - Start with a letter or underscore
 * - Contain only alphanumeric characters and underscores
 * - Not be empty
 *
 * This is critical for security when interpolating table names into SQL queries,
 * as parameterized queries cannot be used for identifiers (table/column names).
 *
 * @param tableName - The table name to validate
 * @throws ValidationError if table name is invalid
 *
 * @example
 * ```typescript
 * import { validateTableName } from '@evodb/core';
 *
 * // Valid table names
 * validateTableName('users');           // OK
 * validateTableName('order_items');     // OK
 * validateTableName('_temp_data');      // OK
 * validateTableName('Table123');        // OK
 *
 * // Invalid table names (will throw)
 * validateTableName('');                // Empty
 * validateTableName('user-data');       // Contains hyphen
 * validateTableName('123table');        // Starts with number
 * validateTableName('users; DROP');     // SQL injection attempt
 * ```
 */
export function validateTableName(tableName: string): void {
  if (!tableName || !VALID_TABLE_NAME_REGEX.test(tableName)) {
    throw new ValidationError(
      `Invalid table name: "${tableName}"`,
      ErrorCode.INVALID_FORMAT,
      { field: 'tableName', actualValue: tableName, expectedFormat: 'alphanumeric with underscores, starting with letter or underscore' },
      'Table names must start with a letter or underscore and contain only alphanumeric characters and underscores (e.g., "users", "order_items", "_temp").'
    );
  }
}

/**
 * Quote a SQL identifier using double quotes (SQL standard).
 *
 * This provides defense in depth when combined with validation.
 * Any embedded double quotes are escaped by doubling them.
 *
 * **Security Note**: Always use validateTableName() FIRST, then quoteIdentifier().
 * Quoting alone is not sufficient - validation ensures the identifier follows
 * expected patterns, while quoting provides an additional layer of protection.
 *
 * @param identifier - The identifier to quote (table name, column name, etc.)
 * @returns The quoted identifier safe for SQL interpolation
 *
 * @example
 * ```typescript
 * import { validateTableName, quoteIdentifier } from '@evodb/core';
 *
 * const tableName = 'user_data';
 * validateTableName(tableName);  // First: validate
 * const quoted = quoteIdentifier(tableName);  // Then: quote
 * console.log(quoted);  // "user_data"
 *
 * // Use in SQL
 * const sql = `SELECT * FROM ${quoted} WHERE id = ?`;
 * ```
 */
export function quoteIdentifier(identifier: string): string {
  // Escape any embedded double quotes by doubling them
  const escaped = identifier.replace(/"/g, '""');
  return `"${escaped}"`;
}

// =============================================================================
// Path Traversal Prevention
// Issue: evodb-409 - Validate key prefix format with whitelist approach
// =============================================================================

/**
 * Validate a storage path to prevent path traversal attacks.
 * Uses a whitelist approach: only allow known-safe characters and patterns.
 *
 * Safe paths:
 * - Use forward slashes for directories
 * - Contain only alphanumeric, dash, underscore, dot characters
 * - Do not start with / (no absolute paths)
 * - Do not contain .. (no path traversal)
 * - Do not contain null bytes or control characters
 *
 * @param path - The storage path to validate
 * @throws StorageError if path contains dangerous patterns
 */
export function validateStoragePath(path: string): void {
  // Check for empty or whitespace-only paths
  if (!path || path.trim().length === 0) {
    throw new StorageError(
      'Storage path cannot be empty',
      ErrorCode.INVALID_PATH,
      { operation: 'validatePath', path, reason: 'empty' },
      'Provide a non-empty path (e.g., "data/file.bin").'
    );
  }

  // Check for null bytes (can truncate paths in some systems)
  if (path.includes('\x00')) {
    throw new StorageError(
      'Storage path contains null byte',
      ErrorCode.INVALID_PATH,
      { operation: 'validatePath', path, reason: 'null_byte' },
      'Remove null bytes from the path. Null bytes can cause security issues.'
    );
  }

  // Check for control characters (ASCII 0x00-0x1F except allowed whitespace)
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f]/.test(path)) {
    throw new StorageError(
      'Storage path contains control character',
      ErrorCode.INVALID_PATH,
      { operation: 'validatePath', path, reason: 'control_character' },
      'Remove control characters from the path. Use only printable characters.'
    );
  }

  // Check for absolute paths (Unix-style)
  if (path.startsWith('/')) {
    throw new StorageError(
      'Absolute path not allowed',
      ErrorCode.INVALID_PATH,
      { operation: 'validatePath', path, reason: 'absolute_path' },
      'Use a relative path instead (e.g., "data/file.bin" not "/data/file.bin").'
    );
  }

  // Check for Windows absolute paths (C:\ or C:/)
  if (/^[a-zA-Z]:[/\\]/.test(path)) {
    throw new StorageError(
      'Absolute path not allowed',
      ErrorCode.INVALID_PATH,
      { operation: 'validatePath', path, reason: 'absolute_path' },
      'Use a relative path instead (e.g., "data/file.bin" not "C:/data/file.bin").'
    );
  }

  // Check for UNC paths (\\server\share or //server/share)
  if (path.startsWith('\\\\') || path.startsWith('//')) {
    throw new StorageError(
      'Absolute path not allowed',
      ErrorCode.INVALID_PATH,
      { operation: 'validatePath', path, reason: 'absolute_path' },
      'Use a relative path instead. UNC paths are not supported.'
    );
  }

  // Normalize the path for traversal detection (handle backslashes as path separators)
  const normalizedPath = path.replace(/\\/g, '/');

  // Check for path traversal patterns - must check BEFORE and AFTER URL decoding
  const pathTraversalPatterns = [
    /\.\./,           // Direct ..
    /%2e%2e/i,        // URL-encoded .
    /%252e%252e/i,    // Double URL-encoded .
  ];

  for (const pattern of pathTraversalPatterns) {
    if (pattern.test(normalizedPath)) {
      throw new StorageError(
        'Path traversal detected',
        ErrorCode.INVALID_PATH,
        { operation: 'validatePath', path, reason: 'path_traversal' },
        'Remove ".." sequences from the path. Path traversal is not allowed for security reasons.'
      );
    }
  }

  // Try URL-decoding and check again (handles single URL-encoded attacks)
  try {
    const decoded = decodeURIComponent(normalizedPath);
    if (decoded.includes('..')) {
      throw new StorageError(
        'Path traversal detected (URL-encoded)',
        ErrorCode.INVALID_PATH,
        { operation: 'validatePath', path, reason: 'path_traversal' },
        'Remove ".." sequences from the path (including URL-encoded variants like %2e%2e).'
      );
    }
    // Try double-decoding (handles double URL-encoded attacks)
    try {
      const doubleDecoded = decodeURIComponent(decoded);
      if (doubleDecoded.includes('..')) {
        throw new StorageError(
          'Path traversal detected (double URL-encoded)',
          ErrorCode.INVALID_PATH,
          { operation: 'validatePath', path, reason: 'path_traversal' },
          'Remove ".." sequences from the path (including double URL-encoded variants).'
        );
      }
    } catch {
      // Double decoding failed, which is fine - the path is safe from double-encoding attacks
    }
  } catch (e) {
    // If decoding fails with a StorageError, re-throw it
    if (e instanceof StorageError) {
      throw e;
    }
    // Otherwise, decoding failed which means it's not a valid URL-encoded attack
  }
}

/**
 * Validate a key prefix used in storage constructors.
 * Empty prefixes are allowed. Non-empty prefixes must pass path validation.
 *
 * @param keyPrefix - The key prefix to validate (can be empty string)
 * @throws Error if prefix contains dangerous patterns
 */
export function validateKeyPrefix(keyPrefix: string): void {
  // Empty prefix is always valid
  if (keyPrefix === '') {
    return;
  }
  // Non-empty prefixes must pass full path validation
  validateStoragePath(keyPrefix);
}

// =============================================================================
// Range Bounds Validation
// Issue: evodb-qpi - TDD: Add getRange bounds validation
// =============================================================================

/**
 * Validate and normalize range parameters for getRange/readRange operations.
 * This function checks for:
 * - Negative lengths (invalid)
 * - Offsets that are out of bounds (past end or before start after negative resolution)
 *
 * @param dataLength - The total length of the data being read from
 * @param offset - The requested offset (can be negative for from-end semantics)
 * @param length - The requested length (must be non-negative)
 * @returns The normalized start position (always non-negative)
 * @throws ValidationError if length is negative, or if offset is out of bounds
 */
export function validateRangeBounds(dataLength: number, offset: number, length: number): number {
  // Check for negative length
  if (length < 0) {
    throw new ValidationError(
      `Invalid range length: ${length}`,
      ErrorCode.VALIDATION_ERROR,
      { field: 'length', actualValue: length, expectedFormat: 'non-negative integer' },
      'Length must be a non-negative integer (e.g., 0, 100, 1024).'
    );
  }

  // Resolve negative offset (from end of data)
  let start = offset;
  if (start < 0) {
    start = dataLength + offset;
  }

  // Check if start is out of bounds
  // Note: start == dataLength is allowed ONLY if length == 0 (reading nothing from end)
  if (start < 0) {
    throw new ValidationError(
      `Offset out of range: ${offset} resolves to ${start} for data of length ${dataLength}`,
      ErrorCode.VALIDATION_ERROR,
      { field: 'offset', actualValue: offset, resolvedValue: start, dataLength },
      `Use an offset between ${-dataLength} and ${dataLength - 1} for this data.`
    );
  }

  if (start > dataLength || (start === dataLength && length > 0)) {
    throw new ValidationError(
      `Offset out of range: ${offset} (resolved to ${start}) is beyond data length ${dataLength}`,
      ErrorCode.VALIDATION_ERROR,
      { field: 'offset', actualValue: offset, resolvedValue: start, dataLength },
      `Use an offset between 0 and ${dataLength - 1} for this data, or use a negative offset to read from the end.`
    );
  }

  return start;
}

/**
 * Create a Durable Object SQLite storage adapter.
 *
 * This adapter stores blocks in a SQLite table within a Durable Object,
 * providing durable, transactional storage for block data.
 *
 * The adapter creates the table if it doesn't exist with schema:
 * - id: TEXT PRIMARY KEY (block ID)
 * - data: BLOB (block data)
 * - created_at: INTEGER (unix timestamp)
 *
 * @param sql - Durable Object SQL storage interface (from `this.ctx.storage.sql`)
 * @param tableName - Name of the table to use (default: 'blocks'). Must pass validation.
 * @returns A StorageAdapter for reading/writing blocks
 * @throws ValidationError if tableName is invalid (SQL injection prevention)
 *
 * @example In a Durable Object
 * ```typescript
 * import { createDOAdapter } from '@evodb/core';
 *
 * export class MyDO extends DurableObject {
 *   private storage: StorageAdapter;
 *
 *   constructor(ctx: DurableObjectState, env: Env) {
 *     super(ctx, env);
 *     this.storage = createDOAdapter(ctx.storage.sql);
 *   }
 *
 *   async writeData(id: string, data: Uint8Array) {
 *     await this.storage.writeBlock(id, data);
 *   }
 * }
 * ```
 *
 * @example With custom table name
 * ```typescript
 * // For multi-purpose DOs with different data types
 * const walStorage = createDOAdapter(ctx.storage.sql, 'wal_entries');
 * const blockStorage = createDOAdapter(ctx.storage.sql, 'data_blocks');
 * ```
 */
export function createDOAdapter(sql: DOSqlStorage, tableName = 'blocks'): StorageAdapter {
  // Validate table name to prevent SQL injection (first line of defense)
  validateTableName(tableName);

  // Quote the table name for defense in depth (second line of defense)
  const quotedTable = quoteIdentifier(tableName);

  // Ensure table exists
  sql.exec(`CREATE TABLE IF NOT EXISTS ${quotedTable} (id TEXT PRIMARY KEY, data BLOB, created_at INTEGER DEFAULT (unixepoch()))`);

  return {
    async writeBlock(id: string, data: Uint8Array): Promise<void> {
      sql.exec(`INSERT OR REPLACE INTO ${quotedTable} (id, data) VALUES (?, ?)`, id, data);
    },

    async readBlock(id: string): Promise<Uint8Array | null> {
      const result = sql.exec(`SELECT data FROM ${quotedTable} WHERE id = ?`, id);
      if (!result.results.length) return null;
      const row = result.results[0] as { data: ArrayBuffer };
      return new Uint8Array(row.data);
    },

    async listBlocks(prefix?: string): Promise<string[]> {
      const query = prefix
        ? `SELECT id FROM ${quotedTable} WHERE id LIKE ? ORDER BY id`
        : `SELECT id FROM ${quotedTable} ORDER BY id`;
      const result = prefix
        ? sql.exec(query, prefix + '%')
        : sql.exec(query);
      return (result.results as { id: string }[]).map(r => r.id);
    },

    async deleteBlock(id: string): Promise<void> {
      sql.exec(`DELETE FROM ${quotedTable} WHERE id = ?`, id);
    },
  };
}

/**
 * Create a Durable Object KV storage adapter.
 *
 * This adapter uses the DO's key-value storage, which supports values up to 128KB.
 * It's ideal for WAL entries and smaller data items that don't require SQL queries.
 *
 * Unlike the SQL adapter, KV storage:
 * - Has simpler semantics (just key-value)
 * - Supports larger values (128KB vs typical row size limits)
 * - May have better performance for simple get/put operations
 *
 * @param storage - Durable Object storage interface (from `this.ctx.storage`)
 * @returns A StorageAdapter for reading/writing blocks
 *
 * @example In a Durable Object
 * ```typescript
 * import { createDOKVAdapter } from '@evodb/core';
 *
 * export class WalDO extends DurableObject {
 *   private storage: StorageAdapter;
 *
 *   constructor(ctx: DurableObjectState, env: Env) {
 *     super(ctx, env);
 *     this.storage = createDOKVAdapter(ctx.storage);
 *   }
 *
 *   async appendWal(id: string, entry: Uint8Array) {
 *     await this.storage.writeBlock(id, entry);
 *   }
 * }
 * ```
 */
export function createDOKVAdapter(storage: DurableObjectStorage): StorageAdapter {
  return {
    async writeBlock(id: string, data: Uint8Array): Promise<void> {
      await storage.put(id, data);
    },

    async readBlock(id: string): Promise<Uint8Array | null> {
      const data = await storage.get<ArrayBuffer>(id);
      return data ? new Uint8Array(data) : null;
    },

    async listBlocks(prefix?: string): Promise<string[]> {
      const opts = prefix ? { prefix } : {};
      const map = await storage.list(opts);
      return [...map.keys()];
    },

    async deleteBlock(id: string): Promise<void> {
      await storage.delete(id);
    },
  };
}

/**
 * Create an in-memory storage adapter for testing.
 *
 * This adapter stores data in a Map, making it ideal for unit tests
 * that don't need persistent storage. Data is lost when the adapter
 * instance is garbage collected.
 *
 * @returns A StorageAdapter backed by in-memory Map storage
 *
 * @example Unit testing
 * ```typescript
 * import { createMemoryAdapter } from '@evodb/core';
 *
 * describe('BlockWriter', () => {
 *   it('should write and read blocks', async () => {
 *     const storage = createMemoryAdapter();
 *     const writer = new BlockWriter(storage);
 *
 *     await writer.write('block-1', testData);
 *     const result = await storage.readBlock('block-1');
 *     expect(result).toEqual(testData);
 *   });
 * });
 * ```
 */
export function createMemoryAdapter(): StorageAdapter {
  const store = new Map<string, Uint8Array>();

  return {
    async writeBlock(id: string, data: Uint8Array): Promise<void> {
      store.set(id, data.slice());
    },

    async readBlock(id: string): Promise<Uint8Array | null> {
      const data = store.get(id);
      return data ? data.slice() : null;
    },

    async listBlocks(prefix?: string): Promise<string[]> {
      const keys = [...store.keys()];
      return prefix ? keys.filter(k => k.startsWith(prefix)).sort() : keys.sort();
    },

    async deleteBlock(id: string): Promise<void> {
      store.delete(id);
    },
  };
}

/** Durable Object Storage interface for type checking */
interface DurableObjectStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
  list(options?: { prefix?: string }): Promise<Map<string, unknown>>;
}

/** Base-36 validation regex: only digits 0-9 and letters a-z (case-insensitive) */
const BASE36_REGEX = /^[0-9a-z]+$/i;

/** Validate and parse base-36 string to number, returns NaN if invalid */
function safeParseBase36(str: string): number {
  if (!str || !BASE36_REGEX.test(str)) return NaN;
  return parseInt(str, 36);
}

// =============================================================================
// Block ID utilities - Returns branded BlockId type
// =============================================================================

/**
 * Create a BlockId from components.
 *
 * Block IDs are structured identifiers with the format:
 * `prefix:timestamp(base36,10-padded):seq(base36,4-padded)`
 *
 * The base-36 encoding and padding ensure:
 * - Lexicographic ordering matches temporal ordering
 * - Fixed-width format for consistent storage
 * - Compact representation (base-36 is 20% smaller than hex)
 *
 * @param prefix - A string prefix identifying the block type or table
 * @param timestamp - Unix timestamp in milliseconds
 * @param seq - Sequence number for blocks with the same timestamp (default: 0)
 * @returns Branded BlockId type for compile-time safety
 *
 * @example
 * ```typescript
 * import { makeBlockId, parseBlockId } from '@evodb/core';
 *
 * // Create a block ID
 * const id = makeBlockId('users', Date.now(), 0);
 * console.log(id);  // "users:lk2x4r7m00:0000"
 *
 * // Block IDs sort chronologically
 * const id1 = makeBlockId('data', 1000);
 * const id2 = makeBlockId('data', 2000);
 * console.log(id1 < id2);  // true
 * ```
 */
export function makeBlockId(prefix: string, timestamp: number, seq = 0): BlockId {
  const ts = timestamp.toString(36).padStart(10, '0');
  const s = seq.toString(36).padStart(4, '0');
  return unsafeBlockId(`${prefix}:${ts}:${s}`);
}

/**
 * Parse a BlockId into its components.
 *
 * Extracts the prefix, timestamp, and sequence number from a block ID string.
 * Returns null if the format is invalid (wrong number of parts, invalid base-36).
 *
 * @param id - BlockId or plain string to parse
 * @returns Parsed components or null if invalid format
 *
 * @example
 * ```typescript
 * import { makeBlockId, parseBlockId } from '@evodb/core';
 *
 * const id = makeBlockId('users', 1705000000000, 5);
 * const parsed = parseBlockId(id);
 *
 * if (parsed) {
 *   console.log(parsed.prefix);     // "users"
 *   console.log(parsed.timestamp);  // 1705000000000
 *   console.log(parsed.seq);        // 5
 * }
 *
 * // Invalid format returns null
 * const invalid = parseBlockId('not-a-valid-id');
 * console.log(invalid);  // null
 * ```
 */
export function parseBlockId(id: BlockId | string): { prefix: string; timestamp: number; seq: number } | null {
  const parts = (id as string).split(':');
  if (parts.length !== 3) return null;

  const timestamp = safeParseBase36(parts[1]);
  const seq = safeParseBase36(parts[2]);

  // Return null if either value is NaN (invalid base-36 input)
  if (Number.isNaN(timestamp) || Number.isNaN(seq)) return null;

  return {
    prefix: parts[0],
    timestamp,
    seq,
  };
}

// =============================================================================
// WAL ID utilities - Returns branded WalId type
// =============================================================================

/**
 * Create a WalId from a Log Sequence Number (LSN).
 *
 * WAL IDs are structured identifiers with the format:
 * `wal:lsn(base36,12-padded)`
 *
 * The base-36 encoding and 12-character padding:
 * - Ensures lexicographic ordering matches LSN ordering
 * - Supports LSNs up to ~4.7 quintillion (2^62)
 * - Provides compact, URL-safe identifiers
 *
 * @param lsn - Log Sequence Number as a bigint
 * @returns WalId string identifier
 *
 * @example
 * ```typescript
 * import { makeWalId, parseWalId } from '@evodb/core';
 *
 * // Create a WAL ID from LSN
 * const id = makeWalId(12345678n);
 * console.log(id);  // "wal:00000007o6me"
 *
 * // WAL IDs sort by LSN order
 * const id1 = makeWalId(100n);
 * const id2 = makeWalId(200n);
 * console.log(id1 < id2);  // true
 * ```
 */
export function makeWalId(lsn: bigint): WalId {
  return `wal:${lsn.toString(36).padStart(12, '0')}`;
}

/**
 * Parse a WalId to extract the Log Sequence Number (LSN).
 *
 * Extracts the LSN from a WAL ID string. Returns null if the format
 * is invalid (doesn't start with "wal:" or contains invalid base-36).
 *
 * @param id - WalId or plain string to parse
 * @returns Parsed LSN as bigint or null if invalid format
 *
 * @example
 * ```typescript
 * import { makeWalId, parseWalId } from '@evodb/core';
 *
 * const id = makeWalId(12345678n);
 * const lsn = parseWalId(id);
 *
 * if (lsn !== null) {
 *   console.log(lsn);  // 12345678n
 * }
 *
 * // Invalid format returns null
 * const invalid = parseWalId('not-a-wal-id');
 * console.log(invalid);  // null
 * ```
 */
export function parseWalId(id: WalId | string): bigint | null {
  const idStr = id as string;
  if (!idStr.startsWith('wal:')) return null;

  const base36Str = idStr.slice(4);
  // Validate base-36 format before parsing
  if (!base36Str || !BASE36_REGEX.test(base36Str)) return null;

  const parsed = parseInt(base36Str, 36);
  if (Number.isNaN(parsed)) return null;

  return BigInt(parsed);
}
