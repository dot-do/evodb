/**
 * TableManifest CRUD operations
 * Core manifest management for lakehouse tables
 *
 * This module provides the essential operations for managing table manifests:
 * - createTable() - Create a new table manifest
 * - appendFiles() - Add files to a snapshot
 * - overwriteFiles() - Replace all files in a table
 * - queryFiles() - Get files for a query with filtering
 * - Serialization and validation utilities
 *
 * For compaction operations, see compaction.ts
 */

import type {
  TableManifest,
  Schema,
  Snapshot,
  ManifestFile,
  PartitionValue,
  FileStats,
  ColumnStats,
  CreateTableOptions,
  QueryFilter,
  DataFileFormat,
} from './types.js';
import { CURRENT_MANIFEST_VERSION, VersionMismatchError } from './types.js';
import { createSchema, createSchemaRef } from './schema.js';
import { createPartitionSpec } from './partition.js';
import { EvoDBError, ErrorCode, captureStackTrace } from '@evodb/core';
import {
  createAppendSnapshot,
  createOverwriteSnapshot,
  createSnapshotRef,
  findSnapshotAsOf,
  getFilesForQuery,
} from './snapshot.js';

// =============================================================================
// Table Creation
// =============================================================================

/**
 * Generate a unique table ID
 */
export function generateTableId(): string {
  return crypto.randomUUID();
}

/**
 * Create a new table manifest
 */
export function createTable(options: CreateTableOptions): {
  manifest: TableManifest;
  schema: Schema;
} {
  const tableId = generateTableId();
  const schema = createSchema(options.schema.columns);
  const partitionSpec = options.partitionBy
    ? createPartitionSpec(options.partitionBy)
    : createPartitionSpec([]);

  const manifest: TableManifest = {
    schemaVersion: CURRENT_MANIFEST_VERSION,
    formatVersion: 1,
    tableId,
    location: options.location,
    currentSchemaId: schema.schemaId,
    schemas: [createSchemaRef(schema.schemaId)],
    partitionSpec,
    currentSnapshotId: null,
    snapshots: [],
    stats: {
      totalRows: 0,
      totalFiles: 0,
      totalSizeBytes: 0,
      lastSnapshotTimestamp: null,
    },
    properties: options.properties ?? {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  return { manifest, schema };
}

// =============================================================================
// File Operations
// =============================================================================

/**
 * Create a manifest file entry
 */
export function createManifestFile(
  path: string,
  length: number,
  partitions: PartitionValue[],
  stats: FileStats,
  options: {
    format?: DataFileFormat;
    sourceDoId?: string;
    lsnRange?: { minLsn: string; maxLsn: string };
  } = {}
): ManifestFile {
  return {
    path,
    length,
    format: options.format ?? 'columnar-json-lite',
    partitions,
    stats,
    ...(options.sourceDoId && { sourceDoId: options.sourceDoId }),
    ...(options.lsnRange && { lsnRange: options.lsnRange }),
  };
}

/**
 * Build file stats from column statistics
 */
export function createFileStats(
  rowCount: number,
  columnStats: Record<string, ColumnStats>
): FileStats {
  return { rowCount, columnStats };
}

/**
 * Append files to a table (creates new snapshot)
 */
export function appendFiles(
  manifest: TableManifest,
  currentSnapshot: Snapshot | null,
  files: ManifestFile[],
  metadata?: Record<string, string>
): {
  manifest: TableManifest;
  snapshot: Snapshot;
} {
  const existingFiles = currentSnapshot?.manifestList ?? [];

  const snapshot = createAppendSnapshot(
    manifest.currentSnapshotId,
    manifest.currentSchemaId,
    files,
    existingFiles,
    metadata
  );

  return {
    manifest: updateManifestWithSnapshot(manifest, snapshot),
    snapshot,
  };
}

/**
 * Overwrite table with new files (replaces all existing)
 */
export function overwriteFiles(
  manifest: TableManifest,
  currentSnapshot: Snapshot | null,
  files: ManifestFile[],
  metadata?: Record<string, string>
): {
  manifest: TableManifest;
  snapshot: Snapshot;
} {
  const oldFiles = currentSnapshot?.manifestList ?? [];

  const snapshot = createOverwriteSnapshot(
    manifest.currentSnapshotId,
    manifest.currentSchemaId,
    files,
    oldFiles,
    metadata
  );

  return {
    manifest: updateManifestWithSnapshot(manifest, snapshot),
    snapshot,
  };
}

/**
 * Update manifest with a new snapshot
 */
function updateManifestWithSnapshot(
  manifest: TableManifest,
  snapshot: Snapshot
): TableManifest {
  const totalRows = snapshot.manifestList.reduce((sum, f) => sum + f.stats.rowCount, 0);
  const totalSizeBytes = snapshot.manifestList.reduce((sum, f) => sum + f.length, 0);

  return {
    ...manifest,
    currentSnapshotId: snapshot.snapshotId,
    snapshots: [...manifest.snapshots, createSnapshotRef(snapshot)],
    stats: {
      totalRows,
      totalFiles: snapshot.manifestList.length,
      totalSizeBytes,
      lastSnapshotTimestamp: snapshot.timestamp,
    },
    updatedAt: Date.now(),
  };
}

// =============================================================================
// Query Operations
// =============================================================================

/**
 * Get files for a query with optional time-travel and filtering
 */
export function queryFiles(
  manifest: TableManifest,
  loadSnapshot: (snapshotId: string) => Snapshot | null,
  filter?: QueryFilter
): ManifestFile[] {
  let snapshotId = manifest.currentSnapshotId;

  // Handle time-travel
  if (filter?.snapshotId) {
    snapshotId = filter.snapshotId;
  } else if (filter?.asOfTimestamp) {
    const ref = findSnapshotAsOf(manifest, filter.asOfTimestamp);
    snapshotId = ref?.snapshotId ?? null;
  }

  if (!snapshotId) {
    return []; // Empty table
  }

  const snapshot = loadSnapshot(snapshotId);
  if (!snapshot) {
    throw new ManifestError(`Snapshot ${snapshotId} not found`);
  }

  return getFilesForQuery(snapshot, filter);
}

/**
 * Get snapshot for time-travel query
 */
export function getSnapshot(
  manifest: TableManifest,
  loadSnapshot: (snapshotId: string) => Snapshot | null,
  snapshotIdOrTimestamp?: string | number
): Snapshot | null {
  let snapshotId: string | null = null;

  if (typeof snapshotIdOrTimestamp === 'string') {
    snapshotId = snapshotIdOrTimestamp;
  } else if (typeof snapshotIdOrTimestamp === 'number') {
    const ref = findSnapshotAsOf(manifest, snapshotIdOrTimestamp);
    snapshotId = ref?.snapshotId ?? null;
  } else {
    snapshotId = manifest.currentSnapshotId;
  }

  if (!snapshotId) return null;

  return loadSnapshot(snapshotId);
}

/**
 * Get files from a snapshot (convenience function for getSnapshotFiles)
 */
export function getSnapshotFiles(snapshot: Snapshot, filter?: QueryFilter): ManifestFile[] {
  return getFilesForQuery(snapshot, filter);
}

// =============================================================================
// Serialization
// =============================================================================

/**
 * Serialize manifest to JSON
 */
export function serializeManifest(manifest: TableManifest): string {
  const manifestWithVersion: TableManifest = {
    ...manifest,
    schemaVersion: manifest.schemaVersion ?? CURRENT_MANIFEST_VERSION,
  };
  return JSON.stringify(manifestWithVersion, null, 2);
}

/**
 * Type guard to validate that a parsed object has the required TableManifest structure.
 * This performs runtime validation of critical fields.
 */
function isValidManifestStructure(obj: Record<string, unknown>): obj is TableManifest {
  return (
    typeof obj.formatVersion === 'number' &&
    typeof obj.tableId === 'string' &&
    typeof obj.location === 'string' &&
    typeof obj.currentSchemaId === 'number' &&
    Array.isArray(obj.schemas) &&
    Array.isArray(obj.snapshots) &&
    typeof obj.stats === 'object' && obj.stats !== null
  );
}

/**
 * Deserialize manifest from JSON
 *
 * @throws {VersionMismatchError} If manifest version is higher than supported
 * @throws {ManifestError} If formatVersion is invalid or structure is invalid
 */
export function deserializeManifest(json: string): TableManifest {
  const parsed = JSON.parse(json) as Record<string, unknown>;

  // Handle schema version - default to 1 for backward compatibility
  const schemaVersion = typeof parsed.schemaVersion === 'number'
    ? parsed.schemaVersion
    : 1;

  // Check for future versions we don't support
  if (schemaVersion > CURRENT_MANIFEST_VERSION) {
    throw new VersionMismatchError(schemaVersion, CURRENT_MANIFEST_VERSION);
  }

  // Validate the manifest structure
  if (!isValidManifestStructure(parsed)) {
    throw new ManifestError('Invalid manifest structure: missing required fields');
  }

  // Now parsed is properly typed as TableManifest
  const manifest = parsed;

  if (manifest.formatVersion !== 1) {
    throw new ManifestError(`Unsupported format version: ${manifest.formatVersion}`);
  }

  manifest.schemaVersion = schemaVersion;

  return manifest;
}

/**
 * Validate manifest structure
 */
export function validateManifest(manifest: TableManifest): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (manifest.schemaVersion === undefined || manifest.schemaVersion === null) {
    errors.push('Missing schemaVersion');
  } else if (manifest.schemaVersion > CURRENT_MANIFEST_VERSION) {
    errors.push(
      `Unsupported schema version: ${manifest.schemaVersion} (max supported: ${CURRENT_MANIFEST_VERSION})`
    );
  }

  if (manifest.formatVersion !== 1) {
    errors.push(`Invalid format version: ${manifest.formatVersion}`);
  }

  if (!manifest.tableId) {
    errors.push('Missing tableId');
  }

  if (!manifest.location) {
    errors.push('Missing location');
  }

  if (manifest.schemas.length === 0) {
    errors.push('No schemas defined');
  }

  if (!manifest.schemas.some(s => s.schemaId === manifest.currentSchemaId)) {
    errors.push(`Current schema ID ${manifest.currentSchemaId} not found in schemas`);
  }

  if (manifest.currentSnapshotId) {
    if (!manifest.snapshots.some(s => s.snapshotId === manifest.currentSnapshotId)) {
      errors.push(`Current snapshot ID ${manifest.currentSnapshotId} not found in snapshots`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// =============================================================================
// Schema Operations
// =============================================================================

/**
 * Add a new schema version to the manifest
 */
export function addSchema(
  manifest: TableManifest,
  schema: Schema,
  setAsCurrent = true
): TableManifest {
  return {
    ...manifest,
    currentSchemaId: setAsCurrent ? schema.schemaId : manifest.currentSchemaId,
    schemas: [...manifest.schemas, createSchemaRef(schema.schemaId)],
    updatedAt: Date.now(),
  };
}

/**
 * Set the current schema ID
 */
export function setCurrentSchema(manifest: TableManifest, schemaId: number): TableManifest {
  if (!manifest.schemas.some(s => s.schemaId === schemaId)) {
    throw new ManifestError(`Schema ${schemaId} not found in manifest`);
  }
  return {
    ...manifest,
    currentSchemaId: schemaId,
    updatedAt: Date.now(),
  };
}

// =============================================================================
// Properties
// =============================================================================

/** Set table property */
export function setProperty(manifest: TableManifest, key: string, value: string): TableManifest {
  return {
    ...manifest,
    properties: { ...manifest.properties, [key]: value },
    updatedAt: Date.now(),
  };
}

/** Remove table property */
export function removeProperty(manifest: TableManifest, key: string): TableManifest {
  const { [key]: _, ...rest } = manifest.properties;
  return { ...manifest, properties: rest, updatedAt: Date.now() };
}

/** Set multiple properties */
export function setProperties(
  manifest: TableManifest,
  properties: Record<string, string>
): TableManifest {
  return {
    ...manifest,
    properties: { ...manifest.properties, ...properties },
    updatedAt: Date.now(),
  };
}

// =============================================================================
// Statistics
// =============================================================================

/** Recompute table statistics from snapshot */
export function recomputeStats(manifest: TableManifest, snapshot: Snapshot | null): TableManifest {
  if (!snapshot) {
    return {
      ...manifest,
      stats: { totalRows: 0, totalFiles: 0, totalSizeBytes: 0, lastSnapshotTimestamp: null },
      updatedAt: Date.now(),
    };
  }
  const totalRows = snapshot.manifestList.reduce((sum, f) => sum + f.stats.rowCount, 0);
  const totalSizeBytes = snapshot.manifestList.reduce((sum, f) => sum + f.length, 0);
  return {
    ...manifest,
    stats: {
      totalRows,
      totalFiles: snapshot.manifestList.length,
      totalSizeBytes,
      lastSnapshotTimestamp: snapshot.timestamp,
    },
    updatedAt: Date.now(),
  };
}

// =============================================================================
// Path Helpers
// =============================================================================

import { dataFilePath } from './types.js';
import { generateBlockFilename, timePartitionValues } from './path.js';

/** Generate data file path based on partitions and timestamp */
export function generateDataFilePath(
  partitions: PartitionValue[],
  prefix = '',
  extension = 'bin'
): string {
  return dataFilePath(partitions, generateBlockFilename(prefix, extension));
}

/** Generate time-partitioned file path */
export function generateTimePartitionedPath(
  timestamp: number,
  granularity: 'year' | 'month' | 'day' | 'hour' = 'day',
  prefix = '',
  extension = 'bin'
): { path: string; partitions: PartitionValue[] } {
  const partitions = timePartitionValues(timestamp, granularity);
  return { path: generateDataFilePath(partitions, prefix, extension), partitions };
}

// =============================================================================
// Error Types
// =============================================================================

/**
 * Error thrown when manifest operations fail.
 * Extends EvoDBError for consistent error hierarchy.
 *
 * @example
 * ```typescript
 * import { EvoDBError, ErrorCode } from '@evodb/core';
 *
 * try {
 *   await appendFiles(manifest, files);
 * } catch (e) {
 *   if (e instanceof ManifestError) {
 *     console.log(`Manifest error: ${e.message}`);
 *   }
 *   // Or catch all EvoDB errors
 *   if (e instanceof EvoDBError && e.code === ErrorCode.MANIFEST_ERROR) {
 *     // Handle manifest error
 *   }
 * }
 * ```
 */
export class ManifestError extends EvoDBError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, ErrorCode.MANIFEST_ERROR, details, 'Check manifest structure and ensure all required fields are present.');
    this.name = 'ManifestError';
    captureStackTrace(this, ManifestError);
  }
}

// =============================================================================
// Re-exports for convenience
// =============================================================================

export { pruneFiles } from './partition.js';
export { findSnapshotAsOf } from './snapshot.js';
