[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / unpackBitsLazy

# Function: unpackBitsLazy()

> **unpackBitsLazy**(`bytes`, `count`): [`LazyBitmap`](../interfaces/LazyBitmap.md)

Defined in: [core/src/encode.ts:432](https://github.com/dot-do/evodb/blob/main/core/src/encode.ts#L432)

Create a lazy bitmap from packed bytes.
Returns an object with O(1) access without allocating the full array.

Performance characteristics:
- get(i): O(1) time, O(1) space
- toArray(): O(n) time, O(n) space (delegates to unpackBits)

## Parameters

### bytes

`Uint8Array`

The packed bitmap bytes

### count

`number`

Total number of elements

## Returns

[`LazyBitmap`](../interfaces/LazyBitmap.md)

LazyBitmap with get(i) method for on-demand access

## Example

```typescript
// Sparse access - only check specific indices
const lazy = unpackBitsLazy(bitmap, 100000);
if (lazy.get(42)) {
  // Index 42 is null
}

// Dense access - convert to array when needed
const bits = lazy.toArray();
```
