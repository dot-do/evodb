[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / CacheStats

# Interface: CacheStats

Defined in: [query/src/types.ts:1192](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1192)

Cache statistics for monitoring cache performance.

## Example

```typescript
const cacheStats: CacheStats = await engine.getCacheStats();

console.log(`Hits: ${cacheStats.hits}, Misses: ${cacheStats.misses}`);
console.log(`Hit ratio: ${(cacheStats.hitRatio * 100).toFixed(1)}%`);
```

## Properties

### hits

> **hits**: `number`

Defined in: [query/src/types.ts:1194](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1194)

Cache hits

***

### misses

> **misses**: `number`

Defined in: [query/src/types.ts:1197](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1197)

Cache misses

***

### bytesFromCache

> **bytesFromCache**: `number`

Defined in: [query/src/types.ts:1200](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1200)

Bytes served from cache

***

### bytesFromR2

> **bytesFromR2**: `number`

Defined in: [query/src/types.ts:1203](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1203)

Bytes read from R2

***

### hitRatio

> **hitRatio**: `number`

Defined in: [query/src/types.ts:1206](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1206)

Cache hit ratio
