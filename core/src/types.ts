// Ultra-minimal type system with discriminators (~1KB budget)

// =============================================================================
// Branded Types - Compile-time ID safety
// =============================================================================

/**
 * Branded type pattern for compile-time type safety.
 * Prevents accidentally passing a SnapshotId where BlockId is expected.
 */
type Brand<T, B> = T & { readonly __brand: B };

/** Block identifier (prefix:timestamp:seq format) */
export type BlockId = Brand<string, 'BlockId'>;

/** Snapshot identifier (ULID-like format) */
export type SnapshotId = Brand<string, 'SnapshotId'>;

/** Batch identifier for RPC tracking */
export type BatchId = Brand<string, 'BatchId'>;

/** WAL entry identifier (wal:lsn format) */
export type WalId = Brand<string, 'WalId'>;

/** Schema version identifier */
export type SchemaId = Brand<number, 'SchemaId'>;

/** Table identifier (UUID format) */
export type TableId = Brand<string, 'TableId'>;

// =============================================================================
// Branded Type Constructors
// =============================================================================

/** BlockId format: prefix:timestamp(base36):seq(base36) */
const BLOCK_ID_REGEX = /^[a-z0-9_-]+:[0-9a-z]+:[0-9a-z]+$/i;

/** WalId format: wal:lsn(base36) */
const WAL_ID_REGEX = /^wal:[0-9a-z]+$/i;

/** SnapshotId format: timestamp(base36)-random */
const SNAPSHOT_ID_REGEX = /^[0-9a-z]+-[0-9a-z]+$/i;

/** BatchId format: sourcePrefix_seq_timestamp(base36) */
const BATCH_ID_REGEX = /^[0-9a-z]+_[0-9]+_[0-9a-z]+$/i;

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
 * Create a SnapshotId from a string.
 * Validates format: timestamp-random (ULID-like)
 */
export function snapshotId(id: string): SnapshotId {
  if (!SNAPSHOT_ID_REGEX.test(id)) {
    throw new Error(`Invalid SnapshotId format: ${id}. Expected format: timestamp-random`);
  }
  return id as SnapshotId;
}

/**
 * Create a SnapshotId without validation (for internal use).
 */
export function unsafeSnapshotId(id: string): SnapshotId {
  return id as SnapshotId;
}

/**
 * Create a BatchId from a string.
 * Validates format: prefix_seq_timestamp
 */
export function batchId(id: string): BatchId {
  if (!BATCH_ID_REGEX.test(id)) {
    throw new Error(`Invalid BatchId format: ${id}. Expected format: prefix_seq_timestamp`);
  }
  return id as BatchId;
}

/**
 * Create a BatchId without validation (for internal use).
 */
export function unsafeBatchId(id: string): BatchId {
  return id as BatchId;
}

/**
 * Create a WalId from a string.
 * Validates format: wal:lsn
 */
export function walId(id: string): WalId {
  if (!WAL_ID_REGEX.test(id)) {
    throw new Error(`Invalid WalId format: ${id}. Expected format: wal:lsn`);
  }
  return id as WalId;
}

/**
 * Create a WalId without validation (for internal use).
 */
export function unsafeWalId(id: string): WalId {
  return id as WalId;
}

/**
 * Create a SchemaId from a number.
 * Validates that it's a non-negative integer.
 */
export function schemaId(id: number): SchemaId {
  if (!Number.isInteger(id) || id < 0) {
    throw new Error(`Invalid SchemaId: ${id}. Must be a non-negative integer.`);
  }
  return id as SchemaId;
}

/**
 * Create a SchemaId without validation (for internal use).
 */
export function unsafeSchemaId(id: number): SchemaId {
  return id as SchemaId;
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
// Type Guards for Branded Types
// =============================================================================

/** Check if a string is a valid BlockId format */
export function isValidBlockId(id: string): boolean {
  return BLOCK_ID_REGEX.test(id);
}

/** Check if a string is a valid SnapshotId format */
export function isValidSnapshotId(id: string): boolean {
  return SNAPSHOT_ID_REGEX.test(id);
}

/** Check if a string is a valid BatchId format */
export function isValidBatchId(id: string): boolean {
  return BATCH_ID_REGEX.test(id);
}

/** Check if a string is a valid WalId format */
export function isValidWalId(id: string): boolean {
  return WAL_ID_REGEX.test(id);
}

/** Check if a number is a valid SchemaId */
export function isValidSchemaId(id: number): boolean {
  return Number.isInteger(id) && id >= 0;
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

/** Column definition */
export interface Column {
  path: string;        // Dot-notation path (e.g., "user.name")
  type: Type;
  nullable: boolean;
  values: unknown[];   // Raw values before encoding
  nulls: boolean[];    // Null bitmap
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
export const enum WalOp {
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

/** Storage adapter interface */
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
