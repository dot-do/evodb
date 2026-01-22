[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / ExecutorPredicate

# Interface: ExecutorPredicate

Defined in: [core/src/query-executor.ts:53](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L53)

Predicate for filtering rows

## Properties

### column

> **column**: `string`

Defined in: [core/src/query-executor.ts:55](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L55)

Column name/path

***

### operator

> **operator**: `"in"` \| `"between"` \| `"like"` \| `"eq"` \| `"ne"` \| `"gt"` \| `"gte"` \| `"ge"` \| `"lt"` \| `"lte"` \| `"le"` \| `"notIn"` \| `"isNull"` \| `"isNotNull"`

Defined in: [core/src/query-executor.ts:58](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L58)

Comparison operator

***

### value?

> `optional` **value**: `unknown`

Defined in: [core/src/query-executor.ts:75](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L75)

Value to compare against

***

### values?

> `optional` **values**: `unknown`[]

Defined in: [core/src/query-executor.ts:78](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L78)

Array of values (for in, notIn)

***

### lowerBound?

> `optional` **lowerBound**: `unknown`

Defined in: [core/src/query-executor.ts:81](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L81)

Lower bound (for between)

***

### upperBound?

> `optional` **upperBound**: `unknown`

Defined in: [core/src/query-executor.ts:84](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L84)

Upper bound (for between)

***

### not?

> `optional` **not**: `boolean`

Defined in: [core/src/query-executor.ts:87](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L87)

Negate the predicate
