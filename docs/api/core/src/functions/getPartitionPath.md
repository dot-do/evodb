[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / getPartitionPath

# Function: getPartitionPath()

> **getPartitionPath**(`tableLocation`, `partitionId`, `mode`, `extension`): [`PartitionPathInfo`](../interfaces/PartitionPathInfo.md)

Defined in: [core/src/partition-modes.ts:325](https://github.com/dot-do/evodb/blob/main/core/src/partition-modes.ts#L325)

Generate the storage path for a partition

## Parameters

### tableLocation

`string`

Base table location (e.g., "com/example/api/users")

### partitionId

`number`

Partition identifier (0-indexed)

### mode

[`PartitionMode`](../type-aliases/PartitionMode.md)

Partition mode being used

### extension

`string` = `'bin'`

File extension (default: 'bin' for columnar data)

## Returns

[`PartitionPathInfo`](../interfaces/PartitionPathInfo.md)

Partition path information

## Example

```ts
const path = getPartitionPath('com/example/api/users', 0, 'standard');
// path.path = 'com/example/api/users/data/part-00000.bin'
```
