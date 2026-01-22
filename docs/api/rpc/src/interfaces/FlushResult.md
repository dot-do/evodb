[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [rpc/src](../README.md) / FlushResult

# Interface: FlushResult

Defined in: [rpc/src/types.ts:402](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L402)

Result of flushing buffers to R2

## Properties

### success

> **success**: `boolean`

Defined in: [rpc/src/types.ts:404](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L404)

Whether the flush was successful

***

### batchesFlushed

> **batchesFlushed**: `number`

Defined in: [rpc/src/types.ts:407](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L407)

Number of batches flushed

***

### entriesFlushed

> **entriesFlushed**: `number`

Defined in: [rpc/src/types.ts:410](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L410)

Number of entries flushed

***

### bytesWritten

> **bytesWritten**: `number`

Defined in: [rpc/src/types.ts:413](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L413)

Total bytes written

***

### paths

> **paths**: `string`[]

Defined in: [rpc/src/types.ts:416](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L416)

R2 paths where data was written

***

### durationMs

> **durationMs**: `number`

Defined in: [rpc/src/types.ts:419](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L419)

Duration of flush operation in milliseconds

***

### error?

> `optional` **error**: `string`

Defined in: [rpc/src/types.ts:422](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L422)

Error message if flush failed

***

### usedFallback

> **usedFallback**: `boolean`

Defined in: [rpc/src/types.ts:425](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L425)

Whether fallback storage was used
