[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / isAllNull

# Function: isAllNull()

> **isAllNull**(`bytes`, `count`): `boolean`

Defined in: [core/src/encode.ts:669](https://github.com/dot-do/evodb/blob/main/core/src/encode.ts#L669)

Check if bitmap represents all-null data.
Early exits on first non-0xFF byte for efficiency.

## Parameters

### bytes

`Uint8Array`

The packed bitmap

### count

`number`

Total number of elements

## Returns

`boolean`

true if all elements are null
