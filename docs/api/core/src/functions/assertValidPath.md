[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / assertValidPath

# Function: assertValidPath()

> **assertValidPath**(`path`, `options?`): `void`

Defined in: core/src/validation.ts:558

Validates a storage path and throws ValidationError if invalid.

Use this at API boundaries where you want to reject invalid input with
a descriptive error message.

## Parameters

### path

`string`

The path to validate

### options?

[`PathValidatorOptions`](../interfaces/PathValidatorOptions.md)

Validator options

## Returns

`void`

## Throws

If the path is invalid

## Example

```typescript
try {
  assertValidPath("../../../etc/passwd");
} catch (error) {
  // ValidationError: Invalid path: contains path traversal pattern
}
```
