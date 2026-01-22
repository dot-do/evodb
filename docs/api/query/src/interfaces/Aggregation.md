[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / Aggregation

# Interface: Aggregation

Defined in: [query/src/types.ts:357](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L357)

Aggregation function specification.

Defines an aggregation operation to compute over grouped or ungrouped data.
Supports all standard SQL aggregation functions with DISTINCT and
conditional (filtered) aggregation modifiers.

## Example

```typescript
// Simple COUNT(*)
const countAll: Aggregation = {
  function: 'count',
  column: null,
  alias: 'total_count'
};

// SUM with column
const sumAmount: Aggregation = {
  function: 'sum',
  column: 'amount',
  alias: 'total_amount'
};

// COUNT DISTINCT
const uniqueUsers: Aggregation = {
  function: 'count',
  column: 'user_id',
  alias: 'unique_users',
  distinct: true
};

// Conditional aggregation (like SQL FILTER clause)
const activeSum: Aggregation = {
  function: 'sum',
  column: 'revenue',
  alias: 'active_revenue',
  filter: { column: 'status', operator: 'eq', value: 'active' }
};
```

## Properties

### function

> **function**: [`AggregationFunction`](../type-aliases/AggregationFunction.md)

Defined in: [query/src/types.ts:359](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L359)

Aggregation function

***

### column

> **column**: `string`

Defined in: [query/src/types.ts:362](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L362)

Column to aggregate (null for COUNT(*))

***

### alias

> **alias**: `string`

Defined in: [query/src/types.ts:365](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L365)

Output alias

***

### distinct?

> `optional` **distinct**: `boolean`

Defined in: [query/src/types.ts:368](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L368)

DISTINCT modifier

***

### filter?

> `optional` **filter**: [`Predicate`](Predicate.md)

Defined in: [query/src/types.ts:371](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L371)

Filter for conditional aggregation
