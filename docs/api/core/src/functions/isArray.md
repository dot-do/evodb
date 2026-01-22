[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / isArray

# Function: isArray()

> **isArray**(`value`): `value is unknown[]`

Defined in: [core/src/guards.ts:38](https://github.com/dot-do/evodb/blob/main/core/src/guards.ts#L38)

Type guard: check if value is an array

## Parameters

### value

`unknown`

Value to check

## Returns

`value is unknown[]`

True if value is an array, narrowing type to unknown[]

## Example

```typescript
const data: unknown = [1, 2, 3];
if (isArray(data)) {
  // data is now typed as unknown[]
  console.log(data.length);
}
```
