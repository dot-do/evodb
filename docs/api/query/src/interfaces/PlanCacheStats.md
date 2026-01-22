[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / PlanCacheStats

# Interface: PlanCacheStats

Defined in: [query/src/cache-aware-planner.ts:70](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L70)

Cache statistics for a plan.

## Properties

### cachedPartitions

> **cachedPartitions**: `number`

Defined in: [query/src/cache-aware-planner.ts:72](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L72)

Number of cached partitions

***

### totalPartitions

> **totalPartitions**: `number`

Defined in: [query/src/cache-aware-planner.ts:75](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L75)

Total number of partitions

***

### cachedBytes

> **cachedBytes**: `number`

Defined in: [query/src/cache-aware-planner.ts:78](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L78)

Total bytes in cached partitions

***

### uncachedBytes

> **uncachedBytes**: `number`

Defined in: [query/src/cache-aware-planner.ts:81](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L81)

Total bytes in uncached partitions

***

### cacheRatio

> **cacheRatio**: `number`

Defined in: [query/src/cache-aware-planner.ts:84](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L84)

Ratio of cached partitions (0.0 - 1.0)
