# Vector Search Guide

## Lance Format
EvoDB uses Lance format for efficient vector storage and search.

## Index Types
- **IVF-PQ**: Inverted file with product quantization
- **HNSW**: Hierarchical navigable small world

## Building Indexes
```typescript
import { buildIvfPqIndex } from '@evodb/lance-reader';

const index = await buildIvfPqIndex(vectors, {
  numPartitions: 256,
  numSubvectors: 8
});
```

## Query Patterns
```typescript
const results = await reader.search(queryEmbedding, {
  k: 10,
  filter: { category: 'tech' }
});
```

## RAG Integration
```typescript
// 1. Generate embedding
const embedding = await ai.embed(query);

// 2. Search similar documents
const docs = await reader.search(embedding, { k: 5 });

// 3. Generate response with context
const response = await ai.generate(query, docs);
```

## Best Practices
- Normalize embeddings
- Choose appropriate index for data size
- Use metadata filters to narrow search
