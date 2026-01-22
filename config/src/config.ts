/**
 * @evodb/config - Configuration Factory Functions
 *
 * Provides functions to create, merge, and manage configurations.
 *
 * @packageDocumentation
 */

import type { EvoDBConfig, DeepPartial, EnvConfigOptions } from './types.js';
import { DEFAULT_CONFIG } from './defaults.js';

/**
 * Deep merge two objects, with source values taking precedence.
 * Handles nested objects and undefined values correctly.
 */
function deepMerge<T extends object>(
  target: T,
  source: DeepPartial<T> | null | undefined
): T {
  if (!source) {
    return target;
  }

  const result = { ...target } as Record<string, unknown>;

  for (const key of Object.keys(source)) {
    const sourceValue = (source as Record<string, unknown>)[key];
    const targetValue = (target as Record<string, unknown>)[key];

    // Skip undefined values - they should not override
    if (sourceValue === undefined) {
      continue;
    }

    // Deep merge nested objects
    if (
      sourceValue !== null &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      targetValue !== null &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(
        targetValue as object,
        sourceValue as DeepPartial<object>
      );
    } else {
      result[key] = sourceValue;
    }
  }

  return result as T;
}

/**
 * Deep freeze an object to prevent mutation.
 */
function deepFreeze<T>(obj: T): Readonly<T> {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  Object.freeze(obj);

  for (const key of Object.keys(obj) as Array<keyof T>) {
    const value = obj[key];
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }

  return obj as Readonly<T>;
}

/**
 * Create a complete EvoDBConfig with optional overrides.
 *
 * @param overrides - Partial configuration to merge with defaults
 * @param base - Optional base configuration (defaults to DEFAULT_CONFIG)
 * @returns Frozen EvoDBConfig with all values filled in
 *
 * @example
 * ```typescript
 * // Use all defaults
 * const config1 = createConfig();
 *
 * // Override specific values
 * const config2 = createConfig({
 *   query: { maxParallelism: 16 },
 *   writer: { partitionMode: 'edge-cache' },
 * });
 *
 * // Build on another config
 * const config3 = createConfig(
 *   { query: { defaultTimeoutMs: 60000 } },
 *   config2
 * );
 * ```
 */
export function createConfig(
  overrides?: DeepPartial<EvoDBConfig>,
  base: EvoDBConfig = DEFAULT_CONFIG
): EvoDBConfig {
  const merged = deepMerge(base as object, overrides as DeepPartial<object>) as EvoDBConfig;
  return deepFreeze(merged);
}

/**
 * Merge multiple partial configurations.
 *
 * Later configurations take precedence over earlier ones.
 *
 * @param configs - Partial configurations to merge
 * @returns Merged partial configuration
 *
 * @example
 * ```typescript
 * const base = { query: { maxParallelism: 4 } };
 * const override = { query: { maxParallelism: 8, defaultTimeoutMs: 60000 } };
 * const merged = mergeConfigs(base, override);
 * // merged.query.maxParallelism === 8
 * // merged.query.defaultTimeoutMs === 60000
 * ```
 */
export function mergeConfigs(
  ...configs: Array<DeepPartial<EvoDBConfig> | null | undefined>
): DeepPartial<EvoDBConfig> {
  let result: DeepPartial<EvoDBConfig> = {};

  for (const config of configs) {
    if (config) {
      result = deepMerge(result as Record<string, unknown>, config) as DeepPartial<EvoDBConfig>;
    }
  }

  return result;
}

/**
 * Parse environment variable value to the appropriate type.
 */
function parseEnvValue(value: string | undefined, type: 'string' | 'number' | 'boolean'): unknown {
  if (value === undefined) {
    return undefined;
  }

  switch (type) {
    case 'number': {
      const num = Number(value);
      return Number.isNaN(num) ? undefined : num;
    }
    case 'boolean':
      return value.toLowerCase() === 'true' || value === '1';
    case 'string':
    default:
      return value;
  }
}

/**
 * Get environment variable with prefix.
 */
function getEnvVar(
  env: Record<string, string | undefined>,
  prefix: string,
  ...parts: string[]
): string | undefined {
  const key = [prefix, ...parts].join('_').toUpperCase();
  return env[key];
}

/**
 * Create configuration from environment variables.
 *
 * Environment variables follow the pattern: EVODB_<SECTION>_<FIELD>
 * For example:
 * - EVODB_QUERY_MAX_PARALLELISM=16
 * - EVODB_STORAGE_CACHE_ENABLED=true
 * - EVODB_WRITER_PARTITION_MODE=edge-cache
 *
 * @param options - Options for environment configuration
 * @returns EvoDBConfig with environment overrides applied
 *
 * @example
 * ```typescript
 * // Basic usage
 * const config = getConfigFromEnv();
 *
 * // Custom prefix
 * const config = getConfigFromEnv({ prefix: 'MYAPP' });
 *
 * // Custom environment object
 * const config = getConfigFromEnv({ env: myEnvObject });
 * ```
 */
export function getConfigFromEnv(options: EnvConfigOptions = {}): EvoDBConfig {
  const prefix = options.prefix ?? 'EVODB';
  const env = options.env ?? (typeof process !== 'undefined' ? process.env : {});

  const overrides: DeepPartial<EvoDBConfig> = {};

  // Query configuration
  const queryMaxParallelism = parseEnvValue(
    getEnvVar(env, prefix, 'QUERY', 'MAX', 'PARALLELISM'),
    'number'
  );
  const queryTimeoutMs = parseEnvValue(
    getEnvVar(env, prefix, 'QUERY', 'TIMEOUT', 'MS'),
    'number'
  );
  const queryMemoryLimitBytes = parseEnvValue(
    getEnvVar(env, prefix, 'QUERY', 'MEMORY', 'LIMIT', 'BYTES'),
    'number'
  );
  const queryEnableStats = parseEnvValue(
    getEnvVar(env, prefix, 'QUERY', 'ENABLE', 'STATS'),
    'boolean'
  );
  const queryEnablePlanCache = parseEnvValue(
    getEnvVar(env, prefix, 'QUERY', 'ENABLE', 'PLAN', 'CACHE'),
    'boolean'
  );

  if (
    queryMaxParallelism !== undefined ||
    queryTimeoutMs !== undefined ||
    queryMemoryLimitBytes !== undefined ||
    queryEnableStats !== undefined ||
    queryEnablePlanCache !== undefined
  ) {
    overrides.query = {
      ...(queryMaxParallelism !== undefined && { maxParallelism: queryMaxParallelism as number }),
      ...(queryTimeoutMs !== undefined && { defaultTimeoutMs: queryTimeoutMs as number }),
      ...(queryMemoryLimitBytes !== undefined && { memoryLimitBytes: queryMemoryLimitBytes as number }),
      ...(queryEnableStats !== undefined && { enableStats: queryEnableStats as boolean }),
      ...(queryEnablePlanCache !== undefined && { enablePlanCache: queryEnablePlanCache as boolean }),
    };
  }

  // Storage/Cache configuration
  const cacheEnabled = parseEnvValue(
    getEnvVar(env, prefix, 'STORAGE', 'CACHE', 'ENABLED'),
    'boolean'
  );
  const cacheTtlSeconds = parseEnvValue(
    getEnvVar(env, prefix, 'STORAGE', 'CACHE', 'TTL', 'SECONDS'),
    'number'
  );
  const cacheMaxSizeBytes = parseEnvValue(
    getEnvVar(env, prefix, 'STORAGE', 'CACHE', 'MAX', 'SIZE', 'BYTES'),
    'number'
  );
  const cacheKeyPrefix = parseEnvValue(
    getEnvVar(env, prefix, 'STORAGE', 'CACHE', 'KEY', 'PREFIX'),
    'string'
  );

  if (
    cacheEnabled !== undefined ||
    cacheTtlSeconds !== undefined ||
    cacheMaxSizeBytes !== undefined ||
    cacheKeyPrefix !== undefined
  ) {
    overrides.storage = {
      cache: {
        ...(cacheEnabled !== undefined && { enabled: cacheEnabled as boolean }),
        ...(cacheTtlSeconds !== undefined && { ttlSeconds: cacheTtlSeconds as number }),
        ...(cacheMaxSizeBytes !== undefined && { maxSizeBytes: cacheMaxSizeBytes as number }),
        ...(cacheKeyPrefix !== undefined && { keyPrefix: cacheKeyPrefix as string }),
      },
    };
  }

  // Writer configuration
  const writerPartitionMode = getEnvVar(env, prefix, 'WRITER', 'PARTITION', 'MODE');
  const writerBufferSize = parseEnvValue(
    getEnvVar(env, prefix, 'WRITER', 'BUFFER', 'SIZE'),
    'number'
  );
  const writerBufferTimeoutMs = parseEnvValue(
    getEnvVar(env, prefix, 'WRITER', 'BUFFER', 'TIMEOUT', 'MS'),
    'number'
  );
  const writerMaxRetries = parseEnvValue(
    getEnvVar(env, prefix, 'WRITER', 'MAX', 'RETRIES'),
    'number'
  );

  if (
    writerPartitionMode !== undefined ||
    writerBufferSize !== undefined ||
    writerBufferTimeoutMs !== undefined ||
    writerMaxRetries !== undefined
  ) {
    overrides.writer = {
      ...(writerPartitionMode !== undefined && {
        partitionMode: writerPartitionMode as 'do-sqlite' | 'edge-cache' | 'enterprise',
      }),
      ...(writerBufferSize !== undefined && { bufferSize: writerBufferSize as number }),
      ...(writerBufferTimeoutMs !== undefined && { bufferTimeoutMs: writerBufferTimeoutMs as number }),
      ...(writerMaxRetries !== undefined && { maxRetries: writerMaxRetries as number }),
    };
  }

  // RPC configuration
  const rpcMaxRetries = parseEnvValue(
    getEnvVar(env, prefix, 'RPC', 'MAX', 'RETRIES'),
    'number'
  );
  const rpcAutoReconnect = parseEnvValue(
    getEnvVar(env, prefix, 'RPC', 'AUTO', 'RECONNECT'),
    'boolean'
  );
  const rpcHeartbeatIntervalMs = parseEnvValue(
    getEnvVar(env, prefix, 'RPC', 'HEARTBEAT', 'INTERVAL', 'MS'),
    'number'
  );
  const rpcMaxBatchSize = parseEnvValue(
    getEnvVar(env, prefix, 'RPC', 'MAX', 'BATCH', 'SIZE'),
    'number'
  );

  if (
    rpcMaxRetries !== undefined ||
    rpcAutoReconnect !== undefined ||
    rpcHeartbeatIntervalMs !== undefined ||
    rpcMaxBatchSize !== undefined
  ) {
    overrides.rpc = {
      ...(rpcMaxRetries !== undefined && { maxRetries: rpcMaxRetries as number }),
      ...(rpcAutoReconnect !== undefined && { autoReconnect: rpcAutoReconnect as boolean }),
      ...(rpcHeartbeatIntervalMs !== undefined && { heartbeatIntervalMs: rpcHeartbeatIntervalMs as number }),
      ...(rpcMaxBatchSize !== undefined && { maxBatchSize: rpcMaxBatchSize as number }),
    };
  }

  // Observability configuration
  const logLevel = getEnvVar(env, prefix, 'OBSERVABILITY', 'LOG', 'LEVEL');
  const logFormat = getEnvVar(env, prefix, 'OBSERVABILITY', 'LOG', 'FORMAT');
  const tracingEnabled = parseEnvValue(
    getEnvVar(env, prefix, 'OBSERVABILITY', 'TRACING', 'ENABLED'),
    'boolean'
  );
  const tracingServiceName = getEnvVar(env, prefix, 'OBSERVABILITY', 'TRACING', 'SERVICE', 'NAME');
  const metricsEnabled = parseEnvValue(
    getEnvVar(env, prefix, 'OBSERVABILITY', 'METRICS', 'ENABLED'),
    'boolean'
  );

  if (
    logLevel !== undefined ||
    logFormat !== undefined ||
    tracingEnabled !== undefined ||
    tracingServiceName !== undefined ||
    metricsEnabled !== undefined
  ) {
    overrides.observability = {
      ...(logLevel !== undefined && {
        logLevel: logLevel as 'debug' | 'info' | 'warn' | 'error',
      }),
      ...(logFormat !== undefined && {
        logFormat: logFormat as 'json' | 'pretty',
      }),
      ...(tracingEnabled !== undefined && { tracingEnabled: tracingEnabled as boolean }),
      ...(tracingServiceName !== undefined && { tracingServiceName: tracingServiceName as string }),
      ...(metricsEnabled !== undefined && { metricsEnabled: metricsEnabled as boolean }),
    };
  }

  return createConfig(overrides);
}
