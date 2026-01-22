[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / PruneReason

# Type Alias: PruneReason

> **PruneReason** = `"zone_map_min_max"` \| `"zone_map_null"` \| `"bloom_filter"` \| `"partition_filter"`

Defined in: [query/src/types.ts:924](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L924)

Reason for partition pruning.

| Reason             | Description                                      |
|--------------------|--------------------------------------------------|
| zone_map_min_max   | Value outside column's min/max range             |
| zone_map_null      | Predicate requires non-null but column all null  |
| bloom_filter       | Bloom filter indicates value not present         |
| partition_filter   | Partition column value doesn't match predicate   |
