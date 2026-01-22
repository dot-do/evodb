[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / validateBufferCapacity

# Function: validateBufferCapacity()

> **validateBufferCapacity**(`bufferLength`, `count`, `bytesPerElement`, `context`): `void`

Defined in: [core/src/encode.ts:1013](https://github.com/dot-do/evodb/blob/main/core/src/encode.ts#L1013)

Validate that buffer has sufficient capacity for the requested count.

## Parameters

### bufferLength

`number`

The length of the buffer in bytes

### count

`number`

Number of elements to decode

### bytesPerElement

`number`

Bytes required per element

### context

`string`

Description of where the validation is occurring

## Returns

`void`

## Throws

Error if buffer is too small for requested count
