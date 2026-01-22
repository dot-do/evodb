[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / sortRows

# Function: sortRows()

> **sortRows**\<`T`\>(`rows`, `orderBy`): `T`[]

Defined in: [core/src/query-ops.ts:669](https://github.com/dot-do/evodb/blob/main/core/src/query-ops.ts#L669)

Sort rows by multiple columns

Uses slice() + in-place sort instead of [...rows].sort() to avoid
double memory allocation from spread operator creating intermediate array.

## Type Parameters

### T

`T` *extends* `Record`\<`string`, `unknown`\>

## Parameters

### rows

`T`[]

### orderBy

[`SortSpec`](../interfaces/SortSpec.md)[]

## Returns

`T`[]
