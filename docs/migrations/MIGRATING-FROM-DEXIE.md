# Migrating from Dexie to EvoDB

This guide helps developers transition from [Dexie.js](https://dexie.org/) to EvoDB. While both are document databases with a focus on developer experience, EvoDB is designed for edge-first architectures with columnar storage.

## Key Differences

| Feature | Dexie | EvoDB |
|---------|-------|-------|
| **Storage Backend** | IndexedDB | R2/Columnar Storage |
| **Runtime Environment** | Browser-only | Edge + Browser |
| **Schema Management** | Version-based migrations | Automatic schema evolution |
| **Query Style** | Chained methods | Fluent query builder |
| **Data Format** | Row-oriented | Columnar (optimized for analytics) |
| **Offline Support** | Built-in | Via Workers + Cache API |
| **Sync** | Dexie Cloud (paid) | Built-in multi-region sync |

## Conceptual Mapping

| Dexie Concept | EvoDB Equivalent |
|---------------|------------------|
| Database | EvoDB instance |
| Table | Collection |
| Schema version | Inferred/evolved schema |
| Index | Automatic indexing |
| Transaction | Transaction API |
| Live queries | Reactive queries (coming soon) |

## Installation

```bash
# Remove Dexie
npm uninstall dexie

# Install EvoDB
npm install @evodb/core @evodb/query
```

## Code Comparison

### Database Initialization

```typescript
// Dexie
import Dexie from 'dexie';

const db = new Dexie('MyDatabase');
db.version(1).stores({
  users: '++id, name, email, age',
  posts: '++id, title, authorId, *tags'
});

// EvoDB
import { EvoDB } from '@evodb/core';

const db = new EvoDB({
  mode: 'development',  // Schema evolves automatically
});

// No schema definition needed - EvoDB infers from data
```

### Basic Queries

```typescript
// Dexie
const users = await db.users.toArray();

// EvoDB
const users = await db.query('users');
```

### Filtering with Where Clauses

```typescript
// Dexie
const adults = await db.users.where('age').above(18).toArray();

// EvoDB
const adults = await db.query('users')
  .where('age', '>', 18);
```

### Compound Filters

```typescript
// Dexie
const activeAdults = await db.users
  .where('age').above(18)
  .and(user => user.status === 'active')
  .toArray();

// EvoDB
const activeAdults = await db.query('users')
  .where('age', '>', 18)
  .where('status', '=', 'active');
```

### Equality Checks

```typescript
// Dexie
const admins = await db.users.where('role').equals('admin').toArray();

// EvoDB
const admins = await db.query('users')
  .where('role', '=', 'admin');
```

### Range Queries

```typescript
// Dexie
const midRange = await db.users
  .where('age').between(18, 65)
  .toArray();

// EvoDB
const midRange = await db.query('users')
  .where('age', '>=', 18)
  .where('age', '<=', 65);
```

### Ordering and Limiting

```typescript
// Dexie
const recent = await db.posts
  .orderBy('createdAt')
  .reverse()
  .limit(10)
  .toArray();

// EvoDB
const recent = await db.query('posts')
  .orderBy('createdAt', 'desc')
  .limit(10);
```

### Selecting Specific Fields

```typescript
// Dexie (manual projection)
const names = await db.users
  .toArray()
  .then(users => users.map(u => ({ name: u.name, email: u.email })));

// EvoDB (native projection - more efficient)
const names = await db.query('users')
  .select(['name', 'email']);
```

### Insert Operations

```typescript
// Dexie
await db.users.add({ name: 'Alice', email: 'alice@example.com' });
await db.users.bulkAdd([
  { name: 'Bob', email: 'bob@example.com' },
  { name: 'Charlie', email: 'charlie@example.com' }
]);

// EvoDB
await db.insert('users', { name: 'Alice', email: 'alice@example.com' });
await db.insert('users', [
  { name: 'Bob', email: 'bob@example.com' },
  { name: 'Charlie', email: 'charlie@example.com' }
]);
```

### Update Operations

```typescript
// Dexie
await db.users.update(userId, { name: 'Alice Updated' });
await db.users.where('role').equals('user').modify({ role: 'member' });

// EvoDB
await db.update('users', { _id: userId }, { name: 'Alice Updated' });
await db.update('users', { role: 'user' }, { role: 'member' });
```

### Delete Operations

```typescript
// Dexie
await db.users.delete(userId);
await db.users.where('status').equals('inactive').delete();

// EvoDB
await db.delete('users', { _id: userId });
await db.delete('users', { status: 'inactive' });
```

### Counting Records

```typescript
// Dexie
const count = await db.users.count();
const activeCount = await db.users.where('status').equals('active').count();

// EvoDB
const count = await db.query('users')
  .aggregate('count', null, 'total')
  .execute();

const activeCount = await db.query('users')
  .where('status', '=', 'active')
  .aggregate('count', null, 'total')
  .execute();
```

### Transactions

```typescript
// Dexie
await db.transaction('rw', db.users, db.posts, async () => {
  const userId = await db.users.add({ name: 'Alice' });
  await db.posts.add({ title: 'First Post', authorId: userId });
});

// EvoDB
await db.transaction(async (tx) => {
  const user = await tx.insert('users', { name: 'Alice' });
  await tx.insert('posts', { title: 'First Post', authorId: user._id });
});
```

## Schema Migration Strategy

### Dexie Approach (Version-based)

```typescript
// Dexie requires explicit version upgrades
db.version(1).stores({ users: '++id, name' });
db.version(2).stores({ users: '++id, name, email' });
db.version(3).stores({ users: '++id, name, email, role' }).upgrade(tx => {
  return tx.users.toCollection().modify(user => {
    user.role = 'member';
  });
});
```

### EvoDB Approach (Automatic Evolution)

```typescript
// EvoDB handles schema evolution automatically
// Just insert documents with new fields
await db.insert('users', { name: 'Alice' });
await db.insert('users', { name: 'Bob', email: 'bob@example.com' });
await db.insert('users', { name: 'Charlie', email: 'charlie@example.com', role: 'admin' });

// Schema evolves to accommodate all fields
const schema = await db.schema.infer('users');
// { _id: 'string', name: 'string', email: 'string?', role: 'string?' }
```

## Feature Differences

### Indexes

```typescript
// Dexie - Manual index definition
db.version(1).stores({
  users: '++id, name, email, [firstName+lastName]'
});

// EvoDB - Automatic indexing based on query patterns
// No manual index definition needed
```

### Live Queries (Dexie-specific)

```typescript
// Dexie live queries
import { liveQuery } from 'dexie';

const users$ = liveQuery(() => db.users.where('status').equals('active').toArray());

// EvoDB - Reactive queries coming soon
// For now, poll or use event-based updates
```

## Migration Checklist

1. **Install EvoDB packages**
   ```bash
   npm install @evodb/core @evodb/query
   ```

2. **Export existing data from Dexie**
   ```typescript
   const exportData = async () => {
     const users = await db.users.toArray();
     const posts = await db.posts.toArray();
     return { users, posts };
   };
   ```

3. **Import data into EvoDB**
   ```typescript
   const importData = async (data: { users: any[], posts: any[] }) => {
     await evodb.insert('users', data.users);
     await evodb.insert('posts', data.posts);
   };
   ```

4. **Update query code** using the patterns shown above

5. **Remove Dexie schema definitions** - EvoDB infers schemas automatically

6. **Test thoroughly** - Verify all queries return expected results

## Benefits of Migrating

- **Edge-native**: Run queries at the edge with Cloudflare Workers
- **Columnar storage**: Better performance for analytical queries
- **No schema migrations**: Schema evolves automatically with your data
- **Built-in sync**: Multi-region data synchronization included
- **Type inference**: Full TypeScript support with inferred types

## Getting Help

- [EvoDB Documentation](/docs/GETTING_STARTED.md)
- [API Reference](/docs/api/README.md)
- [GitHub Issues](https://github.com/evodb/evodb/issues)
