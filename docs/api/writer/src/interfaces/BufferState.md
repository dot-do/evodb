[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / BufferState

# Interface: BufferState

Defined in: [writer/src/types.ts:265](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L265)

Buffer state

## Properties

### entries

> **entries**: [`WalEntry`](WalEntry.md)[]

Defined in: [writer/src/types.ts:267](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L267)

Current entries in buffer

***

### estimatedSize

> **estimatedSize**: `number`

Defined in: [writer/src/types.ts:269](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L269)

Estimated size in bytes

***

### minLsn

> **minLsn**: `bigint`

Defined in: [writer/src/types.ts:271](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L271)

Minimum LSN in buffer

***

### maxLsn

> **maxLsn**: `bigint`

Defined in: [writer/src/types.ts:273](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L273)

Maximum LSN in buffer

***

### firstEntryTime

> **firstEntryTime**: `number`

Defined in: [writer/src/types.ts:275](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L275)

Time when first entry was added

***

### sourceCursors

> **sourceCursors**: `Map`\<`string`, `bigint`\>

Defined in: [writer/src/types.ts:277](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L277)

Per-source tracking for acknowledgment
