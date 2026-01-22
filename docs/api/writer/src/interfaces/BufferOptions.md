[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / BufferOptions

# Interface: BufferOptions

Defined in: [writer/src/buffer.ts:39](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L39)

Buffer options extracted from writer options

## Properties

### bufferSize

> **bufferSize**: `number`

Defined in: [writer/src/buffer.ts:41](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L41)

Max entries before automatic flush

***

### bufferTimeout

> **bufferTimeout**: `number`

Defined in: [writer/src/buffer.ts:43](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L43)

Max milliseconds before automatic flush

***

### targetBlockSize

> **targetBlockSize**: `number`

Defined in: [writer/src/buffer.ts:45](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L45)

Target block size in bytes

***

### maxBufferSize?

> `optional` **maxBufferSize**: `number`

Defined in: [writer/src/buffer.ts:47](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L47)

Hard limit on buffer size in bytes (default: 128MB)
