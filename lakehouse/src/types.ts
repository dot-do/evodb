/**
 * @dotdo/poc-lakehouse-manifest
 * JSON Iceberg-inspired manifest types for Cloudflare R2 lakehouse
 */

import type {
  TableSchema as CoreTableSchema,
  TableSchemaColumn as CoreTableSchemaColumn,
  TableColumnType as CoreColumnType,
} from '@evodb/core';
import { EvoDBError, ErrorCode, captureStackTrace } from '@evodb/core';

// Re-export core types with lakehouse-specific names for compatibility
export type { CoreTableSchema, CoreTableSchemaColumn, CoreColumnType };

// =============================================================================
// Manifest Versioning
// =============================================================================

/**
 * Current manifest schema version.
 *
 * VERSION HISTORY:
 * - Version 1: Initial manifest format with formatVersion, tableId, location,
 *              schemas, partitionSpec, snapshots, stats, properties, timestamps.
 *
 * VERSION MIGRATION STRATEGY:
 * 1. BACKWARD COMPATIBILITY: Readers MUST be able to read manifests written by
 *    older versions. Missing fields (like schemaVersion in legacy manifests)
 *    default to safe values (version 1).
 *
 * 2. FORWARD COMPATIBILITY REJECTION: Readers MUST reject manifests from newer
 *    versions they don't understand (throw VersionMismatchError).
 *
 * 3. VERSION BUMPS: The schemaVersion is bumped when:
 *    - Required fields are added (breaking change)
 *    - Field semantics change in incompatible ways
 *    - Structural changes require migration logic
 *
 * 4. MIGRATION PROCESS:
 *    - Read old manifest (version N)
 *    - Apply migration transforms: migrateManifest(manifest, fromVersion, toVersion)
 *    - Write new manifest (version N+1)
 *
 * Example future migration (v1 -> v2):
 * ```typescript
 * function migrateV1ToV2(manifest: ManifestV1): ManifestV2 {
 *   return {
 *     ...manifest,
 *     schemaVersion: 2,
 *     newRequiredField: computeDefaultValue(manifest),
 *   };
 * }
 * ```
 */
export const CURRENT_MANIFEST_VERSION = 1;

/**
 * Error thrown when attempting to read a manifest with an unsupported schema version.
 * This typically happens when a newer manifest format is encountered by an older reader.
 * Extends EvoDBError for consistent error hierarchy.
 *
 * @example
 * ```typescript
 * import { EvoDBError, ErrorCode } from '@evodb/core';
 *
 * try {
 *   const manifest = await loadManifest('table');
 * } catch (e) {
 *   if (e instanceof VersionMismatchError) {
 *     console.log(`Found version ${e.foundVersion}, supports ${e.supportedVersion}`);
 *   }
 *   // Or catch all EvoDB errors
 *   if (e instanceof EvoDBError && e.code === ErrorCode.VERSION_MISMATCH) {
 *     // Handle version mismatch
 *   }
 * }
 * ```
 */
export class VersionMismatchError extends EvoDBError {
  public readonly foundVersion: number;
  public readonly supportedVersion: number;

  constructor(foundVersion: number, supportedVersion: number) {
    super(
      `Unsupported manifest schema version ${foundVersion}. ` +
      `This reader supports version ${supportedVersion}. ` +
      `Please upgrade to a newer version of the lakehouse package.`,
      ErrorCode.VERSION_MISMATCH,
      { foundVersion, supportedVersion },
      `Please upgrade to a newer version of the lakehouse package that supports version ${foundVersion}.`
    );
    this.name = 'VersionMismatchError';
    this.foundVersion = foundVersion;
    this.supportedVersion = supportedVersion;
    captureStackTrace(this, VersionMismatchError);
  }
}

// =============================================================================
// Core Table Types
// =============================================================================

/**
 * Main table manifest - root of all table metadata
 * Designed for atomic JSON commits to R2
 */
export interface TableManifest {
  /**
   * Manifest schema version for forward/backward compatibility.
   * Used to detect incompatible manifest formats and trigger migrations.
   * Defaults to 1 for legacy manifests that predate this field.
   */
  schemaVersion: number;

  /** Format version (always 1 for this implementation) */
  formatVersion: 1;

  /** Unique table identifier (UUID) */
  tableId: string;

  /** R2 location path (e.g., "com/example/api/users") */
  location: string;

  /** Current active schema ID */
  currentSchemaId: number;

  /** References to all schema versions */
  schemas: SchemaRef[];

  /** Partition specification */
  partitionSpec: PartitionSpec;

  /** Current active snapshot ID (null for empty tables) */
  currentSnapshotId: string | null;

  /** All snapshots (for time-travel) */
  snapshots: SnapshotRef[];

  /** Table-level statistics */
  stats: TableStats;

  /** Custom properties */
  properties: Record<string, string>;

  /** Creation timestamp (ms since epoch) */
  createdAt: number;

  /** Last modification timestamp */
  updatedAt: number;
}

/**
 * Reference to a schema version file
 */
export interface SchemaRef {
  schemaId: number;
  path: string;  // Relative path: "_schema/v{N}.json"
}

/**
 * Reference to a snapshot
 */
export interface SnapshotRef {
  snapshotId: string;
  timestamp: number;
  parentSnapshotId: string | null;
}

/**
 * Table-level statistics
 */
export interface TableStats {
  totalRows: number;
  totalFiles: number;
  totalSizeBytes: number;
  lastSnapshotTimestamp: number | null;
}

// =============================================================================
// Schema Types
// =============================================================================

/**
 * Schema definition (stored in _schema/v{N}.json)
 * Uses CoreTableSchema from @evodb/core for unified type definition.
 */
export type Schema = CoreTableSchema;

/**
 * Column definition within a schema.
 * Uses CoreTableSchemaColumn from @evodb/core for unified type definition.
 */
export type SchemaColumn = CoreTableSchemaColumn;

/**
 * Supported column types (aligned with columnar-json-lite).
 * Uses CoreColumnType from @evodb/core for unified type definition.
 */
export type ColumnType = CoreColumnType;

// =============================================================================
// Snapshot Types
// =============================================================================

/**
 * Snapshot represents a point-in-time view of the table
 */
export interface Snapshot {
  /** Unique snapshot identifier (UUID or ULID) */
  snapshotId: string;

  /** Parent snapshot ID (null for first snapshot) */
  parentSnapshotId: string | null;

  /** Snapshot creation timestamp (ms since epoch) */
  timestamp: number;

  /** Schema ID active at snapshot time */
  schemaId: number;

  /** List of manifest files for this snapshot */
  manifestList: ManifestFile[];

  /** Operation summary */
  summary: SnapshotSummary;

  /** Optional operation metadata */
  metadata?: Record<string, string>;
}

/**
 * Summary of snapshot operation
 */
export interface SnapshotSummary {
  /** Type of operation that created this snapshot */
  operation: 'append' | 'overwrite' | 'delete' | 'compact' | 'replace';

  /** Number of files added */
  addedFiles: number;

  /** Number of files removed */
  deletedFiles: number;

  /** Number of rows added */
  addedRows: number;

  /** Number of rows deleted */
  deletedRows: number;

  /** Source DO identifiers (for CDC tracking) */
  sourceDoIds?: string[];
}

// =============================================================================
// Manifest File Types
// =============================================================================

/**
 * A manifest file lists data files and their metadata
 */
export interface ManifestFile {
  /** Relative path to data file */
  path: string;

  /** File size in bytes */
  length: number;

  /** File format */
  format: DataFileFormat;

  /** Partition values for this file */
  partitions: PartitionValue[];

  /** File-level statistics for query planning */
  stats: FileStats;

  /** Optional: LSN range for CDC ordering */
  lsnRange?: LsnRange;

  /** Optional: Source DO identifier */
  sourceDoId?: string;
}

/**
 * Supported data file formats
 */
export type DataFileFormat = 'columnar-json-lite' | 'parquet' | 'avro' | 'json';

/**
 * File-level statistics
 */
export interface FileStats {
  /** Total row count in file */
  rowCount: number;

  /** Per-column statistics for pruning */
  columnStats: Record<string, ColumnStats>;
}

/**
 * Column-level statistics (zone maps)
 */
export interface ColumnStats {
  /** Minimum value (for range pruning) */
  min?: unknown;

  /** Maximum value (for range pruning) */
  max?: unknown;

  /** Count of null values */
  nullCount: number;

  /** Estimated distinct values (HLL or count) */
  distinctCount?: number;

  /** Total size of values in bytes */
  sizeBytes?: number;
}

/**
 * LSN range for CDC ordering
 */
export interface LsnRange {
  minLsn: string;  // Using string for bigint serialization
  maxLsn: string;
}

// =============================================================================
// Partition Types
// =============================================================================

/**
 * Partition specification
 */
export interface PartitionSpec {
  /** Partition spec ID */
  specId: number;

  /** Partition fields */
  fields: PartitionField[];
}

/**
 * Partition field definition
 */
export interface PartitionField {
  /** Field ID */
  fieldId: number;

  /** Source column name */
  sourceColumn: string;

  /** Transform to apply */
  transform: PartitionTransform;

  /** Result partition name */
  name: string;
}

/**
 * Partition transforms
 */
export type PartitionTransform =
  | { type: 'identity' }
  | { type: 'year' }
  | { type: 'month' }
  | { type: 'day' }
  | { type: 'hour' }
  | { type: 'bucket'; numBuckets: number }
  | { type: 'truncate'; width: number };

/**
 * Concrete partition value
 */
export interface PartitionValue {
  /** Partition field name */
  name: string;

  /** Partition value */
  value: string | number | null;
}

// =============================================================================
// Query and Filter Types
// =============================================================================

/**
 * Query filter for partition pruning
 */
export interface QueryFilter {
  /** Partition filters */
  partitions?: Record<string, PartitionFilter>;

  /** Column filters (for zone map pruning) */
  columns?: Record<string, ColumnFilter>;

  /** Time-travel: specific snapshot ID */
  snapshotId?: string;

  /** Time-travel: as-of timestamp */
  asOfTimestamp?: number;
}

/**
 * Partition filter operations
 */
export type PartitionFilter =
  | { eq: string | number }
  | { in: (string | number)[] }
  | { gte: number; lte?: number }
  | { lte: number; gte?: number }
  | { between: [number, number] };

/**
 * Column filter for zone map pruning
 */
export type ColumnFilter =
  | { eq: unknown }
  | { ne: unknown }
  | { gt: unknown }
  | { gte: unknown }
  | { lt: unknown }
  | { lte: unknown }
  | { between: [unknown, unknown] }
  | { isNull: boolean };

// =============================================================================
// Operation Types
// =============================================================================

/**
 * Options for creating a new table
 */
export interface CreateTableOptions {
  /** R2 location path */
  location: string;

  /** Initial schema */
  schema: Omit<Schema, 'schemaId' | 'version' | 'createdAt'>;

  /** Partition fields */
  partitionBy?: Omit<PartitionField, 'fieldId'>[];

  /** Custom properties */
  properties?: Record<string, string>;
}

/**
 * Options for appending files
 */
export interface AppendFilesOptions {
  /** Files to append */
  files: Omit<ManifestFile, 'path'>[];

  /** Operation metadata */
  metadata?: Record<string, string>;

  /** Source DO IDs for CDC tracking */
  sourceDoIds?: string[];
}

/**
 * Options for compaction
 */
export interface CompactOptions {
  /** Maximum files per compacted output */
  maxFilesPerOutput?: number;

  /** Target file size in bytes */
  targetFileSizeBytes?: number;

  /** Only compact files smaller than this */
  minFileSizeBytes?: number;

  /** Partition filter to limit compaction scope */
  partitionFilter?: Record<string, PartitionFilter>;
}

// =============================================================================
// Storage Adapter Types
// =============================================================================

/**
 * R2 storage adapter interface for lakehouse operations.
 *
 * @deprecated Use StorageProvider from @evodb/core instead.
 * This interface is maintained for backward compatibility with existing
 * lakehouse code. For JSON operations, wrap StorageProvider with JSON
 * serialization/deserialization.
 *
 * Migration guide:
 * - readBinary() -> provider.get()
 * - writeBinary() -> provider.put()
 * - readJson() -> JSON.parse(new TextDecoder().decode(await provider.get()))
 * - writeJson() -> provider.put(path, new TextEncoder().encode(JSON.stringify()))
 * - list() -> provider.list()
 * - delete() -> provider.delete()
 * - exists() -> provider.exists()
 *
 * @example
 * ```typescript
 * // Old code using R2StorageAdapter
 * const adapter: R2StorageAdapter = ...;
 * const manifest = await adapter.readJson<TableManifest>('_manifest.json');
 *
 * // New code using StorageProvider
 * import { StorageProvider } from '@evodb/core';
 * const provider: StorageProvider = ...;
 * const data = await provider.get('_manifest.json');
 * const manifest = data ? JSON.parse(new TextDecoder().decode(data)) : null;
 * ```
 */
export interface R2StorageAdapter {
  /** Read a file as JSON */
  readJson<T>(path: string): Promise<T | null>;

  /** Write JSON to a file */
  writeJson(path: string, data: unknown): Promise<void>;

  /** Read binary data */
  readBinary(path: string): Promise<Uint8Array | null>;

  /** Write binary data */
  writeBinary(path: string, data: Uint8Array): Promise<void>;

  /** List files with prefix */
  list(prefix: string): Promise<string[]>;

  /** Delete a file */
  delete(path: string): Promise<void>;

  /** Check if file exists */
  exists(path: string): Promise<boolean>;

  /** Get file metadata */
  head(path: string): Promise<FileMetadata | null>;
}

/**
 * File metadata from R2
 */
export interface FileMetadata {
  size: number;
  lastModified: Date;
  etag?: string;
}

// =============================================================================
// Path Constants
// =============================================================================

/**
 * Well-known paths within a table location
 */
export const TablePaths = {
  MANIFEST: '_manifest.json',
  SCHEMA_DIR: '_schema',
  DATA_DIR: 'data',
  SNAPSHOTS_DIR: 'snapshots',
} as const;

/**
 * Build schema file path
 */
export function schemaPath(schemaId: number): string {
  return `${TablePaths.SCHEMA_DIR}/v${schemaId}.json`;
}

/**
 * Build snapshot file path
 */
export function snapshotPath(snapshotId: string): string {
  return `${TablePaths.SNAPSHOTS_DIR}/${snapshotId}.json`;
}

/**
 * Build data file path with partition structure
 */
export function dataFilePath(partitions: PartitionValue[], filename: string): string {
  const partitionPath = partitions
    .map(p => `${p.name}=${p.value ?? '__null__'}`)
    .join('/');
  return partitionPath
    ? `${TablePaths.DATA_DIR}/${partitionPath}/${filename}`
    : `${TablePaths.DATA_DIR}/${filename}`;
}
