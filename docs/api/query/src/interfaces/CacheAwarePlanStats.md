[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / CacheAwarePlanStats

# Interface: CacheAwarePlanStats

Defined in: [query/src/cache-aware-planner.ts:130](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L130)

Statistics about cache-aware planning operations.

## Properties

### plansCreated

> **plansCreated**: `number`

Defined in: [query/src/cache-aware-planner.ts:132](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L132)

Total plans created

***

### plansReordered

> **plansReordered**: `number`

Defined in: [query/src/cache-aware-planner.ts:135](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L135)

Plans that were reordered

***

### averageCacheRatio

> **averageCacheRatio**: `number`

Defined in: [query/src/cache-aware-planner.ts:138](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L138)

Average cache ratio across all plans

***

### totalCachedBytes

> **totalCachedBytes**: `number`

Defined in: [query/src/cache-aware-planner.ts:141](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L141)

Total cached bytes encountered

***

### totalUncachedBytes

> **totalUncachedBytes**: `number`

Defined in: [query/src/cache-aware-planner.ts:144](https://github.com/dot-do/evodb/blob/main/query/src/cache-aware-planner.ts#L144)

Total uncached bytes encountered
