[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / isNullish

# Function: isNullish()

> **isNullish**(`value`): `value is null`

Defined in: [core/src/guards.ts:150](https://github.com/dot-do/evodb/blob/main/core/src/guards.ts#L150)

Type guard: check if value is null or undefined

## Parameters

### value

`unknown`

Value to check

## Returns

`value is null`

True if value is null or undefined

## Example

```typescript
const data: unknown = null;
if (isNullish(data)) {
  console.log('Value is null or undefined');
}
```
