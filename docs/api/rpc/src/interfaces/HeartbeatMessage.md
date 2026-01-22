[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [rpc/src](../README.md) / HeartbeatMessage

# Interface: HeartbeatMessage

Defined in: [rpc/src/types.ts:160](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L160)

Heartbeat message - Keep connection alive during hibernation

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

> **type**: `"heartbeat"`

Defined in: [rpc/src/types.ts:161](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L161)

Message type discriminator

#### Overrides

[`RpcMessage`](RpcMessage.md).[`type`](RpcMessage.md#type)

***

### sourceDoId

> **sourceDoId**: `string`

Defined in: [rpc/src/types.ts:164](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L164)

ID of the source Durable Object

***

### lastAckSequence

> **lastAckSequence**: `number`

Defined in: [rpc/src/types.ts:167](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L167)

Last acknowledged sequence number

***

### pendingEntries

> **pendingEntries**: `number`

Defined in: [rpc/src/types.ts:170](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L170)

Number of pending entries in client buffer
