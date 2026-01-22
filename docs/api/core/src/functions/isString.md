[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / isString

# Function: isString()

> **isString**(`value`): `value is string`

Defined in: [core/src/guards.ts:113](https://github.com/dot-do/evodb/blob/main/core/src/guards.ts#L113)

Type guard: check if value is a string

## Parameters

### value

`unknown`

Value to check

## Returns

`value is string`

True if value is a string, narrowing type to string

## Example

```typescript
const data: unknown = 'hello';
if (isString(data)) {
  // data is now typed as string
  console.log(data.toUpperCase());
}
```
