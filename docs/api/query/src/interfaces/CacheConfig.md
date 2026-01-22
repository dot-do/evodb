[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / CacheConfig

# Interface: CacheConfig

Defined in: [query/src/types.ts:1343](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1343)

Cache configuration.

Controls how partition data is cached to reduce R2 reads
for frequently accessed data.

## Example

```typescript
const cacheConfig: CacheConfig = {
  enabled: true,
  ttlSeconds: 3600,          // 1 hour
  maxSizeBytes: 268435456,   // 256MB
  keyPrefix: 'evodb-cache'
};
```

## Properties

### enabled

> **enabled**: `boolean`

Defined in: [query/src/types.ts:1345](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1345)

Enable caching

***

### ttlSeconds

> **ttlSeconds**: `number`

Defined in: [query/src/types.ts:1348](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1348)

Cache TTL in seconds

***

### maxSizeBytes

> **maxSizeBytes**: `number`

Defined in: [query/src/types.ts:1351](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1351)

Maximum cache size in bytes

***

### maxEntries?

> `optional` **maxEntries**: `number`

Defined in: [query/src/types.ts:1354](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1354)

Maximum number of cache entries (default: 1000)

***

### keyPrefix

> **keyPrefix**: `string`

Defined in: [query/src/types.ts:1357](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1357)

Cache key prefix
