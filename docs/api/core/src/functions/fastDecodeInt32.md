[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / fastDecodeInt32

# Function: fastDecodeInt32()

> **fastDecodeInt32**(`data`, `encoding`, `nullBitmap`, `rowCount`, `options?`): `Int32Array`\<`ArrayBufferLike`\>

Defined in: [core/src/encode.ts:1235](https://github.com/dot-do/evodb/blob/main/core/src/encode.ts#L1235)

Fast decode for Int32 columns - returns typed array
Optimized for snippet 5ms CPU constraint

## Parameters

### data

`Uint8Array`

### encoding

[`Encoding`](../enumerations/Encoding.md)

### nullBitmap

`Uint8Array`

### rowCount

`number`

### options?

[`FastDecodeOptions`](../interfaces/FastDecodeOptions.md)

## Returns

`Int32Array`\<`ArrayBufferLike`\>
