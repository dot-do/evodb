# @evodb/config

Unified configuration schema for EvoDB with consistent naming, validation, and environment support.

## Features

- Single unified configuration for all EvoDB packages
- Consistent naming conventions across all options
- Deep partial overrides with type safety
- Environment variable support
- Configuration validation with clear error messages

## Installation

```bash
pnpm add @evodb/config
```

## Usage

### Basic Configuration

```typescript
import { createConfig, DEFAULT_CONFIG } from '@evodb/config';

// Use all defaults
const config = createConfig();

// Override specific values
const customConfig = createConfig({
  query: { maxParallelism: 16 },
  writer: { partitionMode: 'edge-cache' },
});
```

### Environment-Based Configuration

```typescript
import { getConfigFromEnv } from '@evodb/config';

// Load from environment variables (EVODB_* prefix)
const config = getConfigFromEnv();

// Use custom prefix
const config = getConfigFromEnv({ prefix: 'MYAPP' });
```

Environment variable mapping:

| Environment Variable | Config Path |
|---------------------|-------------|
| `EVODB_QUERY_MAX_PARALLELISM` | `query.maxParallelism` |
| `EVODB_QUERY_TIMEOUT_MS` | `query.defaultTimeoutMs` |
| `EVODB_STORAGE_CACHE_ENABLED` | `storage.cache.enabled` |
| `EVODB_STORAGE_CACHE_TTL_SECONDS` | `storage.cache.ttlSeconds` |
| `EVODB_WRITER_PARTITION_MODE` | `writer.partitionMode` |
| `EVODB_RPC_MAX_RETRIES` | `rpc.maxRetries` |
| `EVODB_OBSERVABILITY_LOG_LEVEL` | `observability.logLevel` |

### Configuration Validation

```typescript
import { createConfig, validateConfig } from '@evodb/config';

const config = createConfig({
  query: { defaultTimeoutMs: -100 }, // Invalid!
});

const result = validateConfig(config);
if (!result.valid) {
  console.error('Config errors:', result.errors);
  // [{ path: 'query.defaultTimeoutMs', message: 'Default timeout must be positive...' }]
}
```

### Merging Configurations

```typescript
import { createConfig, mergeConfigs } from '@evodb/config';

const base = { query: { maxParallelism: 4 } };
const override = { query: { defaultTimeoutMs: 60000 } };

const merged = mergeConfigs(base, override);
// merged.query.maxParallelism === 4
// merged.query.defaultTimeoutMs === 60000

// Create from merged partials
const config = createConfig(merged);
```

## Configuration Schema

### StorageConfig

```typescript
interface StorageConfig {
  cache: {
    enabled: boolean;           // Enable caching
    ttlSeconds: number;         // Cache TTL (default: 3600)
    maxSizeBytes: number;       // Max size (default: 256MB)
    maxEntries?: number;        // Max entries (default: 1000)
    keyPrefix: string;          // Key prefix (default: 'evodb-cache')
  };
}
```

### QueryConfig

```typescript
interface QueryConfig {
  maxParallelism: number;       // Max concurrent reads (default: 8)
  defaultTimeoutMs: number;     // Query timeout (default: 30000)
  memoryLimitBytes: number;     // Memory limit (default: 512MB)
  enableStats: boolean;         // Collect stats (default: true)
  enablePlanCache: boolean;     // Cache query plans (default: true)
  defaultHints?: QueryHintsConfig;
  subrequestContext?: 'worker' | 'snippet';
  subrequestBudget?: number;
}
```

### WriterConfig

```typescript
interface WriterConfig {
  partitionMode: 'do-sqlite' | 'edge-cache' | 'enterprise';
  bufferSize: number;           // Entries before flush (default: 10000)
  bufferTimeoutMs: number;      // Timeout before flush (default: 5000)
  targetBlockSizeBytes?: number;
  maxBlockSizeBytes?: number;
  minCompactBlocks: number;     // Trigger compaction (default: 4)
  targetCompactSizeBytes?: number;
  maxRetries: number;           // R2 write retries (default: 3)
  retryBackoffMs: number;       // Backoff base (default: 100)
  maxBufferSizeBytes: number;   // Hard limit (default: 128MB)
  maxBlockIndexSize: number;    // Index size (default: 100000)
  blockIndexEvictionPolicy: 'lru' | 'none';
}
```

### RpcConfig

```typescript
interface RpcConfig {
  maxBatchSize: number;         // Entries per batch (default: 1000)
  maxBatchSizeBytes: number;    // Bytes per batch (default: 4MB)
  maxMessageSizeBytes: number;  // Max message (default: 16MB)
  batchTimeoutMs: number;       // Batch timeout (default: 1000)
  maxRetries: number;           // Retry attempts (default: 3)
  initialRetryDelayMs: number;  // Initial delay (default: 100)
  maxRetryDelayMs: number;      // Max delay (default: 10000)
  backoffMultiplier: number;    // Backoff factor (default: 2)
  autoReconnect: boolean;       // Auto reconnect (default: true)
  reconnectDelayMs: number;     // Reconnect delay (default: 1000)
  maxReconnectAttempts: number; // Max reconnects (default: 10)
  heartbeatIntervalMs: number;  // Heartbeat (default: 30000)
  maxPendingBatches: number;    // Pending limit (default: 100)
  pendingBatchTtlMs: number;    // Batch TTL (default: 30000)
  enableDeduplication: boolean; // Dedup enabled (default: true)
  deduplicationWindowMs: number; // Dedup window (default: 300000)
}
```

### ObservabilityConfig

```typescript
interface ObservabilityConfig {
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  logFormat: 'json' | 'pretty';
  tracingEnabled: boolean;      // Enable tracing (default: false)
  tracingServiceName: string;   // Service name (default: 'evodb')
  tracingSamplingRate?: number; // Sample rate 0-1 (default: 1.0)
  metricsEnabled: boolean;      // Enable metrics (default: false)
  metricsBatchSize?: number;    // Batch size (default: 100)
}
```

## Naming Conventions

The configuration follows consistent naming patterns:

| Pattern | Usage | Examples |
|---------|-------|----------|
| `*TimeoutMs` | Timeouts in milliseconds | `defaultTimeoutMs`, `batchTimeoutMs` |
| `*IntervalMs` | Intervals in milliseconds | `heartbeatIntervalMs`, `reconnectDelayMs` |
| `*Bytes` | Sizes in bytes | `memoryLimitBytes`, `maxSizeBytes` |
| `max*` | Maximum limits | `maxParallelism`, `maxRetries` |
| `min*` | Minimum thresholds | `minCompactBlocks` |
| `*Count` / `*Size` | Numeric counts | `maxBlockIndexSize`, `batchSize` |
| `enable*` | Boolean flags | `enableStats`, `enableDeduplication` |

## Migration from Existing Configs

The unified config maps to existing package configs:

| Existing Config | Unified Config Path |
|----------------|---------------------|
| `QueryEngineConfig.maxParallelism` | `query.maxParallelism` |
| `QueryEngineConfig.defaultTimeoutMs` | `query.defaultTimeoutMs` |
| `WriterOptions.bufferSize` | `writer.bufferSize` |
| `WriterOptions.bufferTimeout` | `writer.bufferTimeoutMs` |
| `ChildConfig.maxRetries` | `rpc.maxRetries` |
| `ParentConfig.flushThresholdEntries` | `writer.bufferSize` |

## License

MIT
