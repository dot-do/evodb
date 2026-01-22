[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / PartitionCalculation

# Interface: PartitionCalculation

Defined in: [core/src/partition-modes.ts:90](https://github.com/dot-do/evodb/blob/main/core/src/partition-modes.ts#L90)

Partition calculation result

## Properties

### partitionCount

> **partitionCount**: `number`

Defined in: [core/src/partition-modes.ts:92](https://github.com/dot-do/evodb/blob/main/core/src/partition-modes.ts#L92)

Number of partitions needed

***

### partitionSizeBytes

> **partitionSizeBytes**: `number`

Defined in: [core/src/partition-modes.ts:95](https://github.com/dot-do/evodb/blob/main/core/src/partition-modes.ts#L95)

Size of each partition in bytes (last may be smaller)

***

### rowsPerPartition

> **rowsPerPartition**: `number`

Defined in: [core/src/partition-modes.ts:98](https://github.com/dot-do/evodb/blob/main/core/src/partition-modes.ts#L98)

Estimated rows per partition

***

### mode

> **mode**: [`PartitionMode`](../type-aliases/PartitionMode.md)

Defined in: [core/src/partition-modes.ts:101](https://github.com/dot-do/evodb/blob/main/core/src/partition-modes.ts#L101)

The partition mode used

***

### isSinglePartition

> **isSinglePartition**: `boolean`

Defined in: [core/src/partition-modes.ts:104](https://github.com/dot-do/evodb/blob/main/core/src/partition-modes.ts#L104)

Whether the data fits in a single partition
