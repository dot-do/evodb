[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / CDCRPCPayload

# Interface: CDCRPCPayload

Defined in: [writer/src/types.ts:567](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L567)

CDC RPC payload

## Properties

### sourceDoId

> **sourceDoId**: `string`

Defined in: [writer/src/types.ts:569](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L569)

Source DO ID

***

### sequenceNumber

> **sequenceNumber**: `string`

Defined in: [writer/src/types.ts:571](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L571)

Sequence number

***

### entries

> **entries**: `Uint8Array`

Defined in: [writer/src/types.ts:573](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L573)

Serialized WAL entries
