# @evodb/query

Query engine for EvoDB with zone map optimization and bloom filters.

## Installation

```bash
npm install @evodb/query
```

## Overview

This package provides the query execution engine:

- **Zone Map Optimization**: Skip blocks based on min/max statistics
- **Bloom Filters**: Accelerate point lookups
- **Edge Cache Integration**: Leverage cdn.workers.do caching
- **Streaming Results**: Handle large result sets
- **Query Planning**: Cost-based optimization

> **Note**: This package is currently in early development. Some features are stubs.

## Quick Start

```typescript
import { createQueryEngine, type Query } from '@evodb/query';

const engine = createQueryEngine({
  bucket: env.R2_BUCKET,
  cache: {
    enabled: true,
    ttl: 3600,
  },
});

const query: Query = {
  table: 'com/example/api/users',
  predicates: [
    { column: 'status', operator: 'eq', value: 'active' },
    { column: 'age', operator: 'between', lower: 18, upper: 65 },
  ],
  projection: { columns: ['id', 'name', 'email'] },
  orderBy: [{ column: 'created_at', direction: 'desc' }],
  limit: 100,
};

const result = await engine.execute(query);
console.log(`Found ${result.totalRowCount} users`);
```

## API Reference

### Query Engine

```typescript
const engine = createQueryEngine(config);

await engine.execute(query)     // Execute query
await engine.explain(query)     // Get query plan
await engine.stream(query)      // Stream results
```

### Query Types

```typescript
interface Query {
  table: string;
  predicates?: Predicate[];
  projection?: Projection;
  aggregation?: Aggregation[];
  orderBy?: OrderBy[];
  limit?: number;
  offset?: number;
  hints?: QueryHints;
}

interface Predicate {
  column: string;
  operator: PredicateOperator;
  value?: PredicateValue;
  values?: PredicateValue[];
  lower?: PredicateValue;
  upper?: PredicateValue;
}

type PredicateOperator =
  | 'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge'
  | 'in' | 'not_in' | 'is_null' | 'is_not_null'
  | 'like' | 'between';
```

### Query Plan

```typescript
interface QueryPlan {
  operators: PlanOperator[];
  cost: QueryCost;
  partitions: PartitionInfo[];
  prunedPartitions: PrunedPartition[];
}

type PlanOperator =
  | ScanOperator      // Read from storage
  | FilterOperator    // Apply predicates
  | ProjectOperator   // Select columns
  | AggregateOperator // Compute aggregates
  | SortOperator      // Order results
  | LimitOperator     // Limit rows
  | MergeOperator;    // Combine partitions
```

### Zone Map Optimization

```typescript
const optimizer = createZoneMapOptimizer();

// Check if block can be skipped
const canSkip = optimizer.canSkipBlock(blockZoneMap, predicate);

// Get pruning statistics
const stats = optimizer.getPruningStats();
```

### Bloom Filter

```typescript
const manager = createBloomFilterManager();

// Check if value might exist
const mightExist = manager.mightContain(bloomFilter, value);

// Load filter from storage
await manager.loadFilter(blockPath);
```

### Aggregation Engine

```typescript
const aggEngine = createAggregationEngine();

// Supported functions
type AggregationFunction =
  | 'count' | 'count_distinct'
  | 'sum' | 'avg'
  | 'min' | 'max'
  | 'approx_count_distinct';

// Execute aggregation
const result = await aggEngine.aggregate(rows, aggregations, groupBy);
```

### Result Types

```typescript
interface QueryResult {
  columns: string[];
  rows: unknown[][];
  totalRowCount: number;
  stats: QueryStats;
}

interface QueryStats {
  executionTimeMs: number;
  planningTimeMs: number;
  blocksScanned: number;
  blocksSkipped: number;
  rowsScanned: number;
  rowsReturned: number;
  bytesRead: number;
  cacheHits: number;
  cacheMisses: number;
}
```

### Factory Functions

```typescript
createQueryEngine(config)       // Main query engine
createQueryPlanner(config)      // Query planner
createZoneMapOptimizer()        // Zone map optimizer
createBloomFilterManager()      // Bloom filter manager
createAggregationEngine()       // Aggregation engine
createCacheManager(config)      // Cache manager
createResultProcessor()         // Result processing
```

## Related Packages

- `@evodb/core` - Columnar encoding primitives
- `@evodb/reader` - Basic reader with Cache API
- `@evodb/lakehouse` - Manifest management
- `@evodb/edge-cache` - Advanced edge caching

## License

MIT
