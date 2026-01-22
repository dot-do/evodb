/**
 * @evodb/config - Unified Configuration for EvoDB
 *
 * Provides a single, unified configuration schema for all EvoDB packages.
 * Supports environment-based configuration, validation, and type safety.
 *
 * Key Features:
 * - Consistent naming conventions (*TimeoutMs, *Bytes, max*, min*)
 * - Deep partial overrides with createConfig()
 * - Environment variable support with getConfigFromEnv()
 * - Validation with clear error messages
 * - Complete TypeScript type safety
 *
 * @example
 * ```typescript
 * import {
 *   createConfig,
 *   validateConfig,
 *   getConfigFromEnv,
 *   DEFAULT_CONFIG,
 * } from '@evodb/config';
 *
 * // Create config with defaults
 * const config = createConfig();
 *
 * // Create config with overrides
 * const customConfig = createConfig({
 *   query: { maxParallelism: 16 },
 *   writer: { partitionMode: 'edge-cache' },
 * });
 *
 * // Load from environment
 * const envConfig = getConfigFromEnv();
 *
 * // Validate configuration
 * const result = validateConfig(config);
 * if (!result.valid) {
 *   console.error('Config errors:', result.errors);
 * }
 * ```
 *
 * @packageDocumentation
 * @module @evodb/config
 */

// =============================================================================
// Types
// =============================================================================

export type {
  // Utility types
  DeepPartial,
  DeepReadonly,

  // Storage types
  CacheConfig,
  StorageConfig,

  // Query types
  QueryHintsConfig,
  SubrequestContext,
  QueryConfig,

  // Writer types
  PartitionMode,
  BlockIndexEvictionPolicy,
  WriterConfig,

  // RPC types
  RpcConfig,

  // Observability types
  LogFormat,
  ObservabilityConfig,

  // Main config
  EvoDBConfig,

  // Validation types
  ValidationError,
  ValidationWarning,
  ValidationResult,

  // Environment types
  EnvConfigOptions,
} from './types.js';

// =============================================================================
// Defaults
// =============================================================================

export { DEFAULT_CONFIG } from './defaults.js';

// =============================================================================
// Config Functions
// =============================================================================

export { createConfig, mergeConfigs, getConfigFromEnv } from './config.js';

// =============================================================================
// Validation
// =============================================================================

export { validateConfig } from './validation.js';
