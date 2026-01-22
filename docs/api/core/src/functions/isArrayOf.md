[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / isArrayOf

# Function: isArrayOf()

> **isArrayOf**\<`T`\>(`value`, `guard`): `value is T[]`

Defined in: [core/src/guards.ts:331](https://github.com/dot-do/evodb/blob/main/core/src/guards.ts#L331)

Type guard: check if value is an array where all elements pass a guard

## Type Parameters

### T

`T`

## Parameters

### value

`unknown`

Value to check

### guard

(`item`) => `item is T`

Type guard function to apply to each element

## Returns

`value is T[]`

True if value is an array and all elements pass the guard

## Example

```typescript
const data: unknown = [1, 2, 3];
if (isArrayOf(data, isNumber)) {
  // data is now typed as number[]
  const sum = data.reduce((a, b) => a + b, 0);
}
```
