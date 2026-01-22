[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / Query

# Interface: Query

Defined in: [query/src/types.ts:128](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L128)

Query definition for scanning R2-stored columnar data.

Represents a declarative query specification that the query engine
translates into an optimized execution plan. Supports filtering,
projection, aggregation, grouping, sorting, and time-travel queries.

## Example

```typescript
// Simple query with filtering and projection
const query: Query = {
  table: 'events/2024',
  projection: { columns: ['user_id', 'event_type', 'timestamp'] },
  predicates: [
    { column: 'event_type', operator: 'eq', value: 'purchase' },
    { column: 'timestamp', operator: 'gte', value: Date.now() - 86400000 }
  ],
  orderBy: [{ column: 'timestamp', direction: 'desc' }],
  limit: 100
};

// Aggregation query with grouping
const aggregateQuery: Query = {
  table: 'sales',
  aggregations: [
    { function: 'sum', column: 'amount', alias: 'total_sales' },
    { function: 'count', column: null, alias: 'order_count' }
  ],
  groupBy: ['region', 'product_category'],
  predicates: [
    { column: 'sale_date', operator: 'between', value: ['2024-01-01', '2024-12-31'] }
  ]
};

// Time-travel query
const historicalQuery: Query = {
  table: 'inventory',
  snapshotId: 'snap-abc123',
  projection: { columns: ['sku', 'quantity'] }
};
```

## Properties

### table

> **table**: `string`

Defined in: [query/src/types.ts:130](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L130)

Table location (R2 path or URL)

***

### projection?

> `optional` **projection**: [`Projection`](Projection.md)

Defined in: [query/src/types.ts:133](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L133)

Columns to project (null = all columns)

***

### predicates?

> `optional` **predicates**: [`Predicate`](Predicate.md)[]

Defined in: [query/src/types.ts:136](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L136)

Row filter predicates

***

### aggregations?

> `optional` **aggregations**: [`Aggregation`](Aggregation.md)[]

Defined in: [query/src/types.ts:139](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L139)

Aggregations to compute

***

### groupBy?

> `optional` **groupBy**: `string`[]

Defined in: [query/src/types.ts:142](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L142)

GROUP BY columns

***

### orderBy?

> `optional` **orderBy**: [`OrderBy`](OrderBy.md)[]

Defined in: [query/src/types.ts:145](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L145)

ORDER BY specification

***

### limit?

> `optional` **limit**: `number`

Defined in: [query/src/types.ts:148](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L148)

Maximum rows to return

***

### offset?

> `optional` **offset**: `number`

Defined in: [query/src/types.ts:151](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L151)

Rows to skip

***

### snapshotId?

> `optional` **snapshotId**: `string`

Defined in: [query/src/types.ts:154](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L154)

Time-travel: query as-of specific snapshot

***

### asOfTimestamp?

> `optional` **asOfTimestamp**: `number`

Defined in: [query/src/types.ts:157](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L157)

Time-travel: query as-of timestamp

***

### hints?

> `optional` **hints**: [`QueryHints`](QueryHints.md)

Defined in: [query/src/types.ts:160](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L160)

Query execution hints
