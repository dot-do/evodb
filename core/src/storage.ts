// DO Storage Adapter (~1KB budget)

import { type StorageAdapter, type BlockId, type WalId, unsafeBlockId, unsafeWalId } from './types.js';

// =============================================================================
// Unified Storage Adapter Interface (R2-compatible)
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
  text?(): Promise<string>;
}

export interface R2ObjectsLike {
  objects: R2ObjectLike[];
  truncated: boolean;
  cursor?: string;
}

export interface R2PutOptionsLike {
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
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
    const buffer = data instanceof ArrayBuffer ? data : (data.buffer as ArrayBuffer).slice(data.byteOffset, data.byteOffset + data.byteLength);
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
// Factory Functions
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

/** Create DO SQLite storage adapter */
export function createDOAdapter(sql: DOSqlStorage, tableName = 'blocks'): StorageAdapter {
  // Ensure table exists
  sql.exec(`CREATE TABLE IF NOT EXISTS ${tableName} (id TEXT PRIMARY KEY, data BLOB, created_at INTEGER DEFAULT (unixepoch()))`);

  return {
    async writeBlock(id: string, data: Uint8Array): Promise<void> {
      sql.exec(`INSERT OR REPLACE INTO ${tableName} (id, data) VALUES (?, ?)`, id, data);
    },

    async readBlock(id: string): Promise<Uint8Array | null> {
      const result = sql.exec(`SELECT data FROM ${tableName} WHERE id = ?`, id);
      if (!result.results.length) return null;
      const row = result.results[0] as { data: ArrayBuffer };
      return new Uint8Array(row.data);
    },

    async listBlocks(prefix?: string): Promise<string[]> {
      const query = prefix
        ? `SELECT id FROM ${tableName} WHERE id LIKE ? ORDER BY id`
        : `SELECT id FROM ${tableName} ORDER BY id`;
      const result = prefix
        ? sql.exec(query, prefix + '%')
        : sql.exec(query);
      return (result.results as { id: string }[]).map(r => r.id);
    },

    async deleteBlock(id: string): Promise<void> {
      sql.exec(`DELETE FROM ${tableName} WHERE id = ?`, id);
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
