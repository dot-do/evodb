[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / SortOperator

# Interface: SortOperator

Defined in: [query/src/types.ts:723](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L723)

Sort operator - sorts results by specified columns.

Performs an in-memory sort of all input rows. For large datasets,
this may be a memory-intensive operation.

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

> **type**: `"sort"`

Defined in: [query/src/types.ts:724](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L724)

***

### input

> **input**: [`PlanOperator`](../type-aliases/PlanOperator.md)

Defined in: [query/src/types.ts:727](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L727)

Child operator

***

### orderBy

> **orderBy**: [`OrderBy`](OrderBy.md)[]

Defined in: [query/src/types.ts:730](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L730)

Sort specification
