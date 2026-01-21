// Ultra-minimal type system with discriminators (~1KB budget)

// =============================================================================
// Branded Types - Compile-time ID safety
// =============================================================================

/**
 * Branded type pattern for compile-time type safety.
 * Only used for the most critical identifiers (BlockId, TableId) where
 * type confusion could cause data corruption or integrity issues.
 *
 * Other identifiers (SnapshotId, BatchId, WalId, SchemaId) use plain
 * string/number types for simplicity - TDD issue evodb-3ju.
 */
type Brand<T, B> = T & { readonly __brand: B };

/** Block identifier (prefix:timestamp:seq format) - branded for data integrity */
export type BlockId = Brand<string, 'BlockId'>;

/** Table identifier (UUID format) - branded for referential integrity */
export type TableId = Brand<string, 'TableId'>;

// =============================================================================
// Plain Type Aliases (simplified from branded types - evodb-3ju)
// =============================================================================

/** Snapshot identifier (ULID-like format) */
export type SnapshotId = string;

/** Batch identifier for RPC tracking */
export type BatchId = string;

/** WAL entry identifier (wal:lsn format) */
export type WalId = string;

/** Schema version identifier */
export type SchemaId = number;

// =============================================================================
// Branded Type Constructors (BlockId, TableId only - evodb-3ju)
// =============================================================================

/** BlockId format: prefix:timestamp(base36):seq(base36) */
const BLOCK_ID_REGEX = /^[a-z0-9_-]+:[0-9a-z]+:[0-9a-z]+$/i;

/** UUID format for TableId */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Create a BlockId from a string.
 * Validates format: prefix:timestamp:seq
 */
export function blockId(id: string): BlockId {
  if (!BLOCK_ID_REGEX.test(id)) {
    throw new Error(`Invalid BlockId format: ${id}. Expected format: prefix:timestamp:seq`);
  }
  return id as BlockId;
}

/**
 * Create a BlockId without validation (for internal use where format is known).
 * Use with caution - prefer blockId() for user input.
 */
export function unsafeBlockId(id: string): BlockId {
  return id as BlockId;
}

/**
 * Create a TableId from a string.
 * Validates UUID format.
 */
export function tableId(id: string): TableId {
  if (!UUID_REGEX.test(id)) {
    throw new Error(`Invalid TableId format: ${id}. Expected UUID format.`);
  }
  return id as TableId;
}

/**
 * Create a TableId without validation (for internal use).
 */
export function unsafeTableId(id: string): TableId {
  return id as TableId;
}

// =============================================================================
// Plain Type Constructors (simplified - evodb-3ju)
// These functions are kept for backward compatibility but now just pass through
// the input value without validation. The types are no longer branded.
// =============================================================================

/**
 * Create a SnapshotId from a string.
 * @deprecated No longer validates - SnapshotId is now a plain string type (evodb-3ju)
 */
export function snapshotId(id: string): SnapshotId {
  return id;
}

/**
 * Create a SnapshotId without validation (for internal use).
 * @deprecated SnapshotId is now a plain string type (evodb-3ju)
 */
export function unsafeSnapshotId(id: string): SnapshotId {
  return id;
}

/**
 * Create a BatchId from a string.
 * @deprecated No longer validates - BatchId is now a plain string type (evodb-3ju)
 */
export function batchId(id: string): BatchId {
  return id;
}

/**
 * Create a BatchId without validation (for internal use).
 * @deprecated BatchId is now a plain string type (evodb-3ju)
 */
export function unsafeBatchId(id: string): BatchId {
  return id;
}

/**
 * Create a WalId from a string.
 * @deprecated No longer validates - WalId is now a plain string type (evodb-3ju)
 */
export function walId(id: string): WalId {
  return id;
}

/**
 * Create a WalId without validation (for internal use).
 * @deprecated WalId is now a plain string type (evodb-3ju)
 */
export function unsafeWalId(id: string): WalId {
  return id;
}

/**
 * Create a SchemaId from a number.
 * @deprecated No longer validates - SchemaId is now a plain number type (evodb-3ju)
 */
export function schemaId(id: number): SchemaId {
  return id;
}

/**
 * Create a SchemaId without validation (for internal use).
 * @deprecated SchemaId is now a plain number type (evodb-3ju)
 */
export function unsafeSchemaId(id: number): SchemaId {
  return id;
}

// =============================================================================
// Type Guards (BlockId, TableId only - evodb-3ju)
// Validators for the simplified types are removed per TDD issue evodb-3ju.
// =============================================================================

/** Check if a string is a valid BlockId format */
export function isValidBlockId(id: string): boolean {
  return BLOCK_ID_REGEX.test(id);
}

/** Check if a string is a valid TableId (UUID) format */
export function isValidTableId(id: string): boolean {
  return UUID_REGEX.test(id);
}

// =============================================================================
// Core Types
// =============================================================================

/** Type discriminators (1 byte) */
export const enum Type {
  Null = 0,
  Bool = 1,
  Int32 = 2,
  Int64 = 3,
  Float64 = 4,
  String = 5,
  Binary = 6,
  Array = 7,
  Object = 8,
  Timestamp = 9,  // Date objects (stored as ms since epoch)
  Date = 10,      // ISO date strings (YYYY-MM-DD)
}

/** Encoding types (1 byte) */
export const enum Encoding {
  Plain = 0,
  RLE = 1,
  Dict = 2,
  Delta = 3,
}

/**
 * Null bitmap representation - can be dense (boolean[]) or sparse (SparseNullSet).
 * Sparse representation is used when null rate < 10% for memory efficiency.
 * Both representations support index-based null checking:
 * - boolean[]: nulls[i] returns true if null
 * - SparseNullSet: nulls.isNull(i) returns true if null
 *
 * For iteration, both are Iterable<boolean>.
 * For backward compatibility, SparseNullSet.toArray() converts to boolean[].
 *
 * @see SparseNullSet in encode.ts for sparse implementation
 * @see SPARSE_NULL_THRESHOLD for the 10% threshold constant
 */
export type NullBitmap = boolean[] | { isNull(index: number): boolean; toArray(): boolean[]; length: number };

/** Column definition */
export interface Column {
  path: string;        // Dot-notation path (e.g., "user.name")
  type: Type;
  nullable: boolean;
  values: unknown[];   // Raw values before encoding
  nulls: NullBitmap;   // Null bitmap (dense or sparse representation)
}

/** Encoded column */
export interface EncodedColumn {
  path: string;
  type: Type;
  encoding: Encoding;
  data: Uint8Array;
  nullBitmap: Uint8Array;
  stats: ColumnStats;
}

/** Column statistics for zone maps */
export interface ColumnStats {
  min: unknown;
  max: unknown;
  nullCount: number;
  distinctEst: number;  // HyperLogLog or simple count
}

/** Block header (64 bytes) */
export interface BlockHeader {
  magic: number;       // 4B: 0x434A4C42 "CJLB"
  version: number;     // 2B
  schemaId: number;    // 4B
  rowCount: number;    // 4B
  columnCount: number; // 2B
  flags: number;       // 2B
  minLsn: bigint;      // 8B
  maxLsn: bigint;      // 8B
  checksum: number;    // 4B
  // reserved: 26B
}

/** WAL operation types */
export enum WalOp {
  Insert = 1,
  Update = 2,
  Delete = 3,
}

/** WAL entry */
export interface WalEntry {
  lsn: bigint;
  timestamp: bigint;
  op: WalOp;
  flags: number;
  data: Uint8Array;
  checksum: number;
}

/** Schema definition */
export interface Schema {
  id: number;
  version: number;
  parentVersion?: number;  // For schema evolution chain tracking
  columns: SchemaColumn[];
}

/** Schema column */
export interface SchemaColumn {
  path: string;
  type: Type;
  nullable: boolean;
  defaultValue?: unknown;
}

/** Block write options */
export interface BlockOptions {
  schemaId?: number;
  minLsn?: bigint;
  maxLsn?: bigint;
}

/**
 * Storage adapter interface for DO block storage.
 *
 * @deprecated Use StorageProvider from @evodb/core/storage instead.
 * This interface is maintained for backward compatibility with existing
 * DO block storage code.
 *
 * Migration guide:
 * - writeBlock() -> put()
 * - readBlock() -> get()
 * - listBlocks() -> list()
 * - deleteBlock() -> delete()
 *
 * @example
 * ```typescript
 * // Old code using StorageAdapter
 * const adapter: StorageAdapter = createMemoryAdapter();
 * await adapter.writeBlock('block-1', data);
 *
 * // New code using StorageProvider
 * import { createInMemoryProvider, StorageProvider } from '@evodb/core';
 * const provider: StorageProvider = createInMemoryProvider();
 * await provider.put('block-1', data);
 * ```
 */
export interface StorageAdapter {
  writeBlock(id: string, data: Uint8Array): Promise<void>;
  readBlock(id: string): Promise<Uint8Array | null>;
  listBlocks(prefix?: string): Promise<string[]>;
  deleteBlock(id: string): Promise<void>;
}

// Magic number: "CJLB" = Columnar JSON Lite Block
export const MAGIC = 0x434A4C42;
export const VERSION = 1;
export const HEADER_SIZE = 64;
export const FOOTER_SIZE = 32;

// =============================================================================
// Exhaustiveness Check Helper
// =============================================================================

/**
 * Assert that a value is of type `never` at compile time.
 * Used in switch statements to ensure all cases are handled.
 *
 * @example
 * ```typescript
 * switch (value.type) {
 *   case 'a': return handleA();
 *   case 'b': return handleB();
 *   default:
 *     return assertNever(value.type, `Unhandled type: ${value.type}`);
 * }
 * ```
 *
 * If a new case is added to the union type, TypeScript will error at compile time
 * because the value won't be assignable to `never`.
 */
export function assertNever(value: never, message?: string): never {
  throw new Error(message ?? `Unexpected value: ${JSON.stringify(value)}`);
}

// =============================================================================
// Unified Table Schema Types (for lakehouse/manifest layer)
// =============================================================================

/**
 * String-based column types for table schemas (human-readable format).
 * Used in table manifests and lakehouse operations.
 * Maps to Core `Type` enum for low-level columnar operations.
 */
export type TableColumnType =
  | 'null'
  | 'boolean'
  | 'int32'
  | 'int64'
  | 'float64'
  | 'string'
  | 'binary'
  | 'timestamp'
  | 'date'
  | 'uuid'
  | 'json'
  | { type: 'array'; elementType: TableColumnType }
  | { type: 'map'; keyType: TableColumnType; valueType: TableColumnType }
  | { type: 'struct'; fields: TableSchemaColumn[] };

/**
 * Column definition for table schemas (high-level format).
 * Uses string-based types and `name` field for manifest compatibility.
 */
export interface TableSchemaColumn {
  /** Column name (use dot-notation for nested: "user.address.city") */
  name: string;
  /** Column data type */
  type: TableColumnType;
  /** Whether column accepts null values */
  nullable: boolean;
  /** Optional default value */
  defaultValue?: unknown;
  /** Optional documentation */
  doc?: string;
}

/**
 * Table schema definition (high-level format for manifests).
 * Used in lakehouse operations, table catalogs, and metadata.
 *
 * Different from Core `Schema` which uses:
 * - `id` instead of `schemaId`
 * - `path` instead of `name` in columns
 * - `Type` enum instead of string types
 */
export interface TableSchema {
  /** Schema version identifier */
  schemaId: number;
  /** Schema version number */
  version: number;
  /** Column definitions */
  columns: TableSchemaColumn[];
  /** Creation timestamp (ms since epoch) */
  createdAt: number;
}

// =============================================================================
// Unified RPC WAL Entry Types (for DO-to-DO communication)
// =============================================================================

/**
 * Metadata associated with a WAL entry for RPC communication.
 *
 * This interface defines the structure for optional metadata that can be
 * attached to WAL entries during DO-to-DO CDC streaming.
 *
 * @example
 * ```typescript
 * const metadata: WalEntryMetadata = {
 *   transactionId: 'tx-12345',
 *   userId: 'user-abc',
 *   source: 'api',
 *   correlationId: 'req-xyz',
 * };
 * ```
 */
export interface WalEntryMetadata {
  /** Transaction identifier for grouping related changes */
  transactionId?: string;
  /** User identifier who initiated the change */
  userId?: string;
  /** Source system or service that produced the entry */
  source?: string;
  /** Correlation ID for request tracing */
  correlationId?: string;
  /** Session identifier */
  sessionId?: string;
  /** Client IP address (for audit logging) */
  clientIp?: string;
  /** Custom tags for categorization */
  tags?: string[];
  /** Additional custom fields (escape hatch for unforeseen metadata needs) */
  [key: string]: string | string[] | undefined;
}

/**
 * Type guard to check if a value is a valid WalEntryMetadata object.
 *
 * @param value - The value to check
 * @returns True if value conforms to WalEntryMetadata structure
 */
export function isWalEntryMetadata(value: unknown): value is WalEntryMetadata {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  // All known fields should be string, string[], or undefined
  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined) continue;
    if (typeof val === 'string') continue;
    if (key === 'tags' && Array.isArray(val) && val.every(v => typeof v === 'string')) continue;
    // Unknown fields must be string or string[]
    if (Array.isArray(val) && val.every(v => typeof v === 'string')) continue;
    return false;
  }
  return true;
}

/**
 * WAL operation types for RPC communication (string-based).
 */
export type RpcWalOperation = 'INSERT' | 'UPDATE' | 'DELETE';

/**
 * Numeric codes for WAL operations (for binary encoding).
 */
export const RpcWalOperationCode = {
  INSERT: 0,
  UPDATE: 1,
  DELETE: 2,
} as const;

export type RpcWalOperationCodeValue = (typeof RpcWalOperationCode)[RpcWalOperation];

/**
 * WAL entry for RPC communication (high-level format).
 * Used for DO-to-DO CDC streaming and parent aggregation.
 *
 * Different from Core `WalEntry` which uses:
 * - `lsn: bigint` instead of `sequence: number`
 * - `timestamp: bigint` instead of `timestamp: number`
 * - `op: WalOp` enum instead of `operation: string`
 * - `data: Uint8Array` instead of `before`/`after` JSON
 */
export interface RpcWalEntry<T = unknown> {
  /** Monotonically increasing sequence number within the source DO */
  sequence: number;
  /** Unix timestamp in milliseconds when the change occurred */
  timestamp: number;
  /** Type of database operation */
  operation: RpcWalOperation;
  /** Table name where the change occurred */
  table: string;
  /** Primary key or row identifier */
  rowId: string;
  /** Row data before the change (for UPDATE/DELETE) */
  before?: T;
  /** Row data after the change (for INSERT/UPDATE) */
  after?: T;
  /** Optional metadata (e.g., transaction ID, user ID) */
  metadata?: WalEntryMetadata;
}

// =============================================================================
// Type Conversion Utilities
// =============================================================================

/**
 * Convert Core Type enum to TableColumnType string.
 */
export function typeEnumToString(type: Type): TableColumnType {
  switch (type) {
    case Type.Null: return 'null';
    case Type.Bool: return 'boolean';
    case Type.Int32: return 'int32';
    case Type.Int64: return 'int64';
    case Type.Float64: return 'float64';
    case Type.String: return 'string';
    case Type.Binary: return 'binary';
    case Type.Timestamp: return 'timestamp';
    case Type.Date: return 'date';
    case Type.Array: return 'json'; // Arrays need element type info
    case Type.Object: return 'json'; // Objects are stored as JSON
    default: return assertNever(type, `Unknown type enum: ${type}`);
  }
}

/**
 * Convert TableColumnType string to Core Type enum.
 * Complex types (array, map, struct) are stored as Object/JSON.
 */
export function stringToTypeEnum(type: TableColumnType): Type {
  if (typeof type === 'object') {
    // Complex types stored as Object/JSON
    return Type.Object;
  }
  switch (type) {
    case 'null': return Type.Null;
    case 'boolean': return Type.Bool;
    case 'int32': return Type.Int32;
    case 'int64': return Type.Int64;
    case 'float64': return Type.Float64;
    case 'string': return Type.String;
    case 'binary': return Type.Binary;
    case 'timestamp': return Type.Timestamp;
    case 'date': return Type.Date;
    case 'uuid': return Type.String; // UUIDs stored as strings
    case 'json': return Type.Object;
    default: return assertNever(type, `Unknown type string: ${type}`);
  }
}

/**
 * Convert Core Schema to TableSchema format.
 */
export function schemaToTableSchema(schema: Schema, createdAt?: number): TableSchema {
  return {
    schemaId: schema.id,
    version: schema.version,
    columns: schema.columns.map(col => ({
      name: col.path,
      type: typeEnumToString(col.type),
      nullable: col.nullable,
      defaultValue: col.defaultValue,
    })),
    createdAt: createdAt ?? Date.now(),
  };
}

/**
 * Convert TableSchema to Core Schema format.
 */
export function tableSchemaToSchema(tableSchema: TableSchema): Schema {
  return {
    id: tableSchema.schemaId,
    version: tableSchema.version,
    parentVersion: tableSchema.version > 1 ? tableSchema.version - 1 : undefined,
    columns: tableSchema.columns.map(col => ({
      path: col.name,
      type: stringToTypeEnum(col.type),
      nullable: col.nullable,
      defaultValue: col.defaultValue,
    })),
  };
}

/**
 * Convert Core WalEntry to RpcWalEntry format.
 * Note: data must be JSON-parseable for this conversion.
 */
export function walEntryToRpcEntry<T = unknown>(
  entry: WalEntry,
  table: string,
  rowId: string
): RpcWalEntry<T> {
  const operation: RpcWalOperation =
    entry.op === WalOp.Insert ? 'INSERT' :
    entry.op === WalOp.Update ? 'UPDATE' :
    'DELETE';

  let after: T | undefined;
  try {
    const text = new TextDecoder().decode(entry.data);
    after = JSON.parse(text) as T;
  } catch {
    // Data is not JSON, leave undefined
  }

  return {
    sequence: Number(entry.lsn),
    timestamp: Number(entry.timestamp),
    operation,
    table,
    rowId,
    after,
  };
}

/**
 * Convert RpcWalEntry to Core WalEntry format.
 */
export function rpcEntryToWalEntry<T>(
  entry: RpcWalEntry<T>,
  checksum = 0
): WalEntry {
  const op: WalOp =
    entry.operation === 'INSERT' ? WalOp.Insert :
    entry.operation === 'UPDATE' ? WalOp.Update :
    WalOp.Delete;

  const data = new TextEncoder().encode(
    JSON.stringify(entry.after ?? entry.before ?? {})
  );

  return {
    lsn: BigInt(entry.sequence),
    timestamp: BigInt(entry.timestamp),
    op,
    flags: 0,
    data,
    checksum,
  };
}
