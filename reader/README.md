# @evodb/reader

**Queries at the Speed of Cache**

The read path. Query your lakehouse with automatic edge caching - hot data serves in <1ms, and you only pay for R2 reads when cache misses.

## The Magic

```
                              Cache Hit: <1ms, FREE
Query ─────┬───────────────────────────────────────────► Results
           │                    ↑
           │                    │ 99% of requests
           │                    │
           │              ┌─────┴─────┐
           │              │   Edge    │
           │              │   Cache   │
           │              │   (FREE)  │
           │              └───────────┘
           │                    ↑
           │                    │ Cache miss
           │                    │
           └──────────────┬─────┴─────┐
                          │    R2     │
                          │ Lakehouse │
                          └───────────┘
```

**The Cache API is free.** Every cache hit saves an R2 read. With proper caching, you pay for data once, serve it millions of times.

## Installation

```bash
npm install @evodb/reader
```

## Quick Start

```typescript
import { createQueryEngine } from '@evodb/reader';

const engine = createQueryEngine({
  bucket: env.R2_BUCKET,
  cache: {
    enabled: true,
    ttl: 3600,  // 1 hour
  },
});

// Execute a query
const result = await engine.query({
  table: 'users',
  columns: ['id', 'name', 'email'],
  filters: [
    { column: 'status', operator: 'eq', value: 'active' },
  ],
  limit: 100,
});

// Check cache performance
console.log(`Cache hit ratio: ${result.stats.cacheHitRatio}`);
// 0.95 = 95% of data came from cache (FREE)
```

## Query Capabilities

### Filtering

```typescript
const result = await engine.query({
  table: 'orders',
  filters: [
    { column: 'status', operator: 'eq', value: 'shipped' },
    { column: 'total', operator: 'gt', value: 100 },
    { column: 'created', operator: 'between', value: ['2024-01-01', '2024-02-01'] },
  ],
});
```

Supported operators: `eq`, `ne`, `lt`, `le`, `gt`, `ge`, `in`, `notIn`, `isNull`, `isNotNull`, `like`, `between`

### Aggregations

```typescript
const result = await engine.query({
  table: 'orders',
  groupBy: ['status'],
  aggregates: [
    { function: 'count', alias: 'order_count' },
    { function: 'sum', column: 'total', alias: 'revenue' },
    { function: 'avg', column: 'total', alias: 'avg_order' },
  ],
});
// [
//   { status: 'pending', order_count: 150, revenue: 45000, avg_order: 300 },
//   { status: 'shipped', order_count: 1200, revenue: 360000, avg_order: 300 },
// ]
```

Supported functions: `count`, `sum`, `avg`, `min`, `max`, `countDistinct`

### Sorting & Pagination

```typescript
const result = await engine.query({
  table: 'users',
  orderBy: [
    { column: 'created_at', direction: 'desc' },
    { column: 'name', direction: 'asc' },
  ],
  limit: 20,
  offset: 40,  // Page 3
});
```

### Column Projection

Only read what you need:

```typescript
// Reads only 2 columns instead of 50
const result = await engine.query({
  table: 'users',
  columns: ['id', 'name'],  // 95% less I/O
});
```

## Cache Strategy

### Automatic Caching

By default, every block read from R2 is cached at the edge:

```typescript
const engine = createQueryEngine({
  bucket: env.R2_BUCKET,
  cache: {
    enabled: true,
    ttl: 3600,       // Cache for 1 hour
    namespace: 'my-app',  // Isolate from other apps
  },
});
```

### Cache Statistics

Monitor cache effectiveness:

```typescript
const stats = engine.getCacheStats();
console.log(`Hits: ${stats.hits}`);       // 950
console.log(`Misses: ${stats.misses}`);   // 50
console.log(`Hit ratio: ${stats.ratio}`); // 0.95

// Query-level stats
const result = await engine.query({ ... });
console.log(`Bytes from cache: ${result.stats.bytesFromCache}`);
console.log(`Bytes from R2: ${result.stats.bytesFromR2}`);
```

### Cache Invalidation

```typescript
// Invalidate specific table
await engine.invalidateCache('users');

// Invalidate specific partition
await engine.invalidateCache('users', '2024-01');

// Full refresh
await engine.refreshManifest();
```

## API Reference

### Query Engine

```typescript
createQueryEngine(config)          // Create engine
engine.query(request)              // Execute query
engine.scanBlock(request)          // Scan single block
engine.listTables()                // List tables
engine.getTableMetadata(name)      // Get schema
engine.getCacheStats()             // Cache statistics
engine.refreshManifest()           // Reload manifest
```

### Query Request

```typescript
interface QueryRequest {
  table: string;
  columns?: string[];
  filters?: FilterPredicate[];
  orderBy?: SortSpec[];
  groupBy?: string[];
  aggregates?: AggregateSpec[];
  limit?: number;
  offset?: number;
}
```

### Query Result

```typescript
interface QueryResult {
  columns: string[];
  rows: unknown[][];
  stats: {
    executionTimeMs: number;
    blocksScanned: number;
    blocksSkipped: number;
    rowsScanned: number;
    rowsReturned: number;
    bytesFromR2: number;
    bytesFromCache: number;
    cacheHitRatio: number;
  };
}
```

## Performance

| Scenario | Cache Hit | Cache Miss |
|----------|-----------|------------|
| Simple filter | <1ms | ~20ms |
| Aggregation | ~2ms | ~50ms |
| Full scan (1M rows) | ~10ms | ~200ms |

The key is cache hit ratio. Design your access patterns to maximize it.

## Related Packages

- [@evodb/core](../core) - Columnar encoding
- [@evodb/writer](../writer) - Write path
- [@evodb/lakehouse](../lakehouse) - Manifest management
- [@evodb/query](../query) - Advanced query optimization
- [@evodb/edge-cache](../edge-cache) - Advanced caching with cdn.workers.do

## License

MIT - Copyright 2026 .do
