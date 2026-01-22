[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / OrderBy

# Interface: OrderBy

Defined in: [query/src/types.ts:439](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L439)

ORDER BY specification.

Defines sorting order for query results. Multiple OrderBy specifications
can be combined for multi-column sorting (first column is primary sort key).
Sort operations are performed after filtering and aggregation.

## Example

```typescript
// Simple descending sort
const byTimestamp: OrderBy = {
  column: 'created_at',
  direction: 'desc'
};

// Ascending with nulls last
const byName: OrderBy = {
  column: 'name',
  direction: 'asc',
  nulls: 'last'
};

// Multi-column sort (array of OrderBy)
const multiSort: OrderBy[] = [
  { column: 'priority', direction: 'desc' },
  { column: 'created_at', direction: 'asc', nulls: 'first' }
];
```

## Properties

### column

> **column**: `string`

Defined in: [query/src/types.ts:441](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L441)

Column to sort by

***

### direction

> **direction**: `"asc"` \| `"desc"`

Defined in: [query/src/types.ts:444](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L444)

Sort direction

***

### nulls?

> `optional` **nulls**: `"first"` \| `"last"`

Defined in: [query/src/types.ts:447](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L447)

Null handling
