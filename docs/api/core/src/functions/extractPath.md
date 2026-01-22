[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / extractPath

# Function: extractPath()

> **extractPath**(`columns`, `path`, `pathIndex?`): `unknown`[]

Defined in: [core/src/shred.ts:497](https://github.com/dot-do/evodb/blob/main/core/src/shred.ts#L497)

Extract values at a single path from columns

## Parameters

### columns

[`Column`](../interfaces/Column.md)[]

The columns to extract from

### path

`string`

The path to extract

### pathIndex?

`Map`\<`string`, [`Column`](../interfaces/Column.md)\>

Optional pre-built path index for O(1) lookup. If not provided, uses O(n) linear search.

## Returns

`unknown`[]
