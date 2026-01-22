[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [rpc/src](../README.md) / CDCBatchMessage

# Interface: CDCBatchMessage

Defined in: [rpc/src/types.ts:104](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L104)

CDC Batch message - Child DO sends WAL entries to Parent

This is the primary message type for streaming CDC data from
Child DOs to the Parent DO aggregator.

## Extends

- [`RpcMessage`](RpcMessage.md)

## Properties

### timestamp

> **timestamp**: `number`

Defined in: [rpc/src/types.ts:92](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L92)

Message timestamp

#### Inherited from

[`RpcMessage`](RpcMessage.md).[`timestamp`](RpcMessage.md#timestamp)

***

### correlationId?

> `optional` **correlationId**: `string`

Defined in: [rpc/src/types.ts:95](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L95)

Optional correlation ID for request/response matching

#### Inherited from

[`RpcMessage`](RpcMessage.md).[`correlationId`](RpcMessage.md#correlationid)

***

### type

> **type**: `"cdc_batch"`

Defined in: [rpc/src/types.ts:105](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L105)

Message type discriminator

#### Overrides

[`RpcMessage`](RpcMessage.md).[`type`](RpcMessage.md#type)

***

### sourceDoId

> **sourceDoId**: `string`

Defined in: [rpc/src/types.ts:108](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L108)

ID of the source Durable Object

***

### sourceShardName?

> `optional` **sourceShardName**: `string`

Defined in: [rpc/src/types.ts:111](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L111)

Human-readable name of the source shard (optional)

***

### entries

> **entries**: [`WalEntry`](../type-aliases/WalEntry.md)\<`unknown`\>[]

Defined in: [rpc/src/types.ts:114](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L114)

WAL entries in this batch

***

### sequenceNumber

> **sequenceNumber**: `number`

Defined in: [rpc/src/types.ts:117](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L117)

Sequence number of this batch (for ordering and deduplication)

***

### firstEntrySequence

> **firstEntrySequence**: `number`

Defined in: [rpc/src/types.ts:120](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L120)

First entry sequence in this batch

***

### lastEntrySequence

> **lastEntrySequence**: `number`

Defined in: [rpc/src/types.ts:123](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L123)

Last entry sequence in this batch

***

### sizeBytes

> **sizeBytes**: `number`

Defined in: [rpc/src/types.ts:126](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L126)

Total size of entries in bytes (approximate)

***

### isRetry

> **isRetry**: `boolean`

Defined in: [rpc/src/types.ts:129](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L129)

Whether this is a retry

***

### retryCount

> **retryCount**: `number`

Defined in: [rpc/src/types.ts:132](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L132)

Retry count (0 for first attempt)
