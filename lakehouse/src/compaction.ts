/**
 * Compaction operations for lakehouse tables
 *
 * This module handles file compaction to optimize storage and query performance:
 * - selectFilesForCompaction() - Identify small files to merge
 * - compact() - Create compaction snapshot
 * - generateCompactionPlan() - Plan optimal compaction strategy
 * - analyzeCompaction() - Analyze compaction opportunities
 */

import type {
  TableManifest,
  Snapshot,
  ManifestFile,
  PartitionValue,
  FileStats,
  ColumnStats,
  CompactOptions,
  PartitionFilter,
} from './types.js';
import { pruneFiles } from './partition.js';
import { createCompactSnapshot, createSnapshotRef } from './snapshot.js';
import { buildPartitionPath } from './path.js';

// =============================================================================
// Basic Compaction
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

  const totalRows = snapshot.manifestList.reduce((sum, f) => sum + f.stats.rowCount, 0);
  const totalSizeBytes = snapshot.manifestList.reduce((sum, f) => sum + f.length, 0);

  const newManifest: TableManifest = {
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

  return { manifest: newManifest, snapshot };
}

// =============================================================================
// Enhanced Compaction Types
// =============================================================================

/**
 * Compaction plan describes files to merge and expected output
 */
export interface CompactionPlan {
  groups: CompactionGroup[];
  totalFilesToCompact: number;
  totalBytesToCompact: number;
  estimatedOutputFiles: number;
  estimatedBytesSavings: number;
}

/**
 * A group of files to compact into one or more output files
 */
export interface CompactionGroup {
  files: ManifestFile[];
  partitions: PartitionValue[];
  totalBytes: number;
  totalRows: number;
  reason: 'small_files' | 'fragmentation' | 'cold_data' | 'manual';
}

/**
 * Options for generating a compaction plan
 */
export interface CompactionPlanOptions {
  minFileSizeBytes?: number;
  targetFileSizeBytes?: number;
  maxFilesPerGroup?: number;
  minFilesPerGroup?: number;
  partitionFilter?: Record<string, PartitionFilter>;
  olderThan?: number;
  reason?: 'small_files' | 'fragmentation' | 'cold_data' | 'manual';
}

/**
 * Result of executing a compaction
 */
export interface CompactionResult {
  originalFiles: ManifestFile[];
  compactedFiles: ManifestFile[];
  bytesBefore: number;
  bytesAfter: number;
  filesBefore: number;
  filesAfter: number;
  durationMs: number;
}

/**
 * Compaction analysis results
 */
export interface CompactionAnalysis {
  totalFiles: number;
  eligibleFiles: number;
  partitionsWithCandidates: number;
  avgFilesPerPartition: number;
  fragmentationRatio: number;
  estimatedSavingsPercent: number;
  recommendation: 'none' | 'low_priority' | 'recommended' | 'urgent';
}

// =============================================================================
// Enhanced Compaction Functions
// =============================================================================

/**
 * Generate a compaction plan for a snapshot
 */
export function generateCompactionPlan(
  snapshot: Snapshot,
  options: CompactionPlanOptions = {}
): CompactionPlan {
  const {
    minFileSizeBytes = 1024 * 1024,
    targetFileSizeBytes = 128 * 1024 * 1024,
    maxFilesPerGroup = 100,
    minFilesPerGroup = 2,
    partitionFilter,
    reason = 'small_files',
  } = options;

  let files = snapshot.manifestList;

  if (partitionFilter) {
    files = pruneFiles(files, { partitions: partitionFilter });
  }

  files = files.filter(f => f.length < minFileSizeBytes);

  const partitionGroups = new Map<string, ManifestFile[]>();

  for (const file of files) {
    const partitionKey = buildPartitionPath(file.partitions);
    const group = partitionGroups.get(partitionKey) ?? [];
    group.push(file);
    partitionGroups.set(partitionKey, group);
  }

  const groups: CompactionGroup[] = [];
  let totalFilesToCompact = 0;
  let totalBytesToCompact = 0;
  let estimatedOutputFiles = 0;

  for (const [, partitionFiles] of partitionGroups) {
    if (partitionFiles.length < minFilesPerGroup) continue;

    partitionFiles.sort((a, b) => a.length - b.length);

    let currentGroup: ManifestFile[] = [];
    let currentGroupBytes = 0;

    for (const file of partitionFiles) {
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

  const fileOverhead = 4096;
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
 * Execute compaction for a single group (planning function)
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
  const mergedColumnStats: Record<string, ColumnStats> = {};

  for (const file of group.files) {
    for (const [column, stats] of Object.entries(file.stats.columnStats)) {
      const existing = mergedColumnStats[column];
      if (!existing) {
        mergedColumnStats[column] = { ...stats };
      } else {
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
          existing.distinctCount = Math.min(totalRows, existing.distinctCount + stats.distinctCount);
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

  const partitionGroups = new Map<string, ManifestFile[]>();
  for (const file of smallFiles) {
    const key = buildPartitionPath(file.partitions);
    const group = partitionGroups.get(key) ?? [];
    group.push(file);
    partitionGroups.set(key, group);
  }

  const partitionsWithCandidates = [...partitionGroups.values()].filter(g => g.length >= 2).length;

  const avgFilesPerPartition =
    partitionsWithCandidates > 0 ? eligibleFiles / partitionsWithCandidates : 0;

  const fragmentationRatio = totalFiles > 0 ? eligibleFiles / totalFiles : 0;

  const fileOverhead = 4096;
  const potentialMerges = [...partitionGroups.values()]
    .filter(g => g.length >= 2)
    .reduce((sum, g) => sum + g.length - 1, 0);
  const totalBytes = snapshot.manifestList.reduce((sum, f) => sum + f.length, 0);
  const estimatedSavingsPercent =
    totalBytes > 0 ? ((potentialMerges * fileOverhead) / totalBytes) * 100 : 0;

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
 * Create compaction commit from results
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
  const allOriginalFiles: ManifestFile[] = [];
  const allCompactedFiles: ManifestFile[] = [];

  for (const result of compactionResults) {
    allOriginalFiles.push(...result.originalFiles);
    allCompactedFiles.push(...result.compactedFiles);
  }

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

  const totalRows = snapshot.manifestList.reduce((sum, f) => sum + f.stats.rowCount, 0);
  const totalSizeBytes = snapshot.manifestList.reduce((sum, f) => sum + f.length, 0);

  const newManifest: TableManifest = {
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

  return { manifest: newManifest, snapshot };
}
