[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / BufferStats

# Interface: BufferStats

Defined in: [writer/src/types.ts:283](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L283)

Buffer statistics

## Properties

### entryCount

> **entryCount**: `number`

Defined in: [writer/src/types.ts:285](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L285)

Number of entries in buffer

***

### estimatedSize

> **estimatedSize**: `number`

Defined in: [writer/src/types.ts:287](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L287)

Estimated size in bytes

***

### ageMs

> **ageMs**: `number`

Defined in: [writer/src/types.ts:289](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L289)

Time since first entry (ms)

***

### sourceCount

> **sourceCount**: `number`

Defined in: [writer/src/types.ts:291](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L291)

Number of unique sources

***

### readyToFlush

> **readyToFlush**: `boolean`

Defined in: [writer/src/types.ts:293](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L293)

Whether buffer is ready to flush
