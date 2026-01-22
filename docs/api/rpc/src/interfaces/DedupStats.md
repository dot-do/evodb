[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [rpc/src](../README.md) / DedupStats

# Interface: DedupStats

Defined in: [rpc/src/buffer.ts:153](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L153)

Statistics about the deduplication state

## Properties

### sourceCount

> **sourceCount**: `number`

Defined in: [rpc/src/buffer.ts:154](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L154)

***

### totalEntries

> **totalEntries**: `number`

Defined in: [rpc/src/buffer.ts:155](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L155)

***

### entriesPerSource

> **entriesPerSource**: `Map`\<`string`, `number`\>

Defined in: [rpc/src/buffer.ts:156](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L156)

***

### oldestEntryAge?

> `optional` **oldestEntryAge**: `number`

Defined in: [rpc/src/buffer.ts:157](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L157)
