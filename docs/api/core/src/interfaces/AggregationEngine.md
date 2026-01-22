[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / AggregationEngine

# Interface: AggregationEngine

Defined in: [core/src/query-ops.ts:126](https://github.com/dot-do/evodb/blob/main/core/src/query-ops.ts#L126)

Aggregation engine interface

## Methods

### aggregate()

> **aggregate**(`rows`, `aggregates`, `groupBy?`): `object`

Defined in: [core/src/query-ops.ts:130](https://github.com/dot-do/evodb/blob/main/core/src/query-ops.ts#L130)

Compute aggregations over rows

#### Parameters

##### rows

`Record`\<`string`, `unknown`\>[]

##### aggregates

[`AggregateSpec`](AggregateSpec.md)[]

##### groupBy?

`string`[]

#### Returns

`object`

##### columns

> **columns**: `string`[]

##### rows

> **rows**: `unknown`[][]
