[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / getAllPartitionPaths

# Function: getAllPartitionPaths()

> **getAllPartitionPaths**(`tableLocation`, `partitionCount`, `mode`, `extension`): [`PartitionPathInfo`](../interfaces/PartitionPathInfo.md)[]

Defined in: [core/src/partition-modes.ts:365](https://github.com/dot-do/evodb/blob/main/core/src/partition-modes.ts#L365)

Generate paths for all partitions

## Parameters

### tableLocation

`string`

Base table location

### partitionCount

`number`

Number of partitions

### mode

[`PartitionMode`](../type-aliases/PartitionMode.md)

Partition mode

### extension

`string` = `'bin'`

File extension

## Returns

[`PartitionPathInfo`](../interfaces/PartitionPathInfo.md)[]

Array of partition path information
