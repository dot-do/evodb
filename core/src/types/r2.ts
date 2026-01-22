/**
 * @evodb/core/types/r2 - Unified R2 Type Definitions
 *
 * This module provides the canonical R2 type definitions used across all EvoDB packages.
 * These types are compatible with Cloudflare Workers R2 bindings.
 *
 * Issue: evodb-sdgz - Consolidate duplicate R2 interfaces
 *
 * @module types/r2
 */

// =============================================================================
// R2 Range Types
// =============================================================================

/**
 * R2 range request options for partial reads.
 * Used in R2GetOptions.range parameter.
 */
export interface R2Range {
  /** Byte offset to start reading from */
  offset?: number;
  /** Number of bytes to read */
  length?: number;
  /** Read last N bytes (alternative to offset+length) */
  suffix?: number;
}

// =============================================================================
// R2 Checksums
// =============================================================================

/**
 * R2 object checksums.
 * All fields are optional as not all checksums may be computed.
 */
export interface R2Checksums {
  md5?: ArrayBuffer;
  sha1?: ArrayBuffer;
  sha256?: ArrayBuffer;
  sha384?: ArrayBuffer;
  sha512?: ArrayBuffer;
}

// =============================================================================
// R2 HTTP Metadata
// =============================================================================

/**
 * HTTP metadata for R2 objects.
 * Corresponds to HTTP headers for the stored object.
 */
export interface R2HTTPMetadata {
  contentType?: string;
  contentLanguage?: string;
  contentDisposition?: string;
  contentEncoding?: string;
  cacheControl?: string;
  cacheExpiry?: Date;
}

// =============================================================================
// R2 Conditional Operations
// =============================================================================

/**
 * Conditional operation parameters for R2.
 * Used for optimistic concurrency control.
 */
export interface R2Conditional {
  etagMatches?: string;
  etagDoesNotMatch?: string;
  uploadedBefore?: Date;
  uploadedAfter?: Date;
}

// =============================================================================
// R2 Options
// =============================================================================

/**
 * Options for R2 put operations.
 */
export interface R2PutOptions {
  httpMetadata?: R2HTTPMetadata;
  customMetadata?: Record<string, string>;
  md5?: string;
  onlyIf?: R2Conditional;
}

/**
 * Options for R2 get operations.
 */
export interface R2GetOptions {
  range?: R2Range;
  onlyIf?: R2Conditional;
}

/**
 * Options for R2 list operations.
 */
export interface R2ListOptions {
  limit?: number;
  prefix?: string;
  cursor?: string;
  delimiter?: string;
  startAfter?: string;
  include?: ('httpMetadata' | 'customMetadata')[];
}

// =============================================================================
// R2 Object Types
// =============================================================================

/**
 * R2 object metadata (without body).
 * Returned by head() and as part of list() results.
 */
export interface R2Object {
  /** Object key/path */
  key: string;
  /** Version identifier */
  version: string;
  /** Object size in bytes */
  size: number;
  /** ETag for cache validation */
  etag: string;
  /** HTTP-formatted ETag (with quotes) */
  httpEtag: string;
  /** Object checksums */
  checksums: R2Checksums;
  /** Upload timestamp */
  uploaded: Date;
  /** HTTP metadata */
  httpMetadata?: R2HTTPMetadata;
  /** Custom metadata key-value pairs */
  customMetadata?: Record<string, string>;
  /** Range information (present when partial read requested) */
  range?: R2Range;
}

/**
 * R2 object with body.
 * Returned by get() when object exists.
 */
export interface R2ObjectBody extends R2Object {
  /** ReadableStream of the body content */
  body: ReadableStream;
  /** Whether the body has been consumed */
  bodyUsed: boolean;
  /** Read body as ArrayBuffer */
  arrayBuffer(): Promise<ArrayBuffer>;
  /** Read body as text */
  text(): Promise<string>;
  /** Read body as JSON */
  json<T = unknown>(): Promise<T>;
  /** Read body as Blob */
  blob(): Promise<Blob>;
}

/**
 * R2 list operation result.
 */
export interface R2Objects {
  /** Array of objects matching the list query */
  objects: R2Object[];
  /** Whether there are more results available */
  truncated: boolean;
  /** Cursor for pagination (present when truncated) */
  cursor?: string;
  /** Prefixes when using delimiter (for "directory" listing) */
  delimitedPrefixes: string[];
}

// =============================================================================
// R2 Bucket Interface
// =============================================================================

/**
 * Full R2 bucket interface.
 * Compatible with Cloudflare Workers R2Bucket binding.
 *
 * Use this interface when you need full R2 functionality including
 * writes, range reads, and delete operations.
 */
export interface R2Bucket {
  /**
   * Store an object in the bucket.
   * @param key - Object key/path
   * @param value - Data to store
   * @param options - Put options (metadata, conditional)
   * @returns The stored object metadata
   */
  put(
    key: string,
    value: ArrayBuffer | Uint8Array | string | ReadableStream | Blob,
    options?: R2PutOptions
  ): Promise<R2Object>;

  /**
   * Retrieve an object from the bucket.
   * @param key - Object key/path
   * @param options - Get options (range, conditional)
   * @returns The object with body, or null if not found
   */
  get(key: string, options?: R2GetOptions): Promise<R2ObjectBody | null>;

  /**
   * Delete one or more objects from the bucket.
   * @param keys - Object key(s) to delete
   */
  delete(keys: string | string[]): Promise<void>;

  /**
   * List objects in the bucket.
   * @param options - List options (prefix, cursor, limit)
   * @returns List result with objects and pagination info
   */
  list(options?: R2ListOptions): Promise<R2Objects>;

  /**
   * Get object metadata without reading the body.
   * @param key - Object key/path
   * @returns Object metadata, or null if not found
   */
  head(key: string): Promise<R2Object | null>;
}

// =============================================================================
// Minimal "Like" Interfaces (for lighter dependencies)
// =============================================================================

/**
 * Minimal R2Bucket interface for read/write operations.
 * Use when you don't need range reads or full R2 features.
 *
 * This is a subset of R2Bucket that's sufficient for most use cases
 * and allows lighter mock implementations.
 */
export interface R2BucketLike {
  get(key: string): Promise<R2ObjectLike | null>;
  put(
    key: string,
    value: ArrayBuffer | Uint8Array | string,
    options?: R2PutOptionsLike
  ): Promise<R2ObjectLike>;
  delete(key: string): Promise<void>;
  list(options?: R2ListOptionsLike): Promise<R2ObjectsLike>;
  head(key: string): Promise<R2ObjectLike | null>;
}

/**
 * Minimal R2Object interface.
 * Subset of R2Object for simpler implementations.
 */
export interface R2ObjectLike {
  key: string;
  size: number;
  etag: string;
  uploaded: Date;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
}

/**
 * Minimal R2Objects interface.
 */
export interface R2ObjectsLike {
  objects: R2ObjectLike[];
  truncated: boolean;
  cursor?: string;
}

/**
 * Minimal R2 put options.
 */
export interface R2PutOptionsLike {
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
  onlyIf?: {
    etagMatches?: string;
    etagDoesNotMatch?: string;
  };
}

/**
 * Minimal R2 list options.
 */
export interface R2ListOptionsLike {
  prefix?: string;
  cursor?: string;
  limit?: number;
  delimiter?: string;
}

// =============================================================================
// Simple R2 Types (for query engine and reader)
// =============================================================================

/**
 * Simple R2 bucket interface for read-only operations.
 * Used by query engines that only need to read data.
 */
export interface SimpleR2Bucket {
  get(key: string): Promise<SimpleR2Object | null>;
  head(key: string): Promise<SimpleR2Object | null>;
  list(options?: SimpleR2ListOptions): Promise<SimpleR2Objects>;
}

/**
 * Simple R2 object interface for read operations.
 */
export interface SimpleR2Object {
  readonly key: string;
  readonly size: number;
  readonly etag: string;
  readonly httpEtag: string;
  readonly uploaded: Date;
  readonly customMetadata?: Record<string, string>;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
}

/**
 * Simple R2 list options.
 */
export interface SimpleR2ListOptions {
  prefix?: string;
  limit?: number;
  cursor?: string;
}

/**
 * Simple R2 objects list result.
 */
export interface SimpleR2Objects {
  objects: SimpleR2Object[];
  truncated: boolean;
  cursor?: string;
}
