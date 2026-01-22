[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / SPARSE\_NULL\_THRESHOLD

# Variable: SPARSE\_NULL\_THRESHOLD

> `const` **SPARSE\_NULL\_THRESHOLD**: `0.1` = `0.1`

Defined in: [core/src/encode.ts:453](https://github.com/dot-do/evodb/blob/main/core/src/encode.ts#L453)

Threshold for using sparse representation.
If null rate is below this threshold, use SparseNullSet instead of full array.
10% threshold: for 10K elements, sparse is better if < 1K nulls
