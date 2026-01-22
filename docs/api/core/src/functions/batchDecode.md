[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / batchDecode

# Function: batchDecode()

> **batchDecode**(`encoded`, `rowCount`, `options?`): [`Column`](../interfaces/Column.md)[]

Defined in: [core/src/encode.ts:1350](https://github.com/dot-do/evodb/blob/main/core/src/encode.ts#L1350)

Batch decode multiple columns for snippet efficiency
Minimizes overhead by processing all columns in one pass

## Parameters

### encoded

[`EncodedColumn`](../interfaces/EncodedColumn.md)[]

### rowCount

`number`

### options?

[`FastDecodeOptions`](../interfaces/FastDecodeOptions.md)

## Returns

[`Column`](../interfaces/Column.md)[]
