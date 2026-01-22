[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / CacheAwarePlan

# Interface: CacheAwarePlan

Defined in: [query/src/cache-aware-planner.ts:90](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L90)

A cache-aware query plan.

## Properties

### query

> **query**: [`Query`](Query.md)

Defined in: [query/src/cache-aware-planner.ts:92](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L92)

The original query

***

### orderedPartitions

> **orderedPartitions**: [`PartitionInfo`](PartitionInfo.md)[]

Defined in: [query/src/cache-aware-planner.ts:95](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L95)

Partitions ordered by cache priority

***

### isReordered

> **isReordered**: `boolean`

Defined in: [query/src/cache-aware-planner.ts:98](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L98)

Whether partitions were reordered for cache optimization

***

### cacheStats

> **cacheStats**: [`PlanCacheStats`](PlanCacheStats.md)

Defined in: [query/src/cache-aware-planner.ts:101](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L101)

Cache statistics for the plan

***

### estimatedCost

> **estimatedCost**: `number`

Defined in: [query/src/cache-aware-planner.ts:104](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L104)

Estimated total cost (cache-adjusted)

***

### createdAt

> **createdAt**: `number`

Defined in: [query/src/cache-aware-planner.ts:107](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L107)

Plan creation timestamp
