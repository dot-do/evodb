[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / ProjectOperator

# Interface: ProjectOperator

Defined in: [query/src/types.ts:688](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L688)

Project operator - column projection and selection.

Selects a subset of columns from input rows, potentially
reducing memory usage for downstream operators.

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

> **type**: `"project"`

Defined in: [query/src/types.ts:689](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L689)

***

### input

> **input**: [`PlanOperator`](../type-aliases/PlanOperator.md)

Defined in: [query/src/types.ts:692](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L692)

Child operator

***

### columns

> **columns**: `string`[]

Defined in: [query/src/types.ts:695](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L695)

Columns to output
