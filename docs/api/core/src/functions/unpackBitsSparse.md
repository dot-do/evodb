[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / unpackBitsSparse

# Function: unpackBitsSparse()

> **unpackBitsSparse**(`bytes`, `count`): `boolean`[] \| [`SparseNullSet`](../classes/SparseNullSet.md)

Defined in: [core/src/encode.ts:631](https://github.com/dot-do/evodb/blob/main/core/src/encode.ts#L631)

Unpack bitmap to sparse representation if null rate is below threshold.
Returns SparseNullSet for sparse data, boolean[] for dense data.

## Parameters

### bytes

`Uint8Array`

The packed bitmap

### count

`number`

Total number of elements

## Returns

`boolean`[] \| [`SparseNullSet`](../classes/SparseNullSet.md)

SparseNullSet for sparse data (< SPARSE_NULL_THRESHOLD null rate),
         boolean[] for dense data
