[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / PrunedPartition

# Interface: PrunedPartition

Defined in: [query/src/types.ts:900](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L900)

Information about a pruned partition.

Records why a partition was excluded from the query plan,
useful for debugging and analyzing query optimization.

## Properties

### path

> **path**: `string`

Defined in: [query/src/types.ts:902](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L902)

Partition path

***

### reason

> **reason**: [`PruneReason`](../type-aliases/PruneReason.md)

Defined in: [query/src/types.ts:905](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L905)

Reason for pruning

***

### column?

> `optional` **column**: `string`

Defined in: [query/src/types.ts:908](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L908)

Column that triggered pruning

***

### predicate?

> `optional` **predicate**: [`Predicate`](Predicate.md)

Defined in: [query/src/types.ts:911](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L911)

Predicate that triggered pruning
