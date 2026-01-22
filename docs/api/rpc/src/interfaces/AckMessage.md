[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [rpc/src](../README.md) / AckMessage

# Interface: AckMessage

Defined in: [rpc/src/types.ts:193](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L193)

Acknowledgment message - Parent acknowledges receipt of CDC batch

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

> **type**: `"ack"`

Defined in: [rpc/src/types.ts:194](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L194)

Message type discriminator

#### Overrides

[`RpcMessage`](RpcMessage.md).[`type`](RpcMessage.md#type)

***

### sequenceNumber

> **sequenceNumber**: `number`

Defined in: [rpc/src/types.ts:197](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L197)

Sequence number being acknowledged

***

### status

> **status**: [`AckStatus`](../type-aliases/AckStatus.md)

Defined in: [rpc/src/types.ts:200](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L200)

Status of the acknowledged batch

***

### batchId?

> `optional` **batchId**: `string`

Defined in: [rpc/src/types.ts:203](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L203)

ID of the batch that was acknowledged

***

### details?

> `optional` **details**: [`AckDetails`](AckDetails.md)

Defined in: [rpc/src/types.ts:206](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L206)

Additional details about the acknowledgment
