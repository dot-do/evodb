[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / R2Objects

# Interface: R2Objects

Defined in: [query/src/types.ts:1493](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1493)

@evodb/query - Unified Query Engine Package

This package provides two query modes:

## Simple Mode (formerly @evodb/reader)
Lightweight query engine for basic filtering, projection, and aggregation:
- R2 + Cache API integration
- Manifest-based table discovery
- Columnar JSON block reading

## Full Mode (advanced features)
Full-featured query engine with:
- Zone map optimization for partition pruning
- Bloom filter support for point lookups
- Edge cache integration
- Streaming results for large queries
- Query planning and cost estimation

## Examples

```typescript
import { SimpleQueryEngine, type SimpleQueryConfig } from '@evodb/query';

const engine = new SimpleQueryEngine({
  bucket: env.R2_BUCKET,
  cache: { enableCacheApi: true },
});

const result = await engine.query({
  table: 'users',
  filters: [{ column: 'status', operator: 'eq', value: 'active' }],
  columns: ['id', 'name'],
  limit: 100,
});
```

```typescript
import { createQueryEngine, type Query } from '@evodb/query';

const engine = createQueryEngine({ bucket: env.R2_BUCKET });

const query: Query = {
  table: 'com/example/api/users',
  predicates: [
    { column: 'status', operator: 'eq', value: 'active' }
  ],
  projection: { columns: ['id', 'name', 'email'] },
  limit: 100,
};

const result = await engine.execute(query);
console.log(`Found ${result.totalRowCount} users`);
```

```typescript
import { createSimpleQueryEngine, createQueryExecutor, type QueryExecutor } from '@evodb/query';

// Both engines implement QueryExecutor interface
const simple: QueryExecutor = createSimpleQueryEngine({ bucket: env.R2_BUCKET });
const full: QueryExecutor = createQueryExecutor({ bucket: env.R2_BUCKET });

// Use unified interface
const result = await simple.execute({
  table: 'users',
  predicates: [{ column: 'status', operator: 'eq', value: 'active' }],
  columns: ['id', 'name'],
  limit: 100,
});
```

## Properties

### objects

> **objects**: [`R2Object`](R2Object.md)[]

Defined in: [query/src/types.ts:1494](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1494)

***

### truncated

> **truncated**: `boolean`

Defined in: [query/src/types.ts:1495](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1495)

***

### cursor?

> `optional` **cursor**: `string`

Defined in: [query/src/types.ts:1496](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1496)
