[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / CacheBenefitStats

# Interface: CacheBenefitStats

Defined in: [query/src/cache-aware-planner.ts:53](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L53)

Statistics about cache benefit for a set of partitions.

## Properties

### cachedPartitions

> **cachedPartitions**: `number`

Defined in: [query/src/cache-aware-planner.ts:55](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L55)

Number of cached partitions

***

### totalPartitions

> **totalPartitions**: `number`

Defined in: [query/src/cache-aware-planner.ts:58](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L58)

Total number of partitions

***

### cacheRatio

> **cacheRatio**: `number`

Defined in: [query/src/cache-aware-planner.ts:61](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L61)

Ratio of cached partitions (0.0 - 1.0)

***

### estimatedSavings

> **estimatedSavings**: `number`

Defined in: [query/src/cache-aware-planner.ts:64](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L64)

Estimated I/O savings from cache in bytes
