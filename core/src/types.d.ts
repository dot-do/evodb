/**
 * Branded type pattern for compile-time type safety.
 * Prevents accidentally passing a SnapshotId where BlockId is expected.
 */
type Brand<T, B> = T & {
    readonly __brand: B;
};
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
/**
 * Create a BlockId from a string.
 * Validates format: prefix:timestamp:seq
 */
export declare function blockId(id: string): BlockId;
/**
 * Create a BlockId without validation (for internal use where format is known).
 * Use with caution - prefer blockId() for user input.
 */
export declare function unsafeBlockId(id: string): BlockId;
/**
 * Create a SnapshotId from a string.
 * Validates format: timestamp-random (ULID-like)
 */
export declare function snapshotId(id: string): SnapshotId;
/**
 * Create a SnapshotId without validation (for internal use).
 */
export declare function unsafeSnapshotId(id: string): SnapshotId;
/**
 * Create a BatchId from a string.
 * Validates format: prefix_seq_timestamp
 */
export declare function batchId(id: string): BatchId;
/**
 * Create a BatchId without validation (for internal use).
 */
export declare function unsafeBatchId(id: string): BatchId;
/**
 * Create a WalId from a string.
 * Validates format: wal:lsn
 */
export declare function walId(id: string): WalId;
/**
 * Create a WalId without validation (for internal use).
 */
export declare function unsafeWalId(id: string): WalId;
/**
 * Create a SchemaId from a number.
 * Validates that it's a non-negative integer.
 */
export declare function schemaId(id: number): SchemaId;
/**
 * Create a SchemaId without validation (for internal use).
 */
export declare function unsafeSchemaId(id: number): SchemaId;
/**
 * Create a TableId from a string.
 * Validates UUID format.
 */
export declare function tableId(id: string): TableId;
/**
 * Create a TableId without validation (for internal use).
 */
export declare function unsafeTableId(id: string): TableId;
/** Check if a string is a valid BlockId format */
export declare function isValidBlockId(id: string): boolean;
/** Check if a string is a valid SnapshotId format */
export declare function isValidSnapshotId(id: string): boolean;
/** Check if a string is a valid BatchId format */
export declare function isValidBatchId(id: string): boolean;
/** Check if a string is a valid WalId format */
export declare function isValidWalId(id: string): boolean;
/** Check if a number is a valid SchemaId */
export declare function isValidSchemaId(id: number): boolean;
/** Check if a string is a valid TableId (UUID) format */
export declare function isValidTableId(id: string): boolean;
/** Type discriminators (1 byte) */
export declare const enum Type {
    Null = 0,
    Bool = 1,
    Int32 = 2,
    Int64 = 3,
    Float64 = 4,
    String = 5,
    Binary = 6,
    Array = 7,
    Object = 8,
    Timestamp = 9,
    Date = 10
}
/** Encoding types (1 byte) */
export declare const enum Encoding {
    Plain = 0,
    RLE = 1,
    Dict = 2,
    Delta = 3
}
/** Column definition */
export interface Column {
    path: string;
    type: Type;
    nullable: boolean;
    values: unknown[];
    nulls: boolean[];
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
    distinctEst: number;
}
/** Block header (64 bytes) */
export interface BlockHeader {
    magic: number;
    version: number;
    schemaId: number;
    rowCount: number;
    columnCount: number;
    flags: number;
    minLsn: bigint;
    maxLsn: bigint;
    checksum: number;
}
/** WAL operation types */
export declare const enum WalOp {
    Insert = 1,
    Update = 2,
    Delete = 3
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
    parentVersion?: number;
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
export declare const MAGIC = 1128942658;
export declare const VERSION = 1;
export declare const HEADER_SIZE = 64;
export declare const FOOTER_SIZE = 32;
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
export declare function assertNever(value: never, message?: string): never;
export {};
//# sourceMappingURL=types.d.ts.map