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
    alternatives: Array<{
        mode: PartitionMode;
        reason: string;
    }>;
}
/** 2MB in bytes - DO SQLite blob limit */
export declare const DO_SQLITE_MAX_BYTES: number;
/** 500MB in bytes - Standard edge cache limit */
export declare const STANDARD_MAX_BYTES: number;
/** 5GB in bytes - Enterprise edge cache limit */
export declare const ENTERPRISE_MAX_BYTES: number;
/** Default block size for DO-SQLite mode (256KB) */
export declare const DO_SQLITE_BLOCK_SIZE: number;
/** Default block size for standard mode (4MB) */
export declare const STANDARD_BLOCK_SIZE: number;
/** Default block size for enterprise mode (16MB) */
export declare const ENTERPRISE_BLOCK_SIZE: number;
/**
 * Configuration for DO-SQLite partition mode
 */
export declare const DO_SQLITE_CONFIG: PartitionModeConfig;
/**
 * Configuration for standard edge partition mode
 */
export declare const STANDARD_CONFIG: PartitionModeConfig;
/**
 * Configuration for enterprise edge partition mode
 */
export declare const ENTERPRISE_CONFIG: PartitionModeConfig;
/**
 * Map of all partition mode configurations
 */
export declare const PARTITION_MODE_CONFIGS: Record<PartitionMode, PartitionModeConfig>;
/**
 * Get configuration for a partition mode
 */
export declare function getPartitionModeConfig(mode: PartitionMode): PartitionModeConfig;
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
export declare function calculatePartitions(dataSizeBytes: number, mode: PartitionMode, estimatedRowCount?: number): PartitionCalculation;
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
export declare function getPartitionPath(tableLocation: string, partitionId: number, mode: PartitionMode, extension?: string): PartitionPathInfo;
/**
 * Generate paths for all partitions
 *
 * @param tableLocation - Base table location
 * @param partitionCount - Number of partitions
 * @param mode - Partition mode
 * @param extension - File extension
 * @returns Array of partition path information
 */
export declare function getAllPartitionPaths(tableLocation: string, partitionCount: number, mode: PartitionMode, extension?: string): PartitionPathInfo[];
/**
 * Parse a partition path to extract components
 *
 * @param path - Full partition path
 * @returns Partition path info or null if invalid
 */
export declare function parsePartitionPath(path: string): PartitionPathInfo | null;
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
export declare function selectPartitionMode(dataSizeBytes: number, tier?: AccountTier, options?: {
    /** Prefer DO-SQLite even if data fits */
    preferDOSqlite?: boolean;
    /** Force a specific mode */
    forceMode?: PartitionMode;
    /** Expected query pattern */
    queryPattern?: 'realtime' | 'analytical' | 'batch';
}): ModeSelectionResult;
/**
 * Format bytes as human-readable string
 */
export declare function formatBytes(bytes: number): string;
/**
 * Check if a data size fits within a single partition for a mode
 */
export declare function fitsInSinglePartition(dataSizeBytes: number, mode: PartitionMode): boolean;
/**
 * Get the recommended block size for a partition mode
 */
export declare function getRecommendedBlockSize(mode: PartitionMode): number;
/**
 * Validate that a partition mode is suitable for a data size
 */
export declare function validateModeForDataSize(dataSizeBytes: number, mode: PartitionMode): {
    valid: boolean;
    warning?: string;
};
/**
 * Calculate optimal partition boundaries for a sorted dataset
 *
 * @param totalRows - Total number of rows
 * @param dataSizeBytes - Total data size
 * @param mode - Partition mode
 * @returns Array of row counts per partition
 */
export declare function calculatePartitionBoundaries(totalRows: number, dataSizeBytes: number, mode: PartitionMode): number[];
/**
 * Estimate data size from row count and average row size
 */
export declare function estimateDataSize(rowCount: number, avgRowSizeBytes: number): number;
/**
 * Get mode by maximum partition size
 */
export declare function getModeByMaxSize(maxBytes: number): PartitionMode | null;
//# sourceMappingURL=partition-modes.d.ts.map