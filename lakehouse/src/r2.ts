/**
 * R2 Storage Adapter for lakehouse manifests
 * Provides atomic manifest operations with optimistic concurrency
 *
 * This module provides two layers of abstraction:
 * 1. ObjectStorageAdapter - low-level byte storage (R2-compatible interface)
 * 2. R2StorageAdapter - high-level JSON/binary with lakehouse semantics
 *
 * For improved testability, use MemoryObjectStorageAdapter in unit tests
 * instead of mocking R2Bucket directly.
 */

import type {
  R2StorageAdapter,
  FileMetadata,
  TableManifest,
  Snapshot,
  Schema,
} from './types.js';
import { TablePaths } from './types.js';
import { serializeManifest } from './manifest.js';
import { serializeSnapshot } from './snapshot.js';
import { serializeSchema } from './schema.js';
import {
  manifestPath,
  schemaFilePath,
  snapshotFilePath,
  joinPath,
} from './path.js';

// =============================================================================
// Object Storage Adapter Interface (R2-compatible)
// =============================================================================

/**
 * File/object metadata returned by storage operations
 */
export interface ObjectMetadata {
  size: number;
  etag: string;
  lastModified?: Date;
}

/**
 * Unified storage adapter interface for R2, S3, filesystem, etc.
 * Designed for testability - use MemoryObjectStorageAdapter for unit tests.
 *
 * This interface is compatible with Cloudflare R2 operations and provides
 * a clean abstraction layer for storage backends.
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
// R2 Bucket Interface (Cloudflare Workers compatible)
// =============================================================================

/**
 * Minimal R2 bucket interface for manifest operations
 * Compatible with Cloudflare Workers R2Bucket
 */
export interface R2BucketLike {
  get(key: string): Promise<R2ObjectLike | null>;
  put(key: string, value: ArrayBuffer | string, options?: R2PutOptions): Promise<R2ObjectLike>;
  delete(key: string): Promise<void>;
  list(options?: R2ListOptions): Promise<R2ObjectsLike>;
  head(key: string): Promise<R2ObjectLike | null>;
}

export interface R2ObjectLike {
  key: string;
  size: number;
  etag: string;
  uploaded: Date;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface R2ObjectsLike {
  objects: R2ObjectLike[];
  truncated: boolean;
  cursor?: string;
}

export interface R2PutOptions {
  httpMetadata?: {
    contentType?: string;
  };
  customMetadata?: Record<string, string>;
  onlyIf?: {
    etagMatches?: string;
    etagDoesNotMatch?: string;
  };
}

export interface R2ListOptions {
  prefix?: string;
  cursor?: string;
  limit?: number;
  delimiter?: string;
}

// =============================================================================
// R2 Object Storage Adapter Implementation
// =============================================================================

/**
 * R2 storage adapter implementation
 * Wraps an R2Bucket binding to implement ObjectStorageAdapter
 */
export class R2ObjectStorageAdapter implements ObjectStorageAdapter {
  constructor(private bucket: R2BucketLike, private keyPrefix: string = '') {}

  private getFullKey(key: string): string {
    if (this.keyPrefix) {
      return `${this.keyPrefix}/${key}`.replace(/\/+/g, '/');
    }
    return key;
  }

  async put(path: string, data: Uint8Array | ArrayBuffer): Promise<void> {
    const fullKey = this.getFullKey(path);
    // Ensure data is an ArrayBuffer for R2
    const buffer = data instanceof ArrayBuffer
      ? data
      : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    await this.bucket.put(fullKey, buffer);
  }

  async get(path: string): Promise<Uint8Array | null> {
    const fullKey = this.getFullKey(path);
    const obj = await this.bucket.get(fullKey);
    if (!obj) return null;
    const buffer = await obj.arrayBuffer();
    return new Uint8Array(buffer);
  }

  async delete(path: string): Promise<void> {
    const fullKey = this.getFullKey(path);
    await this.bucket.delete(fullKey);
  }

  async list(prefix: string): Promise<string[]> {
    const fullPrefix = this.getFullKey(prefix);
    const keys: string[] = [];
    let cursor: string | undefined;

    do {
      const result = await this.bucket.list({ prefix: fullPrefix, cursor, limit: 1000 });
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
// Memory Object Storage Adapter (for testing)
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
    let start = offset;
    if (start < 0) {
      start = entry.data.length + offset;
    }
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
// Factory Functions for Object Storage
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
  // Check if it's already an ObjectStorageAdapter
  if (backend instanceof MemoryObjectStorageAdapter || backend instanceof R2ObjectStorageAdapter) {
    return backend;
  }

  // Check if it looks like an ObjectStorageAdapter (has our specific signature)
  if ('put' in backend && 'get' in backend && 'head' in backend && !('text' in backend)) {
    // Has our methods but not R2-specific methods like text() on objects
    // This is a heuristic - duck typing for ObjectStorageAdapter
    return backend as ObjectStorageAdapter;
  }

  // Assume it's an R2BucketLike and wrap it
  return new R2ObjectStorageAdapter(backend as R2BucketLike, keyPrefix);
}

// =============================================================================
// R2 Storage Adapter Implementation (High-Level with JSON support)
// =============================================================================

/**
 * Create an R2 storage adapter from a raw R2Bucket
 * @deprecated Use createR2AdapterFromObjectStorage with ObjectStorageAdapter for better testability
 */
export function createR2Adapter(bucket: R2BucketLike): R2StorageAdapter {
  return {
    async readJson<T>(path: string): Promise<T | null> {
      const obj = await bucket.get(path);
      if (!obj) return null;
      const text = await obj.text();
      return JSON.parse(text) as T;
    },

    async writeJson(path: string, data: unknown): Promise<void> {
      const json = JSON.stringify(data);
      await bucket.put(path, json, {
        httpMetadata: { contentType: 'application/json' },
      });
    },

    async readBinary(path: string): Promise<Uint8Array | null> {
      const obj = await bucket.get(path);
      if (!obj) return null;
      const buffer = await obj.arrayBuffer();
      return new Uint8Array(buffer);
    },

    async writeBinary(path: string, data: Uint8Array): Promise<void> {
      // Create a new ArrayBuffer from the Uint8Array to ensure correct type
      const buffer = new ArrayBuffer(data.length);
      new Uint8Array(buffer).set(data);
      await bucket.put(path, buffer);
    },

    async list(prefix: string): Promise<string[]> {
      const keys: string[] = [];
      let cursor: string | undefined;

      do {
        const result = await bucket.list({ prefix, cursor, limit: 1000 });
        keys.push(...result.objects.map(obj => obj.key));
        cursor = result.truncated ? result.cursor : undefined;
      } while (cursor);

      return keys;
    },

    async delete(path: string): Promise<void> {
      await bucket.delete(path);
    },

    async exists(path: string): Promise<boolean> {
      const obj = await bucket.head(path);
      return obj !== null;
    },

    async head(path: string): Promise<FileMetadata | null> {
      const obj = await bucket.head(path);
      if (!obj) return null;
      return {
        size: obj.size,
        lastModified: obj.uploaded,
        etag: obj.etag,
      };
    },
  };
}

/**
 * Create a high-level R2StorageAdapter from a low-level ObjectStorageAdapter
 * This is the preferred method for better testability - use MemoryObjectStorageAdapter in tests
 *
 * @example
 * ```typescript
 * // In production
 * const objectStorage = new R2ObjectStorageAdapter(env.MY_BUCKET);
 * const adapter = createR2AdapterFromObjectStorage(objectStorage);
 *
 * // In tests
 * const objectStorage = new MemoryObjectStorageAdapter();
 * const adapter = createR2AdapterFromObjectStorage(objectStorage);
 * ```
 */
export function createR2AdapterFromObjectStorage(storage: ObjectStorageAdapter): R2StorageAdapter {
  const textDecoder = new TextDecoder();
  const textEncoder = new TextEncoder();

  return {
    async readJson<T>(path: string): Promise<T | null> {
      const data = await storage.get(path);
      if (!data) return null;
      const text = textDecoder.decode(data);
      return JSON.parse(text) as T;
    },

    async writeJson(path: string, data: unknown): Promise<void> {
      const json = JSON.stringify(data);
      const bytes = textEncoder.encode(json);
      await storage.put(path, bytes);
    },

    async readBinary(path: string): Promise<Uint8Array | null> {
      return storage.get(path);
    },

    async writeBinary(path: string, data: Uint8Array): Promise<void> {
      await storage.put(path, data);
    },

    async list(prefix: string): Promise<string[]> {
      return storage.list(prefix);
    },

    async delete(path: string): Promise<void> {
      await storage.delete(path);
    },

    async exists(path: string): Promise<boolean> {
      if (storage.exists) {
        return storage.exists(path);
      }
      const meta = await storage.head(path);
      return meta !== null;
    },

    async head(path: string): Promise<FileMetadata | null> {
      const meta = await storage.head(path);
      if (!meta) return null;
      return {
        size: meta.size,
        lastModified: meta.lastModified || new Date(),
        etag: meta.etag,
      };
    },
  };
}

/**
 * Storage backend input type - accepts either:
 * - Raw R2BucketLike (Cloudflare R2 binding)
 * - ObjectStorageAdapter (our abstraction layer)
 * - R2StorageAdapter (high-level adapter)
 */
export type StorageBackend = R2BucketLike | ObjectStorageAdapter | R2StorageAdapter;

/**
 * Normalize any storage backend to R2StorageAdapter
 * Provides backward compatibility for code that passes raw R2Bucket
 */
export function normalizeStorageBackend(backend: StorageBackend): R2StorageAdapter {
  // Check if it's already an R2StorageAdapter (has readJson/writeJson methods)
  if ('readJson' in backend && 'writeJson' in backend && 'readBinary' in backend) {
    return backend as R2StorageAdapter;
  }

  // Check if it's an ObjectStorageAdapter (has put/get/head but not readJson)
  if ('put' in backend && 'get' in backend && 'head' in backend && !('readJson' in backend)) {
    // If it's a MemoryObjectStorageAdapter or R2ObjectStorageAdapter, wrap it
    if (backend instanceof MemoryObjectStorageAdapter || backend instanceof R2ObjectStorageAdapter) {
      return createR2AdapterFromObjectStorage(backend);
    }
  }

  // Assume it's an R2BucketLike
  return createR2Adapter(backend as R2BucketLike);
}

// =============================================================================
// Table Storage Operations
// =============================================================================

/**
 * High-level table storage operations
 */
export class TableStorage {
  constructor(
    private readonly adapter: R2StorageAdapter,
    private readonly tableLocation: string
  ) {}

  // ===========================================================================
  // Manifest Operations
  // ===========================================================================

  /**
   * Read the table manifest
   */
  async readManifest(): Promise<TableManifest | null> {
    const path = manifestPath(this.tableLocation);
    const manifest = await this.adapter.readJson<TableManifest>(path);
    return manifest;
  }

  /**
   * Write the table manifest (atomic)
   */
  async writeManifest(manifest: TableManifest): Promise<void> {
    const path = manifestPath(this.tableLocation);
    const json = serializeManifest(manifest);
    await this.adapter.writeJson(path, JSON.parse(json));
  }

  /**
   * Check if manifest exists
   */
  async manifestExists(): Promise<boolean> {
    const path = manifestPath(this.tableLocation);
    return this.adapter.exists(path);
  }

  // ===========================================================================
  // Schema Operations
  // ===========================================================================

  /**
   * Read a schema version
   */
  async readSchema(schemaId: number): Promise<Schema | null> {
    const path = schemaFilePath(this.tableLocation, schemaId);
    return this.adapter.readJson<Schema>(path);
  }

  /**
   * Write a schema version
   */
  async writeSchema(schema: Schema): Promise<void> {
    const path = schemaFilePath(this.tableLocation, schema.schemaId);
    const json = serializeSchema(schema);
    await this.adapter.writeJson(path, JSON.parse(json));
  }

  /**
   * List all schema versions
   */
  async listSchemas(): Promise<number[]> {
    const prefix = joinPath(this.tableLocation, TablePaths.SCHEMA_DIR);
    const files = await this.adapter.list(prefix);

    return files
      .map(f => {
        const match = f.match(/v(\d+)\.json$/);
        return match ? parseInt(match[1], 10) : null;
      })
      .filter((id): id is number => id !== null)
      .sort((a, b) => a - b);
  }

  // ===========================================================================
  // Snapshot Operations
  // ===========================================================================

  /**
   * Read a snapshot
   */
  async readSnapshot(snapshotId: string): Promise<Snapshot | null> {
    const path = snapshotFilePath(this.tableLocation, snapshotId);
    return this.adapter.readJson<Snapshot>(path);
  }

  /**
   * Write a snapshot
   */
  async writeSnapshot(snapshot: Snapshot): Promise<void> {
    const path = snapshotFilePath(this.tableLocation, snapshot.snapshotId);
    const json = serializeSnapshot(snapshot);
    await this.adapter.writeJson(path, JSON.parse(json));
  }

  /**
   * List all snapshot IDs
   */
  async listSnapshots(): Promise<string[]> {
    const prefix = joinPath(this.tableLocation, TablePaths.SNAPSHOTS_DIR);
    const files = await this.adapter.list(prefix);

    return files
      .map(f => {
        const match = f.match(/([^/]+)\.json$/);
        return match ? match[1] : null;
      })
      .filter((id): id is string => id !== null);
  }

  // ===========================================================================
  // Data File Operations
  // ===========================================================================

  /**
   * Read a data file
   */
  async readDataFile(relativePath: string): Promise<Uint8Array | null> {
    const path = joinPath(this.tableLocation, relativePath);
    return this.adapter.readBinary(path);
  }

  /**
   * Write a data file
   */
  async writeDataFile(relativePath: string, data: Uint8Array): Promise<void> {
    const path = joinPath(this.tableLocation, relativePath);
    await this.adapter.writeBinary(path, data);
  }

  /**
   * Delete a data file
   */
  async deleteDataFile(relativePath: string): Promise<void> {
    const path = joinPath(this.tableLocation, relativePath);
    await this.adapter.delete(path);
  }

  /**
   * List data files
   */
  async listDataFiles(partitionPrefix = ''): Promise<string[]> {
    const prefix = joinPath(this.tableLocation, TablePaths.DATA_DIR, partitionPrefix);
    const files = await this.adapter.list(prefix);

    // Return paths relative to table location
    const baseLen = this.tableLocation.length + 1;
    return files.map(f => f.slice(baseLen));
  }

  /**
   * Get data file metadata
   */
  async getDataFileMetadata(relativePath: string): Promise<FileMetadata | null> {
    const path = joinPath(this.tableLocation, relativePath);
    return this.adapter.head(path);
  }

  // ===========================================================================
  // Utility Operations
  // ===========================================================================

  /**
   * Delete all table data (destructive!)
   */
  async deleteTable(): Promise<void> {
    const files = await this.adapter.list(this.tableLocation);
    for (const file of files) {
      await this.adapter.delete(file);
    }
  }

  /**
   * Get table location
   */
  getLocation(): string {
    return this.tableLocation;
  }
}

// =============================================================================
// Atomic Commit Protocol
// =============================================================================

/**
 * Perform an atomic commit with optimistic concurrency control
 *
 * This implements a simple optimistic locking strategy:
 * 1. Read current manifest
 * 2. Perform operations (write data files, snapshots, schemas)
 * 3. Write new manifest (atomic, will fail if manifest changed)
 */
export async function atomicCommit<T>(
  storage: TableStorage,
  operation: (manifest: TableManifest | null, storage: TableStorage) => Promise<{
    manifest: TableManifest;
    snapshot?: Snapshot;
    schema?: Schema;
    result: T;
  }>
): Promise<{ success: true; result: T } | { success: false; error: string }> {
  try {
    // Read current manifest
    const currentManifest = await storage.readManifest();

    // Perform operation
    const { manifest, snapshot, schema, result } = await operation(currentManifest, storage);

    // Write schema if provided
    if (schema) {
      await storage.writeSchema(schema);
    }

    // Write snapshot if provided
    if (snapshot) {
      await storage.writeSnapshot(snapshot);
    }

    // Write manifest (atomic commit point)
    await storage.writeManifest(manifest);

    return { success: true, result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// Memory Storage Adapter (for testing) - High-level R2StorageAdapter
// =============================================================================

/**
 * In-memory storage adapter for testing (high-level R2StorageAdapter interface)
 */
export function createMemoryAdapter(): R2StorageAdapter {
  const store = new Map<string, { data: unknown; metadata: FileMetadata }>();

  return {
    async readJson<T>(path: string): Promise<T | null> {
      const entry = store.get(path);
      return entry ? (entry.data as T) : null;
    },

    async writeJson(path: string, data: unknown): Promise<void> {
      store.set(path, {
        data,
        metadata: {
          size: JSON.stringify(data).length,
          lastModified: new Date(),
        },
      });
    },

    async readBinary(path: string): Promise<Uint8Array | null> {
      const entry = store.get(path);
      return entry ? (entry.data as Uint8Array) : null;
    },

    async writeBinary(path: string, data: Uint8Array): Promise<void> {
      store.set(path, {
        data: data.slice(),
        metadata: {
          size: data.length,
          lastModified: new Date(),
        },
      });
    },

    async list(prefix: string): Promise<string[]> {
      return [...store.keys()]
        .filter(k => k.startsWith(prefix))
        .sort();
    },

    async delete(path: string): Promise<void> {
      store.delete(path);
    },

    async exists(path: string): Promise<boolean> {
      return store.has(path);
    },

    async head(path: string): Promise<FileMetadata | null> {
      const entry = store.get(path);
      return entry ? entry.metadata : null;
    },
  };
}

/**
 * Create TableStorage with memory adapter (for testing)
 */
export function createMemoryTableStorage(location: string): TableStorage {
  return new TableStorage(createMemoryAdapter(), location);
}
