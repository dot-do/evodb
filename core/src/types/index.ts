/**
 * @evodb/core/types - Core type definitions
 *
 * This submodule exports all fundamental types, branded types,
 * and type conversion utilities.
 *
 * @module types
 */

export {
  // Core enums
  Type,
  Encoding,
  WalOp,

  // Constants
  MAGIC,
  VERSION,
  HEADER_SIZE,
  FOOTER_SIZE,

  // Core interfaces
  type Column,
  type NullBitmap,  // Null bitmap type (sparse or dense representation - evodb-80q)
  type EncodedColumn,
  type ColumnStats,
  type BlockHeader,
  type BlockOptions,
  type WalEntry,
  type Schema,
  type SchemaColumn,
  type StorageAdapter,

  // Branded Types for compile-time ID safety
  type BlockId,
  type SnapshotId,
  type BatchId,
  type WalId,
  type SchemaId,
  type TableId,

  // Branded type constructors (validated)
  blockId,
  snapshotId,
  batchId,
  walId,
  schemaId,
  tableId,

  // Branded type constructors (unvalidated, for internal use)
  unsafeBlockId,
  unsafeSnapshotId,
  unsafeBatchId,
  unsafeWalId,
  unsafeSchemaId,
  unsafeTableId,

  // Type guards for branded types (BlockId, TableId only - evodb-3ju)
  isValidBlockId,
  isValidTableId,

  // Exhaustiveness helper
  assertNever,

  // Unified Table Schema Types (for lakehouse/manifest layer)
  type TableColumnType,
  type TableSchemaColumn,
  type TableSchema,

  // Unified RPC WAL Entry Types (for DO-to-DO communication)
  type WalEntryMetadata,
  isWalEntryMetadata,
  type RpcWalOperation,
  RpcWalOperationCode,
  type RpcWalOperationCodeValue,
  type RpcWalEntry,

  // Type conversion utilities
  typeEnumToString,
  stringToTypeEnum,
  schemaToTableSchema,
  tableSchemaToSchema,
  walEntryToRpcEntry,
  rpcEntryToWalEntry,
} from '../types.js';
