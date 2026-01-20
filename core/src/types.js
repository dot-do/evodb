// Ultra-minimal type system with discriminators (~1KB budget)
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
export function blockId(id) {
    if (!BLOCK_ID_REGEX.test(id)) {
        throw new Error(`Invalid BlockId format: ${id}. Expected format: prefix:timestamp:seq`);
    }
    return id;
}
/**
 * Create a BlockId without validation (for internal use where format is known).
 * Use with caution - prefer blockId() for user input.
 */
export function unsafeBlockId(id) {
    return id;
}
/**
 * Create a SnapshotId from a string.
 * Validates format: timestamp-random (ULID-like)
 */
export function snapshotId(id) {
    if (!SNAPSHOT_ID_REGEX.test(id)) {
        throw new Error(`Invalid SnapshotId format: ${id}. Expected format: timestamp-random`);
    }
    return id;
}
/**
 * Create a SnapshotId without validation (for internal use).
 */
export function unsafeSnapshotId(id) {
    return id;
}
/**
 * Create a BatchId from a string.
 * Validates format: prefix_seq_timestamp
 */
export function batchId(id) {
    if (!BATCH_ID_REGEX.test(id)) {
        throw new Error(`Invalid BatchId format: ${id}. Expected format: prefix_seq_timestamp`);
    }
    return id;
}
/**
 * Create a BatchId without validation (for internal use).
 */
export function unsafeBatchId(id) {
    return id;
}
/**
 * Create a WalId from a string.
 * Validates format: wal:lsn
 */
export function walId(id) {
    if (!WAL_ID_REGEX.test(id)) {
        throw new Error(`Invalid WalId format: ${id}. Expected format: wal:lsn`);
    }
    return id;
}
/**
 * Create a WalId without validation (for internal use).
 */
export function unsafeWalId(id) {
    return id;
}
/**
 * Create a SchemaId from a number.
 * Validates that it's a non-negative integer.
 */
export function schemaId(id) {
    if (!Number.isInteger(id) || id < 0) {
        throw new Error(`Invalid SchemaId: ${id}. Must be a non-negative integer.`);
    }
    return id;
}
/**
 * Create a SchemaId without validation (for internal use).
 */
export function unsafeSchemaId(id) {
    return id;
}
/**
 * Create a TableId from a string.
 * Validates UUID format.
 */
export function tableId(id) {
    if (!UUID_REGEX.test(id)) {
        throw new Error(`Invalid TableId format: ${id}. Expected UUID format.`);
    }
    return id;
}
/**
 * Create a TableId without validation (for internal use).
 */
export function unsafeTableId(id) {
    return id;
}
// =============================================================================
// Type Guards for Branded Types
// =============================================================================
/** Check if a string is a valid BlockId format */
export function isValidBlockId(id) {
    return BLOCK_ID_REGEX.test(id);
}
/** Check if a string is a valid SnapshotId format */
export function isValidSnapshotId(id) {
    return SNAPSHOT_ID_REGEX.test(id);
}
/** Check if a string is a valid BatchId format */
export function isValidBatchId(id) {
    return BATCH_ID_REGEX.test(id);
}
/** Check if a string is a valid WalId format */
export function isValidWalId(id) {
    return WAL_ID_REGEX.test(id);
}
/** Check if a number is a valid SchemaId */
export function isValidSchemaId(id) {
    return Number.isInteger(id) && id >= 0;
}
/** Check if a string is a valid TableId (UUID) format */
export function isValidTableId(id) {
    return UUID_REGEX.test(id);
}
// =============================================================================
// Core Types
// =============================================================================
/** Type discriminators (1 byte) */
export var Type;
(function (Type) {
    Type[Type["Null"] = 0] = "Null";
    Type[Type["Bool"] = 1] = "Bool";
    Type[Type["Int32"] = 2] = "Int32";
    Type[Type["Int64"] = 3] = "Int64";
    Type[Type["Float64"] = 4] = "Float64";
    Type[Type["String"] = 5] = "String";
    Type[Type["Binary"] = 6] = "Binary";
    Type[Type["Array"] = 7] = "Array";
    Type[Type["Object"] = 8] = "Object";
    Type[Type["Timestamp"] = 9] = "Timestamp";
    Type[Type["Date"] = 10] = "Date";
})(Type || (Type = {}));
/** Encoding types (1 byte) */
export var Encoding;
(function (Encoding) {
    Encoding[Encoding["Plain"] = 0] = "Plain";
    Encoding[Encoding["RLE"] = 1] = "RLE";
    Encoding[Encoding["Dict"] = 2] = "Dict";
    Encoding[Encoding["Delta"] = 3] = "Delta";
})(Encoding || (Encoding = {}));
/** WAL operation types */
export var WalOp;
(function (WalOp) {
    WalOp[WalOp["Insert"] = 1] = "Insert";
    WalOp[WalOp["Update"] = 2] = "Update";
    WalOp[WalOp["Delete"] = 3] = "Delete";
})(WalOp || (WalOp = {}));
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
export function assertNever(value, message) {
    throw new Error(message ?? `Unexpected value: ${JSON.stringify(value)}`);
}
//# sourceMappingURL=types.js.map