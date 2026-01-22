[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / validateKeyPrefix

# Function: validateKeyPrefix()

> **validateKeyPrefix**(`keyPrefix`): `void`

Defined in: [core/src/storage.ts:763](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L763)

Validate a key prefix used in storage constructors.
Empty prefixes are allowed. Non-empty prefixes must pass path validation.

## Parameters

### keyPrefix

`string`

The key prefix to validate (can be empty string)

## Returns

`void`

## Throws

ValidationError if prefix contains dangerous patterns
