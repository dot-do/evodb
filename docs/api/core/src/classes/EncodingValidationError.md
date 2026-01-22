[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / EncodingValidationError

# Class: EncodingValidationError

Defined in: [core/src/errors.ts:429](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L429)

Error thrown when encoding validation fails

This is a convenience alias for ValidationError with encoding-specific defaults.
For new code, prefer using ValidationError directly with ENCODING_* codes.

Examples:
- Invalid column type enum value
- Null value in non-nullable column
- Type mismatch (e.g., string in Int32 column)
- Array column with non-array value

## Example

```typescript
throw new EncodingValidationError(
  'Type mismatch at index 2: expected Int32, got string',
  'TYPE_MISMATCH',
  { path: 'user.age', index: 2, expectedType: 'Int32', actualType: 'string' }
);
```

## Extends

- [`ValidationError`](ValidationError.md)

## Constructors

### Constructor

> **new EncodingValidationError**(`message`, `code`, `details?`): `EncodingValidationError`

Defined in: [core/src/errors.ts:437](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L437)

Create a new EncodingValidationError

#### Parameters

##### message

`string`

Human-readable error message describing the validation failure

##### code

`string` = `'ENCODING_VALIDATION_ERROR'`

Error code (default: 'ENCODING_VALIDATION_ERROR')

##### details?

[`EncodingValidationDetails`](../interfaces/EncodingValidationDetails.md)

Additional details about the validation failure

#### Returns

`EncodingValidationError`

#### Overrides

[`ValidationError`](ValidationError.md).[`constructor`](ValidationError.md#constructor)

## Properties

### code

> `readonly` **code**: `string`

Defined in: [core/src/errors.ts:162](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L162)

Error code for programmatic identification

Common codes:
- QUERY_ERROR: Query-related errors
- TIMEOUT_ERROR: Operation timeout
- VALIDATION_ERROR: Data validation failures
- STORAGE_ERROR: Storage operation failures

#### Inherited from

[`ValidationError`](ValidationError.md).[`code`](ValidationError.md#code)

***

### details?

> `readonly` `optional` **details**: `Record`\<`string`, `unknown`\>

Defined in: [core/src/errors.ts:167](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L167)

Optional details for debugging (used by validation and storage errors)

#### Inherited from

[`ValidationError`](ValidationError.md).[`details`](ValidationError.md#details)
