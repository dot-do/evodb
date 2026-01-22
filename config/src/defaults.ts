/**
 * @evodb/config - Default Configuration Values
 *
 * Centralized default configuration for all EvoDB packages.
 * Values are sourced from @evodb/core constants where applicable.
 *
 * @packageDocumentation
 */

import {
  BUFFER_SIZE_4MB,
  BUFFER_SIZE_16MB,
  BUFFER_SIZE_128MB,
  BUFFER_SIZE_256MB,
  TIMEOUT_100MS,
  TIMEOUT_1S,
  TIMEOUT_5S,
  TIMEOUT_10S,
  TIMEOUT_30S,
  TIMEOUT_5MIN,
  DEFAULT_BUFFER_SIZE,
  DEFAULT_MAX_RETRIES,
  MAX_RECONNECT_ATTEMPTS,
  BACKOFF_MULTIPLIER,
  MIN_COMPACT_BLOCKS,
  DEFAULT_CACHE_TTL_SECONDS,
} from '@evodb/core';

import type { EvoDBConfig } from './types.js';

/**
 * Default cache configuration.
 */
const DEFAULT_CACHE_CONFIG = {
  enabled: true,
  ttlSeconds: DEFAULT_CACHE_TTL_SECONDS,
  maxSizeBytes: BUFFER_SIZE_256MB,
  maxEntries: 1000,
  keyPrefix: 'evodb-cache',
} as const;

/**
 * Default storage configuration.
 */
const DEFAULT_STORAGE_CONFIG = {
  cache: DEFAULT_CACHE_CONFIG,
} as const;

/**
 * Default query hints configuration.
 */
const DEFAULT_QUERY_HINTS_CONFIG = {
  preferCache: true,
} as const;

/**
 * Default query configuration.
 */
const DEFAULT_QUERY_CONFIG = {
  maxParallelism: 8,
  defaultTimeoutMs: TIMEOUT_30S,
  memoryLimitBytes: BUFFER_SIZE_128MB * 4, // 512MB
  enableStats: true,
  enablePlanCache: true,
  defaultHints: DEFAULT_QUERY_HINTS_CONFIG,
  subrequestContext: 'worker' as const,
} as const;

/**
 * Default writer configuration.
 */
const DEFAULT_WRITER_CONFIG = {
  partitionMode: 'do-sqlite' as const,
  bufferSize: DEFAULT_BUFFER_SIZE,
  bufferTimeoutMs: TIMEOUT_5S,
  minCompactBlocks: MIN_COMPACT_BLOCKS,
  maxRetries: DEFAULT_MAX_RETRIES,
  retryBackoffMs: TIMEOUT_100MS,
  maxBufferSizeBytes: BUFFER_SIZE_128MB,
  maxBlockIndexSize: 100_000,
  blockIndexEvictionPolicy: 'lru' as const,
} as const;

/**
 * Default RPC configuration.
 */
const DEFAULT_RPC_CONFIG = {
  maxBatchSize: 1000,
  maxBatchSizeBytes: BUFFER_SIZE_4MB,
  maxMessageSizeBytes: BUFFER_SIZE_16MB,
  batchTimeoutMs: TIMEOUT_1S,
  maxRetries: DEFAULT_MAX_RETRIES,
  initialRetryDelayMs: TIMEOUT_100MS,
  maxRetryDelayMs: TIMEOUT_10S,
  backoffMultiplier: BACKOFF_MULTIPLIER,
  autoReconnect: true,
  reconnectDelayMs: TIMEOUT_1S,
  maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
  heartbeatIntervalMs: TIMEOUT_30S,
  maxPendingBatches: 100,
  pendingBatchTtlMs: TIMEOUT_30S,
  enableDeduplication: true,
  deduplicationWindowMs: TIMEOUT_5MIN,
} as const;

/**
 * Default observability configuration.
 */
const DEFAULT_OBSERVABILITY_CONFIG = {
  logLevel: 'info' as const,
  logFormat: 'json' as const,
  tracingEnabled: false,
  tracingServiceName: 'evodb',
  tracingSamplingRate: 1.0,
  metricsEnabled: false,
  metricsBatchSize: 100,
} as const;

/**
 * Default configuration for entire EvoDB instance.
 *
 * This configuration provides sensible defaults for all packages.
 * Values follow consistent naming conventions:
 * - *TimeoutMs / *IntervalMs: milliseconds
 * - *Bytes: byte counts
 * - max* / min* / *Count / *Size: numeric limits
 *
 * @example
 * ```typescript
 * import { DEFAULT_CONFIG, createConfig } from '@evodb/config';
 *
 * // Use defaults directly
 * console.log(DEFAULT_CONFIG.query.maxParallelism); // 8
 *
 * // Or create a config with overrides
 * const config = createConfig({
 *   query: { maxParallelism: 16 },
 * });
 * ```
 */
export const DEFAULT_CONFIG: EvoDBConfig = {
  storage: DEFAULT_STORAGE_CONFIG,
  query: DEFAULT_QUERY_CONFIG,
  writer: DEFAULT_WRITER_CONFIG,
  rpc: DEFAULT_RPC_CONFIG,
  observability: DEFAULT_OBSERVABILITY_CONFIG,
};
