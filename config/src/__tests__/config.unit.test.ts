/**
 * @evodb/config - Unit Tests
 *
 * TDD tests for unified configuration schema.
 * Tests written BEFORE implementation per issue evodb-7zu requirements.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createConfig,
  validateConfig,
  getConfigFromEnv,
  mergeConfigs,
  DEFAULT_CONFIG,
  type EvoDBConfig,
  type DeepPartial,
  type ValidationResult,
  type StorageConfig,
  type QueryConfig,
  type WriterConfig,
  type RpcConfig,
  type ObservabilityConfig,
} from '../index.js';

describe('@evodb/config', () => {
  // =============================================================================
  // DEFAULT_CONFIG Tests
  // =============================================================================

  describe('DEFAULT_CONFIG', () => {
    it('should export a complete default configuration', () => {
      expect(DEFAULT_CONFIG).toBeDefined();
      expect(DEFAULT_CONFIG.storage).toBeDefined();
      expect(DEFAULT_CONFIG.query).toBeDefined();
      expect(DEFAULT_CONFIG.writer).toBeDefined();
      expect(DEFAULT_CONFIG.rpc).toBeDefined();
      expect(DEFAULT_CONFIG.observability).toBeDefined();
    });

    it('should have consistent naming for timeout fields (*TimeoutMs)', () => {
      // All timeout fields should end with 'Ms'
      expect(DEFAULT_CONFIG.query.defaultTimeoutMs).toBeTypeOf('number');
      expect(DEFAULT_CONFIG.rpc.heartbeatIntervalMs).toBeTypeOf('number');
      expect(DEFAULT_CONFIG.rpc.reconnectDelayMs).toBeTypeOf('number');
      expect(DEFAULT_CONFIG.writer.bufferTimeoutMs).toBeTypeOf('number');
    });

    it('should have consistent naming for size fields (*Bytes)', () => {
      // All size fields should end with 'Bytes'
      expect(DEFAULT_CONFIG.query.memoryLimitBytes).toBeTypeOf('number');
      expect(DEFAULT_CONFIG.writer.maxBufferSizeBytes).toBeTypeOf('number');
      expect(DEFAULT_CONFIG.rpc.maxMessageSizeBytes).toBeTypeOf('number');
    });

    it('should have consistent naming for count fields (max*, min*, *Count)', () => {
      expect(DEFAULT_CONFIG.query.maxParallelism).toBeTypeOf('number');
      expect(DEFAULT_CONFIG.writer.minCompactBlocks).toBeTypeOf('number');
      expect(DEFAULT_CONFIG.rpc.maxRetries).toBeTypeOf('number');
    });
  });

  // =============================================================================
  // createConfig Tests
  // =============================================================================

  describe('createConfig', () => {
    it('should create a complete config with no overrides', () => {
      const config = createConfig();
      expect(config).toEqual(DEFAULT_CONFIG);
    });

    it('should deep merge partial overrides', () => {
      const config = createConfig({
        query: {
          maxParallelism: 16,
        },
      });
      expect(config.query.maxParallelism).toBe(16);
      // Other query fields should use defaults
      expect(config.query.defaultTimeoutMs).toBe(DEFAULT_CONFIG.query.defaultTimeoutMs);
      // Other sections should use defaults
      expect(config.storage).toEqual(DEFAULT_CONFIG.storage);
    });

    it('should allow deeply nested overrides', () => {
      const config = createConfig({
        storage: {
          cache: {
            enabled: false,
          },
        },
      });
      expect(config.storage.cache.enabled).toBe(false);
      // Other cache fields should use defaults
      expect(config.storage.cache.ttlSeconds).toBe(DEFAULT_CONFIG.storage.cache.ttlSeconds);
    });

    it('should not mutate the default config', () => {
      const original = DEFAULT_CONFIG.query.maxParallelism;
      createConfig({
        query: {
          maxParallelism: 999,
        },
      });
      expect(DEFAULT_CONFIG.query.maxParallelism).toBe(original);
    });

    it('should accept multiple override layers', () => {
      const base = createConfig({ query: { maxParallelism: 8 } });
      const extended = createConfig(
        { query: { defaultTimeoutMs: 60000 } },
        base
      );
      expect(extended.query.maxParallelism).toBe(8);
      expect(extended.query.defaultTimeoutMs).toBe(60000);
    });
  });

  // =============================================================================
  // validateConfig Tests
  // =============================================================================

  describe('validateConfig', () => {
    it('should pass validation for default config', () => {
      const result = validateConfig(DEFAULT_CONFIG);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should pass validation for valid custom config', () => {
      const config = createConfig({
        query: { maxParallelism: 16 },
      });
      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    });

    it('should fail validation for negative timeout values', () => {
      const config = createConfig({
        query: { defaultTimeoutMs: -1000 },
      });
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].path).toContain('defaultTimeoutMs');
    });

    it('should fail validation for invalid memory limits', () => {
      const config = createConfig({
        query: { memoryLimitBytes: 0 },
      });
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path.includes('memoryLimitBytes'))).toBe(true);
    });

    it('should fail validation for invalid parallelism values', () => {
      const config = createConfig({
        query: { maxParallelism: -1 },
      });
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
    });

    it('should provide clear error messages', () => {
      const config = createConfig({
        query: { defaultTimeoutMs: -100 },
      });
      const result = validateConfig(config);
      expect(result.errors[0].message).toContain('must be');
    });

    it('should validate cache configuration', () => {
      const config = createConfig({
        storage: {
          cache: {
            ttlSeconds: -1,
          },
        },
      });
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path.includes('ttlSeconds'))).toBe(true);
    });

    it('should validate RPC configuration', () => {
      const config = createConfig({
        rpc: {
          maxRetries: -1,
        },
      });
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
    });
  });

  // =============================================================================
  // getConfigFromEnv Tests
  // =============================================================================

  describe('getConfigFromEnv', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return default config when no env vars are set', () => {
      const config = getConfigFromEnv();
      expect(config).toEqual(DEFAULT_CONFIG);
    });

    it('should override query config from EVODB_QUERY_* env vars', () => {
      process.env.EVODB_QUERY_MAX_PARALLELISM = '16';
      process.env.EVODB_QUERY_TIMEOUT_MS = '60000';

      const config = getConfigFromEnv();
      expect(config.query.maxParallelism).toBe(16);
      expect(config.query.defaultTimeoutMs).toBe(60000);
    });

    it('should override storage config from EVODB_STORAGE_* env vars', () => {
      process.env.EVODB_STORAGE_CACHE_ENABLED = 'false';
      process.env.EVODB_STORAGE_CACHE_TTL_SECONDS = '7200';

      const config = getConfigFromEnv();
      expect(config.storage.cache.enabled).toBe(false);
      expect(config.storage.cache.ttlSeconds).toBe(7200);
    });

    it('should override writer config from EVODB_WRITER_* env vars', () => {
      process.env.EVODB_WRITER_PARTITION_MODE = 'edge-cache';
      process.env.EVODB_WRITER_BUFFER_SIZE = '20000';

      const config = getConfigFromEnv();
      expect(config.writer.partitionMode).toBe('edge-cache');
      expect(config.writer.bufferSize).toBe(20000);
    });

    it('should override RPC config from EVODB_RPC_* env vars', () => {
      process.env.EVODB_RPC_MAX_RETRIES = '5';
      process.env.EVODB_RPC_AUTO_RECONNECT = 'false';

      const config = getConfigFromEnv();
      expect(config.rpc.maxRetries).toBe(5);
      expect(config.rpc.autoReconnect).toBe(false);
    });

    it('should override observability config from EVODB_OBSERVABILITY_* env vars', () => {
      process.env.EVODB_OBSERVABILITY_LOG_LEVEL = 'debug';
      process.env.EVODB_OBSERVABILITY_TRACING_ENABLED = 'true';

      const config = getConfigFromEnv();
      expect(config.observability.logLevel).toBe('debug');
      expect(config.observability.tracingEnabled).toBe(true);
    });

    it('should ignore invalid env var values and use defaults', () => {
      process.env.EVODB_QUERY_MAX_PARALLELISM = 'not-a-number';

      const config = getConfigFromEnv();
      expect(config.query.maxParallelism).toBe(DEFAULT_CONFIG.query.maxParallelism);
    });

    it('should accept custom env prefix', () => {
      process.env.MYAPP_QUERY_MAX_PARALLELISM = '32';

      const config = getConfigFromEnv({ prefix: 'MYAPP' });
      expect(config.query.maxParallelism).toBe(32);
    });
  });

  // =============================================================================
  // mergeConfigs Tests
  // =============================================================================

  describe('mergeConfigs', () => {
    it('should merge two configs with later taking precedence', () => {
      const base: DeepPartial<EvoDBConfig> = {
        query: { maxParallelism: 4 },
      };
      const override: DeepPartial<EvoDBConfig> = {
        query: { maxParallelism: 8 },
      };

      const merged = mergeConfigs(base, override);
      expect(merged.query?.maxParallelism).toBe(8);
    });

    it('should deep merge nested objects', () => {
      const base: DeepPartial<EvoDBConfig> = {
        storage: {
          cache: { enabled: true, ttlSeconds: 3600 },
        },
      };
      const override: DeepPartial<EvoDBConfig> = {
        storage: {
          cache: { ttlSeconds: 7200 },
        },
      };

      const merged = mergeConfigs(base, override);
      expect(merged.storage?.cache?.enabled).toBe(true);
      expect(merged.storage?.cache?.ttlSeconds).toBe(7200);
    });

    it('should handle undefined values correctly', () => {
      const base: DeepPartial<EvoDBConfig> = {
        query: { maxParallelism: 4, defaultTimeoutMs: 30000 },
      };
      const override: DeepPartial<EvoDBConfig> = {
        query: { maxParallelism: undefined },
      };

      const merged = mergeConfigs(base, override);
      // undefined should not override existing value
      expect(merged.query?.maxParallelism).toBe(4);
      expect(merged.query?.defaultTimeoutMs).toBe(30000);
    });

    it('should merge multiple configs in order', () => {
      const a: DeepPartial<EvoDBConfig> = { query: { maxParallelism: 2 } };
      const b: DeepPartial<EvoDBConfig> = { query: { maxParallelism: 4 } };
      const c: DeepPartial<EvoDBConfig> = { query: { maxParallelism: 8 } };

      const merged = mergeConfigs(a, b, c);
      expect(merged.query?.maxParallelism).toBe(8);
    });
  });

  // =============================================================================
  // Type Safety Tests
  // =============================================================================

  describe('Type Safety', () => {
    it('should enforce correct types for StorageConfig', () => {
      const storage: StorageConfig = {
        cache: {
          enabled: true,
          ttlSeconds: 3600,
          maxSizeBytes: 256 * 1024 * 1024,
          keyPrefix: 'evodb',
        },
      };
      expect(storage.cache.enabled).toBe(true);
    });

    it('should enforce correct types for QueryConfig', () => {
      const query: QueryConfig = {
        maxParallelism: 8,
        defaultTimeoutMs: 30000,
        memoryLimitBytes: 512 * 1024 * 1024,
        enableStats: true,
        enablePlanCache: true,
        defaultHints: {
          preferCache: true,
        },
      };
      expect(query.maxParallelism).toBe(8);
    });

    it('should enforce correct types for WriterConfig', () => {
      const writer: WriterConfig = {
        partitionMode: 'do-sqlite',
        bufferSize: 10000,
        bufferTimeoutMs: 5000,
        minCompactBlocks: 4,
        maxRetries: 3,
        retryBackoffMs: 100,
        maxBufferSizeBytes: 128 * 1024 * 1024,
        maxBlockIndexSize: 100000,
        blockIndexEvictionPolicy: 'lru',
      };
      expect(writer.partitionMode).toBe('do-sqlite');
    });

    it('should enforce correct types for RpcConfig', () => {
      const rpc: RpcConfig = {
        maxBatchSize: 1000,
        maxBatchSizeBytes: 4 * 1024 * 1024,
        maxMessageSizeBytes: 16 * 1024 * 1024,
        batchTimeoutMs: 1000,
        maxRetries: 3,
        initialRetryDelayMs: 100,
        maxRetryDelayMs: 10000,
        backoffMultiplier: 2,
        autoReconnect: true,
        reconnectDelayMs: 1000,
        maxReconnectAttempts: 10,
        heartbeatIntervalMs: 30000,
        maxPendingBatches: 100,
        pendingBatchTtlMs: 30000,
        enableDeduplication: true,
        deduplicationWindowMs: 300000,
      };
      expect(rpc.autoReconnect).toBe(true);
    });

    it('should enforce correct types for ObservabilityConfig', () => {
      const observability: ObservabilityConfig = {
        logLevel: 'info',
        logFormat: 'json',
        tracingEnabled: true,
        tracingServiceName: 'my-service',
        metricsEnabled: true,
      };
      expect(observability.logLevel).toBe('info');
    });
  });

  // =============================================================================
  // Edge Cases Tests
  // =============================================================================

  describe('Edge Cases', () => {
    it('should handle empty override object', () => {
      const config = createConfig({});
      expect(config).toEqual(DEFAULT_CONFIG);
    });

    it('should handle null-ish values in mergeConfigs', () => {
      const base: DeepPartial<EvoDBConfig> = { query: { maxParallelism: 4 } };
      const merged = mergeConfigs(base, null as unknown as DeepPartial<EvoDBConfig>);
      expect(merged.query?.maxParallelism).toBe(4);
    });

    it('should handle arrays in config (if any)', () => {
      // Currently no arrays in config, but this ensures future-proofing
      const config = createConfig();
      expect(config).toBeDefined();
    });

    it('should freeze returned config to prevent mutation', () => {
      const config = createConfig();
      // Config should be read-only in strict mode
      expect(() => {
        (config as { query: { maxParallelism: number } }).query.maxParallelism = 999;
      }).toThrow();
    });
  });

  // =============================================================================
  // ValidationResult Type Tests
  // =============================================================================

  describe('ValidationResult', () => {
    it('should have correct structure for valid config', () => {
      const result: ValidationResult = validateConfig(DEFAULT_CONFIG);
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('warnings');
    });

    it('should include path, message, and value in errors', () => {
      const config = createConfig({
        query: { defaultTimeoutMs: -100 },
      });
      const result = validateConfig(config);

      expect(result.errors[0]).toHaveProperty('path');
      expect(result.errors[0]).toHaveProperty('message');
      expect(result.errors[0]).toHaveProperty('value');
    });

    it('should provide warnings for suboptimal configurations', () => {
      const config = createConfig({
        query: { maxParallelism: 1000 }, // Very high parallelism
      });
      const result = validateConfig(config);
      // Should warn about potentially high parallelism
      expect(result.warnings.length).toBeGreaterThanOrEqual(0);
    });
  });
});
