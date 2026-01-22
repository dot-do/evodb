[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / unpackBitsDense

# Function: unpackBitsDense()

> **unpackBitsDense**(`bytes`, `count`): `boolean`[]

Defined in: [core/src/encode.ts:353](https://github.com/dot-do/evodb/blob/main/core/src/encode.ts#L353)

Unpack bitmap to dense boolean array.
Use this when you need the full boolean array for backward compatibility.

## Parameters

### bytes

`Uint8Array`

The packed bitmap

### count

`number`

Total number of elements

## Returns

`boolean`[]

Dense boolean array where true means null
