[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / unpackBits

# Function: unpackBits()

> **unpackBits**(`bytes`, `count`): `boolean`[] \| [`SparseNullSet`](../classes/SparseNullSet.md)

Defined in: [core/src/encode.ts:377](https://github.com/dot-do/evodb/blob/main/core/src/encode.ts#L377)

Smart bitmap unpacking - automatically selects sparse or dense representation.
This is the DEFAULT unpacking function (Issue: evodb-80q).

Selection logic:
- If null rate < 10% (SPARSE_NULL_THRESHOLD): returns SparseNullSet for memory efficiency
- Otherwise: returns dense boolean array for fast random access

Memory comparison for 100K elements with 10 nulls:
- Dense boolean[]: ~100KB
- SparseNullSet: ~80 bytes

## Parameters

### bytes

`Uint8Array`

The packed bitmap

### count

`number`

Total number of elements

## Returns

`boolean`[] \| [`SparseNullSet`](../classes/SparseNullSet.md)

SparseNullSet for sparse data, boolean[] for dense data
