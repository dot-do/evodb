[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / FilterOperator

# Interface: FilterOperator

Defined in: [query/src/types.ts:672](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L672)

Filter operator - applies predicates to filter rows.

Evaluates predicates against each input row and only passes
through rows that match all predicates (AND semantics).

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

> **type**: `"filter"`

Defined in: [query/src/types.ts:673](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L673)

***

### input

> **input**: [`PlanOperator`](../type-aliases/PlanOperator.md)

Defined in: [query/src/types.ts:676](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L676)

Child operator

***

### predicates

> **predicates**: [`Predicate`](Predicate.md)[]

Defined in: [query/src/types.ts:679](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L679)

Predicates to apply
