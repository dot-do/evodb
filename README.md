# EvoDB

**The Schema-Evolving Database for the Edge**

Your data model shouldn't be set in stone. EvoDB is a globally distributed database built from the ground up around **schema evolution** - giving you the flexibility of document databases when you need it, and the power of strongly-typed schemas when you want it.

## The Problem

You've been here before:

- **Day 1**: You define your schema, deploy to production
- **Day 30**: Business requirements change, you need a new field
- **Day 60**: That field needs to be restructured
- **Day 90**: You're writing migration scripts, hoping nothing breaks
- **Day 180**: Your database is a patchwork of nullable fields and deprecated columns

Traditional databases force you to choose: **flexibility** or **safety**. Document databases let you move fast but leave you debugging type mismatches at 2am. Relational databases give you guarantees but make every schema change feel like defusing a bomb.

## The Solution

EvoDB gives you both.

```typescript
// Start flexible - discover your schema during development
const user = await evodb.insert('users', {
  name: 'Alice',
  email: 'alice@example.com',
  preferences: { theme: 'dark' }  // New field? Just add it.
});

// Lock it down when you're ready for production
await evodb.schema.lock('users', {
  name: { type: 'string', required: true },
  email: { type: 'string', format: 'email', required: true },
  preferences: {
    theme: { type: 'string', enum: ['light', 'dark', 'system'] }
  }
});
```

**Dynamic schema evolution during development. Locked, enforced schemas in production.** You control when and how your schema evolves.

## Built for Scale

EvoDB isn't just a database - it's a **globally distributed lakehouse** designed for the edge:

```
                          ┌─────────────────────────────────────────┐
                          │         Global Lakehouse (R2)          │
                          │  ┌─────────────────────────────────┐   │
                          │  │    Unified Columnar Storage     │   │
                          │  │  • Global indexes               │   │
                          │  │  • Tenant-scoped namespaces     │   │
                          │  │  • Time-travel queries          │   │
                          │  └─────────────────────────────────┘   │
                          └───────────────┬───────────────────────┘
                                          │
              ┌───────────────────────────┼───────────────────────────┐
              │                           │                           │
     ┌────────┴────────┐        ┌────────┴────────┐        ┌────────┴────────┐
     │   US-WEST Edge  │        │   EU Edge Node  │        │  APAC Edge Node │
     │   ┌──────────┐  │        │   ┌──────────┐  │        │   ┌──────────┐  │
     │   │ User DBs │  │        │   │ User DBs │  │        │   │ User DBs │  │
     │   │ (SQLite) │  │        │   │ (SQLite) │  │        │   │ (SQLite) │  │
     │   └──────────┘  │        │   └──────────┘  │        │   └──────────┘  │
     └─────────────────┘        └─────────────────┘        └─────────────────┘
              │                           │                           │
         < 20ms                      < 20ms                      < 20ms
              │                           │                           │
     ┌────────┴────────┐        ┌────────┴────────┐        ┌────────┴────────┐
     │     Users       │        │     Users       │        │     Users       │
     └─────────────────┘        └─────────────────┘        └─────────────────┘
```

**User-specific databases live next to users** - in regions around the world. Data syncs to a unified lakehouse for analytics, while edge nodes serve sub-20ms reads.

## Core Capabilities

### Columnar JSON with Variant Shredding

Inspired by ClickHouse's columnar JSON and Iceberg/Parquet's variant shredding, EvoDB stores JSON documents in a columnar format that enables:

- **Blazing analytics** - Column pruning means you only read what you query
- **Schema inference** - Types are detected and optimized automatically
- **Mixed types** - A field can evolve from `string` to `number` without migrations

```typescript
// These documents have evolving schemas
const docs = [
  { id: 1, score: "95" },      // score starts as string
  { id: 2, score: 87 },        // later it's a number
  { id: 3, score: 92.5 },      // and then a float
];

// EvoDB handles it - queries just work
const high = await evodb.query('scores')
  .where('score', '>', 90)
  .select(['id', 'score']);
```

### Document Flexibility + Relational Power

Start with the freedom of MongoDB:

```typescript
// No schema needed - just write
await evodb.insert('posts', {
  title: 'Hello World',
  author: { name: 'Alice', avatar: '/alice.png' },
  tags: ['intro', 'welcome'],
  metadata: { views: 0, featured: true }
});
```

Add relationships when you need them:

```typescript
// Define relationships without migrations
await evodb.schema.relate('posts.author', 'users', {
  foreignKey: 'author.id',
  onDelete: 'cascade'
});
```

Enforce constraints when you're ready:

```typescript
// Lock specific fields while keeping others flexible
await evodb.schema.enforce('posts', {
  title: { type: 'string', required: true, maxLength: 200 },
  author: { ref: 'users', required: true }
  // tags and metadata remain dynamic
});
```

### Development to Production Workflow

**Development mode**: Schema evolves automatically as you write data

```typescript
// evodb.config.ts
export default {
  mode: 'development',
  schemaEvolution: 'automatic',
  inferTypes: true
};
```

**Production mode**: Schema is locked, changes require explicit migrations

```typescript
export default {
  mode: 'production',
  schemaEvolution: 'locked',
  validateOnWrite: true,
  rejectUnknownFields: false  // Still accept new fields, just don't index them
};
```

**Transition**: Generate your locked schema from learned patterns

```bash
# See what schema EvoDB has learned
npx evodb schema diff

# Lock it in
npx evodb schema lock --output schema.json

# Push to production
npx evodb schema push --env production
```

## Architecture

EvoDB is built on Cloudflare's global infrastructure:

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Edge Databases** | Durable Objects + SQLite | Per-user/tenant databases with <20ms latency |
| **Lakehouse Storage** | R2 + Columnar Blocks | Unified analytics with time-travel |
| **Query Engine** | Workers + Cache API | Distributed query execution with caching |
| **Vector Search** | Lance Format | AI-native similarity search |
| **CDC Pipeline** | CapnWeb RPC | Real-time sync from edge to lakehouse |

### Data Flow

```
┌─────────────┐    CDC     ┌─────────────┐    Blocks    ┌─────────────┐
│  Edge DOs   │ ─────────► │  Writer DO  │ ──────────► │     R2      │
│  (SQLite)   │  CapnWeb   │  (Buffer)   │   Columnar  │  Lakehouse  │
└─────────────┘            └─────────────┘             └─────────────┘
       │                                                      │
       │ < 20ms                                               │
       │                                                      ▼
┌──────┴──────┐                                       ┌─────────────┐
│    Users    │◄──────────── Query ──────────────────│   Workers   │
└─────────────┘              Cache API               │   (Query)   │
                                                     └─────────────┘
```

1. **Edge DOs** - SQLite-backed Durable Objects serve individual users/tenants
2. **Writer DO** - Aggregates CDC streams, buffers writes, compacts into columnar blocks
3. **R2 Lakehouse** - Stores columnar data with Iceberg-style manifests and snapshots
4. **Query Workers** - Execute distributed queries with Cache API acceleration

## Packages

| Package | Description |
|---------|-------------|
| [@evodb/core](./core) | Schema evolution engine with columnar shredding |
| [@evodb/rpc](./rpc) | CapnWeb RPC for real-time CDC between Durable Objects |
| [@evodb/lakehouse](./lakehouse) | R2-backed lakehouse with manifests, snapshots, time-travel |
| [@evodb/writer](./writer) | CDC aggregation and columnar block writing |
| [@evodb/reader](./reader) | Query execution with zone maps and bloom filters |
| [@evodb/query](./query) | Query planner and optimizer |
| [@evodb/edge-cache](./edge-cache) | Workers Cache API integration |
| [@evodb/lance-reader](./lance-reader) | Lance format reader for vector search |
| [@evodb/snippets-chain](./snippets-chain) | Scatter-gather patterns for distributed queries |
| [@evodb/snippets-lance](./snippets-lance) | Vector search optimized for edge constraints |
| [@evodb/codegen](./codegen) | Schema CLI (pull, push, lock, diff) |

## Quick Start

```bash
npm install @evodb/core @evodb/writer @evodb/reader
```

```typescript
import { EvoDB } from '@evodb/core';

// Initialize with automatic schema evolution
const db = new EvoDB({
  mode: 'development',
  storage: env.R2_BUCKET
});

// Write documents - schema evolves automatically
await db.insert('users', [
  { name: 'Alice', email: 'alice@example.com' },
  { name: 'Bob', email: 'bob@example.com', role: 'admin' }  // New field!
]);

// Query with type inference
const admins = await db.query('users')
  .where('role', '=', 'admin')
  .select(['name', 'email']);

// Check inferred schema
const schema = await db.schema.infer('users');
// { name: 'string', email: 'string', role: 'string?' }
```

## Edge Constraints

EvoDB packages are optimized for Cloudflare's edge constraints:

| Environment | CPU | Memory | Subrequests |
|-------------|-----|--------|-------------|
| Workers | 50ms | 128MB | 1000 |
| Snippets | 5ms | 32MB | 5 |
| Durable Objects | 30s/req | 128MB | Unlimited |

The `@evodb/snippets-*` packages are specifically designed for the strictest constraints, using streaming decompression, index pruning, and scatter-gather patterns.

## Why EvoDB?

| Need | Traditional | Document DB | EvoDB |
|------|-------------|-------------|-------|
| Fast iteration | Painful migrations | Easy | Easy |
| Type safety | Built-in | Manual | Gradual |
| Schema changes | Downtime risk | Silent failures | Controlled evolution |
| Analytics | Separate system | Limited | Built-in lakehouse |
| Global scale | Complex setup | Varies | Native edge |
| Cost | Expensive | Variable | R2 pricing |

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm -r build

# Run tests
pnpm -r test
```

## License

MIT - Copyright 2026 .do

---

**EvoDB**: Schema evolution for the edge. Flexibility when you need it. Safety when you want it.
