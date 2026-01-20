# @evodb/query

**Skip What You Don't Need**

The query optimizer. Zone maps and bloom filters let you skip 90%+ of your data before reading a single byte.

## The Optimization

Traditional query: Read everything, filter later.

EvoDB query: Skip blocks that can't match, read only what's needed.

```
Query: WHERE user_id = 'alice' AND created > '2024-01-01'

┌─────────────────────────────────────────────────────────────┐
│                     1000 Blocks                              │
│                                                              │
│  Zone Maps say:                                              │
│  - 600 blocks have created < '2024-01-01' → SKIP            │
│  - 400 blocks might match                                    │
│                                                              │
│  Bloom Filters say:                                          │
│  - 350 blocks definitely don't have 'alice' → SKIP          │
│  - 50 blocks might have 'alice'                              │
│                                                              │
│  Result: Read 50 blocks instead of 1000 (95% reduction)     │
└─────────────────────────────────────────────────────────────┘
```

**Zone Maps**: Track min/max per column per block. Skip blocks outside the range.

**Bloom Filters**: Probabilistic set membership. Skip blocks that definitely don't match.

## Installation

```bash
npm install @evodb/query
```

## Quick Start

```typescript
import { createQueryEngine, type Query } from '@evodb/query';

const engine = createQueryEngine({
  bucket: env.R2_BUCKET,
  zoneMapEnabled: true,
  bloomFilterEnabled: true,
});

const query: Query = {
  table: 'events',
  predicates: [
    { column: 'user_id', operator: 'eq', value: 'alice' },
    { column: 'created', operator: 'gt', value: '2024-01-01' },
  ],
  projection: { columns: ['id', 'type', 'data'] },
  limit: 100,
};

const result = await engine.execute(query);

// Check how much we skipped
console.log(`Blocks scanned: ${result.stats.blocksScanned}`);
console.log(`Blocks skipped: ${result.stats.blocksSkipped}`);  // 950!
```

## Zone Map Optimization

Every block stores min/max statistics for each column:

```typescript
// Block metadata
{
  blockId: 'blk_abc123',
  rowCount: 10000,
  zoneMap: {
    created: { min: '2024-01-15', max: '2024-01-31' },
    user_id: { min: 'aaron', max: 'zoe' },
    amount: { min: 0, max: 9999 }
  }
}
```

For a query like `WHERE created > '2024-02-01'`:
- Block with `max: '2024-01-31'` → **SKIP** (all values are before our filter)
- Block with `max: '2024-02-15'` → **SCAN** (might have matches)

```typescript
import { createZoneMapOptimizer } from '@evodb/query';

const optimizer = createZoneMapOptimizer();

// Check if block can be skipped
const canSkip = optimizer.canSkipBlock(block.zoneMap, {
  column: 'created',
  operator: 'gt',
  value: '2024-02-01'
});

if (canSkip) {
  // Don't read this block at all
}
```

## Bloom Filters

For equality predicates, bloom filters provide probabilistic filtering:

```typescript
import { createBloomFilterManager } from '@evodb/query';

const manager = createBloomFilterManager();

// Check if value might exist in block
const mightExist = manager.mightContain(block.bloomFilter, 'user_id', 'alice');

if (!mightExist) {
  // 'alice' is DEFINITELY not in this block - skip it
}

// Note: mightExist=true means "possibly" - still need to scan
```

**False positive rate**: ~1%. You might scan some blocks unnecessarily, but you'll never miss data.

## Query Planning

The planner chooses the optimal execution strategy:

```typescript
const plan = await engine.explain(query);

console.log(plan);
// {
//   operators: [
//     { type: 'scan', table: 'events', pruning: { zoneMap: true, bloom: true } },
//     { type: 'filter', predicates: [...] },
//     { type: 'project', columns: ['id', 'type', 'data'] },
//     { type: 'limit', count: 100 }
//   ],
//   cost: {
//     estimatedBlocks: 50,
//     estimatedRows: 5000,
//     prunedBlocks: 950
//   }
// }
```

## Aggregation Engine

Efficient aggregations with partial computation:

```typescript
const result = await engine.execute({
  table: 'orders',
  predicates: [
    { column: 'status', operator: 'eq', value: 'completed' }
  ],
  aggregation: [
    { function: 'count', alias: 'total_orders' },
    { function: 'sum', column: 'amount', alias: 'revenue' },
    { function: 'approx_count_distinct', column: 'user_id', alias: 'unique_customers' }
  ],
  groupBy: ['region']
});
```

Supported functions:
- `count`, `count_distinct`, `approx_count_distinct`
- `sum`, `avg`
- `min`, `max`

## Streaming Results

For large result sets, stream instead of buffering:

```typescript
const stream = await engine.stream(query);

for await (const batch of stream) {
  // Process batch of ~1000 rows
  for (const row of batch.rows) {
    await processRow(row);
  }
}
```

## API Reference

### Query Engine

```typescript
createQueryEngine(config)     // Create engine
engine.execute(query)         // Execute query
engine.explain(query)         // Get query plan
engine.stream(query)          // Stream results
```

### Query Types

```typescript
interface Query {
  table: string;
  predicates?: Predicate[];
  projection?: { columns: string[] };
  aggregation?: Aggregation[];
  groupBy?: string[];
  orderBy?: OrderBy[];
  limit?: number;
  offset?: number;
}
```

### Optimizers

```typescript
createZoneMapOptimizer()      // Zone map pruning
createBloomFilterManager()    // Bloom filter pruning
createQueryPlanner()          // Cost-based planning
createAggregationEngine()     // Aggregation execution
```

## Performance

| Query Type | Without Optimization | With Optimization |
|------------|---------------------|-------------------|
| Point lookup | 200ms | 5ms (40x faster) |
| Range scan | 500ms | 50ms (10x faster) |
| Aggregation | 1000ms | 100ms (10x faster) |

The bigger your data, the bigger the savings.

## Related Packages

- [@evodb/reader](../reader) - Basic query execution
- [@evodb/core](../core) - Columnar encoding
- [@evodb/lakehouse](../lakehouse) - Manifest management
- [@evodb/edge-cache](../edge-cache) - Edge caching

## License

MIT - Copyright 2026 .do
