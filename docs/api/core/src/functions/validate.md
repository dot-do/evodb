[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / validate

# Function: validate()

> **validate**\<`T`\>(`value`, `schema`): `T`

Defined in: core/src/validation.ts:816

Validate an already-parsed value against a Zod schema

This is useful when you have already parsed JSON (e.g., from a library)
and want to validate and narrow its type.

## Type Parameters

### T

`T`

## Parameters

### value

`unknown`

The value to validate

### schema

[`ZodSchemaLike`](../interfaces/ZodSchemaLike.md)\<`T`\>

A Zod schema to validate against

## Returns

`T`

The validated data

## Throws

If validation fails

## Example

```typescript
const data = response.json(); // already parsed
const validated = validate(data, MySchema);
```
