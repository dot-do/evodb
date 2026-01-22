[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / ScanOperator

# Interface: ScanOperator

Defined in: [query/src/types.ts:656](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L656)

Scan operator - reads data from R2 partitions.

The leaf operator in the execution tree that performs actual I/O.
Reads columnar data from R2 storage with optional column projection
pushed down to minimize data transfer.

## Extends

- `BaseOperator`

## Properties

### estimatedRows

> **estimatedRows**: `number`

Defined in: [query/src/types.ts:643](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L643)

Estimated output row count

#### Inherited from

`BaseOperator.estimatedRows`

***

### estimatedCost

> **estimatedCost**: `number`

Defined in: [query/src/types.ts:646](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L646)

Estimated cost

#### Inherited from

`BaseOperator.estimatedCost`

***

### type

> **type**: `"scan"`

Defined in: [query/src/types.ts:657](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L657)

***

### partitions

> **partitions**: [`PartitionInfo`](PartitionInfo.md)[]

Defined in: [query/src/types.ts:660](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L660)

Partitions to scan

***

### columns

> **columns**: `string`[]

Defined in: [query/src/types.ts:663](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L663)

Column projection at scan level
