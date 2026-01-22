[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / countNulls

# Function: countNulls()

> **countNulls**(`nulls`): `number`

Defined in: [core/src/encode.ts:585](https://github.com/dot-do/evodb/blob/main/core/src/encode.ts#L585)

Count the number of null values in a NullBitmap.
Optimized for both sparse and dense representations.

## Parameters

### nulls

`NullBitmap`

The null bitmap (sparse or dense)

## Returns

`number`

Number of null values
