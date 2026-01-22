[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [rpc/src](../README.md) / NackMessage

# Interface: NackMessage

Defined in: [rpc/src/types.ts:239](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L239)

Negative acknowledgment - Parent rejects batch

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

> **type**: `"nack"`

Defined in: [rpc/src/types.ts:240](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L240)

Message type discriminator

#### Overrides

[`RpcMessage`](RpcMessage.md).[`type`](RpcMessage.md#type)

***

### sequenceNumber

> **sequenceNumber**: `number`

Defined in: [rpc/src/types.ts:243](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L243)

Sequence number being rejected

***

### reason

> **reason**: [`NackReason`](../type-aliases/NackReason.md)

Defined in: [rpc/src/types.ts:246](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L246)

Reason for rejection

***

### errorMessage

> **errorMessage**: `string`

Defined in: [rpc/src/types.ts:249](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L249)

Error message

***

### shouldRetry

> **shouldRetry**: `boolean`

Defined in: [rpc/src/types.ts:252](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L252)

Whether client should retry

***

### retryDelayMs?

> `optional` **retryDelayMs**: `number`

Defined in: [rpc/src/types.ts:255](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L255)

Suggested retry delay in milliseconds
