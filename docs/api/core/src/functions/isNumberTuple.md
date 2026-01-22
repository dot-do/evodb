[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / isNumberTuple

# Function: isNumberTuple()

> **isNumberTuple**(`value`): `value is [number, number]`

Defined in: [core/src/guards.ts:306](https://github.com/dot-do/evodb/blob/main/core/src/guards.ts#L306)

Type guard: check if value is a tuple of two numbers

Useful for range values like [min, max] or [lo, hi].
Excludes NaN values by default for safety.

## Parameters

### value

`unknown`

Value to check

## Returns

`value is [number, number]`

True if value is a [number, number] tuple

## Example

```typescript
const range: unknown = [10, 20];
if (isNumberTuple(range)) {
  const [lo, hi] = range;
  console.log(`Range: ${lo} to ${hi}`);
}
```
