[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / toNullArray

# Function: toNullArray()

> **toNullArray**(`nulls`): `boolean`[]

Defined in: [core/src/encode.ts:557](https://github.com/dot-do/evodb/blob/main/core/src/encode.ts#L557)

Convert a NullBitmap to a dense boolean array.
If already a boolean[], returns as-is. If SparseNullSet, converts to array.

## Parameters

### nulls

`NullBitmap`

The null bitmap (sparse or dense)

## Returns

`boolean`[]

Dense boolean array
