[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / CDCMessage

# Interface: CDCMessage

Defined in: [writer/src/types.ts:247](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L247)

CDC message format (for WebSocket/RPC)

## Properties

### type

> **type**: `"cdc"` \| `"ack"` \| `"heartbeat"`

Defined in: [writer/src/types.ts:249](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L249)

Message type

***

### sourceDoId

> **sourceDoId**: `string`

Defined in: [writer/src/types.ts:251](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L251)

Source DO ID

***

### sequenceNumber

> **sequenceNumber**: `bigint`

Defined in: [writer/src/types.ts:253](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L253)

Sequence number

***

### entries?

> `optional` **entries**: [`WalEntry`](WalEntry.md)[]

Defined in: [writer/src/types.ts:255](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L255)

Entries (for cdc type)
