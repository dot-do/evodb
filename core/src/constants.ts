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
