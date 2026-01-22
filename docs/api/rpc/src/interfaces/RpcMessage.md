[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [rpc/src](../README.md) / RpcMessage

# Interface: RpcMessage

Defined in: [rpc/src/types.ts:87](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L87)

Base interface for all RPC messages

## Extended by

- [`CDCBatchMessage`](CDCBatchMessage.md)
- [`ConnectMessage`](ConnectMessage.md)
- [`HeartbeatMessage`](HeartbeatMessage.md)
- [`FlushRequestMessage`](FlushRequestMessage.md)
- [`AckMessage`](AckMessage.md)
- [`NackMessage`](NackMessage.md)
- [`StatusMessage`](StatusMessage.md)

## Properties

### type

> **type**: [`RpcMessageType`](../type-aliases/RpcMessageType.md)

Defined in: [rpc/src/types.ts:89](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L89)

Message type discriminator

***

### timestamp

> **timestamp**: `number`

Defined in: [rpc/src/types.ts:92](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L92)

Message timestamp

***

### correlationId?

> `optional` **correlationId**: `string`

Defined in: [rpc/src/types.ts:95](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L95)

Optional correlation ID for request/response matching
