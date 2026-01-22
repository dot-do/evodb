[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / CacheAwareQueryPlanner

# Class: CacheAwareQueryPlanner

Defined in: [query/src/cache-aware-planner.ts:182](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L182)

Cache-Aware Query Planner

Considers cached data when planning queries and prefers queries
that can use cached blocks to minimize I/O costs.

## Example

```typescript
const planner = new CacheAwareQueryPlanner(config);

// Create a cache-aware plan
const plan = planner.createCacheAwarePlan(query, partitions);

// Get prefetch recommendations
const rec = planner.getPrefetchRecommendation(partitions);
if (rec.shouldPrefetch) {
  await prefetchPartitions(rec.partitionsToPrefetch);
}
```

## Constructors

### Constructor

> **new CacheAwareQueryPlanner**(`engineConfig`): `CacheAwareQueryPlanner`

Defined in: [query/src/cache-aware-planner.ts:196](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L196)

#### Parameters

##### engineConfig

[`QueryEngineConfig`](../interfaces/QueryEngineConfig.md) & `object`

#### Returns

`CacheAwareQueryPlanner`

## Methods

### isEnabled()

> **isEnabled**(): `boolean`

Defined in: [query/src/cache-aware-planner.ts:207](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L207)

Check if cache-aware planning is enabled.
Requires both explicit configuration and cache to be enabled.

#### Returns

`boolean`

***

### reorderByCache()

> **reorderByCache**(`partitions`): [`PartitionInfo`](../interfaces/PartitionInfo.md)[]

Defined in: [query/src/cache-aware-planner.ts:217](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L217)

Reorder partitions to prioritize cached ones.

Cached partitions are moved towards the front, but respecting
the maxReorderDistance limit to avoid excessive disruption.

#### Parameters

##### partitions

[`PartitionInfo`](../interfaces/PartitionInfo.md)[]

#### Returns

[`PartitionInfo`](../interfaces/PartitionInfo.md)[]

***

### estimatePartitionCost()

> **estimatePartitionCost**(`partition`): `number`

Defined in: [query/src/cache-aware-planner.ts:282](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L282)

Estimate the cost of reading a partition.
Cached partitions have reduced cost based on cacheWeightFactor.

#### Parameters

##### partition

[`PartitionInfo`](../interfaces/PartitionInfo.md)

#### Returns

`number`

***

### calculateTotalCost()

> **calculateTotalCost**(`partitions`): `number`

Defined in: [query/src/cache-aware-planner.ts:295](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L295)

Calculate the total cost for a set of partitions.

#### Parameters

##### partitions

[`PartitionInfo`](../interfaces/PartitionInfo.md)[]

#### Returns

`number`

***

### estimateCacheBenefit()

> **estimateCacheBenefit**(`partitions`): [`CacheBenefitStats`](../interfaces/CacheBenefitStats.md)

Defined in: [query/src/cache-aware-planner.ts:302](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L302)

Estimate the cache benefit for a set of partitions.

#### Parameters

##### partitions

[`PartitionInfo`](../interfaces/PartitionInfo.md)[]

#### Returns

[`CacheBenefitStats`](../interfaces/CacheBenefitStats.md)

***

### createCacheAwarePlan()

> **createCacheAwarePlan**(`query`, `partitions`): [`CacheAwarePlan`](../interfaces/CacheAwarePlan.md)

Defined in: [query/src/cache-aware-planner.ts:330](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L330)

Create a cache-aware execution plan for a query.

#### Parameters

##### query

[`Query`](../interfaces/Query.md)

##### partitions

[`PartitionInfo`](../interfaces/PartitionInfo.md)[]

#### Returns

[`CacheAwarePlan`](../interfaces/CacheAwarePlan.md)

***

### getPrefetchRecommendation()

> **getPrefetchRecommendation**(`partitions`): [`PrefetchRecommendation`](../interfaces/PrefetchRecommendation.md)

Defined in: [query/src/cache-aware-planner.ts:400](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L400)

Get prefetch recommendation for a set of partitions.

#### Parameters

##### partitions

[`PartitionInfo`](../interfaces/PartitionInfo.md)[]

#### Returns

[`PrefetchRecommendation`](../interfaces/PrefetchRecommendation.md)

***

### getStats()

> **getStats**(): [`CacheAwarePlanStats`](../interfaces/CacheAwarePlanStats.md)

Defined in: [query/src/cache-aware-planner.ts:451](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L451)

Get cache-aware planning statistics.

#### Returns

[`CacheAwarePlanStats`](../interfaces/CacheAwarePlanStats.md)

***

### resetStats()

> **resetStats**(): `void`

Defined in: [query/src/cache-aware-planner.ts:458](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L458)

Reset statistics.

#### Returns

`void`
