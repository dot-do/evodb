# @evodb/reader

Worker-based query engine reading from R2 with Cache API integration.

## Installation

```bash
npm install @evodb/reader
```

## Overview

This package provides the read path for EvoDB:

- **Manifest-based reads**: Query via table manifests stored in R2
- **Cache API integration**: FREE caching tier for hot data
- **Filter pushdown**: Evaluate predicates during scan
- **Aggregations**: COUNT, SUM, AVG, MIN, MAX, COUNT DISTINCT
- **Sorting**: Multi-column ORDER BY with null handling
- **Projection**: Column selection to minimize I/O

## Quick Start

```typescript
import { createQueryEngine } from '@evodb/reader';

const engine = createQueryEngine({
  bucket: env.R2_BUCKET,
  cache: {
    enabled: true,
    ttl: 3600, // 1 hour
  },
});

// List available tables
const tables = await engine.listTables();

// Execute a query
const result = await engine.query({
  table: 'users',
  columns: ['id', 'name', 'email'],
  filters: [
    { column: 'status', operator: 'eq', value: 'active' },
    { column: 'created_at', operator: 'gt', value: '2024-01-01' },
  ],
  orderBy: [{ column: 'created_at', direction: 'desc' }],
  limit: 100,
});

console.log(`Found ${result.stats.rowsReturned} rows`);
console.log(`Cache hit ratio: ${result.stats.cacheHitRatio}`);
```

## API Reference

### QueryEngine

```typescript
const engine = createQueryEngine(config);

// Methods
await engine.listTables()              // List all tables
await engine.getTableMetadata(name)    // Get table schema
await engine.query(request)            // Execute query
await engine.scanBlock(request)        // Scan single block
await engine.refreshManifest()         // Reload manifest
engine.getCacheStats()                 // Get cache statistics
engine.resetCacheStats()               // Reset statistics
```

### Query Request

```typescript
interface QueryRequest {
  table: string;
  columns?: string[];           // Default: all columns
  filters?: FilterPredicate[];
  orderBy?: SortSpec[];
  groupBy?: string[];
  aggregates?: AggregateSpec[];
  limit?: number;
  offset?: number;
  timeoutMs?: number;
}
```

### Filter Operators

```typescript
type FilterOperator =
  | 'eq'        // Equal
  | 'ne'        // Not equal
  | 'lt'        // Less than
  | 'le'        // Less than or equal
  | 'gt'        // Greater than
  | 'ge'        // Greater than or equal
  | 'in'        // In array
  | 'notIn'     // Not in array
  | 'isNull'    // Is null
  | 'isNotNull' // Is not null
  | 'like'      // SQL LIKE pattern
  | 'between';  // Between range
```

### Aggregates

```typescript
type AggregateFunction =
  | 'count'
  | 'sum'
  | 'avg'
  | 'min'
  | 'max'
  | 'countDistinct';

// Example
const result = await engine.query({
  table: 'orders',
  groupBy: ['status'],
  aggregates: [
    { function: 'count', alias: 'order_count' },
    { function: 'sum', column: 'total', alias: 'revenue' },
  ],
});
```

### Query Result

```typescript
interface QueryResult {
  columns: string[];
  rows: unknown[][];
  stats: QueryStats;
}

interface QueryStats {
  executionTimeMs: number;
  blocksScanned: number;
  blocksSkipped: number;
  rowsScanned: number;
  rowsReturned: number;
  bytesFromR2: number;
  bytesFromCache: number;
  cacheHitRatio: number;
}
```

### Cache Configuration

```typescript
interface CacheTierConfig {
  enabled: boolean;
  ttl: number;           // TTL in seconds
  maxSize?: number;      // Max cached items
  namespace?: string;    // Cache namespace
}
```

## Cache Tier (FREE)

The reader uses the Workers Cache API, which is **free** and provides:

- Automatic edge caching of R2 blocks
- ~0ms latency for cached data
- No egress charges for cache hits
- Configurable TTL per table

```typescript
// Monitor cache effectiveness
const stats = engine.getCacheStats();
console.log(`Hits: ${stats.hits}, Misses: ${stats.misses}`);
console.log(`Hit ratio: ${stats.hits / (stats.hits + stats.misses)}`);
```

## Related Packages

- `@evodb/core` - Columnar encoding primitives
- `@evodb/writer` - Write path to R2
- `@evodb/lakehouse` - Manifest management
- `@evodb/edge-cache` - Advanced edge caching with cdn.workers.do

## License

MIT
