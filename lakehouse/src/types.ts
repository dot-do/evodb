/**
 * @dotdo/poc-lakehouse-manifest
 * JSON Iceberg-inspired manifest types for Cloudflare R2 lakehouse
 */

// =============================================================================
// Core Table Types
// =============================================================================

/**
 * Main table manifest - root of all table metadata
 * Designed for atomic JSON commits to R2
 */
export interface TableManifest {
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
 */
export interface Schema {
  schemaId: number;
  version: number;
  columns: SchemaColumn[];
  createdAt: number;
}

/**
 * Column definition within a schema
 */
export interface SchemaColumn {
  /** Column name/path (dot-notation for nested, e.g., "user.address.city") */
  name: string;

  /** Column data type */
  type: ColumnType;

  /** Whether column accepts null values */
  nullable: boolean;

  /** Optional default value */
  defaultValue?: unknown;

  /** Optional documentation */
  doc?: string;
}

/**
 * Supported column types (aligned with columnar-json-lite)
 */
export type ColumnType =
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
  | { type: 'array'; elementType: ColumnType }
  | { type: 'map'; keyType: ColumnType; valueType: ColumnType }
  | { type: 'struct'; fields: SchemaColumn[] };

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
 * R2 storage adapter interface
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
