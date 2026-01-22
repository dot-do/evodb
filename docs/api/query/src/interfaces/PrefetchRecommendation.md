[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / PrefetchRecommendation

# Interface: PrefetchRecommendation

Defined in: [query/src/cache-aware-planner.ts:113](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L113)

Prefetch recommendation.

## Properties

### shouldPrefetch

> **shouldPrefetch**: `boolean`

Defined in: [query/src/cache-aware-planner.ts:115](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L115)

Whether prefetching is recommended

***

### partitionsToPrefetch

> **partitionsToPrefetch**: [`PartitionInfo`](PartitionInfo.md)[]

Defined in: [query/src/cache-aware-planner.ts:118](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L118)

Partitions that should be prefetched

***

### estimatedPrefetchCost

> **estimatedPrefetchCost**: `number`

Defined in: [query/src/cache-aware-planner.ts:121](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L121)

Estimated cost of prefetching (bytes)

***

### currentCacheRatio

> **currentCacheRatio**: `number`

Defined in: [query/src/cache-aware-planner.ts:124](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L124)

Current cache ratio
