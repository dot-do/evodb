[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / computeAggregations

# Function: computeAggregations()

> **computeAggregations**(`rows`, `aggregates`, `groupBy?`): `object`

Defined in: [core/src/query-ops.ts:1023](https://github.com/dot-do/evodb/blob/main/core/src/query-ops.ts#L1023)

Compute aggregations over rows, optionally grouped.
Uses single-pass aggregation for efficiency - all aggregates are computed
in a single iteration over each group's rows.

## Parameters

### rows

`Record`\<`string`, `unknown`\>[]

### aggregates

[`AggregateSpec`](../interfaces/AggregateSpec.md)[]

### groupBy?

`string`[]

## Returns

`object`

### columns

> **columns**: `string`[]

### rows

> **rows**: `unknown`[][]
