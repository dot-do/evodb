[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / calculatePartitionBoundaries

# Function: calculatePartitionBoundaries()

> **calculatePartitionBoundaries**(`totalRows`, `dataSizeBytes`, `mode`): `number`[]

Defined in: [core/src/partition-modes.ts:591](https://github.com/dot-do/evodb/blob/main/core/src/partition-modes.ts#L591)

Calculate optimal partition boundaries for a sorted dataset

## Parameters

### totalRows

`number`

Total number of rows

### dataSizeBytes

`number`

Total data size

### mode

[`PartitionMode`](../type-aliases/PartitionMode.md)

Partition mode

## Returns

`number`[]

Array of row counts per partition
