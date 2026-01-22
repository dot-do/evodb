[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / validateDecodeCount

# Function: validateDecodeCount()

> **validateDecodeCount**(`count`, `context`): `void`

Defined in: [core/src/encode.ts:981](https://github.com/dot-do/evodb/blob/main/core/src/encode.ts#L981)

Validate count parameter for decode operations.
Ensures count is a valid non-negative integer within safe bounds.

## Parameters

### count

`number`

The count value to validate

### context

`string`

Description of where the validation is occurring

## Returns

`void`

## Throws

Error if count is invalid (negative, NaN, Infinity, or exceeds safe integer)
