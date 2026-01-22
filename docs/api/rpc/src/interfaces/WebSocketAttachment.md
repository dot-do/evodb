[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [rpc/src](../README.md) / WebSocketAttachment

# Interface: WebSocketAttachment

Defined in: [rpc/src/types.ts:584](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L584)

Data stored with hibernating WebSocket connection

This data survives DO hibernation and is used to restore
connection state when the DO wakes up.

IMPORTANT: Must be structured-clone compatible and <= 2048 bytes

## Properties

### childDoId

> **childDoId**: `string`

Defined in: [rpc/src/types.ts:586](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L586)

ID of the connected child DO

***

### childShardName?

> `optional` **childShardName**: `string`

Defined in: [rpc/src/types.ts:589](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L589)

Name of the child shard

***

### lastAckSequence

> **lastAckSequence**: `number`

Defined in: [rpc/src/types.ts:592](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L592)

Last acknowledged sequence number

***

### connectedAt

> **connectedAt**: `number`

Defined in: [rpc/src/types.ts:595](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L595)

Connection timestamp

***

### protocolVersion

> **protocolVersion**: `number`

Defined in: [rpc/src/types.ts:598](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L598)

Protocol version

***

### capabilityFlags

> **capabilityFlags**: `number`

Defined in: [rpc/src/types.ts:601](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L601)

Client capabilities flags (compressed)
