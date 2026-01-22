/**
 * EvoDB Basic CRUD Example
 *
 * This example demonstrates fundamental Create, Read, Update, Delete operations
 * using the EvoDB high-level API in a Cloudflare Workers environment.
 *
 * Features demonstrated:
 * - Document insertion with automatic schema evolution
 * - Fluent query building with filters, sorting, and pagination
 * - Update operations with filter matching
 * - Delete operations with filter matching
 * - Schema locking for production mode
 */

import { EvoDB, type EvoDBConfig } from '@evodb/core';

// Define our document types for type safety
interface User {
  _id?: string;
  name: string;
  email: string;
  role?: 'admin' | 'user' | 'guest';
  age?: number;
  createdAt?: string;
}

interface Post {
  _id?: string;
  title: string;
  content: string;
  authorId: string;
  published?: boolean;
  tags?: string[];
  createdAt?: string;
}

// Cloudflare Worker environment bindings
export interface Env {
  // R2 bucket for data persistence (optional for this example)
  DATA_BUCKET?: R2Bucket;
}

/**
 * Initialize EvoDB instance
 *
 * In development mode, schema evolves automatically as you write data.
 * In production mode, you should lock schemas for data integrity.
 */
function createDatabase(env: Env, mode: 'development' | 'production' = 'development'): EvoDB {
  const config: EvoDBConfig = {
    mode,
    // Optionally connect to R2 for persistence
    // storage: env.DATA_BUCKET,
  };

  return new EvoDB(config);
}

/**
 * CREATE: Insert new documents
 *
 * Documents are automatically assigned unique IDs if not provided.
 * Schema evolves automatically to accommodate new fields.
 */
async function createExamples(db: EvoDB): Promise<void> {
  console.log('\n=== CREATE Operations ===\n');

  // Insert a single user
  const [alice] = await db.insert<User>('users', {
    name: 'Alice Johnson',
    email: 'alice@example.com',
    role: 'admin',
    age: 28,
    createdAt: new Date().toISOString(),
  });
  console.log('Created user:', alice);

  // Insert multiple users at once (batch insert)
  const newUsers = await db.insert<User>('users', [
    { name: 'Bob Smith', email: 'bob@example.com', role: 'user', age: 34 },
    { name: 'Carol White', email: 'carol@example.com', role: 'user', age: 25 },
    { name: 'David Brown', email: 'david@example.com', role: 'guest', age: 42 },
  ]);
  console.log(`Created ${newUsers.length} users in batch`);

  // Insert posts with foreign key reference
  await db.insert<Post>('posts', [
    {
      title: 'Getting Started with EvoDB',
      content: 'EvoDB is a schema-evolving database for the edge...',
      authorId: alice._id!,
      published: true,
      tags: ['evodb', 'tutorial', 'cloudflare'],
      createdAt: new Date().toISOString(),
    },
    {
      title: 'Advanced Query Patterns',
      content: 'Learn how to use complex filters and aggregations...',
      authorId: alice._id!,
      published: false,
      tags: ['evodb', 'advanced'],
      createdAt: new Date().toISOString(),
    },
  ]);
  console.log('Created posts');
}

/**
 * READ: Query documents with filters, sorting, and pagination
 *
 * The fluent query builder supports:
 * - Multiple filter conditions (WHERE)
 * - Column projection (SELECT)
 * - Sorting (ORDER BY)
 * - Pagination (LIMIT/OFFSET)
 * - Aggregations (COUNT, SUM, AVG, MIN, MAX)
 */
async function readExamples(db: EvoDB): Promise<void> {
  console.log('\n=== READ Operations ===\n');

  // Simple query - get all users
  const allUsers = await db.query<User>('users').execute();
  console.log(`Total users: ${allUsers.length}`);

  // Filter by exact match
  const admins = await db.query<User>('users')
    .where('role', '=', 'admin')
    .execute();
  console.log(`Admin users: ${admins.length}`);

  // Multiple filters (AND condition)
  const youngUsers = await db.query<User>('users')
    .where('role', '=', 'user')
    .where('age', '<', 30)
    .execute();
  console.log(`Young regular users: ${youngUsers.length}`);

  // Projection - select specific columns
  const userEmails = await db.query<Pick<User, 'name' | 'email'>>('users')
    .select(['name', 'email'])
    .execute();
  console.log('User emails:', userEmails.map(u => u.email));

  // Sorting
  const sortedByAge = await db.query<User>('users')
    .orderBy('age', 'desc')
    .execute();
  console.log('Users by age (desc):', sortedByAge.map(u => `${u.name}: ${u.age}`));

  // Pagination
  const page1 = await db.query<User>('users')
    .orderBy('name', 'asc')
    .limit(2)
    .offset(0)
    .execute();
  console.log('Page 1 (2 users):', page1.map(u => u.name));

  const page2 = await db.query<User>('users')
    .orderBy('name', 'asc')
    .limit(2)
    .offset(2)
    .execute();
  console.log('Page 2 (2 users):', page2.map(u => u.name));

  // Query with metadata (total count, hasMore)
  const result = await db.query<User>('users')
    .limit(2)
    .executeWithMeta();
  console.log(`Returned ${result.rows.length} of ${result.totalCount} users, hasMore: ${result.hasMore}`);

  // Aggregations
  const countResult = await db.query<{ total: number }>('users')
    .aggregate('count', null, 'total')
    .execute();
  console.log('User count:', countResult[0]?.total);

  // Group by with aggregation
  const roleStats = await db.query<{ role: string; count: number }>('users')
    .aggregate('count', null, 'count')
    .groupBy(['role'])
    .execute();
  console.log('Users by role:', roleStats);
}

/**
 * UPDATE: Modify existing documents
 *
 * Updates match documents using a filter object and apply changes.
 * Supports partial updates (only specified fields are changed).
 */
async function updateExamples(db: EvoDB): Promise<void> {
  console.log('\n=== UPDATE Operations ===\n');

  // Update by exact field match
  const updateResult = await db.update<User>(
    'users',
    { name: 'Bob Smith' },      // Filter: find Bob
    { role: 'admin', age: 35 }, // Changes: promote and update age
  );
  console.log(`Updated ${updateResult.modifiedCount} user(s)`);

  // Update with returnDocuments option to see the changes
  const updateWithDocs = await db.update<User>(
    'users',
    { role: 'guest' },
    { role: 'user' },
    { returnDocuments: true },
  );
  console.log('Promoted guests to users:', updateWithDocs.documents?.map(u => u.name));

  // Update multiple documents matching a filter
  const bulkUpdate = await db.update<User>(
    'users',
    { role: 'user' },
    { updatedAt: new Date().toISOString() },
  );
  console.log(`Added timestamp to ${bulkUpdate.modifiedCount} users`);
}

/**
 * DELETE: Remove documents
 *
 * Deletes match documents using a filter object.
 * Supports returning deleted documents for confirmation.
 */
async function deleteExamples(db: EvoDB): Promise<void> {
  console.log('\n=== DELETE Operations ===\n');

  // First, add some test data to delete
  await db.insert<User>('users', [
    { name: 'Test User 1', email: 'test1@example.com', role: 'guest' },
    { name: 'Test User 2', email: 'test2@example.com', role: 'guest' },
  ]);

  // Delete by filter with returnDocuments
  const deleteResult = await db.delete<User>(
    'users',
    { name: 'Test User 1' },
    { returnDocuments: true },
  );
  console.log(`Deleted ${deleteResult.deletedCount} user(s):`, deleteResult.documents?.map(u => u.name));

  // Delete multiple matching documents
  const bulkDelete = await db.delete<User>(
    'users',
    { role: 'guest' },
  );
  console.log(`Deleted ${bulkDelete.deletedCount} guest user(s)`);

  // Verify deletion
  const remainingUsers = await db.query<User>('users').execute();
  console.log(`Remaining users: ${remainingUsers.length}`);
}

/**
 * SCHEMA MANAGEMENT: Lock schemas for production
 *
 * In production mode, locked schemas enforce data integrity.
 * Writes that don't conform to the schema will be rejected.
 */
async function schemaExamples(db: EvoDB): Promise<void> {
  console.log('\n=== Schema Management ===\n');

  // Infer schema from existing data
  const inferredSchema = await db.schema.infer('users');
  console.log('Inferred schema:', inferredSchema);

  // Lock schema for production (only enforced in production mode)
  await db.schema.lock('users', {
    name: { type: 'string', required: true, minLength: 1, maxLength: 100 },
    email: { type: 'string', required: true, format: 'email' },
    role: { type: 'string', enum: ['admin', 'user', 'guest'] },
    age: { type: 'number', min: 0, max: 150 },
    createdAt: { type: 'string', format: 'iso-datetime' },
  });
  console.log('Schema locked for users table');

  // Define relationships between tables
  await db.schema.relate('posts.authorId', 'users', {
    type: 'one-to-many',
    onDelete: 'cascade',
  });
  console.log('Relationship defined: posts.authorId -> users');
}

/**
 * Main entry point - demonstrates all CRUD operations
 */
async function runAllExamples(): Promise<string> {
  // Create database in development mode
  const db = createDatabase({}, 'development');

  try {
    // Run all CRUD examples
    await createExamples(db);
    await readExamples(db);
    await updateExamples(db);
    await deleteExamples(db);
    await schemaExamples(db);

    return 'All CRUD examples completed successfully!';
  } catch (error) {
    console.error('Error running examples:', error);
    throw error;
  }
}

// Cloudflare Worker fetch handler
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Run examples on GET /
    if (url.pathname === '/' && request.method === 'GET') {
      try {
        const result = await runAllExamples();
        return new Response(result, {
          headers: { 'Content-Type': 'text/plain' },
        });
      } catch (error) {
        return new Response(`Error: ${error}`, { status: 500 });
      }
    }

    return new Response('Not Found', { status: 404 });
  },
};
