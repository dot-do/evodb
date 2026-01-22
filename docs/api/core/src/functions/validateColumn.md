[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / validateColumn

# Function: validateColumn()

> **validateColumn**(`col`): `void`

Defined in: [core/src/encode.ts:254](https://github.com/dot-do/evodb/blob/main/core/src/encode.ts#L254)

Validate a column's type, nullability, and value types.
This function is called automatically by encode() but can also be used
independently for pre-validation.

Validates:
1. Column type is a valid Type enum value (0-10)
2. Non-nullable columns have no null values
3. All non-null values match the declared column type

## Parameters

### col

[`Column`](../interfaces/Column.md)

The column to validate

## Returns

`void`

## Throws

EncodingValidationError with INVALID_TYPE code if type is invalid

## Throws

EncodingValidationError with NULLABLE_CONSTRAINT_VIOLATION code if nulls found in non-nullable column

## Throws

EncodingValidationError with TYPE_MISMATCH code if value type doesn't match column type

## Example

```typescript
try {
  validateColumn({
    path: 'user.age',
    type: Type.Int32,
    nullable: false,
    values: [25, 'thirty'], // type mismatch!
    nulls: [false, false],
  });
} catch (error) {
  if (error instanceof EncodingValidationError) {
    console.log(error.details); // { path: 'user.age', index: 1, ... }
  }
}
```
