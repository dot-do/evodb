[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / isNotNullish

# Function: isNotNullish()

> **isNotNullish**\<`T`\>(`value`): `value is NonNullable<T>`

Defined in: [core/src/guards.ts:168](https://github.com/dot-do/evodb/blob/main/core/src/guards.ts#L168)

Type guard: check if value is not null or undefined

This is useful for filtering out nullish values while preserving type narrowing.

## Type Parameters

### T

`T`

## Parameters

### value

`T`

Value to check

## Returns

`value is NonNullable<T>`

True if value is not null or undefined

## Example

```typescript
const items: (string | null)[] = ['a', null, 'b'];
const filtered: string[] = items.filter(isNotNullish);
```
