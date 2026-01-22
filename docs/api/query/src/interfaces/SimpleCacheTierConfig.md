[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / SimpleCacheTierConfig

# Interface: SimpleCacheTierConfig

Defined in: [query/src/simple-engine.ts:297](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L297)

Cache tier configuration

## Properties

### enableCacheApi

> **enableCacheApi**: `boolean`

Defined in: [query/src/simple-engine.ts:299](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L299)

Enable Cache API tier (FREE)

***

### cacheTtlSeconds?

> `optional` **cacheTtlSeconds**: `number`

Defined in: [query/src/simple-engine.ts:301](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L301)

Cache TTL in seconds (default: 3600)

***

### maxCachedItemSize?

> `optional` **maxCachedItemSize**: `number`

Defined in: [query/src/simple-engine.ts:303](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L303)

Maximum cached item size in bytes

***

### cacheKeyPrefix?

> `optional` **cacheKeyPrefix**: `string`

Defined in: [query/src/simple-engine.ts:305](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L305)

Cache key prefix
