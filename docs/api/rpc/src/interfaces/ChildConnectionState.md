[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [rpc/src](../README.md) / ChildConnectionState

# Interface: ChildConnectionState

Defined in: [rpc/src/buffer.ts:459](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L459)

State tracked per connected child DO

## Properties

### childDoId

> **childDoId**: `string`

Defined in: [rpc/src/buffer.ts:461](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L461)

Child DO ID

***

### childShardName?

> `optional` **childShardName**: `string`

Defined in: [rpc/src/buffer.ts:464](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L464)

Child shard name

***

### lastReceivedSequence

> **lastReceivedSequence**: `number`

Defined in: [rpc/src/buffer.ts:467](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L467)

Last received sequence number

***

### lastAckedSequence

> **lastAckedSequence**: `number`

Defined in: [rpc/src/buffer.ts:470](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L470)

Last acknowledged sequence number

***

### connectedAt

> **connectedAt**: `number`

Defined in: [rpc/src/buffer.ts:473](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L473)

Connection timestamp

***

### lastActivityAt

> **lastActivityAt**: `number`

Defined in: [rpc/src/buffer.ts:476](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L476)

Last activity timestamp

***

### batchesReceived

> **batchesReceived**: `number`

Defined in: [rpc/src/buffer.ts:479](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L479)

Total batches received

***

### entriesReceived

> **entriesReceived**: `number`

Defined in: [rpc/src/buffer.ts:482](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L482)

Total entries received

***

### ws?

> `optional` **ws**: `WebSocket`

Defined in: [rpc/src/buffer.ts:485](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L485)

WebSocket reference
