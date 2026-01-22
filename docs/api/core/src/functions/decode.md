[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / decode

# Function: decode()

> **decode**(`encoded`, `rowCount`): [`Column`](../interfaces/Column.md)

Defined in: [core/src/encode.ts:1034](https://github.com/dot-do/evodb/blob/main/core/src/encode.ts#L1034)

Decode column data.
Uses smart null bitmap unpacking - returns SparseNullSet for sparse data (Issue: evodb-80q).

## Parameters

### encoded

[`EncodedColumn`](../interfaces/EncodedColumn.md)

### rowCount

`number`

## Returns

[`Column`](../interfaces/Column.md)
