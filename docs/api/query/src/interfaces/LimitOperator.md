[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / LimitOperator

# Interface: LimitOperator

Defined in: [query/src/types.ts:739](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L739)

Limit operator - limits and offsets result rows.

Returns at most `limit` rows after skipping `offset` rows.
Used for pagination and top-N queries.

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

> **type**: `"limit"`

Defined in: [query/src/types.ts:740](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L740)

***

### input

> **input**: [`PlanOperator`](../type-aliases/PlanOperator.md)

Defined in: [query/src/types.ts:743](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L743)

Child operator

***

### limit

> **limit**: `number`

Defined in: [query/src/types.ts:746](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L746)

Maximum rows

***

### offset

> **offset**: `number`

Defined in: [query/src/types.ts:749](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L749)

Rows to skip
