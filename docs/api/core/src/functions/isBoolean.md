[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / isBoolean

# Function: isBoolean()

> **isBoolean**(`value`): `value is boolean`

Defined in: [core/src/guards.ts:132](https://github.com/dot-do/evodb/blob/main/core/src/guards.ts#L132)

Type guard: check if value is a boolean

## Parameters

### value

`unknown`

Value to check

## Returns

`value is boolean`

True if value is a boolean, narrowing type to boolean

## Example

```typescript
const data: unknown = true;
if (isBoolean(data)) {
  // data is now typed as boolean
  console.log(!data);
}
```
