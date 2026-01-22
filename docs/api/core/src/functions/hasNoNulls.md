[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / hasNoNulls

# Function: hasNoNulls()

> **hasNoNulls**(`bytes`, `count`): `boolean`

Defined in: [core/src/encode.ts:696](https://github.com/dot-do/evodb/blob/main/core/src/encode.ts#L696)

Check if bitmap has no nulls.
Early exits on first non-zero byte for efficiency.

## Parameters

### bytes

`Uint8Array`

The packed bitmap

### count

`number`

Total number of elements

## Returns

`boolean`

true if no elements are null
