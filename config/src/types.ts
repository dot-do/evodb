/**
 * @evodb/config - Type Definitions
 *
 * Unified configuration schema for all EvoDB packages.
 * Provides consistent naming conventions and type safety.
 *
 * Naming Conventions:
 * - All timeouts: *TimeoutMs or *IntervalMs (milliseconds)
 * - All sizes: *Bytes, *KB, *MB, *GB
 * - All counts: max*, min*, *Count, *Size
 *
 * @packageDocumentation
 * @module @evodb/config
 */

import type { LogLevel } from '@evodb/core';

// =============================================================================
// Utility Types
// =============================================================================

/**
 * Deep partial type that makes all nested properties optional.
 */
export type DeepPartial<T> = T extends object
  ? { [P in keyof T]?: DeepPartial<T[P]> }
  : T;

/**
 * Deep readonly type that makes all nested properties readonly.
 */
export type DeepReadonly<T> = T extends object
  ? { readonly [P in keyof T]: DeepReadonly<T[P]> }
  : T;

// =============================================================================
// Storage Configuration
// =============================================================================

/**
 * Cache configuration for storage layer.
 *
 * @example
 * ```typescript
 * const cacheConfig: CacheConfig = {
 *   enabled: true,
 *   ttlSeconds: 3600,
 *   maxSizeBytes: 256 * 1024 * 1024, // 256MB
 *   keyPrefix: 'evodb-cache',
 * };
 * ```
 */
export interface CacheConfig {
  /** Enable caching */
  enabled: boolean;

  /** Cache TTL in seconds */
  ttlSeconds: number;

  /** Maximum cache size in bytes */
  maxSizeBytes: number;

  /** Maximum number of cache entries */
  maxEntries?: number;

  /** Cache key prefix */
  keyPrefix: string;
}

/**
 * Storage configuration.
 *
 * @example
 * ```typescript
 * const storageConfig: StorageConfig = {
 *   cache: {
 *     enabled: true,
 *     ttlSeconds: 3600,
 *     maxSizeBytes: 256 * 1024 * 1024,
 *     keyPrefix: 'evodb',
 *   },
 * };
 * ```
 */
export interface StorageConfig {
  /** Cache configuration */
  cache: CacheConfig;
}

// =============================================================================
// Query Configuration
// =============================================================================

/**
 * Query hints for execution optimization.
 */
export interface QueryHintsConfig {
  /** Prefer cached partitions */
  preferCache?: boolean;

  /** Maximum partitions to read in parallel */
  maxParallelism?: number;

  /** Skip zone map optimization */
  skipZoneMapPruning?: boolean;

  /** Skip bloom filter checks */
  skipBloomFilters?: boolean;

  /** Force full scan (for benchmarking) */
  forceScan?: boolean;

  /** Timeout in milliseconds */
  timeoutMs?: number;

  /** Memory limit in bytes */
  memoryLimitBytes?: number;
}

/**
 * Subrequest context for Cloudflare Workers.
 */
export type SubrequestContext = 'worker' | 'snippet';

/**
 * Query engine configuration.
 *
 * @example
 * ```typescript
 * const queryConfig: QueryConfig = {
 *   maxParallelism: 8,
 *   defaultTimeoutMs: 30000,
 *   memoryLimitBytes: 512 * 1024 * 1024,
 *   enableStats: true,
 *   enablePlanCache: true,
 * };
 * ```
 */
export interface QueryConfig {
  /** Maximum concurrent partition reads */
  maxParallelism: number;

  /** Default timeout in milliseconds */
  defaultTimeoutMs: number;

  /** Memory limit in bytes */
  memoryLimitBytes: number;

  /** Enable query statistics collection */
  enableStats: boolean;

  /** Enable query plan caching */
  enablePlanCache: boolean;

  /** Default query hints */
  defaultHints?: QueryHintsConfig;

  /** Subrequest execution context */
  subrequestContext?: SubrequestContext;

  /** Custom subrequest budget override */
  subrequestBudget?: number;
}

// =============================================================================
// Writer Configuration
// =============================================================================

/**
 * Partition modes for different deployment targets.
 */
export type PartitionMode = 'do-sqlite' | 'edge-cache' | 'enterprise';

/**
 * Block index eviction policy.
 */
export type BlockIndexEvictionPolicy = 'lru' | 'none';

/**
 * Writer configuration.
 *
 * @example
 * ```typescript
 * const writerConfig: WriterConfig = {
 *   partitionMode: 'do-sqlite',
 *   bufferSize: 10000,
 *   bufferTimeoutMs: 5000,
 *   minCompactBlocks: 4,
 *   maxRetries: 3,
 *   retryBackoffMs: 100,
 *   maxBufferSizeBytes: 128 * 1024 * 1024,
 * };
 * ```
 */
export interface WriterConfig {
  /** Partition mode for block sizing */
  partitionMode: PartitionMode;

  /** Max entries before automatic flush */
  bufferSize: number;

  /** Max milliseconds before automatic flush */
  bufferTimeoutMs: number;

  /** Target block size in bytes (overrides partition mode) */
  targetBlockSizeBytes?: number;

  /** Maximum block size in bytes (overrides partition mode) */
  maxBlockSizeBytes?: number;

  /** Minimum small blocks to trigger compaction */
  minCompactBlocks: number;

  /** Target size after compaction in bytes */
  targetCompactSizeBytes?: number;

  /** Maximum retry attempts for R2 writes */
  maxRetries: number;

  /** Retry backoff base in milliseconds */
  retryBackoffMs: number;

  /** Hard limit on buffer size in bytes */
  maxBufferSizeBytes: number;

  /** Maximum number of entries in the block index */
  maxBlockIndexSize: number;

  /** Eviction policy when block index limit is reached */
  blockIndexEvictionPolicy: BlockIndexEvictionPolicy;
}

// =============================================================================
// RPC Configuration
// =============================================================================

/**
 * RPC configuration for DO-to-DO communication.
 *
 * @example
 * ```typescript
 * const rpcConfig: RpcConfig = {
 *   maxBatchSize: 1000,
 *   maxBatchSizeBytes: 4 * 1024 * 1024,
 *   batchTimeoutMs: 1000,
 *   maxRetries: 3,
 *   autoReconnect: true,
 * };
 * ```
 */
export interface RpcConfig {
  /** Maximum batch size (entries) */
  maxBatchSize: number;

  /** Maximum batch size in bytes */
  maxBatchSizeBytes: number;

  /** Maximum message size in bytes */
  maxMessageSizeBytes: number;

  /** Batch timeout before sending (ms) */
  batchTimeoutMs: number;

  /** Retry attempts on failure */
  maxRetries: number;

  /** Initial retry delay (ms) */
  initialRetryDelayMs: number;

  /** Maximum retry delay (ms) */
  maxRetryDelayMs: number;

  /** Exponential backoff multiplier */
  backoffMultiplier: number;

  /** Enable automatic reconnection */
  autoReconnect: boolean;

  /** Reconnection delay (ms) */
  reconnectDelayMs: number;

  /** Maximum reconnection attempts */
  maxReconnectAttempts: number;

  /** Heartbeat interval (ms) */
  heartbeatIntervalMs: number;

  /** Maximum number of pending batches */
  maxPendingBatches: number;

  /** TTL for pending batches in milliseconds */
  pendingBatchTtlMs: number;

  /** Enable deduplication */
  enableDeduplication: boolean;

  /** Deduplication window in milliseconds */
  deduplicationWindowMs: number;
}

// =============================================================================
// Observability Configuration
// =============================================================================

/**
 * Log format options.
 */
export type LogFormat = 'json' | 'pretty';

/**
 * Observability configuration for logging, tracing, and metrics.
 *
 * @example
 * ```typescript
 * const observabilityConfig: ObservabilityConfig = {
 *   logLevel: 'info',
 *   logFormat: 'json',
 *   tracingEnabled: true,
 *   tracingServiceName: 'my-service',
 *   metricsEnabled: true,
 * };
 * ```
 */
export interface ObservabilityConfig {
  /** Minimum log level */
  logLevel: LogLevel;

  /** Log output format */
  logFormat: LogFormat;

  /** Enable distributed tracing */
  tracingEnabled: boolean;

  /** Service name for tracing */
  tracingServiceName: string;

  /** Tracing sampling rate (0.0 to 1.0) */
  tracingSamplingRate?: number;

  /** Enable metrics collection */
  metricsEnabled: boolean;

  /** Metrics batch size for export */
  metricsBatchSize?: number;
}

// =============================================================================
// Unified Configuration
// =============================================================================

/**
 * Unified EvoDB configuration.
 *
 * Single configuration object for entire EvoDB instance with consistent
 * naming patterns and complete type safety.
 *
 * @example
 * ```typescript
 * const config: EvoDBConfig = {
 *   storage: { cache: { enabled: true, ... } },
 *   query: { maxParallelism: 8, ... },
 *   writer: { partitionMode: 'do-sqlite', ... },
 *   rpc: { autoReconnect: true, ... },
 *   observability: { logLevel: 'info', ... },
 * };
 * ```
 */
export interface EvoDBConfig {
  /** Storage layer configuration */
  storage: StorageConfig;

  /** Query engine configuration */
  query: QueryConfig;

  /** Writer configuration */
  writer: WriterConfig;

  /** RPC configuration */
  rpc: RpcConfig;

  /** Observability configuration */
  observability: ObservabilityConfig;
}

// =============================================================================
// Validation Types
// =============================================================================

/**
 * Validation error details.
 */
export interface ValidationError {
  /** Path to the invalid field (e.g., 'query.maxParallelism') */
  path: string;

  /** Human-readable error message */
  message: string;

  /** The invalid value */
  value: unknown;

  /** Suggested fix (optional) */
  suggestion?: string;
}

/**
 * Validation warning details.
 */
export interface ValidationWarning {
  /** Path to the field with potential issue */
  path: string;

  /** Human-readable warning message */
  message: string;

  /** The concerning value */
  value: unknown;

  /** Recommended action */
  recommendation?: string;
}

/**
 * Configuration validation result.
 */
export interface ValidationResult {
  /** Whether the configuration is valid */
  valid: boolean;

  /** List of validation errors */
  errors: ValidationError[];

  /** List of validation warnings */
  warnings: ValidationWarning[];
}

// =============================================================================
// Environment Configuration Types
// =============================================================================

/**
 * Options for loading configuration from environment variables.
 */
export interface EnvConfigOptions {
  /** Environment variable prefix (default: 'EVODB') */
  prefix?: string;

  /** Custom environment object (default: process.env) */
  env?: Record<string, string | undefined>;
}
