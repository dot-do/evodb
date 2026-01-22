[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [rpc/src](../README.md) / BufferStats

# Interface: BufferStats

Defined in: [rpc/src/types.ts:365](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L365)

Buffer statistics

## Properties

### batchCount

> **batchCount**: `number`

Defined in: [rpc/src/types.ts:367](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L367)

Total number of batches in buffer

***

### entryCount

> **entryCount**: `number`

Defined in: [rpc/src/types.ts:370](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L370)

Total number of entries across all batches

***

### totalSizeBytes

> **totalSizeBytes**: `number`

Defined in: [rpc/src/types.ts:373](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L373)

Total size in bytes

***

### utilization

> **utilization**: `number`

Defined in: [rpc/src/types.ts:376](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L376)

Buffer utilization (0-1)

***

### oldestBatchTime?

> `optional` **oldestBatchTime**: `number`

Defined in: [rpc/src/types.ts:379](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L379)

Oldest batch timestamp

***

### newestBatchTime?

> `optional` **newestBatchTime**: `number`

Defined in: [rpc/src/types.ts:382](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L382)

Newest batch timestamp
