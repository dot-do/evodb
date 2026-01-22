[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / assertValidColumnName

# Function: assertValidColumnName()

> **assertValidColumnName**(`name`, `options?`): `void`

Defined in: core/src/validation.ts:487

Validates a column name and throws ValidationError if invalid.

Use this at API boundaries where you want to reject invalid input with
a descriptive error message.

## Parameters

### name

`string`

The column name to validate

### options?

[`ColumnNameValidatorOptions`](../interfaces/ColumnNameValidatorOptions.md)

Validator options

## Returns

`void`

## Throws

If the column name is invalid

## Example

```typescript
try {
  assertValidColumnName("'; DROP TABLE users; --");
} catch (error) {
  // ValidationError: Invalid column name: contains SQL injection pattern
}
```
