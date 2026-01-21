// DO Storage Adapter (~1KB budget)
import { unsafeBlockId, unsafeWalId } from './types.js';
/**
 * R2 storage adapter implementation
 * Wraps an R2Bucket binding to implement ObjectStorageAdapter
 */
export class R2ObjectStorageAdapter {
    bucket;
    keyPrefix;
    constructor(bucket, keyPrefix = '') {
        this.bucket = bucket;
        this.keyPrefix = keyPrefix;
    }
    getFullKey(key) {
        if (this.keyPrefix) {
            return `${this.keyPrefix}/${key}`.replace(/\/+/g, '/');
        }
        return key;
    }
    async put(path, data) {
        const fullKey = this.getFullKey(path);
        // Ensure data is an ArrayBuffer for R2
        const buffer = data instanceof ArrayBuffer ? data : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
        await this.bucket.put(fullKey, buffer);
    }
    async get(path) {
        const fullKey = this.getFullKey(path);
        const obj = await this.bucket.get(fullKey);
        if (!obj)
            return null;
        const buffer = await obj.arrayBuffer();
        return new Uint8Array(buffer);
    }
    async delete(path) {
        const fullKey = this.getFullKey(path);
        await this.bucket.delete(fullKey);
    }
    async list(prefix) {
        const fullPrefix = this.getFullKey(prefix);
        const keys = [];
        let cursor;
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
    async head(path) {
        const fullKey = this.getFullKey(path);
        const obj = await this.bucket.head(fullKey);
        if (!obj)
            return null;
        return {
            size: obj.size,
            etag: obj.etag,
            lastModified: obj.uploaded,
        };
    }
    async exists(path) {
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
export class MemoryObjectStorageAdapter {
    storage = new Map();
    async put(path, data) {
        const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
        this.storage.set(path, {
            data: bytes.slice(),
            metadata: {
                size: bytes.length,
                etag: `"${this.computeEtag(bytes)}"`,
                lastModified: new Date(),
            },
        });
    }
    async get(path) {
        const entry = this.storage.get(path);
        return entry ? entry.data.slice() : null;
    }
    async delete(path) {
        this.storage.delete(path);
    }
    async list(prefix) {
        return [...this.storage.keys()]
            .filter(k => k.startsWith(prefix))
            .sort();
    }
    async head(path) {
        const entry = this.storage.get(path);
        return entry ? { ...entry.metadata } : null;
    }
    async exists(path) {
        return this.storage.has(path);
    }
    async getRange(path, offset, length) {
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
    clear() {
        this.storage.clear();
    }
    /** Get number of stored objects */
    get size() {
        return this.storage.size;
    }
    /** Get all keys (for debugging) */
    keys() {
        return [...this.storage.keys()];
    }
    computeEtag(data) {
        // Simple hash for testing - in production this would be MD5 or similar
        let hash = 0;
        for (let i = 0; i < data.length; i++) {
            hash = ((hash << 5) - hash + data[i]) | 0;
        }
        return hash.toString(16);
    }
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
export function validateTableName(tableName) {
    if (!tableName || !VALID_TABLE_NAME_REGEX.test(tableName)) {
        throw new Error(`Invalid table name: "${tableName}". Table names must start with a letter or underscore and contain only alphanumeric characters and underscores.`);
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
export function quoteIdentifier(identifier) {
    // Escape any embedded double quotes by doubling them
    const escaped = identifier.replace(/"/g, '""');
    return `"${escaped}"`;
}
// =============================================================================
// Factory Functions
// =============================================================================
/**
 * Create an R2 storage adapter from a bucket binding
 * @param bucket - R2Bucket binding or R2BucketLike interface
 * @param keyPrefix - Optional prefix to prepend to all keys
 */
export function createR2ObjectAdapter(bucket, keyPrefix) {
    return new R2ObjectStorageAdapter(bucket, keyPrefix);
}
/**
 * Create an in-memory storage adapter for testing
 */
export function createMemoryObjectAdapter() {
    return new MemoryObjectStorageAdapter();
}
/**
 * Wrap a raw R2Bucket (or R2BucketLike) in an ObjectStorageAdapter
 * Provides backward compatibility - accepts either an adapter or a raw bucket
 */
export function wrapStorageBackend(backend, keyPrefix) {
    // Check if it's already an ObjectStorageAdapter (has our interface)
    if ('put' in backend && 'get' in backend && 'list' in backend && 'head' in backend && 'delete' in backend) {
        // Could be either interface - check for R2-specific method signatures
        const maybeBucket = backend;
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
        return backend;
    }
    // Assume it's an R2BucketLike
    return new R2ObjectStorageAdapter(backend, keyPrefix);
}
/** Create DO SQLite storage adapter */
export function createDOAdapter(sql, tableName = 'blocks') {
    // Validate table name to prevent SQL injection (first line of defense)
    validateTableName(tableName);
    // Quote the table name for defense in depth (second line of defense)
    const quotedTable = quoteIdentifier(tableName);
    // Ensure table exists
    sql.exec(`CREATE TABLE IF NOT EXISTS ${quotedTable} (id TEXT PRIMARY KEY, data BLOB, created_at INTEGER DEFAULT (unixepoch()))`);
    return {
        async writeBlock(id, data) {
            sql.exec(`INSERT OR REPLACE INTO ${quotedTable} (id, data) VALUES (?, ?)`, id, data);
        },
        async readBlock(id) {
            const result = sql.exec(`SELECT data FROM ${quotedTable} WHERE id = ?`, id);
            if (!result.results.length)
                return null;
            const row = result.results[0];
            return new Uint8Array(row.data);
        },
        async listBlocks(prefix) {
            const query = prefix
                ? `SELECT id FROM ${quotedTable} WHERE id LIKE ? ORDER BY id`
                : `SELECT id FROM ${quotedTable} ORDER BY id`;
            const result = prefix
                ? sql.exec(query, prefix + '%')
                : sql.exec(query);
            return result.results.map(r => r.id);
        },
        async deleteBlock(id) {
            sql.exec(`DELETE FROM ${quotedTable} WHERE id = ?`, id);
        },
    };
}
/** Create DO KV storage adapter (for WAL entries in 128KB values) */
export function createDOKVAdapter(storage) {
    return {
        async writeBlock(id, data) {
            await storage.put(id, data);
        },
        async readBlock(id) {
            const data = await storage.get(id);
            return data ? new Uint8Array(data) : null;
        },
        async listBlocks(prefix) {
            const opts = prefix ? { prefix } : {};
            const map = await storage.list(opts);
            return [...map.keys()];
        },
        async deleteBlock(id) {
            await storage.delete(id);
        },
    };
}
/** Memory adapter for testing */
export function createMemoryAdapter() {
    const store = new Map();
    return {
        async writeBlock(id, data) {
            store.set(id, data.slice());
        },
        async readBlock(id) {
            const data = store.get(id);
            return data ? data.slice() : null;
        },
        async listBlocks(prefix) {
            const keys = [...store.keys()];
            return prefix ? keys.filter(k => k.startsWith(prefix)).sort() : keys.sort();
        },
        async deleteBlock(id) {
            store.delete(id);
        },
    };
}
/** Base-36 validation regex: only digits 0-9 and letters a-z (case-insensitive) */
const BASE36_REGEX = /^[0-9a-z]+$/i;
/** Validate and parse base-36 string to number, returns NaN if invalid */
function safeParseBase36(str) {
    if (!str || !BASE36_REGEX.test(str))
        return NaN;
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
export function makeBlockId(prefix, timestamp, seq = 0) {
    const ts = timestamp.toString(36).padStart(10, '0');
    const s = seq.toString(36).padStart(4, '0');
    return unsafeBlockId(`${prefix}:${ts}:${s}`);
}
/**
 * Parse a BlockId into its components.
 * @param id - BlockId or plain string to parse
 * @returns Parsed components or null if invalid format
 */
export function parseBlockId(id) {
    const parts = id.split(':');
    if (parts.length !== 3)
        return null;
    const timestamp = safeParseBase36(parts[1]);
    const seq = safeParseBase36(parts[2]);
    // Return null if either value is NaN (invalid base-36 input)
    if (Number.isNaN(timestamp) || Number.isNaN(seq))
        return null;
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
export function makeWalId(lsn) {
    return unsafeWalId(`wal:${lsn.toString(36).padStart(12, '0')}`);
}
/**
 * Parse a WalId to extract the LSN.
 * @param id - WalId or plain string to parse
 * @returns Parsed LSN as bigint or null if invalid format
 */
export function parseWalId(id) {
    const idStr = id;
    if (!idStr.startsWith('wal:'))
        return null;
    const base36Str = idStr.slice(4);
    // Validate base-36 format before parsing
    if (!base36Str || !BASE36_REGEX.test(base36Str))
        return null;
    const parsed = parseInt(base36Str, 36);
    if (Number.isNaN(parsed))
        return null;
    return BigInt(parsed);
}
//# sourceMappingURL=storage.js.map