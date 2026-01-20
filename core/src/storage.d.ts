import { type StorageAdapter, type BlockId, type WalId } from './types.js';
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
    httpMetadata?: {
        contentType?: string;
    };
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
export declare class R2ObjectStorageAdapter implements ObjectStorageAdapter {
    private bucket;
    private keyPrefix;
    constructor(bucket: R2BucketLike, keyPrefix?: string);
    private getFullKey;
    put(path: string, data: Uint8Array | ArrayBuffer): Promise<void>;
    get(path: string): Promise<Uint8Array | null>;
    delete(path: string): Promise<void>;
    list(prefix: string): Promise<string[]>;
    head(path: string): Promise<ObjectMetadata | null>;
    exists(path: string): Promise<boolean>;
}
/**
 * In-memory storage adapter for testing
 * Implements the same interface as R2ObjectStorageAdapter but stores data in memory
 */
export declare class MemoryObjectStorageAdapter implements ObjectStorageAdapter {
    private storage;
    put(path: string, data: Uint8Array | ArrayBuffer): Promise<void>;
    get(path: string): Promise<Uint8Array | null>;
    delete(path: string): Promise<void>;
    list(prefix: string): Promise<string[]>;
    head(path: string): Promise<ObjectMetadata | null>;
    exists(path: string): Promise<boolean>;
    getRange(path: string, offset: number, length: number): Promise<Uint8Array>;
    /** Clear all stored data (useful for test cleanup) */
    clear(): void;
    /** Get number of stored objects */
    get size(): number;
    /** Get all keys (for debugging) */
    keys(): string[];
    private computeEtag;
}
/**
 * Create an R2 storage adapter from a bucket binding
 * @param bucket - R2Bucket binding or R2BucketLike interface
 * @param keyPrefix - Optional prefix to prepend to all keys
 */
export declare function createR2ObjectAdapter(bucket: R2BucketLike, keyPrefix?: string): ObjectStorageAdapter;
/**
 * Create an in-memory storage adapter for testing
 */
export declare function createMemoryObjectAdapter(): MemoryObjectStorageAdapter;
/**
 * Wrap a raw R2Bucket (or R2BucketLike) in an ObjectStorageAdapter
 * Provides backward compatibility - accepts either an adapter or a raw bucket
 */
export declare function wrapStorageBackend(backend: ObjectStorageAdapter | R2BucketLike, keyPrefix?: string): ObjectStorageAdapter;
/** Durable Object SQL storage interface */
interface DOSqlStorage {
    exec(query: string, ...bindings: unknown[]): {
        results: unknown[];
    };
}
/** Create DO SQLite storage adapter */
export declare function createDOAdapter(sql: DOSqlStorage, tableName?: string): StorageAdapter;
/** Create DO KV storage adapter (for WAL entries in 128KB values) */
export declare function createDOKVAdapter(storage: DurableObjectStorage): StorageAdapter;
/** Memory adapter for testing */
export declare function createMemoryAdapter(): StorageAdapter;
/** Durable Object Storage interface for type checking */
interface DurableObjectStorage {
    get<T>(key: string): Promise<T | undefined>;
    put(key: string, value: unknown): Promise<void>;
    delete(key: string): Promise<boolean>;
    list(options?: {
        prefix?: string;
    }): Promise<Map<string, unknown>>;
}
/**
 * Create a BlockId from components.
 * Format: prefix:timestamp(base36,10-padded):seq(base36,4-padded)
 * @returns Branded BlockId type for compile-time safety
 */
export declare function makeBlockId(prefix: string, timestamp: number, seq?: number): BlockId;
/**
 * Parse a BlockId into its components.
 * @param id - BlockId or plain string to parse
 * @returns Parsed components or null if invalid format
 */
export declare function parseBlockId(id: BlockId | string): {
    prefix: string;
    timestamp: number;
    seq: number;
} | null;
/**
 * Create a WalId from an LSN.
 * Format: wal:lsn(base36,12-padded)
 * @returns Branded WalId type for compile-time safety
 */
export declare function makeWalId(lsn: bigint): WalId;
/**
 * Parse a WalId to extract the LSN.
 * @param id - WalId or plain string to parse
 * @returns Parsed LSN as bigint or null if invalid format
 */
export declare function parseWalId(id: WalId | string): bigint | null;
export {};
//# sourceMappingURL=storage.d.ts.map