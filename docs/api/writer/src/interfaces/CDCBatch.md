[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / CDCBatch

# Interface: CDCBatch

Defined in: [writer/src/types.ts:235](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L235)

Batch of CDC entries from a single source

## Properties

### sourceDoId

> **sourceDoId**: `string`

Defined in: [writer/src/types.ts:237](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L237)

Source DO ID

***

### sequenceNumber

> **sequenceNumber**: `bigint`

Defined in: [writer/src/types.ts:239](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L239)

Sequence number for acknowledgment

***

### entries

> **entries**: [`WalEntry`](WalEntry.md)[]

Defined in: [writer/src/types.ts:241](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L241)

WAL entries
