[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / extractPaths

# Function: extractPaths()

> **extractPaths**(`columns`, `paths`, `pathIndex?`): `Record`\<`string`, `unknown`[]\>

Defined in: [core/src/shred.ts:509](https://github.com/dot-do/evodb/blob/main/core/src/shred.ts#L509)

Extract values at multiple paths from columns
Uses path index for O(n) total complexity instead of O(n²) for multi-column operations.

## Parameters

### columns

[`Column`](../interfaces/Column.md)[]

The columns to extract from

### paths

`string`[]

The paths to extract

### pathIndex?

`Map`\<`string`, [`Column`](../interfaces/Column.md)\>

Optional pre-built path index. If not provided, builds one internally for O(1) lookups.

## Returns

`Record`\<`string`, `unknown`[]\>
