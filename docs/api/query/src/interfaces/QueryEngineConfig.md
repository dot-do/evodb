[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / QueryEngineConfig

# Interface: QueryEngineConfig

Defined in: [query/src/types.ts:1273](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1273)

Query engine configuration.

Configures the query engine instance with storage, caching,
and execution parameters.

## Example

```typescript
const config: QueryEngineConfig = {
  bucket: env.DATA_BUCKET,
  cache: {
    enabled: true,
    ttlSeconds: 3600,
    maxSizeBytes: 256 * 1024 * 1024, // 256MB
    keyPrefix: 'query-cache'
  },
  defaultHints: {
    preferCache: true,
    maxParallelism: 4,
    timeoutMs: 30000
  },
  maxParallelism: 8,
  defaultTimeoutMs: 60000,
  memoryLimitBytes: 512 * 1024 * 1024, // 512MB
  enableStats: true,
  enablePlanCache: true
};

const engine = new QueryEngine(config);
```

## Properties

### bucket

> **bucket**: [`R2Bucket`](R2Bucket.md)

Defined in: [query/src/types.ts:1275](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1275)

R2 bucket for data storage

***

### cache?

> `optional` **cache**: [`CacheConfig`](CacheConfig.md)

Defined in: [query/src/types.ts:1278](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1278)

Optional cache configuration

***

### defaultHints?

> `optional` **defaultHints**: [`QueryHints`](QueryHints.md)

Defined in: [query/src/types.ts:1281](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1281)

Default query hints

***

### maxParallelism?

> `optional` **maxParallelism**: `number`

Defined in: [query/src/types.ts:1284](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1284)

Maximum concurrent partition reads

***

### defaultTimeoutMs?

> `optional` **defaultTimeoutMs**: `number`

Defined in: [query/src/types.ts:1287](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1287)

Default timeout in milliseconds

***

### memoryLimitBytes?

> `optional` **memoryLimitBytes**: `number`

Defined in: [query/src/types.ts:1290](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1290)

Memory limit in bytes

***

### enableStats?

> `optional` **enableStats**: `boolean`

Defined in: [query/src/types.ts:1293](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1293)

Enable query statistics collection

***

### enablePlanCache?

> `optional` **enablePlanCache**: `boolean`

Defined in: [query/src/types.ts:1296](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1296)

Enable query plan caching

***

### dataSource?

> `optional` **dataSource**: [`TableDataSource`](TableDataSource.md)

Defined in: [query/src/types.ts:1305](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1305)

Optional data source for reading table data.
If not provided, the engine will use a default R2-based source.

For testing, use MockDataSource which provides in-memory test data.
For production, use R2DataSource or integrate with @evodb/reader.

***

### subrequestContext?

> `optional` **subrequestContext**: `SubrequestContext`

Defined in: [query/src/types.ts:1316](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1316)

Subrequest context for budget tracking.

Cloudflare Workers have different subrequest limits:
- 'worker': 1000 subrequests per invocation
- 'snippet': 5 subrequests per invocation

Defaults to 'worker' if not specified.

***

### subrequestBudget?

> `optional` **subrequestBudget**: `number`

Defined in: [query/src/types.ts:1324](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1324)

Custom subrequest budget override.

If specified, overrides the default budget for the context.
Useful for testing or custom environments.
