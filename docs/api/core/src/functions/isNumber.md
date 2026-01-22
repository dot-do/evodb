[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / isNumber

# Function: isNumber()

> **isNumber**(`value`): `value is number`

Defined in: [core/src/guards.ts:84](https://github.com/dot-do/evodb/blob/main/core/src/guards.ts#L84)

Type guard: check if value is a number

Note: This excludes NaN by default since NaN often causes unexpected behavior.
Use isNumberIncludingNaN if you need to include NaN values.

## Parameters

### value

`unknown`

Value to check

## Returns

`value is number`

True if value is a finite number, narrowing type to number

## Example

```typescript
const data: unknown = 42;
if (isNumber(data)) {
  // data is now typed as number
  console.log(data * 2);
}
```
