[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [rpc/src](../README.md) / StatusMessage

# Interface: StatusMessage

Defined in: [rpc/src/types.ts:272](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L272)

Status response message

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

> **type**: `"status"`

Defined in: [rpc/src/types.ts:273](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L273)

Message type discriminator

#### Overrides

[`RpcMessage`](RpcMessage.md).[`type`](RpcMessage.md#type)

***

### state

> **state**: [`ParentState`](../type-aliases/ParentState.md)

Defined in: [rpc/src/types.ts:276](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L276)

Current parent DO state

***

### buffer

> **buffer**: [`BufferStats`](BufferStats.md)

Defined in: [rpc/src/types.ts:279](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L279)

Buffer statistics

***

### connectedChildren

> **connectedChildren**: `number`

Defined in: [rpc/src/types.ts:282](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L282)

Connected children

***

### lastFlushTime?

> `optional` **lastFlushTime**: `number`

Defined in: [rpc/src/types.ts:285](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L285)

Last flush time

***

### nextFlushTime?

> `optional` **nextFlushTime**: `number`

Defined in: [rpc/src/types.ts:288](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L288)

Next scheduled flush time
