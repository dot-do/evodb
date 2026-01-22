# First Query in 5 Minutes

Get up and running with EvoDB in just 5 minutes. This tutorial walks you through installing EvoDB, creating a database instance, inserting your first document, and running your first query.

## Prerequisites

- Node.js 18.0.0 or higher
- npm, pnpm, or yarn

## Step 1: Install EvoDB

Install the core EvoDB package:

```bash
npm install @evodb/core
```

Or with pnpm:

```bash
pnpm add @evodb/core
```

Or with yarn:

```bash
yarn add @evodb/core
```

## Step 2: Create a Database Instance

Create a new TypeScript file called `first-query.ts`:

```typescript
import { EvoDB } from '@evodb/core';

// Create a database instance in development mode
// Development mode enables automatic schema evolution
const db = new EvoDB({
  mode: 'development',
});

console.log('Database created successfully!');
```

In development mode, EvoDB automatically evolves the schema as you insert new data. This makes it easy to prototype and iterate quickly.

## Step 3: Insert Your First Document

Add an insert operation to your file:

```typescript
import { EvoDB } from '@evodb/core';

const db = new EvoDB({
  mode: 'development',
});

async function main() {
  // Insert a single document into the 'users' table
  // EvoDB automatically generates an _id and evolves the schema
  const users = await db.insert('users', {
    name: 'Alice',
    email: 'alice@example.com',
    role: 'admin',
  });

  console.log('Inserted user:', users[0]);
  // Output: { _id: 'abc123...', name: 'Alice', email: 'alice@example.com', role: 'admin' }
}

main();
```

Key points:
- The `insert` method accepts a table name and a document (or array of documents)
- EvoDB automatically generates a unique `_id` for each document
- The schema is inferred from your data structure

## Step 4: Run Your First Query

Now let's query the data we inserted:

```typescript
import { EvoDB } from '@evodb/core';

const db = new EvoDB({
  mode: 'development',
});

async function main() {
  // Insert some sample data
  await db.insert('users', [
    { name: 'Alice', email: 'alice@example.com', role: 'admin' },
    { name: 'Bob', email: 'bob@example.com', role: 'user' },
    { name: 'Charlie', email: 'charlie@example.com', role: 'user' },
  ]);

  // Query all users
  const allUsers = await db.query('users');
  console.log('All users:', allUsers);

  // Query with a filter
  const admins = await db.query('users')
    .where('role', '=', 'admin');
  console.log('Admins:', admins);

  // Select specific fields
  const emails = await db.query('users')
    .select(['name', 'email']);
  console.log('Names and emails:', emails);
}

main();
```

## Complete Example

Here is the complete code:

```typescript
import { EvoDB } from '@evodb/core';

const db = new EvoDB({
  mode: 'development',
});

async function main() {
  console.log('=== EvoDB First Query Tutorial ===\n');

  // Step 1: Insert documents
  console.log('1. Inserting documents...');
  const inserted = await db.insert('products', [
    { name: 'Laptop', price: 999.99, category: 'electronics', inStock: true },
    { name: 'Headphones', price: 149.99, category: 'electronics', inStock: true },
    { name: 'Desk Chair', price: 299.99, category: 'furniture', inStock: false },
    { name: 'Monitor', price: 399.99, category: 'electronics', inStock: true },
  ]);
  console.log(`   Inserted ${inserted.length} products\n`);

  // Step 2: Query all documents
  console.log('2. Query all products:');
  const allProducts = await db.query('products');
  allProducts.forEach(p => console.log(`   - ${p.name}: $${p.price}`));
  console.log();

  // Step 3: Filter by category
  console.log('3. Filter electronics:');
  const electronics = await db.query('products')
    .where('category', '=', 'electronics');
  electronics.forEach(p => console.log(`   - ${p.name}`));
  console.log();

  // Step 4: Filter by price range
  console.log('4. Products under $300:');
  const affordable = await db.query('products')
    .where('price', '<', 300);
  affordable.forEach(p => console.log(`   - ${p.name}: $${p.price}`));
  console.log();

  // Step 5: Multiple filters
  console.log('5. In-stock electronics:');
  const inStockElectronics = await db.query('products')
    .where('category', '=', 'electronics')
    .where('inStock', '=', true);
  inStockElectronics.forEach(p => console.log(`   - ${p.name}`));
  console.log();

  // Step 6: Select specific fields and sort
  console.log('6. Product names sorted by price (descending):');
  const sortedNames = await db.query('products')
    .select(['name', 'price'])
    .orderBy('price', 'desc');
  sortedNames.forEach(p => console.log(`   - ${p.name}: $${p.price}`));
  console.log();

  // Step 7: Limit results
  console.log('7. Top 2 most expensive products:');
  const top2 = await db.query('products')
    .orderBy('price', 'desc')
    .limit(2);
  top2.forEach(p => console.log(`   - ${p.name}: $${p.price}`));

  console.log('\n=== Tutorial Complete! ===');
}

main().catch(console.error);
```

## Running the Example

Run your TypeScript file:

```bash
npx tsx first-query.ts
```

Expected output:

```
=== EvoDB First Query Tutorial ===

1. Inserting documents...
   Inserted 4 products

2. Query all products:
   - Laptop: $999.99
   - Headphones: $149.99
   - Desk Chair: $299.99
   - Monitor: $399.99

3. Filter electronics:
   - Laptop
   - Headphones
   - Monitor

4. Products under $300:
   - Headphones
   - Desk Chair

5. In-stock electronics:
   - Laptop
   - Headphones
   - Monitor

6. Product names sorted by price (descending):
   - Laptop: $999.99
   - Monitor: $399.99
   - Desk Chair: $299.99
   - Headphones: $149.99

7. Top 2 most expensive products:
   - Laptop: $999.99
   - Monitor: $399.99

=== Tutorial Complete! ===
```

## What You Learned

In this tutorial, you learned how to:

1. **Install EvoDB** - Add the `@evodb/core` package to your project
2. **Create a database** - Initialize EvoDB in development mode
3. **Insert documents** - Add single or multiple documents to a table
4. **Query data** - Use the fluent query builder to filter, select, sort, and limit results

## Next Steps

- [Building a TODO App](./02-todo-app.md) - Learn CRUD operations by building a complete TODO application
- [Real-time Chat](./03-realtime-chat.md) - Add real-time subscriptions to your app
- [Vector Search for RAG](./04-vector-search.md) - Build AI-powered search with embeddings

## Query Reference

Here are the query methods you can chain:

| Method | Description | Example |
|--------|-------------|---------|
| `where(field, op, value)` | Filter results | `.where('price', '<', 100)` |
| `select([fields])` | Choose fields to return | `.select(['name', 'price'])` |
| `orderBy(field, dir)` | Sort results | `.orderBy('price', 'desc')` |
| `limit(n)` | Limit result count | `.limit(10)` |
| `offset(n)` | Skip first n results | `.offset(20)` |

Supported operators for `where`:

| Operator | Description |
|----------|-------------|
| `=` | Equals |
| `!=`, `<>` | Not equals |
| `>`, `>=` | Greater than (or equal) |
| `<`, `<=` | Less than (or equal) |
| `in` | Value in array |
| `not in` | Value not in array |
| `like` | SQL-style pattern matching |
| `between` | Between two values |
| `is null` | Is null |
| `is not null` | Is not null |
