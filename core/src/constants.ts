/**
 * EvoDB Common Constants
 *
 * Centralized constants to replace magic numbers across the codebase.
 * All packages should import from @evodb/core instead of using inline values.
 *
 * @module constants
 */

// =============================================================================
// BYTE SIZE CONSTANTS
// =============================================================================

/** 1 Kilobyte in bytes */
export const KB = 1024;

/** 1 Megabyte in bytes */
export const MB = 1024 * 1024;

/** 1 Gigabyte in bytes */
export const GB = 1024 * 1024 * 1024;

// Common buffer sizes
/** 256 Kilobytes - DO SQLite block size */
export const BUFFER_SIZE_256KB = 256 * KB;

/** 1 Megabyte buffer */
export const BUFFER_SIZE_1MB = 1 * MB;

/** 2 Megabytes - DO SQLite blob limit, snippet chunk size */
export const BUFFER_SIZE_2MB = 2 * MB;

/** 4 Megabytes - Standard block size, max batch bytes */
export const BUFFER_SIZE_4MB = 4 * MB;

/** 16 Megabytes - Max RPC message/frame size, enterprise block size */
export const BUFFER_SIZE_16MB = 16 * MB;

/** 32 Megabytes - Parent DO flush threshold */
export const BUFFER_SIZE_32MB = 32 * MB;

/** 50 Megabytes - R2 cache size */
export const BUFFER_SIZE_50MB = 50 * MB;

/** 64 Megabytes - Fallback storage, fallback buffer */
export const BUFFER_SIZE_64MB = 64 * MB;

/** 128 Megabytes - Max buffer size, target file size */
export const BUFFER_SIZE_128MB = 128 * MB;

/** 256 Megabytes - Max block size for edge-cache mode */
export const BUFFER_SIZE_256MB = 256 * MB;

/** 500 Megabytes - Standard edge cache limit */
export const BUFFER_SIZE_500MB = 500 * MB;

/** 512 Megabytes - Max compact size */
export const BUFFER_SIZE_512MB = 512 * MB;

/** 10 Megabytes - DO-SQLite efficiency threshold */
export const BUFFER_SIZE_10MB = 10 * MB;

/** 100 Megabytes - Enterprise efficiency threshold */
export const BUFFER_SIZE_100MB = 100 * MB;

/** 1 Gigabyte - Enterprise target block size */
export const BUFFER_SIZE_1GB = 1 * GB;

/** 2 Gigabytes - Enterprise max block size */
export const BUFFER_SIZE_2GB = 2 * GB;

/** 5 Gigabytes - Enterprise edge cache limit */
export const BUFFER_SIZE_5GB = 5 * GB;

/** 10 Gigabytes - Standard efficiency threshold */
export const BUFFER_SIZE_10GB = 10 * GB;

// =============================================================================
// TIMEOUT CONSTANTS (in milliseconds)
// =============================================================================

/** 100 milliseconds - Initial retry delay */
export const TIMEOUT_100MS = 100;

/** 1 second - Batch timeout, reconnect delay, heartbeat default */
export const TIMEOUT_1S = 1_000;

/** 3 seconds - Buffer timeout for low-latency mode */
export const TIMEOUT_3S = 3_000;

/** 5 seconds - Default buffer timeout, scatter timeout */
export const TIMEOUT_5S = 5_000;

/** 10 seconds - Max retry delay, handshake/heartbeat timeout */
export const TIMEOUT_10S = 10_000;

/** 30 seconds - Operation timeout, flush interval, heartbeat interval */
export const TIMEOUT_30S = 30_000;

/** 60 seconds - Flush threshold, buffer timeout for batch mode */
export const TIMEOUT_60S = 60_000;

/** 5 minutes - Deduplication window */
export const TIMEOUT_5MIN = 300_000;

// =============================================================================
// COUNT/LIMIT CONSTANTS
// =============================================================================

/** 256 - CRC table size, PQ codes (8-bit) */
export const CRC_TABLE_SIZE = 256;

/** 1000 - Default max batch size */
export const DEFAULT_BATCH_SIZE = 1_000;

/** 10000 - Default buffer size, flush threshold entries, string pool max */
export const DEFAULT_BUFFER_SIZE = 10_000;

/** 65535 - Max dictionary size for fast lookup */
export const MAX_DICTIONARY_SIZE = 65535;

// =============================================================================
// RETRY CONSTANTS
// =============================================================================

/** Default max retries for operations */
export const DEFAULT_MAX_RETRIES = 3;

/** Maximum reconnection attempts */
export const MAX_RECONNECT_ATTEMPTS = 10;

/** Exponential backoff multiplier */
export const BACKOFF_MULTIPLIER = 2;

// =============================================================================
// PROTOCOL CONSTANTS
// =============================================================================

/** Maximum RPC message size (16MB) */
export const MAX_MESSAGE_SIZE = BUFFER_SIZE_16MB;

/** Maximum frame size (16MB) */
export const MAX_FRAME_SIZE = BUFFER_SIZE_16MB;

/** Protocol header size for RPC */
export const RPC_HEADER_SIZE = 40;

/** Frame header size */
export const FRAME_HEADER_SIZE = 16;

/** Batch header size */
export const BATCH_HEADER_SIZE = 20;

// =============================================================================
// MERGE/COMPACTION CONSTANTS
// =============================================================================

/** Minimum blocks to trigger compaction */
export const MIN_COMPACT_BLOCKS = 4;

/** Maximum blocks to merge in one operation */
export const MAX_MERGE_BLOCKS = 4;

// =============================================================================
// CACHE CONSTANTS
// =============================================================================

/** Cache TTL hint for DO-SQLite mode (no external cache needed) */
export const CACHE_TTL_NONE = 0;

/** Cache TTL hint for standard mode (1 hour) */
export const CACHE_TTL_1H = 3600;

/** Cache TTL hint for enterprise mode (24 hours) */
export const CACHE_TTL_24H = 86400;

// =============================================================================
// SNIPPET CONSTRAINTS
// =============================================================================

/** Snippet CPU time limit in milliseconds */
export const SNIPPET_CPU_LIMIT_MS = 5;

/** Snippet memory limit in megabytes */
export const SNIPPET_MEMORY_LIMIT_MB = 32;

/** Snippet subrequest limit */
export const SNIPPET_SUBREQUEST_LIMIT = 5;

// =============================================================================
// TIMESTAMP CONSTANTS
// =============================================================================

/** Milliseconds in one second */
export const MS_PER_SECOND = 1_000;

/** Milliseconds in one minute */
export const MS_PER_MINUTE = 60_000;

/** Milliseconds in one hour */
export const MS_PER_HOUR = 3_600_000;

/** Milliseconds in one day */
export const MS_PER_DAY = 86_400_000;

/** Milliseconds in one week */
export const MS_PER_WEEK = 604_800_000;

// =============================================================================
// QUERY CONSTANTS
// =============================================================================

/** Maximum column name length */
export const MAX_COLUMN_NAME_LENGTH = 256;

/** Default query timeout */
export const DEFAULT_QUERY_TIMEOUT_MS = TIMEOUT_30S;

// =============================================================================
// PREFETCH CONSTANTS
// =============================================================================

/** Default max concurrent prefetch operations */
export const DEFAULT_MAX_CONCURRENT_PREFETCH = 5;

// =============================================================================
// BLOCK VALIDATION CONSTANTS
// =============================================================================

/**
 * Maximum column count in a single block.
 * Used to prevent DoS attacks from corrupted data claiming excessive columns.
 */
export const MAX_COLUMN_COUNT = 10_000;

/**
 * Maximum row count in a single block.
 * 100 million rows is a reasonable upper bound for in-memory processing.
 */
export const MAX_ROW_COUNT = 100_000_000;

/**
 * Maximum path length for column paths in block schema.
 * Prevents memory exhaustion from malformed data.
 */
export const MAX_COLUMN_PATH_LENGTH = 1_000;

// =============================================================================
// STORAGE LIST LIMITS
// =============================================================================

/**
 * Default page size for R2/storage list operations.
 * R2 supports up to 1000 objects per list call.
 */
export const STORAGE_LIST_PAGE_SIZE = 1_000;

// =============================================================================
// CIRCUIT BREAKER CONSTANTS
// =============================================================================

/** Default number of consecutive failures before opening circuit */
export const DEFAULT_CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5;

/** Default time in ms to wait before transitioning from OPEN to HALF_OPEN */
export const DEFAULT_CIRCUIT_BREAKER_RESET_TIMEOUT_MS = 30_000;

/** Default number of successful requests in HALF_OPEN before closing circuit */
export const DEFAULT_CIRCUIT_BREAKER_HALF_OPEN_MAX_ATTEMPTS = 1;

// =============================================================================
// MERGE/COMPACTION TIMING CONSTANTS
// =============================================================================

/** Default target rows per merged block */
export const DEFAULT_TARGET_ROWS_PER_BLOCK = 10_000;

/** Interval between merge checks (1 minute) */
export const MERGE_CHECK_INTERVAL_MS = 60_000;

/** Short delay before re-checking after a merge (1 second) */
export const MERGE_RECHECK_DELAY_MS = 1_000;

/** Short delay before scheduled merge (100ms) */
export const MERGE_SCHEDULE_DELAY_MS = 100;

// =============================================================================
// STRING POOL CONSTANTS
// =============================================================================

/** Default maximum size of the global string pool */
export const DEFAULT_STRING_POOL_SIZE = 10_000;

// =============================================================================
// CACHE CONSTANTS (Cache API tier)
// =============================================================================

/** Default cache TTL in seconds (1 hour) */
export const DEFAULT_CACHE_TTL_SECONDS = 3_600;

/** Maximum size for cached items in Cache API (25MB) */
export const CACHE_API_MAX_ITEM_SIZE = 25 * MB;

// =============================================================================
// DEDUPLICATION CONSTANTS
// =============================================================================

/** Default deduplication window (5 minutes) */
export const DEFAULT_DEDUP_WINDOW_MS = 5 * 60 * 1_000;

/** Default max entries per source for deduplication */
export const DEFAULT_DEDUP_MAX_ENTRIES_PER_SOURCE = 10_000;

/** Default max sources for deduplication */
export const DEFAULT_DEDUP_MAX_SOURCES = 1_000;

// =============================================================================
// BUFFER MANAGEMENT CONSTANTS
// =============================================================================

/** Critical buffer utilization threshold (95%) */
export const BUFFER_CRITICAL_THRESHOLD = 0.95;

/** Target buffer utilization after dropping old entries (80%) */
export const BUFFER_TARGET_UTILIZATION = 0.8;

/** Base overhead per WAL entry in bytes (estimated) */
export const WAL_ENTRY_BASE_OVERHEAD_BYTES = 100;

/** Multiplier for binary overhead estimation */
export const BINARY_OVERHEAD_MULTIPLIER = 1.1;

// =============================================================================
// WRITER TIMING CONSTANTS
// =============================================================================

/** Pending block retry interval (30 seconds) */
export const PENDING_BLOCK_RETRY_INTERVAL_MS = 30_000;

/** Compaction check interval (1 minute) */
export const COMPACTION_CHECK_INTERVAL_MS = 60_000;

/** Maximum recent durations to keep for average calculation */
export const MAX_DURATION_HISTORY = 100;

// =============================================================================
// QUERY COMPLEXITY CONSTANTS
// =============================================================================

/** Estimated rows threshold for query complexity decisions */
export const QUERY_ROWS_COMPLEXITY_THRESHOLD = 100_000;

/** Estimated rows threshold for requiring LIMIT clause */
export const QUERY_ROWS_LIMIT_THRESHOLD = 10_000;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Convert megabytes to bytes
 */
export function mbToBytes(mb: number): number {
  return mb * MB;
}

/**
 * Convert bytes to megabytes
 */
export function bytesToMb(bytes: number): number {
  return bytes / MB;
}

/**
 * Convert seconds to milliseconds
 */
export function secToMs(seconds: number): number {
  return seconds * MS_PER_SECOND;
}

/**
 * Convert milliseconds to seconds
 */
export function msToSec(ms: number): number {
  return ms / MS_PER_SECOND;
}
