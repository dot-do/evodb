[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / FilterPredicate

# Interface: FilterPredicate

Defined in: [core/src/query-ops.ts:39](https://github.com/dot-do/evodb/blob/main/core/src/query-ops.ts#L39)

Filter predicate specification

## Properties

### column

> **column**: `string`

Defined in: [core/src/query-ops.ts:41](https://github.com/dot-do/evodb/blob/main/core/src/query-ops.ts#L41)

Column name/path

***

### operator

> **operator**: [`FilterOperator`](../type-aliases/FilterOperator.md)

Defined in: [core/src/query-ops.ts:43](https://github.com/dot-do/evodb/blob/main/core/src/query-ops.ts#L43)

Comparison operator

***

### value?

> `optional` **value**: `unknown`

Defined in: [core/src/query-ops.ts:45](https://github.com/dot-do/evodb/blob/main/core/src/query-ops.ts#L45)

Value to compare against (for eq, ne, gt, gte, lt, lte, like)

***

### values?

> `optional` **values**: `unknown`[]

Defined in: [core/src/query-ops.ts:47](https://github.com/dot-do/evodb/blob/main/core/src/query-ops.ts#L47)

Array of values (for in, notIn)

***

### lowerBound?

> `optional` **lowerBound**: `unknown`

Defined in: [core/src/query-ops.ts:49](https://github.com/dot-do/evodb/blob/main/core/src/query-ops.ts#L49)

Lower bound (for between)

***

### upperBound?

> `optional` **upperBound**: `unknown`

Defined in: [core/src/query-ops.ts:51](https://github.com/dot-do/evodb/blob/main/core/src/query-ops.ts#L51)

Upper bound (for between)

***

### not?

> `optional` **not**: `boolean`

Defined in: [core/src/query-ops.ts:53](https://github.com/dot-do/evodb/blob/main/core/src/query-ops.ts#L53)

Negate the predicate
