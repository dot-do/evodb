[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / MergeOperator

# Interface: MergeOperator

Defined in: [query/src/types.ts:758](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L758)

Merge operator - merges results from multiple child operators.

Used to combine results from parallel partition scans.
Optionally performs a sort-merge if results need to maintain order.

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

> **type**: `"merge"`

Defined in: [query/src/types.ts:759](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L759)

***

### inputs

> **inputs**: [`PlanOperator`](../type-aliases/PlanOperator.md)[]

Defined in: [query/src/types.ts:762](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L762)

Child operators (one per partition)

***

### mergeKey?

> `optional` **mergeKey**: `string`[]

Defined in: [query/src/types.ts:765](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L765)

Sort-merge key (if ordered)
