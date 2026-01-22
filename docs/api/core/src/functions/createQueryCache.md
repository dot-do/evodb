[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / createQueryCache

# Function: createQueryCache()

> **createQueryCache**(`options?`): [`QueryCache`](../interfaces/QueryCache.md)

Defined in: core/src/query-cache.ts:167

Create a new query cache instance.

## Parameters

### options?

[`QueryCacheOptions`](../interfaces/QueryCacheOptions.md)

Default options for the cache

## Returns

[`QueryCache`](../interfaces/QueryCache.md)

New QueryCache instance

## Example

```typescript
// Create cache with defaults
const cache = createQueryCache();

// Create cache with 1 minute TTL and max 1000 entries
const cache = createQueryCache({ ttl: 60000, maxSize: 1000 });
```
