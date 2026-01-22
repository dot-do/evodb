[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / ValidationError

# Class: ValidationError

Defined in: [core/src/errors.ts:272](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L272)

Error thrown when data validation fails

Examples:
- Required field missing
- Type mismatch
- Schema constraint violation
- Format validation failure (email, URL, etc.)
- Encoding validation errors (invalid column type, null in non-nullable)

Common codes: VALIDATION_ERROR, TYPE_MISMATCH, SCHEMA_VALIDATION_ERROR,
ENCODING_VALIDATION_ERROR, NULL_NOT_ALLOWED

## Example

```typescript
throw new ValidationError("Required field 'email' is missing");
throw new ValidationError('Schema mismatch: expected number, got string', 'TYPE_MISMATCH');
// Encoding validation with details
throw new ValidationError('Type mismatch at index 2', 'ENCODING_VALIDATION_ERROR', {
  path: 'user.age', index: 2, expectedType: 'Int32', actualType: 'string'
});
```

## Extends

- [`EvoDBError`](EvoDBError.md)

## Extended by

- [`EncodingValidationError`](EncodingValidationError.md)

## Constructors

### Constructor

> **new ValidationError**(`message`, `code`, `details?`): `ValidationError`

Defined in: [core/src/errors.ts:280](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L280)

Create a new ValidationError

#### Parameters

##### message

`string`

Human-readable error message

##### code

`string` = `'VALIDATION_ERROR'`

Error code (default: 'VALIDATION_ERROR')

##### details?

`Record`\<`string`, `unknown`\>

Optional additional details for debugging (e.g., path, index, expectedType)

#### Returns

`ValidationError`

#### Overrides

[`EvoDBError`](EvoDBError.md).[`constructor`](EvoDBError.md#constructor)

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

[`EvoDBError`](EvoDBError.md).[`code`](EvoDBError.md#code)

***

### details?

> `readonly` `optional` **details**: `Record`\<`string`, `unknown`\>

Defined in: [core/src/errors.ts:167](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L167)

Optional details for debugging (used by validation and storage errors)

#### Inherited from

[`EvoDBError`](EvoDBError.md).[`details`](EvoDBError.md#details)
