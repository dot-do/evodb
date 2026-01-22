# EvoDB Basic CRUD Example

This example demonstrates fundamental Create, Read, Update, Delete operations using the EvoDB high-level API.

## Features Demonstrated

- **Create**: Insert single and batch documents with automatic schema evolution
- **Read**: Query with filters, projection, sorting, pagination, and aggregations
- **Update**: Modify documents with filter matching and partial updates
- **Delete**: Remove documents with filter matching
- **Schema**: Infer schemas, lock for production, define relationships

## Project Structure

```
basic-crud/
├── src/
│   └── index.ts    # Main example code with CRUD operations
├── package.json    # Dependencies and scripts
├── tsconfig.json   # TypeScript configuration
├── wrangler.toml   # Cloudflare Workers configuration
└── README.md       # This file
```

## Setup

1. Install dependencies:

```bash
cd examples/basic-crud
pnpm install
```

2. Run locally:

```bash
pnpm dev
```

3. Open http://localhost:8787 in your browser to run the examples.

## Code Walkthrough

### Initializing EvoDB

```typescript
import { EvoDB } from '@evodb/core';

const db = new EvoDB({
  mode: 'development', // Schema evolves automatically
  // storage: env.R2_BUCKET, // Optional: persist to R2
});
```

### Create (INSERT)

```typescript
// Single document
const [user] = await db.insert('users', {
  name: 'Alice',
  email: 'alice@example.com',
});

// Batch insert
const users = await db.insert('users', [
  { name: 'Bob', email: 'bob@example.com' },
  { name: 'Carol', email: 'carol@example.com' },
]);
```

### Read (QUERY)

```typescript
// Simple query
const allUsers = await db.query('users').execute();

// With filters
const admins = await db.query('users')
  .where('role', '=', 'admin')
  .execute();

// With projection, sorting, and pagination
const page1 = await db.query('users')
  .select(['name', 'email'])
  .where('age', '>=', 18)
  .orderBy('name', 'asc')
  .limit(10)
  .offset(0)
  .execute();

// Aggregations
const stats = await db.query('users')
  .aggregate('count', null, 'total')
  .groupBy(['role'])
  .execute();
```

### Update

```typescript
// Update matching documents
const result = await db.update(
  'users',
  { role: 'guest' },     // Filter
  { role: 'user' },      // Changes
);

// Get updated documents
const { documents } = await db.update(
  'users',
  { name: 'Alice' },
  { age: 29 },
  { returnDocuments: true },
);
```

### Delete

```typescript
// Delete matching documents
const { deletedCount } = await db.delete(
  'users',
  { role: 'inactive' },
);

// Get deleted documents
const { documents } = await db.delete(
  'users',
  { _id: 'user-123' },
  { returnDocuments: true },
);
```

### Schema Management

```typescript
// Infer schema from data
const schema = await db.schema.infer('users');

// Lock schema for production
await db.schema.lock('users', {
  name: { type: 'string', required: true },
  email: { type: 'string', format: 'email', required: true },
  age: { type: 'number', min: 0 },
});

// Define relationships
await db.schema.relate('posts.authorId', 'users', {
  type: 'one-to-many',
  onDelete: 'cascade',
});
```

## Deploying to Cloudflare

1. Update `wrangler.toml` with your account details

2. Create an R2 bucket (optional, for persistence):

```bash
wrangler r2 bucket create evodb-example-data
```

3. Uncomment the R2 binding in `wrangler.toml`

4. Deploy:

```bash
pnpm deploy
```

## Learn More

- [EvoDB Documentation](https://github.com/dot-do/evodb)
- [@evodb/core Package](../../core/README.md)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
