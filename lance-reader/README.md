# @evodb/lance-reader

**Vector Search Without Dependencies**

A pure TypeScript Lance format reader. Zero native dependencies, ~50KB bundle, runs anywhere JavaScript runs - including Cloudflare Workers.

## Why Lance?

Lance is the vector format that powers LanceDB. It's designed for:
- **Fast vector search** - IVF-PQ and HNSW indices
- **Efficient storage** - Columnar format with compression
- **Versioning** - Git-like dataset versioning

EvoDB brings Lance to the edge with a pure TypeScript implementation.

## Installation

```bash
npm install @evodb/lance-reader
```

## Quick Start

```typescript
import { LanceReader, R2StorageAdapter } from '@evodb/lance-reader';

// Open a Lance dataset from R2
const reader = new LanceReader({
  storage: new R2StorageAdapter(env.MY_BUCKET),
  basePath: 'embeddings/products',
});

await reader.open();

// Vector search
const queryVector = await getEmbedding('red running shoes');
const results = await reader.search('embedding', queryVector, {
  k: 10,          // Top 10 results
  nprobes: 20,    // Search 20 partitions
});

for (const result of results) {
  console.log(`Product ${result.rowId}: similarity=${result.score}`);
}
```

## Vector Indices

### IVF-PQ (Recommended for Large Datasets)

Inverted File with Product Quantization. Fast approximate search with memory efficiency.

```typescript
import { IvfPqIndex } from '@evodb/lance-reader';

const index = new IvfPqIndex({
  numPartitions: 256,    // Number of centroids
  numSubVectors: 48,     // PQ compression level
  distanceType: 'l2',
});

await index.load(storage, 'embeddings/products/_indices/vector_idx');

const results = await index.search(queryVector, {
  k: 10,
  nprobes: 20,  // More probes = more accurate, slower
});
```

### HNSW (Best Accuracy)

Hierarchical Navigable Small World. Highest accuracy, more memory.

```typescript
import { HnswIndex } from '@evodb/lance-reader';

const index = new HnswIndex({
  m: 16,              // Connections per node
  efConstruction: 200, // Build-time quality
  distanceType: 'cosine',
});

await index.load(storage, 'embeddings/products/_indices/hnsw_idx');

const results = await index.search(queryVector, {
  k: 10,
  ef: 100,  // Search-time quality (higher = more accurate)
});
```

## Storage Adapters

### R2 Storage

```typescript
import { R2StorageAdapter } from '@evodb/lance-reader';

const storage = new R2StorageAdapter(env.MY_BUCKET);
```

### HTTP Fetch

For datasets served via CDN:

```typescript
import { FetchStorageAdapter } from '@evodb/lance-reader';

const storage = new FetchStorageAdapter('https://cdn.example.com/datasets');
```

### Memory (Testing)

```typescript
import { MemoryStorageAdapter } from '@evodb/lance-reader';

const storage = new MemoryStorageAdapter();
storage.set('manifest.lance', manifestBuffer);
storage.set('data/part-0.lance', dataBuffer);
```

### Caching Wrapper

Cache frequently accessed files:

```typescript
import { CachingStorageAdapter } from '@evodb/lance-reader';

const cached = new CachingStorageAdapter(r2Storage, {
  maxSize: 100_000_000,  // 100MB cache
  ttl: 3600,             // 1 hour
});
```

## Distance Functions

```typescript
import {
  computeL2Distance,
  computeCosineSimilarity,
  computeDotProduct,
  normalizeVector,
} from '@evodb/lance-reader';

// L2 (Euclidean) - good for raw embeddings
const l2 = computeL2Distance(vec1, vec2);

// Cosine - good for normalized embeddings
const cosine = computeCosineSimilarity(vec1, vec2);

// Dot product - good for recommendation scores
const dot = computeDotProduct(vec1, vec2);

// Normalize to unit length (required for cosine)
const normalized = normalizeVector(vec);
```

## Filtering

Pre-filter rows before vector search:

```typescript
const results = await reader.search('embedding', queryVector, {
  k: 10,
  filter: {
    column: 'category',
    operator: 'eq',
    value: 'shoes'
  }
});

// Only searches products in 'shoes' category
```

## Reading Data

Beyond vector search, read any column:

```typescript
// Get schema
const schema = await reader.getSchema();
// [
//   { name: 'id', type: 'int64' },
//   { name: 'name', type: 'string' },
//   { name: 'embedding', type: 'fixed_size_list<float32, 768>' }
// ]

// Read specific columns
const rows = await reader.read({
  columns: ['id', 'name'],
  filter: { column: 'id', operator: 'in', values: [1, 2, 3] }
});
```

## API Reference

### LanceReader

```typescript
const reader = new LanceReader(config);

await reader.open()               // Load manifest
await reader.search(col, vec, opts) // Vector search
await reader.read(opts)           // Read rows
await reader.getSchema()          // Get schema
await reader.getRowCount()        // Total rows
await reader.close()              // Clean up
```

### Search Options

```typescript
interface VectorSearchOptions {
  k?: number;           // Results to return (default: 10)
  nprobes?: number;     // Partitions to search (default: 20)
  refineK?: number;     // Candidates for re-ranking
  filter?: RowFilter;   // Pre-filter
  distanceType?: 'l2' | 'cosine' | 'dot';
}
```

### Search Result

```typescript
interface SearchResult {
  rowId: bigint;        // Row identifier
  distance: number;     // Raw distance value
  score: number;        // Normalized similarity score
}
```

## Performance

Optimized for edge constraints:

| Dataset Size | Search Time | Memory Usage |
|--------------|-------------|--------------|
| 10K vectors | <1ms | ~1MB |
| 100K vectors | ~2ms | ~2MB |
| 1M vectors | ~10ms | ~10MB |
| 10M vectors | ~50ms | ~50MB |

IVF-PQ index with 256 partitions, 48 sub-vectors, k=10, nprobes=20.

## Bundle Size

```
@evodb/lance-reader: ~50KB (minified + gzipped)

Dependencies: 0
Native modules: 0
```

Runs anywhere: Workers, Deno, Node, browsers.

## Related Packages

- [@evodb/snippets-lance](../snippets-lance) - Optimized for Snippets (5ms CPU, 32MB RAM)
- [@evodb/core](../core) - Columnar encoding
- [@evodb/edge-cache](../edge-cache) - Edge caching

## License

MIT - Copyright 2026 .do
