/**
 * TableManifest CRUD operations
 * Core manifest management for lakehouse tables
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
  AppendFilesOptions,
  CompactOptions,
  QueryFilter,
  DataFileFormat,
  PartitionFilter,
} from './types.js';
import { dataFilePath, CURRENT_MANIFEST_VERSION, VersionMismatchError } from './types.js';
import { createSchema, createSchemaRef } from './schema.js';
import { createPartitionSpec, pruneFiles } from './partition.js';
import {
  createAppendSnapshot,
  createOverwriteSnapshot,
  createCompactSnapshot,
  createSnapshotRef,
  findSnapshotAsOf,
  getFilesForQuery,
} from './snapshot.js';
import { generateBlockFilename, buildPartitionPath, timePartitionValues } from './path.js';
import { parseJsonWithContext } from './r2.js';

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
  options: Omit<AppendFilesOptions, 'files'> = {}
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
    options.metadata
  );

  const newManifest = updateManifestWithSnapshot(manifest, snapshot);

  return { manifest: newManifest, snapshot };
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

  const newManifest = updateManifestWithSnapshot(manifest, snapshot);

  return { manifest: newManifest, snapshot };
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
  const schemaRef = createSchemaRef(schema.schemaId);

  return {
    ...manifest,
    currentSchemaId: setAsCurrent ? schema.schemaId : manifest.currentSchemaId,
    schemas: [...manifest.schemas, schemaRef],
    updatedAt: Date.now(),
  };
}

/**
 * Set the current schema ID
 */
export function setCurrentSchema(
  manifest: TableManifest,
  schemaId: number
): TableManifest {
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
// Compaction
// =============================================================================

/**
 * Identify files that should be compacted
 */
export function selectFilesForCompaction(
  snapshot: Snapshot,
  options: CompactOptions = {}
): ManifestFile[][] {
  const { minFileSizeBytes = 1024 * 1024, partitionFilter } = options;

  let files = snapshot.manifestList;

  // Apply partition filter if specified
  if (partitionFilter) {
    files = pruneFiles(files, { partitions: partitionFilter });
  }

  // Group files by partition
  const partitionGroups = new Map<string, ManifestFile[]>();

  for (const file of files) {
    // Only compact small files
    if (file.length >= minFileSizeBytes) continue;

    const partitionKey = buildPartitionPath(file.partitions);
    const group = partitionGroups.get(partitionKey) ?? [];
    group.push(file);
    partitionGroups.set(partitionKey, group);
  }

  // Return groups with 2+ files
  return [...partitionGroups.values()].filter(group => group.length >= 2);
}

/**
 * Create a compaction snapshot
 */
export function compact(
  manifest: TableManifest,
  currentSnapshot: Snapshot,
  compactedFiles: ManifestFile[],
  originalFiles: ManifestFile[],
  metadata?: Record<string, string>
): {
  manifest: TableManifest;
  snapshot: Snapshot;
} {
  const snapshot = createCompactSnapshot(
    manifest.currentSnapshotId,
    manifest.currentSchemaId,
    compactedFiles,
    originalFiles,
    currentSnapshot.manifestList,
    metadata
  );

  const newManifest = updateManifestWithSnapshot(manifest, snapshot);

  return { manifest: newManifest, snapshot };
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

// =============================================================================
// Properties
// =============================================================================

/**
 * Set table property
 */
export function setProperty(
  manifest: TableManifest,
  key: string,
  value: string
): TableManifest {
  return {
    ...manifest,
    properties: { ...manifest.properties, [key]: value },
    updatedAt: Date.now(),
  };
}

/**
 * Remove table property
 */
export function removeProperty(
  manifest: TableManifest,
  key: string
): TableManifest {
  const { [key]: _, ...rest } = manifest.properties;
  return {
    ...manifest,
    properties: rest,
    updatedAt: Date.now(),
  };
}

/**
 * Set multiple properties
 */
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

/**
 * Recompute table statistics from snapshot
 */
export function recomputeStats(manifest: TableManifest, snapshot: Snapshot | null): TableManifest {
  if (!snapshot) {
    return {
      ...manifest,
      stats: {
        totalRows: 0,
        totalFiles: 0,
        totalSizeBytes: 0,
        lastSnapshotTimestamp: null,
      },
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
// Serialization
// =============================================================================

/**
 * Serialize manifest to JSON
 *
 * Ensures the manifest has the current schema version set before serialization.
 */
export function serializeManifest(manifest: TableManifest): string {
  // Ensure schemaVersion is set to current version
  const manifestWithVersion: TableManifest = {
    ...manifest,
    schemaVersion: manifest.schemaVersion ?? CURRENT_MANIFEST_VERSION,
  };
  return JSON.stringify(manifestWithVersion, null, 2);
}

/**
 * Deserialize manifest from JSON
 *
 * Handles version compatibility:
 * - Legacy manifests (without schemaVersion) are treated as version 1
 * - Future versions (> CURRENT_MANIFEST_VERSION) throw VersionMismatchError
 *
 * @throws {JsonParseError} If the JSON is invalid
 * @throws {VersionMismatchError} If manifest version is higher than supported
 * @throws {ManifestError} If formatVersion is invalid
 */
export function deserializeManifest(json: string): TableManifest {
  const parsed = parseJsonWithContext<Record<string, unknown>>(json, 'manifest');

  // Handle schema version - default to 1 for backward compatibility with legacy manifests
  const schemaVersion = typeof parsed.schemaVersion === 'number'
    ? parsed.schemaVersion
    : 1;

  // Check for future versions we don't support
  if (schemaVersion > CURRENT_MANIFEST_VERSION) {
    throw new VersionMismatchError(schemaVersion, CURRENT_MANIFEST_VERSION);
  }

  const manifest = parsed as unknown as TableManifest;

  // Validate format version
  if (manifest.formatVersion !== 1) {
    throw new ManifestError(`Unsupported format version: ${manifest.formatVersion}`);
  }

  // Ensure schemaVersion is set (for legacy manifests)
  manifest.schemaVersion = schemaVersion;

  return manifest;
}

/**
 * Validate manifest structure
 */
export function validateManifest(manifest: TableManifest): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate schema version
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
// Helper Functions
// =============================================================================

/**
 * Generate data file path based on partitions and timestamp
 */
export function generateDataFilePath(
  partitions: PartitionValue[],
  prefix = '',
  extension = 'bin'
): string {
  const filename = generateBlockFilename(prefix, extension);
  return dataFilePath(partitions, filename);
}

/**
 * Generate time-partitioned file path
 */
export function generateTimePartitionedPath(
  timestamp: number,
  granularity: 'year' | 'month' | 'day' | 'hour' = 'day',
  prefix = '',
  extension = 'bin'
): {
  path: string;
  partitions: PartitionValue[];
} {
  const partitions = timePartitionValues(timestamp, granularity);
  const path = generateDataFilePath(partitions, prefix, extension);
  return { path, partitions };
}

// =============================================================================
// Error Types
// =============================================================================

export class ManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManifestError';
  }
}

// =============================================================================
// Enhanced Compaction Support
// =============================================================================

/**
 * Compaction plan describes files to merge and expected output
 */
export interface CompactionPlan {
  /** Groups of files to compact together */
  groups: CompactionGroup[];
  /** Total files to be compacted */
  totalFilesToCompact: number;
  /** Total bytes to be compacted */
  totalBytesToCompact: number;
  /** Estimated output file count */
  estimatedOutputFiles: number;
  /** Estimated bytes savings from compaction */
  estimatedBytesSavings: number;
}

/**
 * A group of files to compact into one or more output files
 */
export interface CompactionGroup {
  /** Files in this group */
  files: ManifestFile[];
  /** Partition values (all files share these) */
  partitions: PartitionValue[];
  /** Total bytes in group */
  totalBytes: number;
  /** Total rows in group */
  totalRows: number;
  /** Reason for compaction */
  reason: 'small_files' | 'fragmentation' | 'cold_data' | 'manual';
}

/**
 * Options for generating a compaction plan
 */
export interface CompactionPlanOptions {
  /** Files smaller than this are candidates for compaction (default: 1MB) */
  minFileSizeBytes?: number;
  /** Target output file size (default: 128MB) */
  targetFileSizeBytes?: number;
  /** Maximum files per compaction group (default: 100) */
  maxFilesPerGroup?: number;
  /** Minimum files needed to trigger compaction (default: 2) */
  minFilesPerGroup?: number;
  /** Partition filter to limit scope */
  partitionFilter?: Record<string, PartitionFilter>;
  /** Include files older than this timestamp */
  olderThan?: number;
  /** Compaction reason */
  reason?: 'small_files' | 'fragmentation' | 'cold_data' | 'manual';
}

/**
 * Generate a compaction plan for a snapshot
 */
export function generateCompactionPlan(
  snapshot: Snapshot,
  options: CompactionPlanOptions = {}
): CompactionPlan {
  const {
    minFileSizeBytes = 1024 * 1024, // 1MB
    targetFileSizeBytes = 128 * 1024 * 1024, // 128MB
    maxFilesPerGroup = 100,
    minFilesPerGroup = 2,
    partitionFilter,
    olderThan,
    reason = 'small_files',
  } = options;

  let files = snapshot.manifestList;

  // Apply partition filter if specified
  if (partitionFilter) {
    files = pruneFiles(files, { partitions: partitionFilter });
  }

  // Filter by size
  files = files.filter(f => f.length < minFileSizeBytes);

  // Filter by age if specified
  if (olderThan) {
    // We don't have creation time on files, so skip this for now
    // In a real implementation, we'd track file creation timestamps
  }

  // Group files by partition
  const partitionGroups = new Map<string, ManifestFile[]>();

  for (const file of files) {
    const partitionKey = buildPartitionPath(file.partitions);
    const group = partitionGroups.get(partitionKey) ?? [];
    group.push(file);
    partitionGroups.set(partitionKey, group);
  }

  // Build compaction groups
  const groups: CompactionGroup[] = [];
  let totalFilesToCompact = 0;
  let totalBytesToCompact = 0;
  let estimatedOutputFiles = 0;

  for (const [, partitionFiles] of partitionGroups) {
    // Skip if not enough files
    if (partitionFiles.length < minFilesPerGroup) continue;

    // Sort by size (smallest first) for better bin-packing
    partitionFiles.sort((a, b) => a.length - b.length);

    // Create groups respecting maxFilesPerGroup and targetFileSizeBytes
    let currentGroup: ManifestFile[] = [];
    let currentGroupBytes = 0;

    for (const file of partitionFiles) {
      // Start new group if current is full
      if (
        currentGroup.length >= maxFilesPerGroup ||
        (currentGroupBytes > 0 && currentGroupBytes + file.length > targetFileSizeBytes)
      ) {
        if (currentGroup.length >= minFilesPerGroup) {
          const totalBytes = currentGroup.reduce((sum, f) => sum + f.length, 0);
          const totalRows = currentGroup.reduce((sum, f) => sum + f.stats.rowCount, 0);

          groups.push({
            files: currentGroup,
            partitions: currentGroup[0].partitions,
            totalBytes,
            totalRows,
            reason,
          });

          totalFilesToCompact += currentGroup.length;
          totalBytesToCompact += totalBytes;
          estimatedOutputFiles += Math.ceil(totalBytes / targetFileSizeBytes);
        }
        currentGroup = [];
        currentGroupBytes = 0;
      }

      currentGroup.push(file);
      currentGroupBytes += file.length;
    }

    // Don't forget the last group
    if (currentGroup.length >= minFilesPerGroup) {
      const totalBytes = currentGroup.reduce((sum, f) => sum + f.length, 0);
      const totalRows = currentGroup.reduce((sum, f) => sum + f.stats.rowCount, 0);

      groups.push({
        files: currentGroup,
        partitions: currentGroup[0].partitions,
        totalBytes,
        totalRows,
        reason,
      });

      totalFilesToCompact += currentGroup.length;
      totalBytesToCompact += totalBytes;
      estimatedOutputFiles += Math.ceil(totalBytes / targetFileSizeBytes);
    }
  }

  // Estimate savings (reduced file overhead)
  const fileOverhead = 4096; // Estimated per-file overhead in bytes
  const estimatedBytesSavings = Math.max(
    0,
    (totalFilesToCompact - estimatedOutputFiles) * fileOverhead
  );

  return {
    groups,
    totalFilesToCompact,
    totalBytesToCompact,
    estimatedOutputFiles,
    estimatedBytesSavings,
  };
}

/**
 * Result of executing a compaction
 */
export interface CompactionResult {
  /** Original files that were compacted */
  originalFiles: ManifestFile[];
  /** New compacted files */
  compactedFiles: ManifestFile[];
  /** Bytes before compaction */
  bytesBefore: number;
  /** Bytes after compaction */
  bytesAfter: number;
  /** Files before compaction */
  filesBefore: number;
  /** Files after compaction */
  filesAfter: number;
  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Execute compaction for a single group
 * This is a planning function - actual data merging is done externally
 */
export function planGroupCompaction(
  group: CompactionGroup,
  outputPathPrefix: string
): {
  filesToRemove: ManifestFile[];
  outputPath: string;
  expectedStats: FileStats;
} {
  const totalRows = group.files.reduce((sum, f) => sum + f.stats.rowCount, 0);

  // Merge column stats from all files
  const mergedColumnStats: Record<string, ColumnStats> = {};

  for (const file of group.files) {
    for (const [column, stats] of Object.entries(file.stats.columnStats)) {
      const existing = mergedColumnStats[column];
      if (!existing) {
        mergedColumnStats[column] = { ...stats };
      } else {
        // Merge stats
        if (stats.min !== undefined && stats.min !== null) {
          if (existing.min === undefined || existing.min === null || stats.min < existing.min) {
            existing.min = stats.min;
          }
        }
        if (stats.max !== undefined && stats.max !== null) {
          if (existing.max === undefined || existing.max === null || stats.max > existing.max) {
            existing.max = stats.max;
          }
        }
        existing.nullCount += stats.nullCount;
        if (stats.distinctCount !== undefined && existing.distinctCount !== undefined) {
          // Upper bound estimate for merged distinct count
          existing.distinctCount = Math.min(
            totalRows,
            existing.distinctCount + stats.distinctCount
          );
        }
      }
    }
  }

  const partitionPath = buildPartitionPath(group.partitions);
  const outputPath = partitionPath
    ? `${outputPathPrefix}/${partitionPath}/compacted-${Date.now().toString(36)}.bin`
    : `${outputPathPrefix}/compacted-${Date.now().toString(36)}.bin`;

  return {
    filesToRemove: group.files,
    outputPath,
    expectedStats: {
      rowCount: totalRows,
      columnStats: mergedColumnStats,
    },
  };
}

/**
 * Analyze compaction opportunities
 */
export interface CompactionAnalysis {
  /** Total files in snapshot */
  totalFiles: number;
  /** Files eligible for compaction */
  eligibleFiles: number;
  /** Partitions with compaction candidates */
  partitionsWithCandidates: number;
  /** Average files per partition (for eligible partitions) */
  avgFilesPerPartition: number;
  /** Fragmentation ratio (small files / total files) */
  fragmentationRatio: number;
  /** Estimated space savings percentage */
  estimatedSavingsPercent: number;
  /** Recommendation */
  recommendation: 'none' | 'low_priority' | 'recommended' | 'urgent';
}

/**
 * Analyze compaction opportunities for a snapshot
 */
export function analyzeCompaction(
  snapshot: Snapshot,
  options: { minFileSizeBytes?: number } = {}
): CompactionAnalysis {
  const { minFileSizeBytes = 1024 * 1024 } = options;

  const totalFiles = snapshot.manifestList.length;
  const smallFiles = snapshot.manifestList.filter(f => f.length < minFileSizeBytes);
  const eligibleFiles = smallFiles.length;

  // Group by partition
  const partitionGroups = new Map<string, ManifestFile[]>();
  for (const file of smallFiles) {
    const key = buildPartitionPath(file.partitions);
    const group = partitionGroups.get(key) ?? [];
    group.push(file);
    partitionGroups.set(key, group);
  }

  // Count partitions with 2+ small files
  const partitionsWithCandidates = [...partitionGroups.values()]
    .filter(g => g.length >= 2).length;

  const avgFilesPerPartition = partitionsWithCandidates > 0
    ? eligibleFiles / partitionsWithCandidates
    : 0;

  const fragmentationRatio = totalFiles > 0 ? eligibleFiles / totalFiles : 0;

  // Estimate savings
  const fileOverhead = 4096;
  const potentialMerges = [...partitionGroups.values()]
    .filter(g => g.length >= 2)
    .reduce((sum, g) => sum + g.length - 1, 0);
  const totalBytes = snapshot.manifestList.reduce((sum, f) => sum + f.length, 0);
  const estimatedSavingsPercent = totalBytes > 0
    ? (potentialMerges * fileOverhead / totalBytes) * 100
    : 0;

  // Determine recommendation
  let recommendation: CompactionAnalysis['recommendation'] = 'none';
  if (fragmentationRatio > 0.8 || partitionsWithCandidates > 100) {
    recommendation = 'urgent';
  } else if (fragmentationRatio > 0.5 || partitionsWithCandidates > 50) {
    recommendation = 'recommended';
  } else if (fragmentationRatio > 0.2 || partitionsWithCandidates > 10) {
    recommendation = 'low_priority';
  }

  return {
    totalFiles,
    eligibleFiles,
    partitionsWithCandidates,
    avgFilesPerPartition,
    fragmentationRatio,
    estimatedSavingsPercent,
    recommendation,
  };
}

/**
 * Create compaction commit
 */
export function createCompactionCommit(
  manifest: TableManifest,
  currentSnapshot: Snapshot,
  compactionResults: CompactionResult[],
  metadata?: Record<string, string>
): {
  manifest: TableManifest;
  snapshot: Snapshot;
} {
  // Collect all original and compacted files
  const allOriginalFiles: ManifestFile[] = [];
  const allCompactedFiles: ManifestFile[] = [];

  for (const result of compactionResults) {
    allOriginalFiles.push(...result.originalFiles);
    allCompactedFiles.push(...result.compactedFiles);
  }

  // Create compaction snapshot
  const snapshot = createCompactSnapshot(
    manifest.currentSnapshotId,
    manifest.currentSchemaId,
    allCompactedFiles,
    allOriginalFiles,
    currentSnapshot.manifestList,
    {
      ...metadata,
      compaction_groups: String(compactionResults.length),
      files_before: String(allOriginalFiles.length),
      files_after: String(allCompactedFiles.length),
    }
  );

  // Update manifest
  const newManifest = updateManifestWithSnapshot(manifest, snapshot);

  return { manifest: newManifest, snapshot };
}
