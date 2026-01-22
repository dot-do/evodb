# EvoDB Vector Search Example

This example demonstrates vector similarity search using EvoDB's Lance format reader. It shows how to build AI/ML applications with semantic search, embeddings, and RAG patterns.

## Overview

Vector search enables finding similar items based on their semantic meaning rather than exact keyword matches. This is powered by:

- **Embeddings**: Dense vector representations of text, images, or other data
- **Vector Indices**: Efficient data structures for approximate nearest neighbor search
- **Lance Format**: Modern columnar format optimized for ML workloads

## Features Demonstrated

1. **Basic Vector Search**: k-NN similarity search
2. **IVF-PQ Index**: Scalable search for large datasets
3. **HNSW Index**: High-recall approximate search
4. **R2 Integration**: Production-ready storage
5. **AI Embeddings**: Generate embeddings with Cloudflare AI
6. **RAG Pattern**: Retrieval Augmented Generation

## Project Structure

```
vector-search/
├── src/
│   └── index.ts    # Vector search examples
├── package.json    # Dependencies and scripts
├── tsconfig.json   # TypeScript configuration
├── wrangler.toml   # Cloudflare Workers configuration
└── README.md       # This file
```

## Setup

1. Install dependencies:

```bash
cd examples/vector-search
pnpm install
```

2. Run locally:

```bash
pnpm dev
```

3. Visit http://localhost:8787 to run the examples

## Code Examples

### Basic Vector Search

```typescript
import {
  LanceReader,
  R2StorageAdapter,
  computeCosineSimilarity,
} from '@evodb/lance-reader';

// Connect to Lance dataset in R2
const reader = new LanceReader({
  storage: new R2StorageAdapter(env.EMBEDDINGS_BUCKET),
  basePath: 'datasets/documents',
});

await reader.open();

// Search for similar vectors
const results = await reader.search('embedding', queryVector, {
  k: 10,        // Return top 10 results
  nprobes: 20,  // Search 20 IVF clusters
});

for (const result of results) {
  console.log(`Distance: ${result.distance}, Row: ${result.rowId}`);
}
```

### Generate Embeddings with Cloudflare AI

```typescript
// Generate embeddings for text
const response = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
  text: ['Hello, world!', 'How are you?'],
});

// response.data contains the embedding vectors
const embeddings = response.data;
console.log(`Dimension: ${embeddings[0].length}`); // 768
```

### RAG (Retrieval Augmented Generation)

```typescript
async function answerQuestion(question: string, env: Env) {
  // 1. Generate query embedding
  const queryEmb = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
    text: [question],
  });

  // 2. Search for relevant documents
  const results = await reader.search('embedding', queryEmb.data[0], {
    k: 3,
  });

  // 3. Fetch document content
  const docs = await fetchDocumentsByIds(results.map(r => r.rowId));
  const context = docs.map(d => d.content).join('\n\n');

  // 4. Generate answer with context
  const answer = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
    messages: [
      {
        role: 'system',
        content: 'Answer based on the provided context only.',
      },
      {
        role: 'user',
        content: `Context:\n${context}\n\nQuestion: ${question}`,
      },
    ],
  });

  return answer;
}
```

## Vector Index Types

### IVF-PQ (Inverted File with Product Quantization)

Best for: Large datasets (millions of vectors), memory-constrained environments

```typescript
// IVF-PQ parameters
const options = {
  k: 10,         // Number of results
  nprobes: 20,   // Clusters to search (tradeoff: speed vs recall)
};
```

### HNSW (Hierarchical Navigable Small World)

Best for: High-recall requirements, moderate dataset sizes

```typescript
// HNSW parameters in Lance index
// M = 16          - Connections per node
// efSearch = 50   - Search depth (higher = better recall)
```

## Distance Metrics

```typescript
import {
  computeL2Distance,
  computeCosineSimilarity,
  computeDotProduct,
} from '@evodb/lance-reader';

// L2 (Euclidean) distance - good for normalized vectors
const l2 = computeL2Distance(v1, v2);

// Cosine similarity - good for text embeddings
const cosine = computeCosineSimilarity(v1, v2);

// Dot product - fastest, requires normalized vectors
const dot = computeDotProduct(v1, v2);
```

## Building Lance Datasets

To create a Lance dataset for production:

```python
# Using Python lancedb
import lancedb
import numpy as np

# Connect to database
db = lancedb.connect("./my_dataset")

# Create table with embeddings
data = [
    {"id": 1, "text": "Hello", "embedding": np.random.rand(768)},
    {"id": 2, "text": "World", "embedding": np.random.rand(768)},
]

table = db.create_table("documents", data)

# Create vector index
table.create_index(
    num_partitions=256,     # IVF clusters
    num_sub_vectors=96,     # PQ subvectors
)
```

Then upload to R2:

```bash
# Upload Lance dataset to R2
wrangler r2 object put embeddings/datasets/documents/ --file ./my_dataset
```

## Production Setup

1. **Create R2 bucket**:

```bash
wrangler r2 bucket create evodb-embeddings
```

2. **Update wrangler.toml**:

```toml
[[r2_buckets]]
binding = "EMBEDDINGS_BUCKET"
bucket_name = "evodb-embeddings"

[ai]
binding = "AI"
```

3. **Upload Lance dataset** to the bucket

4. **Deploy**:

```bash
pnpm deploy
```

## Use Cases

### Semantic Search

Find documents by meaning rather than keywords:

```typescript
// User searches: "how to cook pasta"
// Also finds: "Italian noodle recipes", "making spaghetti at home"
```

### Image Similarity

Find visually similar images:

```typescript
// Upload image -> CLIP embedding -> Vector search -> Similar images
```

### Recommendations

"Users who liked X also liked":

```typescript
// Item embedding -> Find similar items -> Recommend
```

### Question Answering (RAG)

Ground LLM responses in your data:

```typescript
// Question -> Search docs -> Add to context -> LLM generates answer
```

## Performance Tips

1. **Batch embedding generation** - Process multiple texts at once
2. **Tune nprobes** - Balance speed vs recall
3. **Use appropriate index** - IVF-PQ for scale, HNSW for recall
4. **Cache frequent queries** - Use Cloudflare Cache API
5. **Pre-filter when possible** - Reduce search space with metadata filters

## Learn More

- [EvoDB Documentation](https://github.com/dot-do/evodb)
- [@evodb/lance-reader Package](../../lance-reader/README.md)
- [Lance Format](https://lancedb.github.io/lance/)
- [Cloudflare AI](https://developers.cloudflare.com/workers-ai/)
- [Vector Search Fundamentals](https://www.pinecone.io/learn/vector-search/)
