# Performance Guide

This guide covers EvoDB performance characteristics, optimization techniques, and tuning strategies for different deployment environments.

## Recent Optimizations (v0.x)

EvoDB has undergone significant performance optimization across 24 documented improvements, achieving substantial gains in bundle size, query performance, and memory usage.

### Bundle Size Reduction (40-50%)

| Component | Before | After | Reduction |
|-----------|--------|-------|-----------|
| @evodb/core barrel | ~460KB | ~30KB (focused) | ~93% with tree-shaking |
| circuit-breaker.ts | 497 lines | 289 lines | 42% |
| query-engine-selector.ts | 497 lines | 73 lines | 85% |
| schema.ts | 270 lines | 50 lines | 81% |
| Branded types | 6 types | 2 types (BlockId, TableId) | 67% |
| Error classes | Many | 4 consolidated types | Simplified |

**Key Changes:**
- Removed source maps from npm distribution
- Extracted @evodb/observability package (metrics, tracing, logging)
- Created focused entry points for tree-shaking
- Simplified edge execution model components

### Query Performance Improvement (40-60%)

| Optimization | Impact |
|--------------|--------|
| Pre-compiled column accessors | Avoid re-parsing paths per row |
| Single-pass aggregation | Compute all aggregates in one iteration |
| Lazy bitmap unpacking | Only unpack accessed indices |
| ASCII fast path for string comparison | 2-3x faster for ASCII strings |
| Path index for O(1) column lookup | Avoid O(n) linear search per column |

### Memory Usage Reduction (30-40%)

| Optimization | Before | After |
|--------------|--------|-------|
| Array spread in sortRows() | Double allocation | Single slice() |
| Merge column concatenation | O(n) copies | Optimized in-place |
| TextEncoder allocation | Created in loop | Module-level reuse |
| Sparse null bitmap | Full boolean array | Bit-packed storage |

## Bundle Size Analysis

### @evodb/core Entry Points

Use focused imports to minimize bundle size:

```typescript
// Focused imports - only import what you need (~8KB each)
import { encode, decode } from '@evodb/core/encoding';
import { shred, unshred } from '@evodb/core/shredding';
import { evaluateFilters, sortRows } from '@evodb/core/query';
import { Type, BlockId } from '@evodb/core/types';
import { EvoDBError, QueryError } from '@evodb/core/errors';
import { KB, MB, GB } from '@evodb/core/constants';

// Barrel export - includes everything (~460KB)
import { encode, decode } from '@evodb/core';
```

### Available Entry Points

| Entry Point | Description | Approximate Size |
|-------------|-------------|------------------|
| `@evodb/core/types` | Type definitions, enums | ~2KB |
| `@evodb/core/encoding` | Encode/decode operations | ~8KB |
| `@evodb/core/shredding` | JSON shredding | ~8KB |
| `@evodb/core/query` | Filter, sort, aggregate | ~10KB |
| `@evodb/core/storage` | Storage adapters | ~12KB |
| `@evodb/core/errors` | Error classes | ~2KB |
| `@evodb/core/constants` | Size constants | ~1KB |
| `@evodb/core/guards` | Type guards | ~2KB |
| `@evodb/core/snippet` | Snippets-optimized format | ~15KB |

### Tree-Shaking Configuration

Ensure your bundler is configured for optimal tree-shaking:

```javascript
// vite.config.js
export default {
  build: {
    rollupOptions: {
      treeshake: {
        moduleSideEffects: false,
      },
    },
  },
};
```

```javascript
// esbuild
{
  treeShaking: true,
  sideEffects: false,
}
```

## Query Optimization

### Use Compiled Filters for Repeated Queries

For queries executed multiple times (e.g., filtering each row), compile filters once:

```typescript
import { compileFilters, evaluateCompiledFilters } from '@evodb/core/query';

// Compile once before iterating
const filters = [
  { column: 'status', operator: 'eq', value: 'active' },
  { column: 'score', operator: 'gt', value: 90 },
];
const compiled = compileFilters(filters);

// Use in tight loop - avoids re-parsing paths and re-compiling regex
const results = rows.filter(row => evaluateCompiledFilters(row, compiled));
```

**Benefits:**
- Column names validated once at compile time
- Path strings pre-split for fast nested access
- LIKE patterns pre-compiled to RegExp

### Single-Pass Aggregation

EvoDB computes all aggregations in a single pass over the data:

```typescript
import { computeAggregations } from '@evodb/core/query';

// All 7 aggregates computed in ONE iteration over rows
const result = computeAggregations(rows, [
  { function: 'count', column: null, alias: 'total' },
  { function: 'sum', column: 'amount', alias: 'totalAmount' },
  { function: 'avg', column: 'amount', alias: 'avgAmount' },
  { function: 'min', column: 'amount', alias: 'minAmount' },
  { function: 'max', column: 'amount', alias: 'maxAmount' },
  { function: 'stddev', column: 'amount', alias: 'stddev' },
  { function: 'variance', column: 'amount', alias: 'variance' },
], ['category']);
```

### Zone Map and Bloom Filter Usage

Zone maps track min/max values per column in each block. Use them to skip irrelevant blocks:

```typescript
import { canSkipByZoneMap, BloomFilter } from '@evodb/core/snippet';

// Skip blocks where zone map excludes the filter
const zoneMap = { min: 100, max: 200, nullCount: 0 };
if (canSkipByZoneMap(zoneMap, { min: 250 })) {
  // Block can be skipped - no values >= 250
}

// Use bloom filter for point lookups
const bloom = new BloomFilter(10000);
if (!bloom.mightContain(searchValue)) {
  // Definitely not in block - skip
}
```

### Column Projection

Only decode columns you need:

```typescript
import { readSnippetChunk } from '@evodb/core/snippet';

// Read only 'id' and 'value' columns - skip decoding others
const { columns } = readSnippetChunk(chunk, {
  columns: ['id', 'value']
});
```

## Memory Tuning

### Environment Constraints

| Environment | Memory Limit | Recommended Config |
|-------------|--------------|-------------------|
| Cloudflare Workers | 128MB | Default settings |
| Cloudflare Snippets | 32MB | Use streaming, projection |
| Durable Objects | 128MB | Default settings |

### Cloudflare Snippets (32MB Limit)

For Snippets, follow these guidelines:

```typescript
// 1. Use column projection - only decode needed columns
const { columns } = readSnippetChunk(chunk, {
  columns: ['id', 'timestamp', 'value']
});

// 2. Use zone maps to skip irrelevant chunks
if (canSkipByZoneMap(chunkZoneMap, filterBounds)) {
  continue; // Skip this chunk entirely
}

// 3. Use streaming for large result sets
for await (const batch of streamResults(query)) {
  await processAndFlush(batch);
}

// 4. Prefer zero-copy decode for numeric types
const decoded = zeroCopyDecodeFloat64(bytes, count);
// No memory allocation - view into existing buffer
```

### Buffer Size Configuration

Configure buffer sizes based on your workload:

```typescript
import { createWriteBuffer } from '@evodb/writer';

const buffer = createWriteBuffer({
  // Flush at 10MB or 10K rows, whichever first
  maxBytes: 10_000_000,
  maxRows: 10_000,

  // Time-based flush for low-volume tables
  flushIntervalMs: 5000,
});
```

## Benchmarks

### Encoding Performance

| Operation | 10K Rows | 100K Rows | Notes |
|-----------|----------|-----------|-------|
| Shred (JSON -> columns) | <100ms | <3s | 100K+ docs/s throughput |
| Unshred (columns -> JSON) | <100ms | <1s | Faster than shred |
| Encode columns | <200ms | <1s | Dictionary/delta encoding |
| Decode columns | <200ms | <1s | Zero-copy for numerics |

### Query Performance

| Operation | Dataset | Time | Notes |
|-----------|---------|------|-------|
| Filter 100K rows | 100K | <50ms | With compiled filters |
| Sort 10K rows | 10K | <50ms | Multi-column, null handling |
| Aggregate 7 functions | 100K | <100ms | Single-pass over data |
| Path extraction | 10K | <10ms | With path index |

### Compression Ratios

| Data Type | Encoding | Typical Ratio |
|-----------|----------|---------------|
| Sequential integers | Delta + BitPack | 10-100x |
| Low-cardinality strings | Dictionary | 5-20x |
| Timestamps | Delta | 8-16x |
| Random floats | Raw | 1x (no compression) |
| Booleans | Bitmap | 8x |

### Zero-Copy Decode Throughput

| Operation | Data Size | Time | Throughput |
|-----------|-----------|------|------------|
| Raw Int32 | 4MB | <0.01ms | 400+ GB/s |
| Raw Float64 | 8MB | <0.01ms | 400+ GB/s |
| Delta+BitPack | 1M integers | <50ms | 80+ MB/s |
| Dictionary String | 100K values | <30ms | 30+ MB/s |

## Profiling Tools

### Measuring Performance

Use the built-in benchmark utilities:

```typescript
import { describe, it, expect } from 'vitest';

function formatTime(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(2)}us`;
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

it('should benchmark my operation', () => {
  const start = performance.now();
  // Your operation here
  myOperation();
  const elapsed = performance.now() - start;

  console.log(`Operation time: ${formatTime(elapsed)}`);
  expect(elapsed).toBeLessThan(100); // 100ms budget
});
```

### Memory Profiling

```typescript
function getMemory(): number {
  if (typeof process !== 'undefined' && process.memoryUsage) {
    return process.memoryUsage().heapUsed;
  }
  return 0;
}

const before = getMemory();
const result = expensiveOperation();
const after = getMemory();

console.log(`Memory used: ${((after - before) / 1024 / 1024).toFixed(2)}MB`);
```

### Common Bottlenecks

| Symptom | Likely Cause | Solution |
|---------|--------------|----------|
| Slow repeated queries | Re-parsing filters | Use `compileFilters()` |
| High memory on filter | Large result sets | Use streaming/pagination |
| Slow string sorting | Unicode localeCompare | Data is ASCII (fast path used) |
| Slow nested access | Linear column search | Use path index |
| High memory on decode | Eager unpacking | Use lazy bitmap access |

## Optimization Checklist

### Before Deployment

- [ ] Use focused entry points instead of barrel imports
- [ ] Enable tree-shaking in bundler
- [ ] Remove source maps from production
- [ ] Set appropriate buffer sizes for workload

### For Queries

- [ ] Compile filters for repeated use
- [ ] Use column projection to minimize I/O
- [ ] Enable zone map pruning for range queries
- [ ] Use bloom filters for point lookups

### For Memory

- [ ] Check target environment limits (Workers: 128MB, Snippets: 32MB)
- [ ] Use streaming for large result sets
- [ ] Prefer zero-copy decode for numeric columns
- [ ] Use lazy bitmap unpacking for sparse access

### For Cloudflare Snippets

- [ ] Stay under 5ms CPU budget
- [ ] Stay under 32MB memory
- [ ] Limit to 5 subrequests
- [ ] Use scatter-gather patterns from @evodb/snippets-chain
- [ ] Pre-compute and cache expensive operations

## Related Resources

- [Architecture Guide](../ARCHITECTURE.md) - System design and data flow
- [Getting Started](./GETTING_STARTED.md) - Quick start guide
- [@evodb/benchmark](../benchmark/README.md) - Benchmarking tools
- [Core README](../core/README.md) - Core package documentation
