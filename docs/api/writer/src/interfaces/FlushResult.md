[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / FlushResult

# Interface: FlushResult

Defined in: [writer/src/types.ts:352](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L352)

Result of a flush operation

## Properties

### status

> **status**: `"persisted"` \| `"buffered"` \| `"empty"`

Defined in: [writer/src/types.ts:354](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L354)

Status of the flush

***

### location?

> `optional` **location**: [`BlockLocation`](../type-aliases/BlockLocation.md)

Defined in: [writer/src/types.ts:356](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L356)

Where the block was written

***

### block?

> `optional` **block**: [`BlockMetadata`](BlockMetadata.md)

Defined in: [writer/src/types.ts:358](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L358)

Block metadata (if written)

***

### entryCount

> **entryCount**: `number`

Defined in: [writer/src/types.ts:360](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L360)

Number of entries flushed

***

### durationMs

> **durationMs**: `number`

Defined in: [writer/src/types.ts:362](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L362)

Duration in milliseconds

***

### retryScheduled?

> `optional` **retryScheduled**: `boolean`

Defined in: [writer/src/types.ts:364](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L364)

Whether a retry is scheduled

***

### error?

> `optional` **error**: `string`

Defined in: [writer/src/types.ts:366](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L366)

Error message (if buffered due to failure)
