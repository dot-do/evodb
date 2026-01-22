[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / PartitionInfo

# Interface: PartitionInfo

Defined in: [query/src/types.ts:791](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L791)

Partition information for query planning and execution.

Contains metadata about a data partition including location,
statistics for pruning, and caching status.

## Example

```typescript
const partition: PartitionInfo = {
  path: 'data/events/year=2024/month=01/part-00001.parquet',
  partitionValues: { year: 2024, month: 1 },
  sizeBytes: 52428800,
  rowCount: 100000,
  zoneMap: {
    columns: {
      timestamp: { min: 1704067200000, max: 1706745600000, nullCount: 0, allNull: false }
    }
  },
  isCached: true,
  cacheKey: 'events-2024-01-00001'
};
```

## Properties

### path

> **path**: `string`

Defined in: [query/src/types.ts:793](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L793)

Partition file path

***

### partitionValues

> **partitionValues**: `PartitionValues`

Defined in: [query/src/types.ts:796](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L796)

Partition values

***

### sizeBytes

> **sizeBytes**: `number`

Defined in: [query/src/types.ts:799](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L799)

File size in bytes

***

### rowCount

> **rowCount**: `number`

Defined in: [query/src/types.ts:802](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L802)

Row count

***

### zoneMap

> **zoneMap**: [`ZoneMap`](ZoneMap.md)

Defined in: [query/src/types.ts:805](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L805)

Zone map statistics

***

### bloomFilter?

> `optional` **bloomFilter**: [`BloomFilterInfo`](BloomFilterInfo.md)

Defined in: [query/src/types.ts:808](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L808)

Optional bloom filter

***

### isCached

> **isCached**: `boolean`

Defined in: [query/src/types.ts:811](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L811)

Whether partition is cached

***

### cacheKey?

> `optional` **cacheKey**: `string`

Defined in: [query/src/types.ts:814](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L814)

Cache key if cached
