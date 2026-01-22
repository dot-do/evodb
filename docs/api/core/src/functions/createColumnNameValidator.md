[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / createColumnNameValidator

# Function: createColumnNameValidator()

> **createColumnNameValidator**(`options`): [`ColumnNameValidator`](../type-aliases/ColumnNameValidator.md)

Defined in: core/src/validation.ts:213

Creates a column name validator with configurable options.

This validator protects against:
- SQL injection in column names
- XSS patterns
- Control characters
- Overly long inputs

## Parameters

### options

[`ColumnNameValidatorOptions`](../interfaces/ColumnNameValidatorOptions.md) = `{}`

Configuration options

## Returns

[`ColumnNameValidator`](../type-aliases/ColumnNameValidator.md)

A validator function that returns true for valid column names

## Example

```typescript
const validate = createColumnNameValidator();
validate('user_id');     // true
validate('user.name');   // true
validate('items[0]');    // true
validate("'; DROP TABLE"); // false - SQL injection
validate('<script>');    // false - XSS
```
