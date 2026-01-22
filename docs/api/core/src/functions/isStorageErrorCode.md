[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / isStorageErrorCode

# Function: isStorageErrorCode()

> **isStorageErrorCode**(`code`): `code is StorageErrorCode`

Defined in: [core/src/errors.ts:349](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L349)

Type guard to check if a string is a valid StorageErrorCode.
Useful for validating error codes from external sources.

## Parameters

### code

`string`

The string to check

## Returns

`code is StorageErrorCode`

true if the code is a valid StorageErrorCode value

## Example

```typescript
if (isStorageErrorCode(error.code)) {
  // TypeScript knows error.code is StorageErrorCode here
  handleKnownError(error.code);
}
```
