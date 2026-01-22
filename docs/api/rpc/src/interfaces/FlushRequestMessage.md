[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [rpc/src](../README.md) / FlushRequestMessage

# Interface: FlushRequestMessage

Defined in: [rpc/src/types.ts:176](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L176)

Flush request message - Child requests Parent to flush buffers

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

> **type**: `"flush_request"`

Defined in: [rpc/src/types.ts:177](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L177)

Message type discriminator

#### Overrides

[`RpcMessage`](RpcMessage.md).[`type`](RpcMessage.md#type)

***

### sourceDoId

> **sourceDoId**: `string`

Defined in: [rpc/src/types.ts:180](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L180)

ID of the requesting Durable Object

***

### reason

> **reason**: `"buffer_full"` \| `"manual"` \| `"shutdown"` \| `"time_threshold"`

Defined in: [rpc/src/types.ts:183](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L183)

Reason for flush request
