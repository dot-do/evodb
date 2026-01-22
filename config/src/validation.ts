/**
 * @evodb/config - Configuration Validation
 *
 * Validates configuration values and provides clear error messages.
 *
 * @packageDocumentation
 */

import type {
  EvoDBConfig,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from './types.js';

/**
 * Validate a complete EvoDBConfig.
 *
 * @param config - The configuration to validate
 * @returns ValidationResult with errors and warnings
 *
 * @example
 * ```typescript
 * const result = validateConfig(myConfig);
 * if (!result.valid) {
 *   console.error('Config errors:', result.errors);
 * }
 * if (result.warnings.length > 0) {
 *   console.warn('Config warnings:', result.warnings);
 * }
 * ```
 */
export function validateConfig(config: EvoDBConfig): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Validate storage configuration
  validateStorageConfig(config.storage, errors, warnings);

  // Validate query configuration
  validateQueryConfig(config.query, errors, warnings);

  // Validate writer configuration
  validateWriterConfig(config.writer, errors, warnings);

  // Validate RPC configuration
  validateRpcConfig(config.rpc, errors, warnings);

  // Validate observability configuration
  validateObservabilityConfig(config.observability, errors, warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate storage configuration.
 */
function validateStorageConfig(
  storage: EvoDBConfig['storage'],
  errors: ValidationError[],
  warnings: ValidationWarning[]
): void {
  const { cache } = storage;

  // Cache TTL must be non-negative
  if (cache.ttlSeconds < 0) {
    errors.push({
      path: 'storage.cache.ttlSeconds',
      message: 'Cache TTL must be non-negative',
      value: cache.ttlSeconds,
      suggestion: 'Use 0 for no caching or a positive value for TTL in seconds',
    });
  }

  // Cache max size must be positive
  if (cache.maxSizeBytes <= 0) {
    errors.push({
      path: 'storage.cache.maxSizeBytes',
      message: 'Cache max size must be a positive number',
      value: cache.maxSizeBytes,
    });
  }

  // Warn about very large cache sizes
  if (cache.maxSizeBytes > 1024 * 1024 * 1024) {
    warnings.push({
      path: 'storage.cache.maxSizeBytes',
      message: 'Cache size exceeds 1GB, which may cause memory pressure',
      value: cache.maxSizeBytes,
      recommendation: 'Consider reducing cache size or using a distributed cache',
    });
  }

  // Max entries must be positive if defined
  if (cache.maxEntries !== undefined && cache.maxEntries <= 0) {
    errors.push({
      path: 'storage.cache.maxEntries',
      message: 'Cache max entries must be a positive number',
      value: cache.maxEntries,
    });
  }
}

/**
 * Validate query configuration.
 */
function validateQueryConfig(
  query: EvoDBConfig['query'],
  errors: ValidationError[],
  warnings: ValidationWarning[]
): void {
  // Max parallelism must be positive
  if (query.maxParallelism <= 0) {
    errors.push({
      path: 'query.maxParallelism',
      message: 'Max parallelism must be a positive number',
      value: query.maxParallelism,
    });
  }

  // Warn about very high parallelism
  if (query.maxParallelism > 100) {
    warnings.push({
      path: 'query.maxParallelism',
      message: 'High parallelism may cause resource contention',
      value: query.maxParallelism,
      recommendation: 'Consider values between 4-32 for most workloads',
    });
  }

  // Default timeout must be positive
  if (query.defaultTimeoutMs <= 0) {
    errors.push({
      path: 'query.defaultTimeoutMs',
      message: 'Default timeout must be a positive number in milliseconds',
      value: query.defaultTimeoutMs,
    });
  }

  // Memory limit must be positive
  if (query.memoryLimitBytes <= 0) {
    errors.push({
      path: 'query.memoryLimitBytes',
      message: 'Memory limit must be a positive number in bytes',
      value: query.memoryLimitBytes,
    });
  }

  // Warn about very low memory limits
  if (query.memoryLimitBytes > 0 && query.memoryLimitBytes < 16 * 1024 * 1024) {
    warnings.push({
      path: 'query.memoryLimitBytes',
      message: 'Memory limit under 16MB may cause query failures',
      value: query.memoryLimitBytes,
      recommendation: 'Consider at least 64MB for typical workloads',
    });
  }

  // Validate subrequest budget if set
  if (query.subrequestBudget !== undefined && query.subrequestBudget <= 0) {
    errors.push({
      path: 'query.subrequestBudget',
      message: 'Subrequest budget must be a positive number',
      value: query.subrequestBudget,
    });
  }
}

/**
 * Validate writer configuration.
 */
function validateWriterConfig(
  writer: EvoDBConfig['writer'],
  errors: ValidationError[],
  _warnings: ValidationWarning[]
): void {
  // Buffer size must be positive
  if (writer.bufferSize <= 0) {
    errors.push({
      path: 'writer.bufferSize',
      message: 'Buffer size must be a positive number',
      value: writer.bufferSize,
    });
  }

  // Buffer timeout must be positive
  if (writer.bufferTimeoutMs <= 0) {
    errors.push({
      path: 'writer.bufferTimeoutMs',
      message: 'Buffer timeout must be a positive number in milliseconds',
      value: writer.bufferTimeoutMs,
    });
  }

  // Min compact blocks must be positive
  if (writer.minCompactBlocks <= 0) {
    errors.push({
      path: 'writer.minCompactBlocks',
      message: 'Min compact blocks must be a positive number',
      value: writer.minCompactBlocks,
    });
  }

  // Max retries must be non-negative
  if (writer.maxRetries < 0) {
    errors.push({
      path: 'writer.maxRetries',
      message: 'Max retries must be non-negative',
      value: writer.maxRetries,
    });
  }

  // Retry backoff must be positive
  if (writer.retryBackoffMs <= 0) {
    errors.push({
      path: 'writer.retryBackoffMs',
      message: 'Retry backoff must be a positive number in milliseconds',
      value: writer.retryBackoffMs,
    });
  }

  // Max buffer size must be positive
  if (writer.maxBufferSizeBytes <= 0) {
    errors.push({
      path: 'writer.maxBufferSizeBytes',
      message: 'Max buffer size must be a positive number in bytes',
      value: writer.maxBufferSizeBytes,
    });
  }

  // Max block index size must be positive
  if (writer.maxBlockIndexSize <= 0) {
    errors.push({
      path: 'writer.maxBlockIndexSize',
      message: 'Max block index size must be a positive number',
      value: writer.maxBlockIndexSize,
    });
  }

  // Validate partition mode
  const validModes = ['do-sqlite', 'edge-cache', 'enterprise'];
  if (!validModes.includes(writer.partitionMode)) {
    errors.push({
      path: 'writer.partitionMode',
      message: `Partition mode must be one of: ${validModes.join(', ')}`,
      value: writer.partitionMode,
    });
  }

  // Validate eviction policy
  const validPolicies = ['lru', 'none'];
  if (!validPolicies.includes(writer.blockIndexEvictionPolicy)) {
    errors.push({
      path: 'writer.blockIndexEvictionPolicy',
      message: `Block index eviction policy must be one of: ${validPolicies.join(', ')}`,
      value: writer.blockIndexEvictionPolicy,
    });
  }
}

/**
 * Validate RPC configuration.
 */
function validateRpcConfig(
  rpc: EvoDBConfig['rpc'],
  errors: ValidationError[],
  warnings: ValidationWarning[]
): void {
  // Max batch size must be positive
  if (rpc.maxBatchSize <= 0) {
    errors.push({
      path: 'rpc.maxBatchSize',
      message: 'Max batch size must be a positive number',
      value: rpc.maxBatchSize,
    });
  }

  // Max batch size bytes must be positive
  if (rpc.maxBatchSizeBytes <= 0) {
    errors.push({
      path: 'rpc.maxBatchSizeBytes',
      message: 'Max batch size in bytes must be a positive number',
      value: rpc.maxBatchSizeBytes,
    });
  }

  // Max message size bytes must be positive
  if (rpc.maxMessageSizeBytes <= 0) {
    errors.push({
      path: 'rpc.maxMessageSizeBytes',
      message: 'Max message size in bytes must be a positive number',
      value: rpc.maxMessageSizeBytes,
    });
  }

  // Batch timeout must be positive
  if (rpc.batchTimeoutMs <= 0) {
    errors.push({
      path: 'rpc.batchTimeoutMs',
      message: 'Batch timeout must be a positive number in milliseconds',
      value: rpc.batchTimeoutMs,
    });
  }

  // Max retries must be non-negative
  if (rpc.maxRetries < 0) {
    errors.push({
      path: 'rpc.maxRetries',
      message: 'Max retries must be non-negative',
      value: rpc.maxRetries,
    });
  }

  // Backoff multiplier must be positive
  if (rpc.backoffMultiplier <= 0) {
    errors.push({
      path: 'rpc.backoffMultiplier',
      message: 'Backoff multiplier must be a positive number',
      value: rpc.backoffMultiplier,
    });
  }

  // Heartbeat interval must be positive
  if (rpc.heartbeatIntervalMs <= 0) {
    errors.push({
      path: 'rpc.heartbeatIntervalMs',
      message: 'Heartbeat interval must be a positive number in milliseconds',
      value: rpc.heartbeatIntervalMs,
    });
  }

  // Max pending batches must be positive
  if (rpc.maxPendingBatches <= 0) {
    errors.push({
      path: 'rpc.maxPendingBatches',
      message: 'Max pending batches must be a positive number',
      value: rpc.maxPendingBatches,
    });
  }

  // Deduplication window must be positive if enabled
  if (rpc.enableDeduplication && rpc.deduplicationWindowMs <= 0) {
    errors.push({
      path: 'rpc.deduplicationWindowMs',
      message: 'Deduplication window must be a positive number in milliseconds when deduplication is enabled',
      value: rpc.deduplicationWindowMs,
    });
  }

  // Warn about very large batch sizes
  if (rpc.maxBatchSize > 10000) {
    warnings.push({
      path: 'rpc.maxBatchSize',
      message: 'Large batch sizes may cause memory pressure or latency spikes',
      value: rpc.maxBatchSize,
      recommendation: 'Consider values between 100-5000 for most workloads',
    });
  }
}

/**
 * Validate observability configuration.
 */
function validateObservabilityConfig(
  observability: EvoDBConfig['observability'],
  errors: ValidationError[],
  _warnings: ValidationWarning[]
): void {
  // Validate log level
  const validLogLevels = ['debug', 'info', 'warn', 'error'];
  if (!validLogLevels.includes(observability.logLevel)) {
    errors.push({
      path: 'observability.logLevel',
      message: `Log level must be one of: ${validLogLevels.join(', ')}`,
      value: observability.logLevel,
    });
  }

  // Validate log format
  const validLogFormats = ['json', 'pretty'];
  if (!validLogFormats.includes(observability.logFormat)) {
    errors.push({
      path: 'observability.logFormat',
      message: `Log format must be one of: ${validLogFormats.join(', ')}`,
      value: observability.logFormat,
    });
  }

  // Validate sampling rate if set
  if (
    observability.tracingSamplingRate !== undefined &&
    (observability.tracingSamplingRate < 0 || observability.tracingSamplingRate > 1)
  ) {
    errors.push({
      path: 'observability.tracingSamplingRate',
      message: 'Tracing sampling rate must be between 0.0 and 1.0',
      value: observability.tracingSamplingRate,
    });
  }

  // Validate metrics batch size if set
  if (
    observability.metricsBatchSize !== undefined &&
    observability.metricsBatchSize <= 0
  ) {
    errors.push({
      path: 'observability.metricsBatchSize',
      message: 'Metrics batch size must be a positive number',
      value: observability.metricsBatchSize,
    });
  }

  // Warn about debug logging in production-like configs
  if (observability.logLevel === 'debug') {
    _warnings.push({
      path: 'observability.logLevel',
      message: 'Debug logging may cause performance issues in production',
      value: observability.logLevel,
      recommendation: 'Use "info" or higher log level in production',
    });
  }
}
