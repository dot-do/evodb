[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / hasAnyNulls

# Function: hasAnyNulls()

> **hasAnyNulls**(`nulls`): `boolean`

Defined in: [core/src/encode.ts:571](https://github.com/dot-do/evodb/blob/main/core/src/encode.ts#L571)

Check if any value in the null bitmap is null.
Optimized for both sparse and dense representations.

## Parameters

### nulls

`NullBitmap`

The null bitmap (sparse or dense)

## Returns

`boolean`

true if at least one value is null
