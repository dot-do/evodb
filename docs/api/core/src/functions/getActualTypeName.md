[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / getActualTypeName

# Function: getActualTypeName()

> **getActualTypeName**(`value`): `string`

Defined in: [core/src/encode.ts:163](https://github.com/dot-do/evodb/blob/main/core/src/encode.ts#L163)

Get human-readable type name for an actual runtime value.
Handles special cases like null, undefined, arrays, Uint8Array, Date.

## Parameters

### value

`unknown`

The value to describe

## Returns

`string`

Human-readable type name (e.g., 'string', 'number', 'array', 'null')
