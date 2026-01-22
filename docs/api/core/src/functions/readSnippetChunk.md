[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / readSnippetChunk

# Function: readSnippetChunk()

> **readSnippetChunk**(`data`, `options?`): `object`

Defined in: [core/src/snippet-format.ts:1332](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L1332)

Read snippet chunk with optional projection

## Parameters

### data

`Uint8Array`

### options?

[`DecodeOptions`](../interfaces/DecodeOptions.md)

## Returns

`object`

### header

> **header**: [`SnippetHeader`](../interfaces/SnippetHeader.md)

### columns

> **columns**: [`DecodedColumn`](../interfaces/DecodedColumn.md)[]
