/**
 * @evodb/core - Unified StorageProvider Interface
 *
 * Issue: evodb-v3l - Consolidate storage interface fragmentation
 *
 * This module provides a unified StorageProvider interface that consolidates
 * the following overlapping storage abstractions in the codebase:
 *
 * 1. Storage (core/storage.ts) - read/write/list/delete
 * 2. ObjectStorageAdapter (core/storage.ts) - put/get/list/head/delete
 * 3. StorageAdapter (core/types.ts) - writeBlock/readBlock/listBlocks/deleteBlock
 * 4. R2StorageAdapter (lakehouse/types.ts) - readJson/writeJson/readBinary/writeBinary
 * 5. StorageAdapter (lance-reader/types.ts) - get/getRange/list/exists
 *
 * The StorageProvider interface uses consistent naming:
 * - get() for reading data
 * - put() for writing data
 * - delete() for removing data
 * - list() for listing keys (returns string[])
 * - exists() for checking key existence
 *
 * @module storage-provider
 */

// =============================================================================
// PATH VALIDATION (inlined to avoid circular dependencies)
// =============================================================================

/**
 * Validate a storage path to prevent path traversal attacks.
 * Uses a whitelist approach: only allow known-safe characters and patterns.
 *
 * @param path - The storage path to validate
 * @throws Error if path contains dangerous patterns
 */
function validateStoragePath(path: string): void {
  // Check for empty or whitespace-only paths
  if (!path || path.trim().length === 0) {
    throw new Error('Storage path validation failed: path cannot be empty');
  }

  // Check for null bytes (can truncate paths in some systems)
  if (path.includes('\x00')) {
    throw new Error('Storage path validation failed: path contains null byte');
  }

  // Check for control characters (ASCII 0x00-0x1F except allowed whitespace)
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f]/.test(path)) {
    throw new Error('Storage path validation failed: path contains control character');
  }

  // Check for absolute paths (Unix-style)
  if (path.startsWith('/')) {
    throw new Error('Storage path validation failed: absolute path not allowed');
  }

  // Check for Windows absolute paths (C:\ or C:/)
  if (/^[a-zA-Z]:[/\\]/.test(path)) {
    throw new Error('Storage path validation failed: absolute path not allowed');
  }

  // Check for UNC paths (\\server\share or //server/share)
  if (path.startsWith('\\\\') || path.startsWith('//')) {
    throw new Error('Storage path validation failed: absolute path not allowed');
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
      throw new Error('Storage path validation failed: path traversal detected');
    }
  }

  // Try URL-decoding and check again (handles single URL-encoded attacks)
  try {
    const decoded = decodeURIComponent(normalizedPath);
    if (decoded.includes('..')) {
      throw new Error('Storage path validation failed: path traversal detected');
    }
    // Try double-decoding (handles double URL-encoded attacks)
    try {
      const doubleDecoded = decodeURIComponent(decoded);
      if (doubleDecoded.includes('..')) {
        throw new Error('Storage path validation failed: path traversal detected');
      }
    } catch {
      // Double decoding failed, which is fine - the path is safe from double-encoding attacks
    }
  } catch (e) {
    // If decoding fails with a non-path-traversal error, re-throw original path traversal errors
    if (e instanceof Error && e.message.includes('path traversal')) {
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
function validateKeyPrefix(keyPrefix: string): void {
  // Empty prefix is always valid
  if (keyPrefix === '') {
    return;
  }
  // Non-empty prefixes must pass full path validation
  validateStoragePath(keyPrefix);
}

// =============================================================================
// STORAGE PROVIDER ERROR CLASSES
// =============================================================================

/**
 * Base error class for all storage provider errors.
 * Provides consistent error handling across all storage implementations.
 *
 * @example
 * ```typescript
 * try {
 *   await provider.get('path/to/file.bin');
 * } catch (error) {
 *   if (error instanceof StorageProviderError) {
 *     console.error('Storage error:', error.message);
 *   }
 * }
 * ```
 */
export class StorageProviderError extends Error {
  public readonly cause?: Error;

  constructor(message: string, options?: { cause?: Error }) {
    super(message);
    this.name = 'StorageProviderError';
    this.cause = options?.cause;
    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, StorageProviderError.prototype);
  }
}

/**
 * Error thrown when a requested key is not found in storage.
 * This is typically used for operations that require the key to exist
 * (e.g., readRange on a non-existent file).
 *
 * Note: get() and exists() return null/false instead of throwing this error.
 *
 * @example
 * ```typescript
 * if (error instanceof NotFoundError) {
 *   console.log(`File not found: ${error.path}`);
 * }
 * ```
 */
export class NotFoundError extends StorageProviderError {
  constructor(
    public readonly path: string,
    options?: { cause?: Error }
  ) {
    super(`Object not found: ${path}`, options);
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

// =============================================================================
// STORAGE PROVIDER INTERFACE
// =============================================================================

/**
 * Unified StorageProvider interface - the canonical interface for storage operations.
 *
 * This interface consolidates multiple overlapping storage abstractions into a
 * single, consistent API. Use this interface for all new code.
 *
 * Design principles:
 * - Simple, minimal interface (5 core methods)
 * - Matches common object storage semantics (R2, S3, GCS)
 * - Uses Uint8Array for binary data (not ArrayBuffer) for consistency
 * - Returns null/false for missing keys (not exceptions)
 * - Consistent method naming (get/put/delete/list/exists)
 *
 * Migration from other interfaces:
 * - Storage: read() -> get(), write() -> put()
 * - ObjectStorageAdapter: Same naming, but list() returns string[] not { paths: string[] }
 * - StorageAdapter: readBlock() -> get(), writeBlock() -> put(), listBlocks() -> list()
 * - R2StorageAdapter: readBinary() -> get(), writeBinary() -> put()
 * - lance-reader StorageAdapter: Same naming (get/list/exists)
 *
 * @example
 * ```typescript
 * // In production: use R2StorageProvider
 * const provider = new R2StorageProvider(env.MY_BUCKET);
 *
 * // In tests: use InMemoryStorageProvider
 * const testProvider = new InMemoryStorageProvider();
 *
 * // Both implement the same interface
 * async function processData(provider: StorageProvider) {
 *   const data = await provider.get('path/to/file.bin');
 *   if (!data) {
 *     await provider.put('path/to/file.bin', new Uint8Array([1, 2, 3]));
 *   }
 * }
 * ```
 */
export interface StorageProvider {
  /**
   * Retrieve data from storage.
   *
   * @param key - The storage key/path
   * @returns The data as Uint8Array, or null if key doesn't exist
   */
  get(key: string): Promise<Uint8Array | null>;

  /**
   * Store data in storage.
   *
   * @param key - The storage key/path
   * @param data - The data to store
   */
  put(key: string, data: Uint8Array): Promise<void>;

  /**
   * Delete data from storage.
   * Does not throw if key doesn't exist.
   *
   * @param key - The storage key/path
   */
  delete(key: string): Promise<void>;

  /**
   * List keys with a given prefix.
   *
   * @param prefix - The prefix to filter keys
   * @returns Array of matching keys, sorted alphabetically
   */
  list(prefix: string): Promise<string[]>;

  /**
   * Check if a key exists in storage.
   *
   * @param key - The storage key/path
   * @returns true if key exists, false otherwise
   */
  exists(key: string): Promise<boolean>;
}

// =============================================================================
// R2 BUCKET INTERFACE (for type safety)
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

// =============================================================================
// IN-MEMORY STORAGE PROVIDER
// =============================================================================

/** Default page size for list operations */
const STORAGE_LIST_PAGE_SIZE = 1000;

/**
 * In-memory implementation of StorageProvider.
 * Use for unit testing storage-dependent code.
 *
 * Features:
 * - Stores data in a Map (isolated per instance)
 * - Defensive copying prevents mutation issues
 * - Provides clear() and size for test utilities
 *
 * @example
 * ```typescript
 * const provider = new InMemoryStorageProvider();
 * await provider.put('test.bin', new Uint8Array([1, 2, 3]));
 * const data = await provider.get('test.bin');
 * expect(data).toEqual(new Uint8Array([1, 2, 3]));
 *
 * // Clean up after test
 * provider.clear();
 * ```
 */
export class InMemoryStorageProvider implements StorageProvider {
  private data = new Map<string, Uint8Array>();

  async get(key: string): Promise<Uint8Array | null> {
    const entry = this.data.get(key);
    return entry ? entry.slice() : null;
  }

  async put(key: string, data: Uint8Array): Promise<void> {
    this.data.set(key, data.slice()); // Defensive copy
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }

  async list(prefix: string): Promise<string[]> {
    return Array.from(this.data.keys())
      .filter(k => k.startsWith(prefix))
      .sort();
  }

  async exists(key: string): Promise<boolean> {
    return this.data.has(key);
  }

  /**
   * Clear all stored data.
   * Useful for test cleanup between test cases.
   */
  clear(): void {
    this.data.clear();
  }

  /**
   * Get the number of stored objects.
   * Useful for test assertions.
   */
  get size(): number {
    return this.data.size;
  }
}

// =============================================================================
// R2 STORAGE PROVIDER
// =============================================================================

/**
 * R2 implementation of StorageProvider.
 * Wraps an R2Bucket binding to provide the StorageProvider interface.
 *
 * Features:
 * - Supports optional key prefix for namespacing
 * - Validates paths to prevent path traversal attacks
 * - Handles R2 pagination for large lists
 *
 * @example
 * ```typescript
 * // In a Cloudflare Worker
 * const provider = new R2StorageProvider(env.MY_BUCKET);
 * await provider.put('data/file.bin', new Uint8Array([1, 2, 3]));
 *
 * // With key prefix for namespacing
 * const tenantProvider = new R2StorageProvider(env.MY_BUCKET, 'tenant-123');
 * // Operations are scoped to tenant-123/ prefix
 * ```
 */
export class R2StorageProvider implements StorageProvider {
  constructor(
    private bucket: R2BucketLike,
    private keyPrefix: string = ''
  ) {
    // Validate keyPrefix to prevent path traversal attacks
    validateKeyPrefix(keyPrefix);
  }

  private getFullKey(key: string): string {
    if (this.keyPrefix) {
      return `${this.keyPrefix}/${key}`.replace(/\/+/g, '/');
    }
    return key;
  }

  async get(key: string): Promise<Uint8Array | null> {
    validateStoragePath(key);
    const fullKey = this.getFullKey(key);
    const obj = await this.bucket.get(fullKey);
    if (!obj) return null;
    const buffer = await obj.arrayBuffer();
    return new Uint8Array(buffer);
  }

  async put(key: string, data: Uint8Array): Promise<void> {
    validateStoragePath(key);
    const fullKey = this.getFullKey(key);
    const buffer = (data.buffer as ArrayBuffer).slice(
      data.byteOffset,
      data.byteOffset + data.byteLength
    );
    await this.bucket.put(fullKey, buffer);
  }

  async delete(key: string): Promise<void> {
    validateStoragePath(key);
    const fullKey = this.getFullKey(key);
    await this.bucket.delete(fullKey);
  }

  async list(prefix: string): Promise<string[]> {
    validateStoragePath(prefix);
    const fullPrefix = this.getFullKey(prefix);
    const keys: string[] = [];
    let cursor: string | undefined;

    do {
      const result = await this.bucket.list({
        prefix: fullPrefix,
        cursor,
        limit: STORAGE_LIST_PAGE_SIZE,
      });

      for (const obj of result.objects) {
        let key = obj.key;
        // Strip the keyPrefix if present
        if (this.keyPrefix && key.startsWith(this.keyPrefix)) {
          key = key.slice(this.keyPrefix.length).replace(/^\/+/, '');
        }
        keys.push(key);
      }

      cursor = result.truncated ? result.cursor : undefined;
    } while (cursor);

    return keys;
  }

  async exists(key: string): Promise<boolean> {
    validateStoragePath(key);
    const fullKey = this.getFullKey(key);
    const obj = await this.bucket.head(fullKey);
    return obj !== null;
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create an R2 storage provider from a bucket binding.
 *
 * @param bucket - R2Bucket binding
 * @param keyPrefix - Optional prefix to prepend to all keys
 * @returns StorageProvider implementation
 *
 * @example
 * ```typescript
 * const provider = createStorageProvider(env.MY_BUCKET);
 * // or with prefix
 * const tenantProvider = createStorageProvider(env.MY_BUCKET, 'tenant-123');
 * ```
 */
export function createStorageProvider(
  bucket: R2BucketLike,
  keyPrefix?: string
): R2StorageProvider {
  return new R2StorageProvider(bucket, keyPrefix);
}

/**
 * Create an in-memory storage provider for testing.
 *
 * @returns InMemoryStorageProvider implementation
 *
 * @example
 * ```typescript
 * const provider = createInMemoryProvider();
 * await provider.put('test.bin', new Uint8Array([1, 2, 3]));
 * ```
 */
export function createInMemoryProvider(): InMemoryStorageProvider {
  return new InMemoryStorageProvider();
}

// =============================================================================
// ADAPTER FUNCTIONS - Bridge to legacy interfaces
// =============================================================================

// Import the existing Storage interface for adapter conversion
import type { Storage, ObjectStorageAdapter } from './storage.js';

/**
 * Adapt a StorageProvider to the legacy Storage interface.
 *
 * Use this when passing a StorageProvider to code that expects
 * the Storage interface (read/write/list/delete).
 *
 * @param provider - StorageProvider to adapt
 * @returns Storage interface
 *
 * @deprecated Use StorageProvider directly in new code
 */
export function providerToStorage(provider: StorageProvider): Storage {
  return {
    async read(path: string): Promise<Uint8Array | null> {
      return provider.get(path);
    },
    async write(path: string, data: Uint8Array): Promise<void> {
      await provider.put(path, data);
    },
    async list(prefix: string): Promise<{ paths: string[] }> {
      const paths = await provider.list(prefix);
      return { paths };
    },
    async delete(path: string): Promise<void> {
      await provider.delete(path);
    },
    async exists(path: string): Promise<boolean> {
      return provider.exists(path);
    },
  };
}

/**
 * Adapt a StorageProvider to the legacy ObjectStorageAdapter interface.
 *
 * Use this when passing a StorageProvider to code that expects
 * the ObjectStorageAdapter interface (put/get/list/head/delete).
 *
 * @param provider - StorageProvider to adapt
 * @returns ObjectStorageAdapter interface
 *
 * @deprecated Use StorageProvider directly in new code
 */
export function providerToObjectAdapter(provider: StorageProvider): ObjectStorageAdapter {
  return {
    async put(path: string, data: Uint8Array | ArrayBuffer): Promise<void> {
      const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
      await provider.put(path, bytes);
    },
    async get(path: string): Promise<Uint8Array | null> {
      return provider.get(path);
    },
    async delete(path: string): Promise<void> {
      await provider.delete(path);
    },
    async list(prefix: string): Promise<string[]> {
      return provider.list(prefix);
    },
    async head(path: string): Promise<{ size: number; etag: string; lastModified?: Date } | null> {
      const data = await provider.get(path);
      if (!data) return null;
      return {
        size: data.length,
        etag: '', // Cannot compute real etag without reading data
      };
    },
    async exists(path: string): Promise<boolean> {
      return provider.exists(path);
    },
  };
}

/**
 * Adapt a legacy Storage interface to StorageProvider.
 *
 * Use this when migrating existing Storage code to use StorageProvider.
 *
 * @param storage - Storage interface to adapt
 * @returns StorageProvider implementation
 */
export function storageToProvider(storage: Storage): StorageProvider {
  return {
    async get(key: string): Promise<Uint8Array | null> {
      return storage.read(key);
    },
    async put(key: string, data: Uint8Array): Promise<void> {
      await storage.write(key, data);
    },
    async delete(key: string): Promise<void> {
      await storage.delete(key);
    },
    async list(prefix: string): Promise<string[]> {
      const result = await storage.list(prefix);
      return result.paths;
    },
    async exists(key: string): Promise<boolean> {
      if (storage.exists) {
        return storage.exists(key);
      }
      const data = await storage.read(key);
      return data !== null;
    },
  };
}

/**
 * Adapt a legacy ObjectStorageAdapter to StorageProvider.
 *
 * Use this when migrating existing ObjectStorageAdapter code to use StorageProvider.
 *
 * @param adapter - ObjectStorageAdapter to adapt
 * @returns StorageProvider implementation
 */
export function objectAdapterToProvider(adapter: ObjectStorageAdapter): StorageProvider {
  return {
    async get(key: string): Promise<Uint8Array | null> {
      return adapter.get(key);
    },
    async put(key: string, data: Uint8Array): Promise<void> {
      await adapter.put(key, data);
    },
    async delete(key: string): Promise<void> {
      await adapter.delete(key);
    },
    async list(prefix: string): Promise<string[]> {
      return adapter.list(prefix);
    },
    async exists(key: string): Promise<boolean> {
      if (adapter.exists) {
        return adapter.exists(key);
      }
      const meta = await adapter.head(key);
      return meta !== null;
    },
  };
}
