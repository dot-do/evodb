[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [rpc/src](../README.md) / ConnectMessage

# Interface: ConnectMessage

Defined in: [rpc/src/types.ts:138](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L138)

Connect message - Child DO initiates connection to Parent

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

> **type**: `"connect"`

Defined in: [rpc/src/types.ts:139](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L139)

Message type discriminator

#### Overrides

[`RpcMessage`](RpcMessage.md).[`type`](RpcMessage.md#type)

***

### sourceDoId

> **sourceDoId**: `string`

Defined in: [rpc/src/types.ts:142](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L142)

ID of the connecting Durable Object

***

### sourceShardName?

> `optional` **sourceShardName**: `string`

Defined in: [rpc/src/types.ts:145](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L145)

Human-readable name of the source shard

***

### lastAckSequence

> **lastAckSequence**: `number`

Defined in: [rpc/src/types.ts:148](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L148)

Last acknowledged sequence number (for resumption)

***

### protocolVersion

> **protocolVersion**: `number`

Defined in: [rpc/src/types.ts:151](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L151)

Protocol version

***

### capabilities

> **capabilities**: [`ClientCapabilities`](ClientCapabilities.md)

Defined in: [rpc/src/types.ts:154](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L154)

Client capabilities
