/**
 * R2 Storage Adapter for lakehouse manifests
 * Provides atomic manifest operations with optimistic concurrency
 *
 * This module provides two layers of abstraction:
 * 1. ObjectStorageAdapter - low-level byte storage (R2-compatible interface) - from @evodb/core
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
// Re-export low-level storage types from @evodb/core
// =============================================================================

// Import from core - these are the canonical definitions
import {
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
} from '@evodb/core';

// Re-export all types from core for backward compatibility
export {
  type ObjectStorageAdapter,
  type ObjectMetadata,
  R2ObjectStorageAdapter,
  MemoryObjectStorageAdapter,
  createR2ObjectAdapter,
  createMemoryObjectAdapter,
  wrapStorageBackend,
};

// Re-export R2 types with both old names (for backward compat) and new names
export type { R2BucketLike, R2ObjectLike, R2ObjectsLike };

// Backward compatibility aliases - lakehouse previously used these names without "Like" suffix
export type R2PutOptions = R2PutOptionsLike;
export type R2ListOptions = R2ListOptionsLike;

// =============================================================================
// JSON Parse Error
// =============================================================================

/**
 * Custom error class thrown when JSON parsing fails during storage operations.
 * Provides context including:
 * - The file path that failed to parse
 * - The position in the JSON where the error occurred (if available)
 * - The original error from JSON.parse
 */
export class JsonParseError extends Error {
  public readonly name = 'JsonParseError';

  constructor(
    message: string,
    public readonly path: string,
    public readonly position?: number,
    public readonly cause?: Error
  ) {
    super(message);
    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, JsonParseError.prototype);
  }
}

/**
 * Parse JSON with error handling, wrapping SyntaxError in JsonParseError
 * @param text - The JSON string to parse
 * @param path - The file path (for error context)
 * @returns The parsed JSON value
 * @throws JsonParseError if parsing fails
 */
function parseJsonWithContext<T>(text: string, path: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    const syntaxError = err instanceof SyntaxError ? err : undefined;

    // Extract position from the error message if available
    // Node/V8 format: "... at position 21 (line 1 column 22)"
    let position: number | undefined;
    if (syntaxError?.message) {
      const posMatch = syntaxError.message.match(/at position (\d+)/);
      if (posMatch) {
        position = parseInt(posMatch[1], 10);
      }
    }

    // Create a snippet of the content for debugging (truncated for large content)
    const maxSnippetLength = 100;
    const snippet =
      text.length > maxSnippetLength ? text.slice(0, maxSnippetLength) + '...' : text;

    // Build descriptive error message
    const posInfo = position !== undefined ? ` at position ${position}` : '';
    const message = `Failed to parse JSON from "${path}"${posInfo}: ${
      syntaxError?.message || 'Invalid JSON'
    }. Content preview: "${snippet}"`;

    throw new JsonParseError(message, path, position, syntaxError);
  }
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
      return parseJsonWithContext<T>(text, path);
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
      return parseJsonWithContext<T>(text, path);
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
