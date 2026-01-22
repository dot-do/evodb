[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / calculatePartitions

# Function: calculatePartitions()

> **calculatePartitions**(`dataSizeBytes`, `mode`, `estimatedRowCount?`): [`PartitionCalculation`](../interfaces/PartitionCalculation.md)

Defined in: [core/src/partition-modes.ts:268](https://github.com/dot-do/evodb/blob/main/core/src/partition-modes.ts#L268)

Calculate the number of partitions needed for a given data size

## Parameters

### dataSizeBytes

`number`

Total size of data in bytes

### mode

[`PartitionMode`](../type-aliases/PartitionMode.md)

Partition mode to use

### estimatedRowCount?

`number`

Optional estimated row count for better planning

## Returns

[`PartitionCalculation`](../interfaces/PartitionCalculation.md)

Partition calculation details

## Example

```ts
const calc = calculatePartitions(1024 * 1024 * 1024, 'standard'); // 1GB
console.log(calc.partitionCount); // 2 partitions for 500MB each
```
