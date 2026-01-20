# @evodb/edge-cache

Edge caching integration for EvoDB with cdn.workers.do.

## Installation

```bash
npm install @evodb/edge-cache
```

## Overview

This package provides advanced edge caching capabilities:

- **cdn.workers.do Integration**: Global edge cache with up to 5GB files
- **Partition Modes**: Standard (500MB) and Enterprise (5GB)
- **Prefetch API**: Warm caches before queries
- **Cache-Aware Planning**: Optimize query plans based on cache state
- **Cache Tags**: Granular invalidation by table/partition

## Quick Start

```typescript
import {
  prefetchDataset,
  checkCacheStatus,
  createCacheAwarePlanner,
} from '@evodb/edge-cache';

// Prefetch hot partitions
await prefetchDataset('com/example/users', {
  partitions: ['2024-01', '2024-02'],
  mode: 'standard',
  priority: 80,
});

// Check cache status
const status = await checkCacheStatus('com/example/users', '2024-01');
console.log(`Cached: ${status.cached}, TTL: ${status.ttlRemaining}s`);

// Create cache-aware query planner
const planner = createCacheAwarePlanner({
  cdnBaseUrl: 'https://cdn.workers.do',
  hotnessThreshold: 0.7,
});

const plan = await planner.plan(query);
console.log(`Cached: ${plan.cachedPartitions.length}`);
console.log(`Origin: ${plan.originPartitions.length}`);
```

## API Reference

### Prefetch Operations

```typescript
prefetchDataset(table, options)     // Prefetch partitions to edge
warmPartition(table, partition)     // Warm single partition
checkCacheStatus(table, partition)  // Check if cached
invalidatePartition(table, partition) // Invalidate cached partition
invalidateTable(table)              // Invalidate all partitions
```

### Prefetcher Class

```typescript
const prefetcher = createPrefetcher(config);

await prefetcher.prefetch(partitions, {
  priority: 80,
  ttl: 86400,
  onProgress: (progress) => {
    console.log(`${progress.completed}/${progress.total}`);
  },
});
```

### Cache-Aware Planner

```typescript
const planner = createCacheAwarePlanner(options);

const plan = await planner.plan(query);
// plan.cachedPartitions - read from edge cache
// plan.originPartitions - read from R2 origin
// plan.prefetchQueue - queue for background prefetch
// plan.estimatedCost - cost score (lower is better)
// plan.fullyCached - true if entire query is cached
```

### Cache Headers

```typescript
// Generate cache headers for responses
const headers = getCacheHeaders('users', '2024-01', 86400);
// {
//   'Cache-Control': 'public, max-age=86400',
//   'CF-Cache-Tag': 'evodb:users:2024-01'
// }

// Parse cache tag
const tag = parseCacheTag('evodb:users:2024-01');
// { namespace: 'evodb', table: 'users', partition: '2024-01' }
```

### Configuration

```typescript
interface EdgeCacheConfig {
  cdnBaseUrl: string;              // Default: 'https://cdn.workers.do'
  defaultMode: PartitionMode;       // 'standard' | 'enterprise'
  defaultTtl: number;               // Default: 86400 (24h)
  maxConcurrentPrefetch: number;    // Default: 5
  enableBackgroundPrefetch: boolean;// Default: true
  hotnessThreshold: number;         // Default: 0.7
}
```

### Partition Modes

```typescript
type PartitionMode = 'standard' | 'enterprise';

const MAX_FILE_SIZE = {
  standard: 500 * 1024 * 1024,   // 500MB
  enterprise: 5 * 1024 * 1024 * 1024, // 5GB
};

// Check size limits
isWithinSizeLimit(sizeBytes, 'standard')
getRequiredMode(sizeBytes) // Returns required mode or null
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

interface PrefetchProgress {
  total: number;
  completed: number;
  failed: number;
  currentPartition?: string;
  bytesTransferred: number;
  totalBytes: number;
}

interface CacheAwareQueryPlan {
  cachedPartitions: string[];
  originPartitions: string[];
  prefetchQueue: string[];
  estimatedCost: number;
  fullyCached: boolean;
}
```

## Related Packages

- `@evodb/reader` - Query engine with basic Cache API
- `@evodb/lakehouse` - Manifest management
- `@evodb/writer` - Write path to R2

## License

MIT
