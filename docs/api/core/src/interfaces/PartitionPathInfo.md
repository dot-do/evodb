[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / PartitionPathInfo

# Interface: PartitionPathInfo

Defined in: [core/src/partition-modes.ts:110](https://github.com/dot-do/evodb/blob/main/core/src/partition-modes.ts#L110)

Partition path components

## Properties

### path

> **path**: `string`

Defined in: [core/src/partition-modes.ts:112](https://github.com/dot-do/evodb/blob/main/core/src/partition-modes.ts#L112)

Full R2/storage path

***

### tableLocation

> **tableLocation**: `string`

Defined in: [core/src/partition-modes.ts:115](https://github.com/dot-do/evodb/blob/main/core/src/partition-modes.ts#L115)

Table location prefix

***

### partitionId

> **partitionId**: `number`

Defined in: [core/src/partition-modes.ts:118](https://github.com/dot-do/evodb/blob/main/core/src/partition-modes.ts#L118)

Partition identifier (0-indexed)

***

### extension

> **extension**: `string`

Defined in: [core/src/partition-modes.ts:121](https://github.com/dot-do/evodb/blob/main/core/src/partition-modes.ts#L121)

File extension

***

### mode

> **mode**: [`PartitionMode`](../type-aliases/PartitionMode.md)

Defined in: [core/src/partition-modes.ts:124](https://github.com/dot-do/evodb/blob/main/core/src/partition-modes.ts#L124)

Partition mode used
