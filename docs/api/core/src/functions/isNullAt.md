[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / isNullAt

# Function: isNullAt()

> **isNullAt**(`nulls`, `index`): `boolean`

Defined in: [core/src/encode.ts:543](https://github.com/dot-do/evodb/blob/main/core/src/encode.ts#L543)

Check if a specific index is null in a NullBitmap.
Works with both SparseNullSet and boolean[] representations.

## Parameters

### nulls

`NullBitmap`

The null bitmap (sparse or dense)

### index

`number`

The index to check

## Returns

`boolean`

true if the value at index is null

## Example

```typescript
const nulls = unpackBits(bitmap, count);
if (isNullAt(nulls, 42)) {
  // Value at index 42 is null
}
```
