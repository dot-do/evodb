[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / safeValidate

# Function: safeValidate()

> **safeValidate**\<`T`\>(`value`, `schema`): [`SafeParseJSONResult`](../type-aliases/SafeParseJSONResult.md)\<`T`\>

Defined in: core/src/validation.ts:846

Safely validate an already-parsed value against a Zod schema

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

[`SafeParseJSONResult`](../type-aliases/SafeParseJSONResult.md)\<`T`\>

A result object with either the data or error

## Example

```typescript
const data = response.json();
const result = safeValidate(data, MySchema);

if (result.success) {
  processData(result.data);
}
```
