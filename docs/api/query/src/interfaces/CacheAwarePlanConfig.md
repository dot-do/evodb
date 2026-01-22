[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / CacheAwarePlanConfig

# Interface: CacheAwarePlanConfig

Defined in: [query/src/cache-aware-planner.ts:27](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L27)

Configuration for cache-aware query planning.

## Properties

### enabled

> **enabled**: `boolean`

Defined in: [query/src/cache-aware-planner.ts:29](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L29)

Enable cache-aware planning

***

### cacheWeightFactor

> **cacheWeightFactor**: `number`

Defined in: [query/src/cache-aware-planner.ts:35](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L35)

Cost reduction factor for cached partitions (0.0 - 1.0).
E.g., 0.5 means cached partitions have 50% the cost of non-cached.

***

### maxReorderDistance

> **maxReorderDistance**: `number`

Defined in: [query/src/cache-aware-planner.ts:41](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L41)

Maximum distance (in positions) a partition can be reordered.
Limits how much the original order is disrupted.

***

### prefetchThreshold

> **prefetchThreshold**: `number`

Defined in: [query/src/cache-aware-planner.ts:47](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L47)

Cache ratio threshold for prefetch recommendation.
If cache ratio is above this, recommend prefetching remaining partitions.
