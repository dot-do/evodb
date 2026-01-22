[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / fastDecodeFloat64

# Function: fastDecodeFloat64()

> **fastDecodeFloat64**(`data`, `encoding`, `nullBitmap`, `rowCount`, `options?`): `Float64Array`\<`ArrayBufferLike`\>

Defined in: [core/src/encode.ts:1265](https://github.com/dot-do/evodb/blob/main/core/src/encode.ts#L1265)

Fast decode for Float64 columns - returns typed array
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

`Float64Array`\<`ArrayBufferLike`\>
