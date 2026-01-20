# @evodb/edge-cache

**Global Edge, Zero Egress**

Advanced edge caching with cdn.workers.do. Cache up to 5GB files at the edge, prefetch hot data proactively, and never pay egress fees.

## The Economics

```
                    Traditional CDN              EvoDB + cdn.workers.do
                    ───────────────              ────────────────────────
Origin reads:       Every cache miss             Only first read
Egress fees:        $0.09/GB                     $0.00 (R2 to CDN is free)
Cache size:         Limited                      Up to 5GB per file
```

**R2 has zero egress.** When you cache R2 data at the edge, you pay for the read once. Every subsequent request is free.

## Installation

```bash
npm install @evodb/edge-cache
```

## Quick Start

```typescript
import { prefetchDataset, checkCacheStatus, createCacheAwarePlanner } from '@evodb/edge-cache';

// Prefetch hot partitions to edge
await prefetchDataset('events', {
  partitions: ['2024-01', '2024-02'],
  priority: 80,
});

// Check what's cached
const status = await checkCacheStatus('events', '2024-01');
console.log(`Cached: ${status.cached}`);
console.log(`TTL remaining: ${status.ttlRemaining}s`);

// Plan queries to use cache
const planner = createCacheAwarePlanner({
  cdnBaseUrl: 'https://cdn.workers.do',
});

const plan = await planner.plan(query);
console.log(`Cached partitions: ${plan.cachedPartitions.length}`);
console.log(`Origin partitions: ${plan.originPartitions.length}`);
```

## Prefetching

Warm the cache before queries arrive:

```typescript
import { createPrefetcher } from '@evodb/edge-cache';

const prefetcher = createPrefetcher({
  cdnBaseUrl: 'https://cdn.workers.do',
  maxConcurrent: 5,
});

// Prefetch with progress tracking
await prefetcher.prefetch(['users/2024-01', 'users/2024-02'], {
  ttl: 86400,  // 24 hours
  priority: 80,
  onProgress: (p) => {
    console.log(`${p.completed}/${p.total} partitions cached`);
    console.log(`${p.bytesTransferred} bytes transferred`);
  },
});
```

### Background Prefetching

Let the system prefetch automatically based on access patterns:

```typescript
const planner = createCacheAwarePlanner({
  enableBackgroundPrefetch: true,
  hotnessThreshold: 0.7,  // Prefetch if >70% of recent queries hit this partition
});

// After each query, the planner queues related partitions
const plan = await planner.plan(query);
// plan.prefetchQueue = ['users/2024-03', 'users/2024-04']
```

## Cache-Aware Query Planning

Route queries to cached data when possible:

```typescript
const planner = createCacheAwarePlanner({
  cdnBaseUrl: 'https://cdn.workers.do',
  hotnessThreshold: 0.7,
});

const plan = await planner.plan({
  table: 'events',
  partitions: ['2024-01', '2024-02', '2024-03'],
});

// {
//   cachedPartitions: ['2024-01', '2024-02'],   // Read from edge
//   originPartitions: ['2024-03'],              // Read from R2
//   estimatedCost: 0.15,                        // Lower is better
//   fullyCached: false
// }

// Execute with cache-aware routing
if (plan.fullyCached) {
  // All from edge - fastest path
  return await queryFromEdge(plan.cachedPartitions);
} else {
  // Mix of edge and origin
  const [edgeResults, originResults] = await Promise.all([
    queryFromEdge(plan.cachedPartitions),
    queryFromOrigin(plan.originPartitions),
  ]);
  return merge(edgeResults, originResults);
}
```

## Partition Modes

Support for large files:

| Mode | Max File Size | Use Case |
|------|---------------|----------|
| `standard` | 500MB | Most analytics workloads |
| `enterprise` | 5GB | Large-scale ML/AI datasets |

```typescript
import { getRequiredMode, isWithinSizeLimit } from '@evodb/edge-cache';

// Check which mode is needed
const mode = getRequiredMode(fileSizeBytes);
// 'standard' | 'enterprise' | null (if too large)

// Validate size
if (!isWithinSizeLimit(fileSizeBytes, 'standard')) {
  // Need enterprise mode
}
```

## Cache Headers

Generate proper cache headers for responses:

```typescript
import { getCacheHeaders, parseCacheTag } from '@evodb/edge-cache';

// Generate headers for cached response
const headers = getCacheHeaders('users', '2024-01', 86400);
// {
//   'Cache-Control': 'public, max-age=86400',
//   'CF-Cache-Tag': 'evodb:users:2024-01'
// }

// Parse cache tag for invalidation
const tag = parseCacheTag('evodb:users:2024-01');
// { namespace: 'evodb', table: 'users', partition: '2024-01' }
```

## Cache Invalidation

Granular invalidation by tag:

```typescript
import { invalidatePartition, invalidateTable } from '@evodb/edge-cache';

// Invalidate single partition
await invalidatePartition('users', '2024-01');

// Invalidate entire table
await invalidateTable('users');
```

## API Reference

### Prefetch Operations

```typescript
prefetchDataset(table, options)   // Prefetch partitions
warmPartition(table, partition)   // Warm single partition
checkCacheStatus(table, partition)// Check if cached
invalidatePartition(table, partition) // Invalidate partition
invalidateTable(table)            // Invalidate table
```

### Cache-Aware Planner

```typescript
createCacheAwarePlanner(config)   // Create planner
planner.plan(query)               // Get cache-aware plan
```

### Types

```typescript
interface CacheStatus {
  cached: boolean;
  cachedAt?: Date;
  ttlRemaining?: number;
  sizeBytes?: number;
  hitCount?: number;
  edgeLocation?: string;
}

interface CacheAwareQueryPlan {
  cachedPartitions: string[];
  originPartitions: string[];
  prefetchQueue: string[];
  estimatedCost: number;
  fullyCached: boolean;
}
```

## Performance

| Scenario | Origin Only | With Edge Cache |
|----------|-------------|-----------------|
| Cold query | 200ms | 200ms (same) |
| Warm query | 200ms | <10ms (20x faster) |
| Cost per query | R2 read | FREE after first |

The key is hit ratio. Prefetch intelligently, cache aggressively.

## Related Packages

- [@evodb/reader](../reader) - Basic query with Cache API
- [@evodb/lakehouse](../lakehouse) - Manifest management
- [@evodb/writer](../writer) - Write path

## License

MIT - Copyright 2026 .do
