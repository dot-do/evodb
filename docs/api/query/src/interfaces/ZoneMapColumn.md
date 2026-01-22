[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / ZoneMapColumn

# Interface: ZoneMapColumn

Defined in: [query/src/types.ts:846](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L846)

Zone map column statistics.

Per-column statistics used for predicate evaluation during
partition pruning. These statistics are collected during
data ingestion and stored in partition metadata.

## Properties

### min

> **min**: `unknown`

Defined in: [query/src/types.ts:848](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L848)

Minimum value

***

### max

> **max**: `unknown`

Defined in: [query/src/types.ts:851](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L851)

Maximum value

***

### nullCount

> **nullCount**: `number`

Defined in: [query/src/types.ts:854](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L854)

Null count

***

### allNull

> **allNull**: `boolean`

Defined in: [query/src/types.ts:857](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L857)

Whether all values are null

***

### distinctCount?

> `optional` **distinctCount**: `number`

Defined in: [query/src/types.ts:860](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L860)

Estimated distinct count
