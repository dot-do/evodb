# Vector Search for RAG

Build AI-powered semantic search using EvoDB's vector capabilities. Learn how to store embeddings, build vector indices, search for similar documents, and generate context-aware responses using RAG (Retrieval Augmented Generation).

## Prerequisites

- Completed [Building a TODO App](./02-todo-app.md)
- Node.js 18.0.0 or higher
- Cloudflare account (for AI bindings)
- Basic understanding of embeddings and LLMs

## What We're Building

A knowledge base with semantic search:

1. Store documents with vector embeddings
2. Search for semantically similar content
3. Use retrieved context to generate accurate answers
4. Build a Q&A chatbot powered by your own data

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     RAG Pipeline                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. User Query        2. Generate          3. Vector Search     │
│  ┌──────────┐         Embedding            ┌──────────────┐     │
│  │ "How do  │  ──────>  [0.12,   ────────> │ Find top-k   │     │
│  │ I use    │           -0.34,             │ similar docs │     │
│  │ EvoDB?"  │            0.56,             └──────┬───────┘     │
│  └──────────┘            ...]                     │             │
│                                                   ▼             │
│  6. Response          5. LLM                4. Retrieved        │
│  ┌──────────┐         Generation            Context             │
│  │ "EvoDB   │  <──────  ┌──────┐  <──────  ┌──────────────┐    │
│  │ is a     │           │ LLM  │           │ Doc 1: ...   │    │
│  │ schema-  │           └──────┘           │ Doc 2: ...   │    │
│  │ evolving │                              │ Doc 3: ...   │    │
│  │ DB..."   │                              └──────────────┘    │
│  └──────────┘                                                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Step 1: Project Setup

Create a new Cloudflare Workers project:

```bash
mkdir evodb-rag
cd evodb-rag
npm create cloudflare@latest -- --template hello-world-ts
npm install @evodb/core @evodb/lance-reader
```

Update `wrangler.toml`:

```toml
name = "evodb-rag"
main = "src/index.ts"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

# R2 bucket for storing Lance vector index
[[r2_buckets]]
binding = "VECTORS_BUCKET"
bucket_name = "evodb-vectors"

# AI binding for embeddings and generation
[ai]
binding = "AI"
```

Create the R2 bucket:

```bash
npx wrangler r2 bucket create evodb-vectors
```

## Step 2: Define Types

Create `src/types.ts`:

```typescript
/**
 * Document with embedding
 */
export interface Document {
  _id: string;
  title: string;
  content: string;
  embedding: number[];
  metadata?: {
    source?: string;
    category?: string;
    createdAt?: string;
  };
}

/**
 * Search result with relevance score
 */
export interface SearchResult {
  document: Document;
  score: number;      // Cosine similarity (0-1)
  distance: number;   // L2 distance
}

/**
 * RAG response
 */
export interface RAGResponse {
  answer: string;
  sources: Array<{
    title: string;
    score: number;
  }>;
}
```

## Step 3: Create the Embedding Service

Create `src/embeddings.ts`:

```typescript
export interface Env {
  AI: {
    run(model: string, input: unknown): Promise<unknown>;
  };
}

/**
 * Embedding service using Cloudflare AI
 *
 * Uses bge-base-en-v1.5 model which produces 768-dimensional embeddings
 * optimized for semantic search.
 */
export class EmbeddingService {
  private ai: Env['AI'];
  private model = '@cf/baai/bge-base-en-v1.5';

  constructor(ai: Env['AI']) {
    this.ai = ai;
  }

  /**
   * Generate embedding for a single text
   */
  async embed(text: string): Promise<number[]> {
    const result = await this.ai.run(this.model, {
      text: [text],
    }) as { data: number[][] };

    return result.data[0];
  }

  /**
   * Generate embeddings for multiple texts (batch)
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const result = await this.ai.run(this.model, {
      text: texts,
    }) as { data: number[][] };

    return result.data;
  }

  /**
   * Get embedding dimension (useful for index configuration)
   */
  getDimension(): number {
    return 768; // bge-base-en-v1.5 dimension
  }
}
```

## Step 4: Create the Vector Store

Create `src/vector-store.ts`:

```typescript
import { EvoDB } from '@evodb/core';
import {
  LanceReader,
  R2StorageAdapter,
  computeCosineSimilarity,
  computeL2Distance,
  normalizeVector,
} from '@evodb/lance-reader';
import type { Document, SearchResult } from './types.js';
import type { EmbeddingService } from './embeddings.js';

/**
 * Vector store for semantic search
 *
 * Stores documents with embeddings and provides similarity search.
 * Uses in-memory index for development and Lance/R2 for production.
 */
export class VectorStore {
  private db: EvoDB;
  private embeddings: EmbeddingService;
  private documents: Document[] = [];
  private r2?: R2Bucket;

  constructor(embeddings: EmbeddingService, r2?: R2Bucket) {
    this.db = new EvoDB({ mode: 'development' });
    this.embeddings = embeddings;
    this.r2 = r2;
  }

  /**
   * Add a document to the vector store
   */
  async addDocument(title: string, content: string, metadata?: Document['metadata']): Promise<Document> {
    // Generate embedding for the content
    const embedding = await this.embeddings.embed(content);

    // Create document
    const doc: Document = {
      _id: crypto.randomUUID(),
      title,
      content,
      embedding: normalizeVector(embedding),
      metadata: {
        ...metadata,
        createdAt: new Date().toISOString(),
      },
    };

    // Store in database
    await this.db.insert('documents', doc);
    this.documents.push(doc);

    return doc;
  }

  /**
   * Add multiple documents in batch
   */
  async addDocuments(docs: Array<{ title: string; content: string; metadata?: Document['metadata'] }>): Promise<Document[]> {
    // Generate embeddings in batch
    const contents = docs.map(d => d.content);
    const embeddings = await this.embeddings.embedBatch(contents);

    // Create documents
    const documents: Document[] = docs.map((doc, i) => ({
      _id: crypto.randomUUID(),
      title: doc.title,
      content: doc.content,
      embedding: normalizeVector(embeddings[i]),
      metadata: {
        ...doc.metadata,
        createdAt: new Date().toISOString(),
      },
    }));

    // Store in database
    await this.db.insert('documents', documents);
    this.documents.push(...documents);

    return documents;
  }

  /**
   * Search for similar documents
   *
   * @param query - Search query text
   * @param k - Number of results to return
   * @param threshold - Minimum similarity score (0-1)
   */
  async search(query: string, k: number = 5, threshold: number = 0.5): Promise<SearchResult[]> {
    // Generate query embedding
    const queryEmbedding = await this.embeddings.embed(query);
    const normalizedQuery = normalizeVector(queryEmbedding);

    // Load documents if not in memory
    if (this.documents.length === 0) {
      this.documents = await this.db.query<Document>('documents');
    }

    // Calculate similarity for all documents
    const results: SearchResult[] = this.documents.map(doc => ({
      document: doc,
      score: computeCosineSimilarity(normalizedQuery, doc.embedding),
      distance: computeL2Distance(normalizedQuery, doc.embedding),
    }));

    // Sort by similarity (descending) and filter by threshold
    return results
      .filter(r => r.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  /**
   * Search using pre-built Lance index (for large datasets)
   */
  async searchWithIndex(query: string, k: number = 5): Promise<SearchResult[]> {
    if (!this.r2) {
      throw new Error('R2 bucket required for index-based search');
    }

    // Generate query embedding
    const queryEmbedding = await this.embeddings.embed(query);

    // Create Lance reader
    const storage = new R2StorageAdapter(this.r2);
    const reader = new LanceReader({
      storage,
      basePath: 'vectors/documents',
    });

    try {
      await reader.open();

      // Search the index
      const results = await reader.search('embedding', queryEmbedding, {
        k,
        nprobes: 10, // Number of clusters to search
      });

      // Fetch full documents for results
      const searchResults: SearchResult[] = [];
      for (const result of results) {
        const doc = this.documents.find(d => d._id === result.rowId);
        if (doc) {
          searchResults.push({
            document: doc,
            score: 1 - result.distance, // Convert distance to similarity
            distance: result.distance,
          });
        }
      }

      return searchResults;
    } finally {
      await reader.close();
    }
  }

  /**
   * Get all documents
   */
  async getAllDocuments(): Promise<Document[]> {
    if (this.documents.length === 0) {
      this.documents = await this.db.query<Document>('documents');
    }
    return this.documents;
  }

  /**
   * Get document count
   */
  getDocumentCount(): number {
    return this.documents.length;
  }
}
```

## Step 5: Create the RAG Service

Create `src/rag.ts`:

```typescript
import type { SearchResult, RAGResponse } from './types.js';
import type { VectorStore } from './vector-store.js';

export interface Env {
  AI: {
    run(model: string, input: unknown): Promise<unknown>;
  };
}

/**
 * RAG (Retrieval Augmented Generation) service
 *
 * Combines vector search with LLM generation for accurate,
 * context-aware responses grounded in your documents.
 */
export class RAGService {
  private ai: Env['AI'];
  private vectorStore: VectorStore;
  private model = '@cf/meta/llama-3-8b-instruct';

  constructor(ai: Env['AI'], vectorStore: VectorStore) {
    this.ai = ai;
    this.vectorStore = vectorStore;
  }

  /**
   * Answer a question using RAG
   *
   * 1. Search for relevant documents
   * 2. Build context from retrieved documents
   * 3. Generate answer using LLM with context
   */
  async answer(question: string, options: {
    k?: number;
    threshold?: number;
    maxContextLength?: number;
  } = {}): Promise<RAGResponse> {
    const {
      k = 3,
      threshold = 0.5,
      maxContextLength = 4000,
    } = options;

    // Step 1: Retrieve relevant documents
    const results = await this.vectorStore.search(question, k, threshold);

    if (results.length === 0) {
      return {
        answer: "I couldn't find any relevant information to answer your question.",
        sources: [],
      };
    }

    // Step 2: Build context from retrieved documents
    const context = this.buildContext(results, maxContextLength);

    // Step 3: Generate answer with LLM
    const answer = await this.generate(question, context);

    return {
      answer,
      sources: results.map(r => ({
        title: r.document.title,
        score: r.score,
      })),
    };
  }

  /**
   * Build context string from search results
   */
  private buildContext(results: SearchResult[], maxLength: number): string {
    let context = '';
    let currentLength = 0;

    for (const result of results) {
      const docContext = `## ${result.document.title}\n\n${result.document.content}\n\n`;

      if (currentLength + docContext.length > maxLength) {
        // Truncate if needed
        const remaining = maxLength - currentLength;
        if (remaining > 100) {
          context += docContext.slice(0, remaining) + '...\n\n';
        }
        break;
      }

      context += docContext;
      currentLength += docContext.length;
    }

    return context;
  }

  /**
   * Generate answer using LLM
   */
  private async generate(question: string, context: string): Promise<string> {
    const systemPrompt = `You are a helpful assistant that answers questions based on the provided context.
Your answers should be:
- Accurate and grounded in the provided context
- Concise but complete
- If the context doesn't contain enough information, say so

Do not make up information that is not in the context.`;

    const userPrompt = `Context:
${context}

Question: ${question}

Please provide a helpful answer based on the context above.`;

    const response = await this.ai.run(this.model, {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 500,
    }) as { response: string };

    return response.response;
  }

  /**
   * Generate a streaming answer (for chat interfaces)
   */
  async *answerStream(question: string, options: {
    k?: number;
    threshold?: number;
  } = {}): AsyncGenerator<string> {
    const { k = 3, threshold = 0.5 } = options;

    // Retrieve documents
    const results = await this.vectorStore.search(question, k, threshold);

    if (results.length === 0) {
      yield "I couldn't find any relevant information to answer your question.";
      return;
    }

    // Build context
    const context = this.buildContext(results, 4000);

    // Stream generation (simplified - actual streaming depends on AI binding support)
    const answer = await this.generate(question, context);

    // Simulate streaming by yielding chunks
    const words = answer.split(' ');
    for (const word of words) {
      yield word + ' ';
    }
  }
}
```

## Step 6: Create the Worker

Create `src/index.ts`:

```typescript
import { EmbeddingService } from './embeddings.js';
import { VectorStore } from './vector-store.js';
import { RAGService } from './rag.js';
import type { Document, RAGResponse } from './types.js';

export interface Env {
  AI: {
    run(model: string, input: unknown): Promise<unknown>;
  };
  VECTORS_BUCKET: R2Bucket;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Initialize services
    const embeddings = new EmbeddingService(env.AI);
    const vectorStore = new VectorStore(embeddings, env.VECTORS_BUCKET);
    const rag = new RAGService(env.AI, vectorStore);

    // Seed sample data on first request
    if (url.pathname === '/seed' && request.method === 'POST') {
      return handleSeed(vectorStore);
    }

    // Add document
    if (url.pathname === '/documents' && request.method === 'POST') {
      return handleAddDocument(request, vectorStore);
    }

    // Search documents
    if (url.pathname === '/search' && request.method === 'GET') {
      return handleSearch(url, vectorStore);
    }

    // RAG query
    if (url.pathname === '/ask' && request.method === 'POST') {
      return handleAsk(request, rag);
    }

    // UI
    if (url.pathname === '/') {
      return new Response(getUIHTML(), {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    return new Response('Not Found', { status: 404 });
  },
};

/**
 * Seed sample documents
 */
async function handleSeed(vectorStore: VectorStore): Promise<Response> {
  const sampleDocs = [
    {
      title: 'What is EvoDB?',
      content: `EvoDB is a schema-evolving database built for the edge. It automatically adapts its schema as you write data, making it perfect for rapid development and prototyping. EvoDB uses a columnar storage format for efficient queries and supports both development and production modes.`,
    },
    {
      title: 'Getting Started with EvoDB',
      content: `To get started with EvoDB, install the @evodb/core package using npm. Create a new database instance with EvoDB({ mode: 'development' }) for automatic schema evolution. Use db.insert() to add documents and db.query() to retrieve them. The query builder supports filters, sorting, and pagination.`,
    },
    {
      title: 'EvoDB Schema Evolution',
      content: `In development mode, EvoDB automatically evolves the schema when you insert documents with new fields. The schema is inferred from your data structure, including nested objects and arrays. In production mode, you can lock the schema for stability while still accepting new fields without indexing them.`,
    },
    {
      title: 'Vector Search in EvoDB',
      content: `EvoDB supports vector similarity search through the @evodb/lance-reader package. Store document embeddings alongside your data and search for semantically similar content. EvoDB uses IVF-PQ and HNSW indices for efficient approximate nearest neighbor search on large datasets.`,
    },
    {
      title: 'Deploying EvoDB to Cloudflare',
      content: `EvoDB is designed for Cloudflare Workers and uses R2 for persistent storage. Configure your wrangler.toml with an R2 bucket binding and set mode: 'production' for the EvoDB instance. EvoDB optimizes queries for the edge runtime with columnar storage and efficient caching.`,
    },
    {
      title: 'EvoDB Query Builder',
      content: `The EvoDB query builder provides a fluent API for constructing queries. Chain methods like where(), select(), orderBy(), limit(), and offset(). Supported operators include =, !=, >, <, >=, <=, in, not in, like, between, is null, and is not null. Execute queries with await or use executeWithMeta() for pagination info.`,
    },
  ];

  await vectorStore.addDocuments(sampleDocs);

  return Response.json({
    success: true,
    message: `Seeded ${sampleDocs.length} documents`,
  });
}

/**
 * Add a document
 */
async function handleAddDocument(request: Request, vectorStore: VectorStore): Promise<Response> {
  const body = await request.json() as { title: string; content: string };

  const doc = await vectorStore.addDocument(body.title, body.content);

  return Response.json({ success: true, document: { _id: doc._id, title: doc.title } });
}

/**
 * Search documents
 */
async function handleSearch(url: URL, vectorStore: VectorStore): Promise<Response> {
  const query = url.searchParams.get('q');
  const k = parseInt(url.searchParams.get('k') ?? '5');

  if (!query) {
    return Response.json({ error: 'Missing query parameter' }, { status: 400 });
  }

  const results = await vectorStore.search(query, k);

  return Response.json({
    results: results.map(r => ({
      title: r.document.title,
      content: r.document.content.slice(0, 200) + '...',
      score: r.score,
    })),
  });
}

/**
 * RAG query
 */
async function handleAsk(request: Request, rag: RAGService): Promise<Response> {
  const body = await request.json() as { question: string };

  if (!body.question) {
    return Response.json({ error: 'Missing question' }, { status: 400 });
  }

  const response = await rag.answer(body.question);

  return Response.json(response);
}

/**
 * Simple UI
 */
function getUIHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EvoDB RAG Demo</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; }
    h1 { margin-bottom: 1rem; }
    .section { margin-bottom: 2rem; }
    .section h2 { margin-bottom: 0.5rem; font-size: 1.25rem; }
    input, textarea { width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 0.5rem; margin-bottom: 0.5rem; }
    button { padding: 0.75rem 1.5rem; background: #2563eb; color: white; border: none; border-radius: 0.5rem; cursor: pointer; }
    button:hover { background: #1d4ed8; }
    button:disabled { background: #9ca3af; }
    .result { background: #f3f4f6; padding: 1rem; border-radius: 0.5rem; margin-top: 1rem; }
    .source { font-size: 0.875rem; color: #6b7280; margin-top: 0.5rem; }
    .sources { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #e5e7eb; }
    .sources h4 { font-size: 0.875rem; color: #6b7280; margin-bottom: 0.5rem; }
    .sources ul { list-style: none; }
    .sources li { font-size: 0.875rem; color: #374151; }
  </style>
</head>
<body>
  <h1>EvoDB RAG Demo</h1>

  <div class="section">
    <h2>1. Seed Sample Data</h2>
    <p style="color: #6b7280; margin-bottom: 0.5rem;">Add sample documents about EvoDB to the vector store.</p>
    <button id="seedBtn">Seed Documents</button>
    <div id="seedResult" class="result" style="display: none;"></div>
  </div>

  <div class="section">
    <h2>2. Search Documents</h2>
    <input type="text" id="searchQuery" placeholder="Enter search query..." />
    <button id="searchBtn">Search</button>
    <div id="searchResults" class="result" style="display: none;"></div>
  </div>

  <div class="section">
    <h2>3. Ask a Question (RAG)</h2>
    <input type="text" id="question" placeholder="Ask anything about EvoDB..." />
    <button id="askBtn">Ask</button>
    <div id="answer" class="result" style="display: none;"></div>
  </div>

  <script>
    // Seed documents
    document.getElementById('seedBtn').onclick = async () => {
      const btn = document.getElementById('seedBtn');
      btn.disabled = true;
      btn.textContent = 'Seeding...';

      try {
        const res = await fetch('/seed', { method: 'POST' });
        const data = await res.json();
        document.getElementById('seedResult').style.display = 'block';
        document.getElementById('seedResult').textContent = data.message;
      } finally {
        btn.disabled = false;
        btn.textContent = 'Seed Documents';
      }
    };

    // Search
    document.getElementById('searchBtn').onclick = async () => {
      const query = document.getElementById('searchQuery').value;
      if (!query) return;

      const btn = document.getElementById('searchBtn');
      btn.disabled = true;

      try {
        const res = await fetch('/search?q=' + encodeURIComponent(query));
        const data = await res.json();

        const resultsDiv = document.getElementById('searchResults');
        resultsDiv.style.display = 'block';
        resultsDiv.innerHTML = data.results.map(r =>
          '<div style="margin-bottom: 1rem;">' +
          '<strong>' + r.title + '</strong> <span class="source">(score: ' + r.score.toFixed(3) + ')</span>' +
          '<p style="margin-top: 0.25rem;">' + r.content + '</p>' +
          '</div>'
        ).join('');
      } finally {
        btn.disabled = false;
      }
    };

    // Ask
    document.getElementById('askBtn').onclick = async () => {
      const question = document.getElementById('question').value;
      if (!question) return;

      const btn = document.getElementById('askBtn');
      btn.disabled = true;
      btn.textContent = 'Thinking...';

      try {
        const res = await fetch('/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question }),
        });
        const data = await res.json();

        const answerDiv = document.getElementById('answer');
        answerDiv.style.display = 'block';
        answerDiv.innerHTML =
          '<p>' + data.answer + '</p>' +
          '<div class="sources">' +
          '<h4>Sources:</h4>' +
          '<ul>' + data.sources.map(s =>
            '<li>' + s.title + ' (relevance: ' + (s.score * 100).toFixed(0) + '%)</li>'
          ).join('') + '</ul>' +
          '</div>';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Ask';
      }
    };

    // Enter key handlers
    document.getElementById('searchQuery').onkeypress = (e) => {
      if (e.key === 'Enter') document.getElementById('searchBtn').click();
    };
    document.getElementById('question').onkeypress = (e) => {
      if (e.key === 'Enter') document.getElementById('askBtn').click();
    };
  </script>
</body>
</html>`;
}
```

## Step 7: Deploy and Test

Deploy to Cloudflare Workers:

```bash
npx wrangler deploy
```

Test locally:

```bash
npx wrangler dev
```

Try these queries:

1. **Seed the data**: Click "Seed Documents"
2. **Search**: Try "schema evolution" or "query builder"
3. **Ask**: Try "How do I get started with EvoDB?" or "What storage does EvoDB use?"

## Understanding Vector Search

### Embeddings

Embeddings are numerical representations of text that capture semantic meaning:

```typescript
// Text: "EvoDB is a database"
// Embedding: [0.12, -0.34, 0.56, ...] (768 dimensions)

const embedding = await embeddings.embed("EvoDB is a database");
```

Similar texts have similar embeddings, allowing semantic search.

### Similarity Metrics

**Cosine Similarity** (0-1, higher is better):
- Measures the angle between vectors
- Ignores magnitude, focuses on direction
- Best for normalized embeddings

```typescript
const similarity = computeCosineSimilarity(embedding1, embedding2);
// 1.0 = identical, 0.0 = orthogonal
```

**L2 Distance** (0+, lower is better):
- Euclidean distance between vectors
- Considers both direction and magnitude

```typescript
const distance = computeL2Distance(embedding1, embedding2);
// 0.0 = identical
```

### Vector Indices

For large datasets, use approximate nearest neighbor (ANN) indices:

**IVF-PQ** (Inverted File with Product Quantization):
- Clusters vectors and uses quantization for compression
- Fast search with configurable recall/speed tradeoff
- Good for 100K+ vectors

**HNSW** (Hierarchical Navigable Small World):
- Graph-based index with hierarchical layers
- Excellent recall with logarithmic search time
- Higher memory usage than IVF-PQ

```typescript
// Search with IVF-PQ index
const results = await reader.search('embedding', queryVector, {
  k: 10,        // Return top 10 results
  nprobes: 20,  // Search 20 clusters (higher = better recall)
});
```

## RAG Best Practices

### 1. Chunk Documents Appropriately

```typescript
// Bad: Entire documents as single chunks
await vectorStore.addDocument('Manual', entireDocumentText);

// Good: Split into semantic sections
const sections = splitIntoSections(documentText);
for (const section of sections) {
  await vectorStore.addDocument(section.title, section.content);
}
```

### 2. Use Hybrid Search

Combine vector search with keyword search for better results:

```typescript
async function hybridSearch(query: string, k: number): Promise<SearchResult[]> {
  // Vector search
  const vectorResults = await vectorStore.search(query, k * 2);

  // Keyword search
  const keywordResults = await db.query('documents')
    .where('content', 'like', `%${query}%`)
    .limit(k);

  // Merge and deduplicate
  return mergeResults(vectorResults, keywordResults, k);
}
```

### 3. Include Metadata for Filtering

```typescript
// Store with metadata
await vectorStore.addDocument(title, content, {
  category: 'tutorial',
  date: '2024-01-15',
});

// Filter search by metadata
const results = await vectorStore.search(query, k);
const filtered = results.filter(r =>
  r.document.metadata?.category === 'tutorial'
);
```

### 4. Rerank Results

Use a cross-encoder for more accurate relevance scoring:

```typescript
async function rerank(query: string, results: SearchResult[]): Promise<SearchResult[]> {
  // Score each result with cross-encoder
  const scored = await Promise.all(
    results.map(async (r) => ({
      ...r,
      rerankScore: await crossEncode(query, r.document.content),
    }))
  );

  // Sort by rerank score
  return scored.sort((a, b) => b.rerankScore - a.rerankScore);
}
```

## What You Learned

In this tutorial, you learned how to:

1. **Generate embeddings** - Use AI models to create vector representations
2. **Store vectors** - Save embeddings alongside documents
3. **Search semantically** - Find similar documents using vector similarity
4. **Build RAG pipelines** - Combine retrieval with LLM generation
5. **Deploy to the edge** - Run vector search on Cloudflare Workers

## Next Steps

- [Getting Started Guide](../GETTING_STARTED.md) - Production configuration
- [Lance Reader Documentation](../../lance-reader/README.md) - Advanced vector search
- [Cloudflare AI](https://developers.cloudflare.com/workers-ai/) - Available models

## Troubleshooting

### "AI binding not available"

Make sure your `wrangler.toml` includes:

```toml
[ai]
binding = "AI"
```

### Low Quality Search Results

- Increase `k` to retrieve more candidates
- Lower the `threshold` for similarity
- Try different embedding models
- Chunk documents into smaller pieces

### Slow Search on Large Datasets

- Build an IVF-PQ or HNSW index
- Use the Lance format for efficient vector storage
- Increase `nprobes` for better recall (at cost of speed)
