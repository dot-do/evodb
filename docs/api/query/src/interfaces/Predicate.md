[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / Predicate

# Interface: Predicate

Defined in: [query/src/types.ts:232](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L232)

Predicate for filtering rows.

Represents a single filter condition that can be applied to rows during
query execution. Predicates are pushed down to the storage layer when
possible, and zone maps / bloom filters are used to prune partitions
that cannot match the predicate.

## Example

```typescript
// Equality predicate
const eqPredicate: Predicate = {
  column: 'status',
  operator: 'eq',
  value: 'active'
};

// Range predicate
const rangePredicate: Predicate = {
  column: 'price',
  operator: 'between',
  value: [100, 500]
};

// IN predicate
const inPredicate: Predicate = {
  column: 'region',
  operator: 'in',
  value: ['US', 'EU', 'APAC']
};

// NULL check
const nullPredicate: Predicate = {
  column: 'deleted_at',
  operator: 'isNull',
  value: null
};
```

## Properties

### column

> **column**: `string`

Defined in: [query/src/types.ts:234](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L234)

Column name/path

***

### operator

> **operator**: [`PredicateOperator`](../type-aliases/PredicateOperator.md)

Defined in: [query/src/types.ts:237](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L237)

Comparison operator

***

### value

> **value**: [`PredicateValue`](../type-aliases/PredicateValue.md)

Defined in: [query/src/types.ts:240](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L240)

Value to compare against

***

### not?

> `optional` **not**: `boolean`

Defined in: [query/src/types.ts:243](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L243)

Optional: negate the predicate
