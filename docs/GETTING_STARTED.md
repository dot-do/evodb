# Getting Started with EvoDB

This guide will help you get up and running with EvoDB, the schema-evolving database for the edge.

## Prerequisites

### Required

- **Node.js**: Version 18.0.0 or higher
- **Package Manager**: npm, pnpm, or yarn
- **TypeScript**: Version 5.4.0 or higher (recommended)

### For Production Deployment

- **Cloudflare Account**: Free or paid account at [dash.cloudflare.com](https://dash.cloudflare.com)
- **Wrangler CLI**: Cloudflare's CLI tool (`npm install -g wrangler`)
- **R2 Bucket**: Object storage for the lakehouse (created via Cloudflare dashboard)

## Installation

> **Note**: EvoDB packages are not yet published to npm. This documentation reflects the planned installation process coming soon.

Install the core packages:

```bash
npm install @evodb/core @evodb/query
```

Or with pnpm:

```bash
pnpm add @evodb/core @evodb/query
```

Or with yarn:

```bash
yarn add @evodb/core @evodb/query
```

### Package Overview

| Package | Purpose |
|---------|---------|
| `@evodb/core` | Core engine with schema evolution, shredding, and query operations |
| `@evodb/query` | Query planner and optimizer |
| `@evodb/writer` | CDC aggregation and R2 block writing |
| `@evodb/reader` | Query execution with Cache API integration |
| `@evodb/lakehouse` | R2-backed lakehouse with manifests and snapshots |
| `@evodb/codegen` | Schema CLI tools (pull, push, lock, diff) |

## Quick Start

Here is a complete runnable example to get you started:

```typescript
import { EvoDB } from '@evodb/core';

// 1. Initialize EvoDB in development mode
const db = new EvoDB({
  mode: 'development',
});

// 2. Insert documents - schema evolves automatically
await db.insert('products', [
  { name: 'Widget', price: 29.99, category: 'tools', inStock: true },
  { name: 'Gadget', price: 49.99, category: 'electronics', inStock: true },
  { name: 'Gizmo', price: 19.99, category: 'tools', inStock: false },
]);

// 3. Query with filters
const affordableTools = await db.query('products')
  .where('category', '=', 'tools')
  .where('price', '<', 30)
  .select(['name', 'price']);

console.log(affordableTools);
// [{ name: 'Gizmo', price: 19.99 }]

// 4. Aggregate by category
const categoryStats = await db.query('products')
  .aggregate('count', null, 'count')
  .aggregate('avg', 'price', 'avgPrice')
  .groupBy(['category'])
  .execute();

console.log(categoryStats);
// [
//   { category: 'tools', count: 2, avgPrice: 24.99 },
//   { category: 'electronics', count: 1, avgPrice: 49.99 }
// ]

// 5. Infer the schema
const schema = await db.schema.infer('products');
console.log(schema);
// { _id: 'string', name: 'string', price: 'number', category: 'string', inStock: 'boolean' }
```

## Basic Usage

### Initialize EvoDB

```typescript
import { EvoDB } from '@evodb/core';

// Development mode: schema evolves automatically
const db = new EvoDB({
  mode: 'development',
});

// Production mode with R2 storage
const prodDb = new EvoDB({
  mode: 'production',
  storage: env.R2_BUCKET,
});
```

### Insert Documents

```typescript
// Single document
await db.insert('users', {
  name: 'Alice',
  email: 'alice@example.com',
});

// Multiple documents
await db.insert('users', [
  { name: 'Bob', email: 'bob@example.com' },
  { name: 'Charlie', email: 'charlie@example.com', role: 'admin' },
]);

// Nested objects and arrays
await db.insert('posts', {
  title: 'Hello World',
  author: { name: 'Alice', avatar: '/alice.png' },
  tags: ['intro', 'welcome'],
});
```

### Query Data

```typescript
// Simple query - returns all documents
const users = await db.query('users');

// Filter with where clause
const admins = await db.query('users')
  .where('role', '=', 'admin');

// Multiple filters
const activeAdmins = await db.query('users')
  .where('role', '=', 'admin')
  .where('status', '=', 'active');

// Select specific columns
const names = await db.query('users')
  .select(['name', 'email']);

// Sorting
const sorted = await db.query('users')
  .orderBy('name', 'asc');

// Pagination
const page = await db.query('users')
  .orderBy('createdAt', 'desc')
  .limit(10)
  .offset(20);

// Get result with metadata
const result = await db.query('users')
  .limit(10)
  .executeWithMeta();
// result.rows, result.totalCount, result.hasMore
```

### Update and Delete

```typescript
// Update documents matching filter
await db.update('users', { _id: 'user-1' }, { name: 'Alice Updated' });

// Update multiple documents
await db.update('users', { role: 'user' }, { role: 'member' });

// Delete documents
await db.delete('users', { _id: 'user-1' });

// Delete all matching
await db.delete('users', { status: 'inactive' });
```

### Aggregations

```typescript
// Count
const count = await db.query('orders')
  .aggregate('count', null, 'total')
  .execute();

// Sum, Avg, Min, Max
const stats = await db.query('orders')
  .aggregate('sum', 'amount', 'totalAmount')
  .aggregate('avg', 'amount', 'avgAmount')
  .execute();

// Group by
const byCategory = await db.query('products')
  .aggregate('count', null, 'productCount')
  .aggregate('sum', 'price', 'totalValue')
  .groupBy(['category'])
  .execute();
```

## Configuration Options

### EvoDBConfig

```typescript
interface EvoDBConfig {
  // Operating mode
  mode: 'development' | 'production';

  // R2 bucket for storage (optional)
  storage?: R2Bucket;

  // Schema evolution behavior
  // Default: 'automatic' in development, 'locked' in production
  schemaEvolution?: 'automatic' | 'locked';

  // Infer types from data (default: true)
  inferTypes?: boolean;

  // Validate data on write in production (default: true in production)
  validateOnWrite?: boolean;

  // Reject fields not in schema (default: false)
  rejectUnknownFields?: boolean;

  // Structured logging
  logger?: Logger;
}
```

### Development vs Production

```typescript
// Development: flexible, schema evolves
const devDb = new EvoDB({
  mode: 'development',
  schemaEvolution: 'automatic',
  inferTypes: true,
});

// Production: strict, schema locked
const prodDb = new EvoDB({
  mode: 'production',
  storage: env.R2_BUCKET,
  schemaEvolution: 'locked',
  validateOnWrite: true,
  rejectUnknownFields: false, // Accept new fields, just don't index them
});
```

## Cloudflare Workers Integration

### wrangler.toml

```toml
name = "my-evodb-worker"
main = "src/index.ts"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "my-evodb-lakehouse"
```

### Worker Example

```typescript
import { EvoDB } from '@evodb/core';

export interface Env {
  R2_BUCKET: R2Bucket;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const db = new EvoDB({
      mode: 'production',
      storage: env.R2_BUCKET,
    });

    const url = new URL(request.url);

    if (url.pathname === '/users' && request.method === 'GET') {
      const users = await db.query('users');
      return Response.json(users);
    }

    if (url.pathname === '/users' && request.method === 'POST') {
      const body = await request.json();
      const result = await db.insert('users', body);
      return Response.json(result, { status: 201 });
    }

    return new Response('Not Found', { status: 404 });
  },
};
```

## Schema CLI Commands

The `@evodb/codegen` package provides CLI tools for schema management:

```bash
# See what schema EvoDB has learned from your data
npx evodb schema diff

# Generate TypeScript types from schema
npx evodb pull --db mydb

# Lock schema at current version
npx evodb schema lock --output schema.json

# Push schema changes to production
npx evodb schema push --env production
```

## Filter Operators

EvoDB supports SQL-like filter operators:

| Operator | Description |
|----------|-------------|
| `=` | Equals |
| `!=`, `<>` | Not equals |
| `>` | Greater than |
| `>=` | Greater than or equal |
| `<` | Less than |
| `<=` | Less than or equal |
| `in` | Value in array |
| `not in` | Value not in array |
| `like` | SQL LIKE pattern matching |
| `between` | Between two values |
| `is null` | Is null |
| `is not null` | Is not null |

## Schema Validation

In production mode with a locked schema, EvoDB validates all writes:

```typescript
await db.schema.lock('users', {
  name: { type: 'string', required: true },
  email: { type: 'string', format: 'email', required: true },
  age: { type: 'number', min: 0, max: 150 },
  role: { type: 'string', enum: ['admin', 'user', 'guest'] },
});

// This will throw ValidationError
await db.insert('users', { name: 'Alice' }); // Missing required 'email'
await db.insert('users', { name: 'Alice', email: 'invalid' }); // Invalid email format
await db.insert('users', { name: 'Alice', email: 'a@b.com', role: 'superuser' }); // Invalid enum
```

## Troubleshooting

### Common Errors

#### "Cannot find module '@evodb/core'"

The packages are not yet published to npm. For now, you need to build from source:

```bash
git clone https://github.com/dot-do/evodb.git
cd evodb
pnpm install
pnpm -r build
```

#### "Schema locked: cannot add field 'newField'"

In production mode with a locked schema, new fields are rejected by default. Options:

1. Set `rejectUnknownFields: false` to accept new fields without indexing them
2. Evolve the schema to include the new field before inserting

```typescript
// Option 1: Accept unknown fields
const db = new EvoDB({
  mode: 'production',
  rejectUnknownFields: false, // New fields accepted but not indexed
});

// Option 2: Evolve schema first
await db.schema.addField('users', 'newField', { type: 'string' });
```

#### "R2_BUCKET is not defined"

Ensure your `wrangler.toml` has the R2 bucket binding configured:

```toml
[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "your-bucket-name"
```

And that you've created the bucket in your Cloudflare dashboard.

### TypeScript Configuration Issues

#### Module Resolution Errors

EvoDB uses ES modules. Ensure your `tsconfig.json` has the correct settings:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "types": ["@cloudflare/workers-types"]
  }
}
```

#### Type Inference Not Working

If TypeScript isn't inferring query result types, ensure you have the latest version:

```bash
npm install typescript@latest
```

### Cloudflare-Specific Issues

#### "Exceeded CPU time limit"

Cloudflare Workers have CPU limits. For complex queries:

1. Add indexes to frequently queried fields
2. Use pagination with `limit()` and `offset()`
3. Use the `@evodb/edge-cache` package for caching

```typescript
// Add caching for expensive queries
import { withCache } from '@evodb/edge-cache';

const cachedQuery = withCache(
  () => db.query('products').where('category', '=', 'tools'),
  { ttl: 60 } // Cache for 60 seconds
);
```

#### "Subrequest limit exceeded"

Workers have a limit of 1000 subrequests. Use batch operations:

```typescript
// Instead of individual inserts
for (const doc of documents) {
  await db.insert('collection', doc); // Many subrequests
}

// Use batch insert
await db.insert('collection', documents); // Single operation
```

#### "Memory limit exceeded in Snippets"

Snippets have stricter limits (32MB). Use streaming:

```typescript
// For large result sets, use streaming
const stream = await db.query('large_table')
  .stream();

for await (const batch of stream) {
  process.batch(batch);
}
```

## Links

### Documentation

- [README](../README.md) - Project overview and architecture
- [Architecture Guide](../ARCHITECTURE.md) - Detailed system design
- [Migration Guide](../MIGRATION.md) - Upgrading between versions
- [Debugging Guide](../DEBUGGING.md) - Debugging and profiling

### Package Documentation

- [@evodb/core](../core/README.md) - Core engine documentation
- [@evodb/query](../query/README.md) - Query engine documentation
- [@evodb/lakehouse](../lakehouse/README.md) - Lakehouse documentation

### External Resources

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)
- [Durable Objects Documentation](https://developers.cloudflare.com/durable-objects/)

## Next Steps

1. Follow the [Quick Start](#quick-start) to run your first query
2. Read the [Configuration Options](#configuration-options) to customize EvoDB
3. Deploy to Cloudflare with the [Workers Integration](#cloudflare-workers-integration) guide
4. Explore the [Schema CLI Commands](#schema-cli-commands) for production workflows
