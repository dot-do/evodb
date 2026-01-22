[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / NullBitmap

# Type Alias: NullBitmap

> **NullBitmap** = `boolean`[] \| \{ `isNull`: `boolean`; `toArray`: `boolean`[]; `length`: `number`; \}

Defined in: [core/src/types.ts:141](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L141)

Null bitmap representation - can be dense (boolean[]) or sparse (SparseNullSet).
Sparse representation is used when null rate < 10% for memory efficiency.
Both representations support index-based null checking:
- boolean[]: nulls[i] returns true if null
- SparseNullSet: nulls.isNull(i) returns true if null

For iteration, both are Iterable<boolean>.
For backward compatibility, SparseNullSet.toArray() converts to boolean[].

## See

 - SparseNullSet in encode.ts for sparse implementation
 - SPARSE_NULL_THRESHOLD for the 10% threshold constant
