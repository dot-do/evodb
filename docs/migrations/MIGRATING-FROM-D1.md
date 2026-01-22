# Migrating from Cloudflare D1 to EvoDB

This guide helps developers transition from [Cloudflare D1](https://developers.cloudflare.com/d1/) to EvoDB. Both run on Cloudflare's edge infrastructure, but EvoDB provides a document-oriented approach with automatic schema evolution and columnar storage optimized for analytics.

## Key Differences

| Feature | D1 | EvoDB |
|---------|-----|-------|
| **Data Model** | SQL (relational) | NoSQL (document) |
| **Query Language** | SQL | Fluent API |
| **Schema** | Fixed, migration-based | Automatic evolution |
| **Storage Format** | Row-oriented (SQLite) | Columnar |
| **Best For** | Transactional workloads | Analytics + documents |
| **Joins** | Native SQL joins | Denormalized data |
| **Transactions** | Full ACID | Optimistic concurrency |

## SQL vs NoSQL: When to Choose

### Choose EvoDB when:
- Your data is document-oriented (JSON)
- Schema changes frequently
- You need fast analytical queries
- You prefer denormalized data
- You want automatic schema inference

### Stay with D1 when:
- You need complex SQL joins
- Your schema is stable and relational
- You have existing SQL expertise
- You need strict ACID transactions

## Conceptual Mapping

| D1 (SQL) Concept | EvoDB Equivalent |
|------------------|------------------|
| Database | EvoDB instance |
| Table | Collection |
| Row | Document |
| Column | Field |
| PRIMARY KEY | `_id` field (auto-generated) |
| CREATE TABLE | Automatic (insert first document) |
| ALTER TABLE | Automatic schema evolution |
| Index | Automatic indexing |

## Installation

```bash
npm install @evodb/core @evodb/query
```

## Schema Mapping

### D1 Schema Definition

```sql
-- D1 requires explicit table creation
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  age INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT,
  author_id INTEGER REFERENCES users(id),
  tags TEXT, -- JSON array stored as text
  published_at TEXT
);
```

### EvoDB Schema (Inferred)

```typescript
// EvoDB infers schema from inserted data
await db.insert('users', {
  name: 'Alice',
  email: 'alice@example.com',
  age: 30,
  createdAt: new Date().toISOString()
});

await db.insert('posts', {
  title: 'My First Post',
  content: 'Hello world!',
  authorId: 'user-123',
  tags: ['intro', 'welcome'],  // Native array support
  publishedAt: new Date().toISOString()
});

// View inferred schema
const schema = await db.schema.infer('users');
// { _id: 'string', name: 'string', email: 'string', age: 'number', createdAt: 'string' }
```

## Query Translation

### SELECT Queries

```typescript
// D1 (SQL)
const users = await env.DB.prepare('SELECT * FROM users').all();

// EvoDB
const users = await db.query('users');
```

### WHERE Clauses

```typescript
// D1 (SQL)
const adults = await env.DB
  .prepare('SELECT * FROM users WHERE age > ?')
  .bind(18)
  .all();

// EvoDB
const adults = await db.query('users')
  .where('age', '>', 18);
```

### Multiple Conditions (AND)

```typescript
// D1 (SQL)
const activeAdmins = await env.DB
  .prepare('SELECT * FROM users WHERE role = ? AND status = ?')
  .bind('admin', 'active')
  .all();

// EvoDB
const activeAdmins = await db.query('users')
  .where('role', '=', 'admin')
  .where('status', '=', 'active');
```

### IN Operator

```typescript
// D1 (SQL)
const selected = await env.DB
  .prepare('SELECT * FROM users WHERE id IN (?, ?, ?)')
  .bind(1, 2, 3)
  .all();

// EvoDB
const selected = await db.query('users')
  .where('_id', 'in', ['user-1', 'user-2', 'user-3']);
```

### LIKE / Pattern Matching

```typescript
// D1 (SQL)
const matching = await env.DB
  .prepare("SELECT * FROM users WHERE name LIKE ?")
  .bind('%alice%')
  .all();

// EvoDB
const matching = await db.query('users')
  .where('name', 'contains', 'alice');
```

### SELECT Specific Columns

```typescript
// D1 (SQL)
const names = await env.DB
  .prepare('SELECT name, email FROM users')
  .all();

// EvoDB
const names = await db.query('users')
  .select(['name', 'email']);
```

### ORDER BY

```typescript
// D1 (SQL)
const sorted = await env.DB
  .prepare('SELECT * FROM users ORDER BY name ASC')
  .all();

// EvoDB
const sorted = await db.query('users')
  .orderBy('name', 'asc');
```

### LIMIT and OFFSET

```typescript
// D1 (SQL)
const page = await env.DB
  .prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?')
  .bind(10, 20)
  .all();

// EvoDB
const page = await db.query('users')
  .orderBy('createdAt', 'desc')
  .limit(10)
  .offset(20);
```

### COUNT

```typescript
// D1 (SQL)
const count = await env.DB
  .prepare('SELECT COUNT(*) as total FROM users')
  .first();

// EvoDB
const result = await db.query('users')
  .aggregate('count', null, 'total')
  .execute();
```

### Aggregations with GROUP BY

```typescript
// D1 (SQL)
const stats = await env.DB
  .prepare(`
    SELECT
      role,
      COUNT(*) as count,
      AVG(age) as avg_age
    FROM users
    GROUP BY role
  `)
  .all();

// EvoDB
const stats = await db.query('users')
  .aggregate('count', null, 'count')
  .aggregate('avg', 'age', 'avgAge')
  .groupBy(['role'])
  .execute();
```

### INSERT

```typescript
// D1 (SQL)
await env.DB
  .prepare('INSERT INTO users (name, email, age) VALUES (?, ?, ?)')
  .bind('Alice', 'alice@example.com', 30)
  .run();

// EvoDB
await db.insert('users', {
  name: 'Alice',
  email: 'alice@example.com',
  age: 30
});
```

### Batch INSERT

```typescript
// D1 (SQL)
const batch = [
  env.DB.prepare('INSERT INTO users (name) VALUES (?)').bind('Alice'),
  env.DB.prepare('INSERT INTO users (name) VALUES (?)').bind('Bob'),
  env.DB.prepare('INSERT INTO users (name) VALUES (?)').bind('Charlie'),
];
await env.DB.batch(batch);

// EvoDB
await db.insert('users', [
  { name: 'Alice' },
  { name: 'Bob' },
  { name: 'Charlie' }
]);
```

### UPDATE

```typescript
// D1 (SQL)
await env.DB
  .prepare('UPDATE users SET name = ? WHERE id = ?')
  .bind('Alice Updated', 1)
  .run();

// EvoDB
await db.update('users', { _id: 'user-1' }, { name: 'Alice Updated' });
```

### Bulk UPDATE

```typescript
// D1 (SQL)
await env.DB
  .prepare('UPDATE users SET role = ? WHERE role = ?')
  .bind('member', 'user')
  .run();

// EvoDB
await db.update('users', { role: 'user' }, { role: 'member' });
```

### DELETE

```typescript
// D1 (SQL)
await env.DB
  .prepare('DELETE FROM users WHERE id = ?')
  .bind(1)
  .run();

// EvoDB
await db.delete('users', { _id: 'user-1' });
```

### Bulk DELETE

```typescript
// D1 (SQL)
await env.DB
  .prepare('DELETE FROM users WHERE status = ?')
  .bind('inactive')
  .run();

// EvoDB
await db.delete('users', { status: 'inactive' });
```

## Handling Relationships

### D1: Foreign Keys and JOINs

```sql
-- D1 (SQL) - Normalized with JOIN
SELECT
  posts.title,
  posts.content,
  users.name as author_name
FROM posts
JOIN users ON posts.author_id = users.id
WHERE posts.published_at IS NOT NULL;
```

### EvoDB: Denormalized Documents

```typescript
// EvoDB - Denormalized approach (recommended)
await db.insert('posts', {
  title: 'My Post',
  content: 'Hello world!',
  author: {
    id: 'user-123',
    name: 'Alice',
    avatar: '/alice.png'
  },
  publishedAt: new Date().toISOString()
});

// Query is simpler - no joins needed
const posts = await db.query('posts')
  .where('publishedAt', '!=', null)
  .select(['title', 'content', 'author.name']);
```

### Maintaining References

```typescript
// If you need to keep references, store IDs and resolve manually
const posts = await db.query('posts')
  .where('authorId', '=', userId);

const author = await db.query('users')
  .where('_id', '=', userId)
  .first();
```

## Transactions

```typescript
// D1 (SQL)
const results = await env.DB.batch([
  env.DB.prepare('INSERT INTO users (name) VALUES (?)').bind('Alice'),
  env.DB.prepare('INSERT INTO logs (action) VALUES (?)').bind('user_created'),
]);

// EvoDB
await db.transaction(async (tx) => {
  const user = await tx.insert('users', { name: 'Alice' });
  await tx.insert('logs', { action: 'user_created', userId: user._id });
});
```

## Schema Migration

### D1: Explicit Migrations

```sql
-- D1 requires explicit ALTER TABLE
ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE users ADD COLUMN address TEXT;

-- Data backfill
UPDATE users SET phone = 'unknown' WHERE phone IS NULL;
```

### EvoDB: Automatic Evolution

```typescript
// EvoDB - Just insert documents with new fields
// Existing documents keep their structure
// New documents can have additional fields

await db.insert('users', {
  name: 'New User',
  email: 'new@example.com',
  phone: '+1234567890',  // New field
  address: '123 Main St'  // New field
});

// Query handles optional fields gracefully
const schema = await db.schema.infer('users');
// { _id: 'string', name: 'string', email: 'string', phone: 'string?', address: 'string?' }
```

## Data Migration Steps

### 1. Export from D1

```typescript
// Export all tables from D1
async function exportFromD1(env: Env) {
  const users = await env.DB.prepare('SELECT * FROM users').all();
  const posts = await env.DB.prepare('SELECT * FROM posts').all();

  return {
    users: users.results,
    posts: posts.results
  };
}
```

### 2. Transform Data

```typescript
// Transform relational data to documents
function transformPosts(posts: any[], users: any[]) {
  const userMap = new Map(users.map(u => [u.id, u]));

  return posts.map(post => ({
    ...post,
    _id: `post-${post.id}`,
    authorId: `user-${post.author_id}`,
    author: userMap.get(post.author_id) ? {
      name: userMap.get(post.author_id).name,
      email: userMap.get(post.author_id).email
    } : null,
    tags: post.tags ? JSON.parse(post.tags) : [],  // Parse JSON strings
  }));
}
```

### 3. Import to EvoDB

```typescript
async function importToEvoDB(db: EvoDB, data: any) {
  // Import users
  const transformedUsers = data.users.map(u => ({
    ...u,
    _id: `user-${u.id}`
  }));
  await db.insert('users', transformedUsers);

  // Import posts with denormalized author
  const transformedPosts = transformPosts(data.posts, data.users);
  await db.insert('posts', transformedPosts);
}
```

## Wrangler Configuration

### D1 Configuration

```toml
# wrangler.toml for D1
[[d1_databases]]
binding = "DB"
database_name = "my-database"
database_id = "xxx-xxx-xxx"
```

### EvoDB Configuration

```toml
# wrangler.toml for EvoDB
[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "my-evodb-bucket"
```

### Worker Code

```typescript
// D1
export default {
  async fetch(request: Request, env: Env) {
    const users = await env.DB.prepare('SELECT * FROM users').all();
    return Response.json(users.results);
  }
};

// EvoDB
import { EvoDB } from '@evodb/core';

export default {
  async fetch(request: Request, env: Env) {
    const db = new EvoDB({
      mode: 'production',
      storage: env.R2_BUCKET,
    });
    const users = await db.query('users');
    return Response.json(users);
  }
};
```

## Migration Checklist

1. **Assess your data model**
   - Identify relationships that need denormalization
   - Plan document structures

2. **Install EvoDB packages**
   ```bash
   npm install @evodb/core @evodb/query
   ```

3. **Export data from D1**
   - Write export scripts for all tables
   - Handle relationships and foreign keys

4. **Transform data**
   - Convert to document format
   - Denormalize where appropriate
   - Parse JSON strings to native arrays/objects

5. **Import to EvoDB**
   - Insert transformed documents
   - Verify data integrity

6. **Update application code**
   - Replace SQL queries with EvoDB fluent API
   - Remove JOIN logic (use denormalized data)

7. **Update Wrangler config**
   - Add R2 bucket binding
   - Remove D1 binding (after migration)

8. **Test thoroughly**
   - Verify all queries return expected results
   - Check edge cases and null handling

## Benefits of Migrating

- **Flexible schema**: No more ALTER TABLE migrations
- **Native JSON**: Store arrays and nested objects directly
- **Columnar performance**: Faster analytical queries
- **Simpler queries**: No complex JOINs needed
- **Edge-optimized**: Designed for Cloudflare's edge network

## Getting Help

- [EvoDB Documentation](/docs/GETTING_STARTED.md)
- [API Reference](/docs/api/README.md)
- [GitHub Issues](https://github.com/evodb/evodb/issues)
