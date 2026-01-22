[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / AggregateOperator

# Interface: AggregateOperator

Defined in: [query/src/types.ts:704](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L704)

Aggregate operator - computes aggregations over groups.

Groups input rows by the specified columns and computes
aggregation functions over each group.

## Extends

- `BaseOperator`

## Properties

### estimatedRows

> **estimatedRows**: `number`

Defined in: [query/src/types.ts:643](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L643)

Estimated output row count

#### Inherited from

`BaseOperator.estimatedRows`

***

### estimatedCost

> **estimatedCost**: `number`

Defined in: [query/src/types.ts:646](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L646)

Estimated cost

#### Inherited from

`BaseOperator.estimatedCost`

***

### type

> **type**: `"aggregate"`

Defined in: [query/src/types.ts:705](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L705)

***

### input

> **input**: [`PlanOperator`](../type-aliases/PlanOperator.md)

Defined in: [query/src/types.ts:708](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L708)

Child operator

***

### aggregations

> **aggregations**: [`Aggregation`](Aggregation.md)[]

Defined in: [query/src/types.ts:711](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L711)

Aggregations to compute

***

### groupBy

> **groupBy**: `string`[]

Defined in: [query/src/types.ts:714](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L714)

Group by columns
