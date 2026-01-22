[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [rpc/src](../README.md) / BufferedBatch

# Interface: BufferedBatch

Defined in: [rpc/src/types.ts:333](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L333)

A buffered batch in the Parent DO

## Properties

### batchId

> **batchId**: `string`

Defined in: [rpc/src/types.ts:335](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L335)

Unique batch ID

***

### sourceDoId

> **sourceDoId**: `string`

Defined in: [rpc/src/types.ts:338](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L338)

ID of the source Durable Object

***

### sourceShardName?

> `optional` **sourceShardName**: `string`

Defined in: [rpc/src/types.ts:341](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L341)

Source shard name (optional)

***

### entries

> **entries**: [`WalEntry`](../type-aliases/WalEntry.md)\<`unknown`\>[]

Defined in: [rpc/src/types.ts:344](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L344)

WAL entries in this batch

***

### receivedAt

> **receivedAt**: `number`

Defined in: [rpc/src/types.ts:347](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L347)

When the batch was received

***

### sequenceNumber

> **sequenceNumber**: `number`

Defined in: [rpc/src/types.ts:350](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L350)

Sequence number of this batch

***

### persisted

> **persisted**: `boolean`

Defined in: [rpc/src/types.ts:353](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L353)

Whether the batch has been persisted to R2

***

### inFallback

> **inFallback**: `boolean`

Defined in: [rpc/src/types.ts:356](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L356)

Whether the batch is in fallback storage

***

### sizeBytes

> **sizeBytes**: `number`

Defined in: [rpc/src/types.ts:359](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L359)

Size of the batch in bytes
