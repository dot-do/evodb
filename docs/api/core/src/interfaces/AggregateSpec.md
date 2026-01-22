[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / AggregateSpec

# Interface: AggregateSpec

Defined in: [core/src/query-ops.ts:95](https://github.com/dot-do/evodb/blob/main/core/src/query-ops.ts#L95)

Aggregation specification

## Properties

### function

> **function**: [`AggregateFunction`](../type-aliases/AggregateFunction.md)

Defined in: [core/src/query-ops.ts:97](https://github.com/dot-do/evodb/blob/main/core/src/query-ops.ts#L97)

Aggregation function

***

### column?

> `optional` **column**: `string`

Defined in: [core/src/query-ops.ts:99](https://github.com/dot-do/evodb/blob/main/core/src/query-ops.ts#L99)

Column to aggregate (null for COUNT(*))

***

### alias

> **alias**: `string`

Defined in: [core/src/query-ops.ts:101](https://github.com/dot-do/evodb/blob/main/core/src/query-ops.ts#L101)

Output alias

***

### filter?

> `optional` **filter**: [`FilterPredicate`](FilterPredicate.md)

Defined in: [core/src/query-ops.ts:103](https://github.com/dot-do/evodb/blob/main/core/src/query-ops.ts#L103)

Filter for conditional aggregation

***

### distinct?

> `optional` **distinct**: `boolean`

Defined in: [core/src/query-ops.ts:105](https://github.com/dot-do/evodb/blob/main/core/src/query-ops.ts#L105)

DISTINCT modifier (can also be inferred from function name)
