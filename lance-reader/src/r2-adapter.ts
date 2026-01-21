/**
 * R2 Storage Adapter for Lance Reader
 * Implements StorageAdapter interface for Cloudflare R2
 *
 * @module @evodb/lance-reader/r2
 */

import type { StorageAdapter } from './types.js';

// ==========================================
// Path Traversal Prevention (Issue evodb-409)
// ==========================================

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

  // Check for control characters (ASCII 0x00-0x1F)
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

// ==========================================
// R2 Type Definitions
// ==========================================

/**
 * Minimal R2Bucket interface
 * Compatible with Cloudflare Workers R2 bindings
 */
export interface R2Bucket {
  get(
    key: string,
    options?: { range?: R2Range }
  ): Promise<R2ObjectBody | null>;

  head(key: string): Promise<R2Object | null>;

  list(options?: R2ListOptions): Promise<R2Objects>;
}

/**
 * R2 range request options
 */
export interface R2Range {
  offset?: number;
  length?: number;
  suffix?: number;
}

/**
 * R2 object metadata
 */
export interface R2Object {
  key: string;
  version: string;
  size: number;
  etag: string;
  httpEtag: string;
  checksums: R2Checksums;
  uploaded: Date;
  httpMetadata?: R2HTTPMetadata;
  customMetadata?: Record<string, string>;
  range?: R2Range;
}

/**
 * R2 object with body
 */
export interface R2ObjectBody extends R2Object {
  body: ReadableStream;
  bodyUsed: boolean;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  json<T>(): Promise<T>;
  blob(): Promise<Blob>;
}

/**
 * R2 checksums
 */
export interface R2Checksums {
  md5?: ArrayBuffer;
  sha1?: ArrayBuffer;
  sha256?: ArrayBuffer;
  sha384?: ArrayBuffer;
  sha512?: ArrayBuffer;
}

/**
 * R2 HTTP metadata
 */
export interface R2HTTPMetadata {
  contentType?: string;
  contentLanguage?: string;
  contentDisposition?: string;
  contentEncoding?: string;
  cacheControl?: string;
  cacheExpiry?: Date;
}

/**
 * R2 list options
 */
export interface R2ListOptions {
  limit?: number;
  prefix?: string;
  cursor?: string;
  delimiter?: string;
  startAfter?: string;
  include?: ('httpMetadata' | 'customMetadata')[];
}

/**
 * R2 list result
 */
export interface R2Objects {
  objects: R2Object[];
  truncated: boolean;
  cursor?: string;
  delimitedPrefixes: string[];
}

// ==========================================
// R2 Storage Adapter
// ==========================================

/**
 * Storage adapter for Cloudflare R2
 *
 * @example
 * ```typescript
 * import { R2StorageAdapter } from '@evodb/lance-reader/r2';
 *
 * export default {
 *   async fetch(request: Request, env: Env): Promise<Response> {
 *     const storage = new R2StorageAdapter(env.MY_BUCKET);
 *     // Use with LanceReader
 *   }
 * };
 * ```
 */
export class R2StorageAdapter implements StorageAdapter {
  private bucket: R2Bucket;
  private keyPrefix: string;

  /**
   * Create an R2 storage adapter
   * @param bucket - R2 bucket binding
   * @param keyPrefix - Optional prefix to prepend to all keys
   * @throws Error if keyPrefix contains path traversal patterns
   */
  constructor(bucket: R2Bucket, keyPrefix: string = '') {
    // Validate keyPrefix to prevent path traversal attacks (Issue evodb-409)
    validateKeyPrefix(keyPrefix);
    this.bucket = bucket;
    this.keyPrefix = keyPrefix;
  }

  /**
   * Get the full key with prefix
   */
  private getFullKey(key: string): string {
    if (this.keyPrefix) {
      return `${this.keyPrefix}/${key}`.replace(/\/+/g, '/');
    }
    return key;
  }

  /**
   * Read an entire object
   */
  async get(key: string): Promise<ArrayBuffer | null> {
    const fullKey = this.getFullKey(key);
    const obj = await this.bucket.get(fullKey);

    if (!obj) {
      return null;
    }

    return obj.arrayBuffer();
  }

  /**
   * Read a byte range from an object
   *
   * @param key - Object key
   * @param offset - Starting byte offset (negative for offset from end)
   * @param length - Number of bytes to read
   */
  async getRange(key: string, offset: number, length: number): Promise<ArrayBuffer> {
    const fullKey = this.getFullKey(key);

    // Build range request
    let range: R2Range;

    if (offset < 0) {
      // Negative offset means read from end of file
      // R2 uses 'suffix' for this
      range = { suffix: Math.abs(offset) };
    } else {
      range = { offset, length };
    }

    const obj = await this.bucket.get(fullKey, { range });

    if (!obj) {
      throw new Error(`Object not found: ${fullKey}`);
    }

    return obj.arrayBuffer();
  }

  /**
   * List objects with a given prefix
   */
  async list(prefix: string): Promise<string[]> {
    const fullPrefix = this.getFullKey(prefix);
    const keys: string[] = [];
    let cursor: string | undefined;

    do {
      const result = await this.bucket.list({
        prefix: fullPrefix,
        cursor,
        limit: 1000,
      });

      for (const obj of result.objects) {
        // Remove the key prefix if present
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

  /**
   * Check if an object exists
   */
  async exists(key: string): Promise<boolean> {
    const fullKey = this.getFullKey(key);
    const obj = await this.bucket.head(fullKey);
    return obj !== null;
  }

  /**
   * Get object metadata without reading body
   */
  async head(key: string): Promise<{
    size: number;
    etag: string;
    lastModified: Date;
  } | null> {
    const fullKey = this.getFullKey(key);
    const obj = await this.bucket.head(fullKey);

    if (!obj) {
      return null;
    }

    return {
      size: obj.size,
      etag: obj.etag,
      lastModified: obj.uploaded,
    };
  }

  /**
   * Read multiple ranges in parallel
   * More efficient than sequential getRange calls
   */
  async getBatchRanges(
    key: string,
    ranges: Array<{ offset: number; length: number }>
  ): Promise<ArrayBuffer[]> {
    // R2 doesn't support multipart ranges in a single request,
    // so we parallelize multiple requests
    return Promise.all(
      ranges.map(range => this.getRange(key, range.offset, range.length))
    );
  }

  /**
   * Read multiple keys in parallel
   */
  async getBatch(keys: string[]): Promise<(ArrayBuffer | null)[]> {
    return Promise.all(keys.map(key => this.get(key)));
  }
}

// ==========================================
// Memory Storage Adapter (for testing)
// ==========================================

/**
 * In-memory storage adapter for testing
 */
export class MemoryStorageAdapter implements StorageAdapter {
  private data: Map<string, ArrayBuffer> = new Map();

  /**
   * Store data in memory
   */
  put(key: string, data: ArrayBuffer): void {
    this.data.set(key, data);
  }

  /**
   * Store string data
   */
  putString(key: string, data: string): void {
    this.data.set(key, new TextEncoder().encode(data).buffer);
  }

  async get(key: string): Promise<ArrayBuffer | null> {
    return this.data.get(key) ?? null;
  }

  async getRange(key: string, offset: number, length: number): Promise<ArrayBuffer> {
    const data = this.data.get(key);
    if (!data) {
      throw new Error(`Object not found: ${key}`);
    }

    // Handle negative offset (from end)
    let start = offset;
    if (start < 0) {
      start = data.byteLength + offset;
    }

    return data.slice(start, start + length);
  }

  async list(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    for (const key of this.data.keys()) {
      if (key.startsWith(prefix)) {
        keys.push(key);
      }
    }
    return keys.sort();
  }

  async exists(key: string): Promise<boolean> {
    return this.data.has(key);
  }

  /**
   * Clear all stored data
   */
  clear(): void {
    this.data.clear();
  }

  /**
   * Get number of stored objects
   */
  get size(): number {
    return this.data.size;
  }
}

// ==========================================
// Fetch-based Storage Adapter
// ==========================================

/** Headers type for fetch requests */
type FetchHeaders = Record<string, string>;

/**
 * Storage adapter using fetch API
 * Useful for testing or when R2 is accessed via HTTP
 */
export class FetchStorageAdapter implements StorageAdapter {
  private baseUrl: string;
  private headers: FetchHeaders;

  /**
   * Create a fetch-based storage adapter
   * @param baseUrl - Base URL for the storage endpoint
   * @param headers - Optional headers to include in requests
   */
  constructor(baseUrl: string, headers: FetchHeaders = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.headers = headers;
  }

  private getUrl(key: string): string {
    return `${this.baseUrl}/${key}`;
  }

  async get(key: string): Promise<ArrayBuffer | null> {
    const response = await fetch(this.getUrl(key), {
      headers: this.headers,
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch ${key}: ${response.status} ${response.statusText}`);
    }

    return response.arrayBuffer();
  }

  async getRange(key: string, offset: number, length: number): Promise<ArrayBuffer> {
    // Build Range header
    let rangeHeader: string;

    if (offset < 0) {
      // Suffix range (last N bytes)
      rangeHeader = `bytes=${offset}`;
    } else {
      rangeHeader = `bytes=${offset}-${offset + length - 1}`;
    }

    const response = await fetch(this.getUrl(key), {
      headers: {
        ...this.headers,
        'Range': rangeHeader,
      },
    });

    if (response.status === 404) {
      throw new Error(`Object not found: ${key}`);
    }

    if (!response.ok && response.status !== 206) {
      throw new Error(`Failed to fetch range from ${key}: ${response.status} ${response.statusText}`);
    }

    return response.arrayBuffer();
  }

  async list(_prefix: string): Promise<string[]> {
    // This would need to be implemented based on the storage API
    // For now, throw an error
    throw new Error('list() not implemented for FetchStorageAdapter');
  }

  async exists(key: string): Promise<boolean> {
    const response = await fetch(this.getUrl(key), {
      method: 'HEAD',
      headers: this.headers,
    });
    return response.ok;
  }
}

// ==========================================
// Caching Wrapper
// ==========================================

/**
 * Caching wrapper for any storage adapter
 * Caches full objects and ranges in memory
 */
export class CachingStorageAdapter implements StorageAdapter {
  private storage: StorageAdapter;
  private cache: Map<string, ArrayBuffer> = new Map();
  private maxCacheSize: number;
  private currentCacheSize: number = 0;

  constructor(storage: StorageAdapter, maxCacheSize: number = 50 * 1024 * 1024) {
    this.storage = storage;
    this.maxCacheSize = maxCacheSize;
  }

  async get(key: string): Promise<ArrayBuffer | null> {
    // Check cache
    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }

    // Fetch and cache
    const data = await this.storage.get(key);
    if (data) {
      this.cacheData(key, data);
    }
    return data;
  }

  async getRange(key: string, offset: number, length: number): Promise<ArrayBuffer> {
    // Check if full object is cached
    const cached = this.cache.get(key);
    if (cached) {
      let start = offset;
      if (start < 0) {
        start = cached.byteLength + offset;
      }
      return cached.slice(start, start + length);
    }

    // Fetch range directly
    return this.storage.getRange(key, offset, length);
  }

  async list(prefix: string): Promise<string[]> {
    return this.storage.list(prefix);
  }

  async exists(key: string): Promise<boolean> {
    if (this.cache.has(key)) return true;
    if (this.storage.exists) {
      return this.storage.exists(key);
    }
    const data = await this.storage.get(key);
    return data !== null;
  }

  private cacheData(key: string, data: ArrayBuffer): void {
    // Evict if necessary
    while (this.currentCacheSize + data.byteLength > this.maxCacheSize && this.cache.size > 0) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        const oldData = this.cache.get(oldestKey);
        if (oldData) {
          this.currentCacheSize -= oldData.byteLength;
        }
        this.cache.delete(oldestKey);
      }
    }

    // Only cache if it fits
    if (data.byteLength <= this.maxCacheSize) {
      this.cache.set(key, data);
      this.currentCacheSize += data.byteLength;
    }
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
    this.currentCacheSize = 0;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; entries: number; maxSize: number } {
    return {
      size: this.currentCacheSize,
      entries: this.cache.size,
      maxSize: this.maxCacheSize,
    };
  }
}

// ==========================================
// Core Storage Adapter (Issue evodb-pyo)
// ==========================================

/**
 * Interface matching @evodb/core's unified Storage interface.
 * This is duplicated here to avoid adding @evodb/core as a dependency,
 * keeping lance-reader standalone.
 */
interface CoreStorageLike {
  read(path: string): Promise<Uint8Array | null>;
  readRange?(path: string, offset: number, length: number): Promise<Uint8Array>;
  exists?(path: string): Promise<boolean>;
}

/**
 * Interface matching @evodb/core's unified Storage interface with list support.
 * Extended version that includes list() method.
 */
interface CoreStorageWithList extends CoreStorageLike {
  list(prefix: string): Promise<{ paths: string[] }>;
}

/**
 * Create a lance-reader StorageAdapter from an @evodb/core Storage instance.
 *
 * This allows using the unified Storage interface from @evodb/core with lance-reader
 * without adding @evodb/core as a direct dependency.
 *
 * @example
 * ```typescript
 * // In application code that uses both @evodb/core and @evodb/lance-reader
 * import { createMemoryStorage } from '@evodb/core';
 * import { createLanceStorageAdapter, LanceReader } from '@evodb/lance-reader';
 *
 * const coreStorage = createMemoryStorage();
 * // ... populate storage with lance dataset files ...
 *
 * const lanceAdapter = createLanceStorageAdapter(coreStorage);
 * const reader = new LanceReader({
 *   storage: lanceAdapter,
 *   basePath: 'datasets/embeddings',
 * });
 * ```
 *
 * @param storage - An object implementing @evodb/core Storage interface
 * @returns A StorageAdapter compatible with lance-reader
 */
export function createLanceStorageAdapter(storage: CoreStorageWithList): StorageAdapter {
  return {
    async get(key: string): Promise<ArrayBuffer | null> {
      const data = await storage.read(key);
      if (!data) return null;
      // Convert Uint8Array to ArrayBuffer - use slice to ensure we get a proper ArrayBuffer
      return data.slice().buffer;
    },

    async getRange(key: string, offset: number, length: number): Promise<ArrayBuffer> {
      if (storage.readRange) {
        const data = await storage.readRange(key, offset, length);
        return data.slice().buffer;
      }
      // Fallback: read entire file and slice
      const fullData = await storage.read(key);
      if (!fullData) {
        throw new Error(`Object not found: ${key}`);
      }
      let start = offset;
      if (start < 0) {
        start = fullData.length + offset;
      }
      const slice = fullData.slice(start, start + length);
      return slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength);
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
