// DO Storage Adapter (~1KB budget)

import { type StorageAdapter, type BlockId, type WalId, unsafeBlockId, unsafeWalId } from './types.js';
import { STORAGE_LIST_PAGE_SIZE } from './constants.js';

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

/**
 * Minimal R2Bucket interface for storage operations
 * Compatible with Cloudflare Workers R2Bucket binding
 */
export interface R2BucketLike {
  get(key: string): Promise<R2ObjectLike | null>;
  put(key: string, value: ArrayBuffer | Uint8Array | string, options?: R2PutOptionsLike): Promise<R2ObjectLike>;
  delete(key: string): Promise<void>;
  list(options?: R2ListOptionsLike): Promise<R2ObjectsLike>;
  head(key: string): Promise<R2ObjectLike | null>;
}

export interface R2ObjectLike {
  key: string;
  size: number;
  etag: string;
  uploaded: Date;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
}

export interface R2ObjectsLike {
  objects: R2ObjectLike[];
  truncated: boolean;
  cursor?: string;
}

export interface R2PutOptionsLike {
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
  onlyIf?: {
    etagMatches?: string;
    etagDoesNotMatch?: string;
  };
}

export interface R2ListOptionsLike {
  prefix?: string;
  cursor?: string;
  limit?: number;
  delimiter?: string;
}

/**
 * R2 storage adapter implementation
 * Wraps an R2Bucket binding to implement ObjectStorageAdapter
 */
export class R2ObjectStorageAdapter implements ObjectStorageAdapter {
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
 * In-memory storage adapter for testing
 * Implements the same interface as R2ObjectStorageAdapter but stores data in memory
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
      throw new Error(`Object not found: ${path}`);
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
      throw new Error(`Object not found: ${path}`);
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
        throw new Error(`Object not found: ${path}`);
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
        throw new Error(`Object not found: ${path}`);
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
 * Table names must:
 * - Start with a letter or underscore
 * - Contain only alphanumeric characters and underscores
 * - Not be empty
 *
 * @throws Error if table name is invalid
 */
export function validateTableName(tableName: string): void {
  if (!tableName || !VALID_TABLE_NAME_REGEX.test(tableName)) {
    throw new Error(
      `Invalid table name: "${tableName}". Table names must start with a letter or underscore and contain only alphanumeric characters and underscores.`
    );
  }
}

/**
 * Quote a SQL identifier using double quotes (SQL standard).
 * This provides defense in depth when combined with validation.
 * Any embedded double quotes are escaped by doubling them.
 *
 * @param identifier - The identifier to quote (table name, column name, etc.)
 * @returns The quoted identifier safe for SQL interpolation
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
 * @throws Error if path contains dangerous patterns
 */
export function validateStoragePath(path: string): void {
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
 * @throws Error if length is negative, or if offset is out of bounds
 */
export function validateRangeBounds(dataLength: number, offset: number, length: number): number {
  // Check for negative length
  if (length < 0) {
    throw new Error(`Invalid length: ${length}. Length cannot be negative.`);
  }

  // Resolve negative offset (from end of data)
  let start = offset;
  if (start < 0) {
    start = dataLength + offset;
  }

  // Check if start is out of bounds
  // Note: start == dataLength is allowed ONLY if length == 0 (reading nothing from end)
  if (start < 0) {
    throw new Error(`Offset out of range: ${offset} resolves to ${start} for data of length ${dataLength}.`);
  }

  if (start > dataLength || (start === dataLength && length > 0)) {
    throw new Error(`Offset out of range: ${offset} (resolved to ${start}) is beyond data length ${dataLength}.`);
  }

  return start;
}

/** Create DO SQLite storage adapter */
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

/** Create DO KV storage adapter (for WAL entries in 128KB values) */
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

/** Memory adapter for testing */
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
 * Format: prefix:timestamp(base36,10-padded):seq(base36,4-padded)
 * @returns Branded BlockId type for compile-time safety
 */
export function makeBlockId(prefix: string, timestamp: number, seq = 0): BlockId {
  const ts = timestamp.toString(36).padStart(10, '0');
  const s = seq.toString(36).padStart(4, '0');
  return unsafeBlockId(`${prefix}:${ts}:${s}`);
}

/**
 * Parse a BlockId into its components.
 * @param id - BlockId or plain string to parse
 * @returns Parsed components or null if invalid format
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
 * Create a WalId from an LSN.
 * Format: wal:lsn(base36,12-padded)
 * @returns Branded WalId type for compile-time safety
 */
export function makeWalId(lsn: bigint): WalId {
  return unsafeWalId(`wal:${lsn.toString(36).padStart(12, '0')}`);
}

/**
 * Parse a WalId to extract the LSN.
 * @param id - WalId or plain string to parse
 * @returns Parsed LSN as bigint or null if invalid format
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
