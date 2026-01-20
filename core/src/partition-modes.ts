/**
 * EvoDB Partition Modes
 *
 * Defines three partition modes optimized for different deployment targets:
 * - do-sqlite: 2MB max, optimized for Durable Object SQLite blob storage
 * - standard: 500MB max, standard Cloudflare edge cache
 * - enterprise: 5GB max, enterprise edge cache with extended limits
 *
 * Trade-offs:
 *
 * DO-SQLite (2MB):
 * - Pros: Lowest latency for small datasets, direct SQLite blob access
 * - Pros: No external network calls for reads within DO
 * - Pros: Transactional consistency with DO state
 * - Cons: Limited to 2MB per partition (DO SQLite blob limit)
 * - Cons: Memory pressure with many partitions
 * - Use case: High-frequency small writes, real-time data, session state
 *
 * Standard (500MB):
 * - Pros: Good balance of size and global cache distribution
 * - Pros: Works with standard Cloudflare Workers plans
 * - Pros: Efficient for medium-sized analytical workloads
 * - Cons: Requires R2 round-trip on cache miss
 * - Cons: May need multiple partitions for larger tables
 * - Use case: General-purpose analytics, time-series data, logs
 *
 * Enterprise (5GB):
 * - Pros: Maximum cache efficiency for large datasets
 * - Pros: Fewer partitions = simpler query planning
 * - Pros: Better compression ratios with larger blocks
 * - Cons: Requires enterprise plan
 * - Cons: Longer cold start on cache miss
 * - Use case: Large analytical tables, data warehousing, batch processing
 *
 * @module partition-modes
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Available partition modes
 */
export type PartitionMode = 'do-sqlite' | 'standard' | 'enterprise';

/**
 * Account tier for auto-selection
 */
export type AccountTier = 'free' | 'pro' | 'business' | 'enterprise';

/**
 * Configuration for a partition mode
 */
export interface PartitionModeConfig {
  /** Mode identifier */
  mode: PartitionMode;

  /** Maximum partition size in bytes */
  maxPartitionSizeBytes: number;

  /** Human-readable description */
  description: string;

  /** Recommended block size for writes */
  recommendedBlockSizeBytes: number;

  /** Minimum data size where this mode is efficient */
  minEfficientDataSizeBytes: number;

  /** Maximum data size this mode supports efficiently */
  maxEfficientDataSizeBytes: number;

  /** Target number of rows per partition (guideline) */
  targetRowsPerPartition: number;

  /** Whether this mode uses R2 storage */
  usesR2: boolean;

  /** Whether this mode uses DO SQLite */
  usesDOSqlite: boolean;

  /** Cache TTL hint in seconds */
  cacheTtlHintSeconds: number;
}

/**
 * Partition calculation result
 */
export interface PartitionCalculation {
  /** Number of partitions needed */
  partitionCount: number;

  /** Size of each partition in bytes (last may be smaller) */
  partitionSizeBytes: number;

  /** Estimated rows per partition */
  rowsPerPartition: number;

  /** The partition mode used */
  mode: PartitionMode;

  /** Whether the data fits in a single partition */
  isSinglePartition: boolean;
}

/**
 * Partition path components
 */
export interface PartitionPathInfo {
  /** Full R2/storage path */
  path: string;

  /** Table location prefix */
  tableLocation: string;

  /** Partition identifier (0-indexed) */
  partitionId: number;

  /** File extension */
  extension: string;

  /** Partition mode used */
  mode: PartitionMode;
}

/**
 * Mode selection result
 */
export interface ModeSelectionResult {
  /** Selected partition mode */
  mode: PartitionMode;

  /** Configuration for the selected mode */
  config: PartitionModeConfig;

  /** Reason for selection */
  reason: string;

  /** Alternative modes considered */
  alternatives: Array<{ mode: PartitionMode; reason: string }>;
}

// =============================================================================
// Constants
// =============================================================================

/** 2MB in bytes - DO SQLite blob limit */
export const DO_SQLITE_MAX_BYTES = 2 * 1024 * 1024;

/** 500MB in bytes - Standard edge cache limit */
export const STANDARD_MAX_BYTES = 500 * 1024 * 1024;

/** 5GB in bytes - Enterprise edge cache limit */
export const ENTERPRISE_MAX_BYTES = 5 * 1024 * 1024 * 1024;

/** Default block size for DO-SQLite mode (256KB) */
export const DO_SQLITE_BLOCK_SIZE = 256 * 1024;

/** Default block size for standard mode (4MB) */
export const STANDARD_BLOCK_SIZE = 4 * 1024 * 1024;

/** Default block size for enterprise mode (16MB) */
export const ENTERPRISE_BLOCK_SIZE = 16 * 1024 * 1024;

// =============================================================================
// Mode Configurations
// =============================================================================

/**
 * Configuration for DO-SQLite partition mode
 */
export const DO_SQLITE_CONFIG: PartitionModeConfig = {
  mode: 'do-sqlite',
  maxPartitionSizeBytes: DO_SQLITE_MAX_BYTES,
  description: 'Optimized for Durable Object SQLite blob storage (2MB limit)',
  recommendedBlockSizeBytes: DO_SQLITE_BLOCK_SIZE,
  minEfficientDataSizeBytes: 0,
  maxEfficientDataSizeBytes: 10 * 1024 * 1024, // 10MB before recommending standard
  targetRowsPerPartition: 10_000,
  usesR2: false,
  usesDOSqlite: true,
  cacheTtlHintSeconds: 0, // No external cache needed
};

/**
 * Configuration for standard edge partition mode
 */
export const STANDARD_CONFIG: PartitionModeConfig = {
  mode: 'standard',
  maxPartitionSizeBytes: STANDARD_MAX_BYTES,
  description: 'Standard Cloudflare edge cache (500MB limit)',
  recommendedBlockSizeBytes: STANDARD_BLOCK_SIZE,
  minEfficientDataSizeBytes: 1 * 1024 * 1024, // 1MB
  maxEfficientDataSizeBytes: 10 * 1024 * 1024 * 1024, // 10GB before recommending enterprise
  targetRowsPerPartition: 1_000_000,
  usesR2: true,
  usesDOSqlite: false,
  cacheTtlHintSeconds: 3600, // 1 hour
};

/**
 * Configuration for enterprise edge partition mode
 */
export const ENTERPRISE_CONFIG: PartitionModeConfig = {
  mode: 'enterprise',
  maxPartitionSizeBytes: ENTERPRISE_MAX_BYTES,
  description: 'Enterprise Cloudflare edge cache (5GB limit)',
  recommendedBlockSizeBytes: ENTERPRISE_BLOCK_SIZE,
  minEfficientDataSizeBytes: 100 * 1024 * 1024, // 100MB
  maxEfficientDataSizeBytes: Number.MAX_SAFE_INTEGER,
  targetRowsPerPartition: 10_000_000,
  usesR2: true,
  usesDOSqlite: false,
  cacheTtlHintSeconds: 86400, // 24 hours
};

/**
 * Map of all partition mode configurations
 */
export const PARTITION_MODE_CONFIGS: Record<PartitionMode, PartitionModeConfig> = {
  'do-sqlite': DO_SQLITE_CONFIG,
  'standard': STANDARD_CONFIG,
  'enterprise': ENTERPRISE_CONFIG,
};

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Get configuration for a partition mode
 */
export function getPartitionModeConfig(mode: PartitionMode): PartitionModeConfig {
  return PARTITION_MODE_CONFIGS[mode];
}

/**
 * Calculate the number of partitions needed for a given data size
 *
 * @param dataSizeBytes - Total size of data in bytes
 * @param mode - Partition mode to use
 * @param estimatedRowCount - Optional estimated row count for better planning
 * @returns Partition calculation details
 *
 * @example
 * ```ts
 * const calc = calculatePartitions(1024 * 1024 * 1024, 'standard'); // 1GB
 * console.log(calc.partitionCount); // 2 partitions for 500MB each
 * ```
 */
export function calculatePartitions(
  dataSizeBytes: number,
  mode: PartitionMode,
  estimatedRowCount?: number
): PartitionCalculation {
  const config = getPartitionModeConfig(mode);
  const maxSize = config.maxPartitionSizeBytes;

  // Handle edge cases
  if (dataSizeBytes <= 0) {
    return {
      partitionCount: 1,
      partitionSizeBytes: 0,
      rowsPerPartition: 0,
      mode,
      isSinglePartition: true,
    };
  }

  // Calculate partition count (ceiling division)
  const partitionCount = Math.ceil(dataSizeBytes / maxSize);
  const isSinglePartition = partitionCount === 1;

  // Calculate even distribution
  const partitionSizeBytes = isSinglePartition
    ? dataSizeBytes
    : Math.ceil(dataSizeBytes / partitionCount);

  // Estimate rows per partition
  const rowsPerPartition = estimatedRowCount
    ? Math.ceil(estimatedRowCount / partitionCount)
    : config.targetRowsPerPartition;

  return {
    partitionCount,
    partitionSizeBytes,
    rowsPerPartition,
    mode,
    isSinglePartition,
  };
}

/**
 * Generate the storage path for a partition
 *
 * @param tableLocation - Base table location (e.g., "com/example/api/users")
 * @param partitionId - Partition identifier (0-indexed)
 * @param mode - Partition mode being used
 * @param extension - File extension (default: 'bin' for columnar data)
 * @returns Partition path information
 *
 * @example
 * ```ts
 * const path = getPartitionPath('com/example/api/users', 0, 'standard');
 * // path.path = 'com/example/api/users/data/part-00000.bin'
 * ```
 */
export function getPartitionPath(
  tableLocation: string,
  partitionId: number,
  mode: PartitionMode,
  extension = 'bin'
): PartitionPathInfo {
  // Normalize table location (remove trailing slashes)
  const normalizedLocation = tableLocation.replace(/\/+$/, '');

  // Format partition ID with zero-padding for lexicographic sorting
  const paddedId = partitionId.toString().padStart(5, '0');

  // Build path based on mode
  let path: string;
  if (mode === 'do-sqlite') {
    // DO-SQLite uses a flat structure within the DO
    path = `${normalizedLocation}/blobs/part-${paddedId}.${extension}`;
  } else {
    // R2 modes use Iceberg-style data directory
    path = `${normalizedLocation}/data/part-${paddedId}.${extension}`;
  }

  return {
    path,
    tableLocation: normalizedLocation,
    partitionId,
    extension,
    mode,
  };
}

/**
 * Generate paths for all partitions
 *
 * @param tableLocation - Base table location
 * @param partitionCount - Number of partitions
 * @param mode - Partition mode
 * @param extension - File extension
 * @returns Array of partition path information
 */
export function getAllPartitionPaths(
  tableLocation: string,
  partitionCount: number,
  mode: PartitionMode,
  extension = 'bin'
): PartitionPathInfo[] {
  return Array.from({ length: partitionCount }, (_, i) =>
    getPartitionPath(tableLocation, i, mode, extension)
  );
}

/**
 * Parse a partition path to extract components
 *
 * @param path - Full partition path
 * @returns Partition path info or null if invalid
 */
export function parsePartitionPath(path: string): PartitionPathInfo | null {
  // Match patterns like:
  // - .../blobs/part-00000.bin (do-sqlite)
  // - .../data/part-00000.bin (standard/enterprise)
  const match = path.match(/^(.+)\/(blobs|data)\/part-(\d+)\.(\w+)$/);
  if (!match) return null;

  const [, tableLocation, dir, partitionIdStr, extension] = match;
  const partitionId = parseInt(partitionIdStr, 10);
  const mode: PartitionMode = dir === 'blobs' ? 'do-sqlite' : 'standard';

  return {
    path,
    tableLocation,
    partitionId,
    extension,
    mode,
  };
}

// =============================================================================
// Mode Selection
// =============================================================================

/**
 * Auto-select the best partition mode based on data size and account tier
 *
 * @param dataSizeBytes - Total data size in bytes
 * @param tier - Account tier (affects available modes)
 * @param options - Additional selection options
 * @returns Mode selection result with reasoning
 *
 * @example
 * ```ts
 * const result = selectPartitionMode(1024 * 1024 * 100, 'pro'); // 100MB
 * console.log(result.mode); // 'standard'
 * console.log(result.reason); // 'Data size (100MB) fits standard mode efficiently'
 * ```
 */
export function selectPartitionMode(
  dataSizeBytes: number,
  tier: AccountTier = 'pro',
  options: {
    /** Prefer DO-SQLite even if data fits */
    preferDOSqlite?: boolean;
    /** Force a specific mode */
    forceMode?: PartitionMode;
    /** Expected query pattern */
    queryPattern?: 'realtime' | 'analytical' | 'batch';
  } = {}
): ModeSelectionResult {
  // Handle forced mode
  if (options.forceMode) {
    const config = getPartitionModeConfig(options.forceMode);
    return {
      mode: options.forceMode,
      config,
      reason: `Forced mode: ${options.forceMode}`,
      alternatives: [],
    };
  }

  const alternatives: Array<{ mode: PartitionMode; reason: string }> = [];

  // Check if enterprise mode is available
  const enterpriseAvailable = tier === 'enterprise';

  // Small data: prefer DO-SQLite
  if (dataSizeBytes <= DO_SQLITE_CONFIG.maxEfficientDataSizeBytes) {
    if (options.preferDOSqlite || options.queryPattern === 'realtime') {
      return {
        mode: 'do-sqlite',
        config: DO_SQLITE_CONFIG,
        reason: `Data size (${formatBytes(dataSizeBytes)}) is small enough for DO-SQLite with lowest latency`,
        alternatives: [
          { mode: 'standard', reason: 'Could use standard mode but DO-SQLite has lower latency' },
        ],
      };
    }

    // Default to DO-SQLite for very small data
    if (dataSizeBytes <= DO_SQLITE_MAX_BYTES) {
      return {
        mode: 'do-sqlite',
        config: DO_SQLITE_CONFIG,
        reason: `Data size (${formatBytes(dataSizeBytes)}) fits in single DO-SQLite partition`,
        alternatives: [
          { mode: 'standard', reason: 'Could use standard mode for R2 persistence' },
        ],
      };
    }
  }

  // Medium data: use standard mode
  if (dataSizeBytes <= STANDARD_CONFIG.maxEfficientDataSizeBytes) {
    alternatives.push({
      mode: 'do-sqlite',
      reason: `Would require ${Math.ceil(dataSizeBytes / DO_SQLITE_MAX_BYTES)} DO-SQLite partitions`,
    });

    if (enterpriseAvailable) {
      alternatives.push({
        mode: 'enterprise',
        reason: 'Available but standard mode is more efficient for this size',
      });
    }

    return {
      mode: 'standard',
      config: STANDARD_CONFIG,
      reason: `Data size (${formatBytes(dataSizeBytes)}) fits standard mode efficiently`,
      alternatives,
    };
  }

  // Large data: prefer enterprise if available
  if (enterpriseAvailable) {
    alternatives.push({
      mode: 'standard',
      reason: `Would require ${Math.ceil(dataSizeBytes / STANDARD_MAX_BYTES)} standard partitions`,
    });

    return {
      mode: 'enterprise',
      config: ENTERPRISE_CONFIG,
      reason: `Data size (${formatBytes(dataSizeBytes)}) benefits from enterprise cache limits`,
      alternatives,
    };
  }

  // Fall back to standard mode for non-enterprise accounts
  return {
    mode: 'standard',
    config: STANDARD_CONFIG,
    reason: `Data size (${formatBytes(dataSizeBytes)}) will use multiple standard partitions (enterprise mode not available)`,
    alternatives: [
      {
        mode: 'enterprise',
        reason: 'Would be more efficient but requires enterprise tier',
      },
    ],
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Format bytes as human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Check if a data size fits within a single partition for a mode
 */
export function fitsInSinglePartition(dataSizeBytes: number, mode: PartitionMode): boolean {
  const config = getPartitionModeConfig(mode);
  return dataSizeBytes <= config.maxPartitionSizeBytes;
}

/**
 * Get the recommended block size for a partition mode
 */
export function getRecommendedBlockSize(mode: PartitionMode): number {
  return getPartitionModeConfig(mode).recommendedBlockSizeBytes;
}

/**
 * Validate that a partition mode is suitable for a data size
 */
export function validateModeForDataSize(
  dataSizeBytes: number,
  mode: PartitionMode
): { valid: boolean; warning?: string } {
  const config = getPartitionModeConfig(mode);

  // Check if mode is efficient for this size
  if (dataSizeBytes > config.maxEfficientDataSizeBytes) {
    return {
      valid: true,
      warning: `Data size (${formatBytes(dataSizeBytes)}) exceeds efficient range for ${mode} mode. Consider upgrading to a larger mode.`,
    };
  }

  if (dataSizeBytes < config.minEfficientDataSizeBytes && mode !== 'do-sqlite') {
    return {
      valid: true,
      warning: `Data size (${formatBytes(dataSizeBytes)}) is below efficient range for ${mode} mode. Consider using do-sqlite mode.`,
    };
  }

  return { valid: true };
}

/**
 * Calculate optimal partition boundaries for a sorted dataset
 *
 * @param totalRows - Total number of rows
 * @param dataSizeBytes - Total data size
 * @param mode - Partition mode
 * @returns Array of row counts per partition
 */
export function calculatePartitionBoundaries(
  totalRows: number,
  dataSizeBytes: number,
  mode: PartitionMode
): number[] {
  const { partitionCount } = calculatePartitions(dataSizeBytes, mode, totalRows);

  if (partitionCount === 1) {
    return [totalRows];
  }

  // Distribute rows evenly across partitions
  const baseRowsPerPartition = Math.floor(totalRows / partitionCount);
  const remainder = totalRows % partitionCount;

  const boundaries: number[] = [];
  for (let i = 0; i < partitionCount; i++) {
    // Distribute remainder across first few partitions
    const extra = i < remainder ? 1 : 0;
    boundaries.push(baseRowsPerPartition + extra);
  }

  return boundaries;
}

/**
 * Estimate data size from row count and average row size
 */
export function estimateDataSize(rowCount: number, avgRowSizeBytes: number): number {
  return rowCount * avgRowSizeBytes;
}

/**
 * Get mode by maximum partition size
 */
export function getModeByMaxSize(maxBytes: number): PartitionMode | null {
  if (maxBytes <= DO_SQLITE_MAX_BYTES) return 'do-sqlite';
  if (maxBytes <= STANDARD_MAX_BYTES) return 'standard';
  if (maxBytes <= ENTERPRISE_MAX_BYTES) return 'enterprise';
  return null;
}
