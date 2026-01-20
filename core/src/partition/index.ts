/**
 * @evodb/core/partition - Partition modes
 *
 * This submodule exports partition mode configuration and utilities for:
 * - DO-SQLite (2MB max)
 * - Standard (500MB max)
 * - Enterprise (5GB max)
 *
 * @module partition
 */

export {
  // Types
  type PartitionMode,
  type AccountTier,
  type PartitionModeConfig,
  type PartitionCalculation,
  type PartitionPathInfo,
  type ModeSelectionResult,
  // Constants
  DO_SQLITE_MAX_BYTES,
  STANDARD_MAX_BYTES,
  ENTERPRISE_MAX_BYTES,
  DO_SQLITE_BLOCK_SIZE,
  STANDARD_BLOCK_SIZE,
  ENTERPRISE_BLOCK_SIZE,
  DO_SQLITE_CONFIG,
  STANDARD_CONFIG,
  ENTERPRISE_CONFIG,
  PARTITION_MODE_CONFIGS,
  // Config getters
  getPartitionModeConfig,
  // Core functions
  calculatePartitions,
  getPartitionPath,
  getAllPartitionPaths,
  parsePartitionPath,
  selectPartitionMode,
  // Utilities
  formatBytes,
  fitsInSinglePartition,
  getRecommendedBlockSize,
  validateModeForDataSize,
  calculatePartitionBoundaries,
  estimateDataSize,
  getModeByMaxSize,
} from '../partition-modes.js';
