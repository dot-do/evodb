[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / CacheManager

# Class: CacheManager

Defined in: [query/src/engine.ts:1253](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L1253)

Cache Manager

Manages edge cache integration for query results with LRU eviction.

## Constructors

### Constructor

> **new CacheManager**(`config`): `CacheManager`

Defined in: [query/src/engine.ts:1265](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L1265)

#### Parameters

##### config

[`QueryEngineConfig`](../interfaces/QueryEngineConfig.md)

#### Returns

`CacheManager`

## Methods

### getMaxEntries()

> **getMaxEntries**(): `number`

Defined in: [query/src/engine.ts:1273](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L1273)

Get the maximum number of cache entries

#### Returns

`number`

***

### getCacheSize()

> **getCacheSize**(): `number`

Defined in: [query/src/engine.ts:1280](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L1280)

Get the current number of cache entries

#### Returns

`number`

***

### getPartitionData()

> **getPartitionData**(`partition`): `Promise`\<\{ `data`: `ArrayBuffer`; `fromCache`: `boolean`; \}\>

Defined in: [query/src/engine.ts:1287](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L1287)

Get partition data from cache or R2

#### Parameters

##### partition

[`PartitionInfo`](../interfaces/PartitionInfo.md)

#### Returns

`Promise`\<\{ `data`: `ArrayBuffer`; `fromCache`: `boolean`; \}\>

***

### isCached()

> **isCached**(`partition`): `Promise`\<`boolean`\>

Defined in: [query/src/engine.ts:1371](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L1371)

Check if partition is cached

#### Parameters

##### partition

[`PartitionInfo`](../interfaces/PartitionInfo.md)

#### Returns

`Promise`\<`boolean`\>

***

### prefetch()

> **prefetch**(`partitions`): `Promise`\<`void`\>

Defined in: [query/src/engine.ts:1379](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L1379)

Prefetch partitions into cache

#### Parameters

##### partitions

[`PartitionInfo`](../interfaces/PartitionInfo.md)[]

#### Returns

`Promise`\<`void`\>

***

### getStats()

> **getStats**(): [`CacheStats`](../interfaces/CacheStats.md)

Defined in: [query/src/engine.ts:1405](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L1405)

Get cache statistics

#### Returns

[`CacheStats`](../interfaces/CacheStats.md)

***

### clear()

> **clear**(): `Promise`\<`void`\>

Defined in: [query/src/engine.ts:1412](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L1412)

Clear all cached data

#### Returns

`Promise`\<`void`\>

***

### invalidate()

> **invalidate**(`paths`): `Promise`\<`void`\>

Defined in: [query/src/engine.ts:1426](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L1426)

Invalidate specific cache entries

#### Parameters

##### paths

`string`[]

#### Returns

`Promise`\<`void`\>
