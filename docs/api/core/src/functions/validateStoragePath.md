[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / validateStoragePath

# Function: validateStoragePath()

> **validateStoragePath**(`path`): `void`

Defined in: [core/src/storage.ts:752](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L752)

Validate a storage path to prevent path traversal attacks.
Uses the centralized assertValidPath from validation.ts.

Safe paths:
- Use forward slashes for directories
- Contain only alphanumeric, dash, underscore, dot characters
- Do not start with / (no absolute paths)
- Do not contain .. (no path traversal)
- Do not contain null bytes or control characters

## Parameters

### path

`string`

The storage path to validate

## Returns

`void`

## Throws

ValidationError if path contains dangerous patterns
