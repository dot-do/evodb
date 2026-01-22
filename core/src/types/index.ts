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

  // ColumnStats type-safe accessors (Issue evodb-lgp2)
  type NumericColumnStats,
  type StringColumnStats,
  type BigIntColumnStats,
  isNumericStats,
  isStringStats,
  isBigIntStats,
  getNumericStats,
  getStringStats,
  getBigIntStats,

  // Branded Types for compile-time ID safety (BlockId, TableId only - evodb-cn6)
  type BlockId,
  type TableId,

  // Plain Type Aliases (SnapshotId, BatchId, WalId, SchemaId - evodb-cn6)
  type SnapshotId,
  type BatchId,
  type WalId,
  type SchemaId,

  // Branded type constructors (BlockId, TableId only - evodb-cn6)
  blockId,
  tableId,
  unsafeBlockId,
  unsafeTableId,

  // Type guards (BlockId, TableId only - evodb-cn6)
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

  // Generic Constraint Types (Issue evodb-aqap)
  type DocumentConstraint,
  type DocumentWithId,
  type KeysOfType,
  type StringFieldsOf,
  type NumericFieldsOf,
  type BooleanFieldsOf,
  type FieldPath,
  type InvalidFieldError,
  type ValidateFields,
  type TypedIndexFields,
  type TypedUpdate,
  type TypedFilter,
  type TypedFieldAccessor,
  type ArrayElement,
  type RequireFields,
  type OptionalFields,
} from '../types.js';

// =============================================================================
// R2 Types (Issue evodb-sdgz - Consolidated R2 interfaces)
// =============================================================================

export {
  // Full R2 types (compatible with Cloudflare Workers R2 bindings)
  type R2Range,
  type R2Checksums,
  type R2HTTPMetadata,
  type R2Conditional,
  type R2PutOptions,
  type R2GetOptions,
  type R2ListOptions,
  type R2Object,
  type R2ObjectBody,
  type R2Objects,
  type R2Bucket,

  // Minimal "Like" interfaces (for lighter dependencies)
  type R2BucketLike,
  type R2ObjectLike,
  type R2ObjectsLike,
  type R2PutOptionsLike,
  type R2ListOptionsLike,

  // Simple R2 types (for query engine and reader)
  type SimpleR2Bucket,
  type SimpleR2Object,
  type SimpleR2ListOptions,
  type SimpleR2Objects,
} from './r2.js';
