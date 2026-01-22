# Building a TODO App

Learn EvoDB's CRUD operations by building a complete TODO application. This tutorial covers creating, reading, updating, and deleting documents, plus filtering and sorting your todo list.

## Prerequisites

- Completed [First Query in 5 Minutes](./01-first-query.md)
- Node.js 18.0.0 or higher
- TypeScript (recommended)

## What We're Building

A command-line TODO application with the following features:

- Add new todos
- List all todos with filters (completed, pending, by priority)
- Mark todos as complete
- Update todo details
- Delete todos
- Search todos by title

## Step 1: Project Setup

Create a new directory and initialize your project:

```bash
mkdir evodb-todo
cd evodb-todo
npm init -y
npm install @evodb/core
npm install -D typescript tsx @types/node
```

Create a `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["src/**/*"]
}
```

## Step 2: Define the Schema

Create `src/types.ts` to define our TODO interface:

```typescript
/**
 * Todo item structure
 */
export interface Todo {
  _id: string;
  title: string;
  description?: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  dueDate?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Input for creating a new todo (without auto-generated fields)
 */
export type CreateTodoInput = Omit<Todo, '_id' | 'createdAt' | 'updatedAt'>;

/**
 * Input for updating a todo (all fields optional)
 */
export type UpdateTodoInput = Partial<Omit<Todo, '_id' | 'createdAt' | 'updatedAt'>>;
```

## Step 3: Create the Database Module

Create `src/db.ts`:

```typescript
import { EvoDB } from '@evodb/core';

// Create a singleton database instance
export const db = new EvoDB({
  mode: 'development',
});

// Table name constant
export const TODOS_TABLE = 'todos';
```

## Step 4: Implement CRUD Operations

Create `src/todo-service.ts`:

```typescript
import { db, TODOS_TABLE } from './db.js';
import type { Todo, CreateTodoInput, UpdateTodoInput } from './types.js';

/**
 * TodoService handles all CRUD operations for todos
 */
export class TodoService {
  /**
   * Create a new todo
   */
  async create(input: CreateTodoInput): Promise<Todo> {
    const now = new Date().toISOString();

    const [todo] = await db.insert<Todo>(TODOS_TABLE, {
      ...input,
      createdAt: now,
      updatedAt: now,
    });

    return todo;
  }

  /**
   * Get all todos
   */
  async getAll(): Promise<Todo[]> {
    return db.query<Todo>(TODOS_TABLE)
      .orderBy('createdAt', 'desc');
  }

  /**
   * Get a single todo by ID
   */
  async getById(id: string): Promise<Todo | null> {
    const results = await db.query<Todo>(TODOS_TABLE)
      .where('_id', '=', id)
      .limit(1);

    return results[0] ?? null;
  }

  /**
   * Get todos filtered by completion status
   */
  async getByStatus(completed: boolean): Promise<Todo[]> {
    return db.query<Todo>(TODOS_TABLE)
      .where('completed', '=', completed)
      .orderBy('createdAt', 'desc');
  }

  /**
   * Get todos filtered by priority
   */
  async getByPriority(priority: 'low' | 'medium' | 'high'): Promise<Todo[]> {
    return db.query<Todo>(TODOS_TABLE)
      .where('priority', '=', priority)
      .orderBy('createdAt', 'desc');
  }

  /**
   * Search todos by title (case-insensitive pattern matching)
   */
  async searchByTitle(searchTerm: string): Promise<Todo[]> {
    return db.query<Todo>(TODOS_TABLE)
      .where('title', 'like', `%${searchTerm}%`)
      .orderBy('createdAt', 'desc');
  }

  /**
   * Get overdue todos (due date in the past and not completed)
   */
  async getOverdue(): Promise<Todo[]> {
    const now = new Date().toISOString();

    return db.query<Todo>(TODOS_TABLE)
      .where('completed', '=', false)
      .where('dueDate', '<', now)
      .orderBy('dueDate', 'asc');
  }

  /**
   * Update a todo
   */
  async update(id: string, changes: UpdateTodoInput): Promise<Todo | null> {
    const result = await db.update<Todo>(
      TODOS_TABLE,
      { _id: id },
      {
        ...changes,
        updatedAt: new Date().toISOString(),
      },
      { returnDocuments: true }
    );

    return result.documents?.[0] ?? null;
  }

  /**
   * Mark a todo as complete
   */
  async markComplete(id: string): Promise<Todo | null> {
    return this.update(id, { completed: true });
  }

  /**
   * Mark a todo as incomplete
   */
  async markIncomplete(id: string): Promise<Todo | null> {
    return this.update(id, { completed: false });
  }

  /**
   * Toggle todo completion status
   */
  async toggleComplete(id: string): Promise<Todo | null> {
    const todo = await this.getById(id);
    if (!todo) return null;

    return this.update(id, { completed: !todo.completed });
  }

  /**
   * Delete a todo
   */
  async delete(id: string): Promise<boolean> {
    const result = await db.delete<Todo>(TODOS_TABLE, { _id: id });
    return result.deletedCount > 0;
  }

  /**
   * Delete all completed todos
   */
  async deleteCompleted(): Promise<number> {
    const result = await db.delete<Todo>(TODOS_TABLE, { completed: true });
    return result.deletedCount;
  }

  /**
   * Get todo statistics
   */
  async getStats(): Promise<{
    total: number;
    completed: number;
    pending: number;
    byPriority: { low: number; medium: number; high: number };
  }> {
    const all = await this.getAll();

    const completed = all.filter(t => t.completed).length;
    const pending = all.length - completed;

    const byPriority = {
      low: all.filter(t => t.priority === 'low').length,
      medium: all.filter(t => t.priority === 'medium').length,
      high: all.filter(t => t.priority === 'high').length,
    };

    return {
      total: all.length,
      completed,
      pending,
      byPriority,
    };
  }
}

// Export singleton instance
export const todoService = new TodoService();
```

## Step 5: Build the CLI Interface

Create `src/cli.ts`:

```typescript
import { todoService } from './todo-service.js';
import type { Todo } from './types.js';

/**
 * Format a todo for display
 */
function formatTodo(todo: Todo): string {
  const status = todo.completed ? '[x]' : '[ ]';
  const priority = `[${todo.priority.toUpperCase()}]`;
  const dueDate = todo.dueDate ? ` (due: ${todo.dueDate.split('T')[0]})` : '';

  return `${status} ${priority} ${todo.title}${dueDate}`;
}

/**
 * Print a list of todos
 */
function printTodos(todos: Todo[], title: string): void {
  console.log(`\n=== ${title} ===`);
  if (todos.length === 0) {
    console.log('  No todos found.');
  } else {
    todos.forEach((todo, index) => {
      console.log(`  ${index + 1}. ${formatTodo(todo)}`);
      if (todo.description) {
        console.log(`     ${todo.description}`);
      }
    });
  }
  console.log();
}

/**
 * Main application
 */
async function main(): Promise<void> {
  console.log('===========================================');
  console.log('       EvoDB TODO App Tutorial');
  console.log('===========================================\n');

  // CREATE: Add some todos
  console.log('--- Creating todos ---');

  const todo1 = await todoService.create({
    title: 'Learn EvoDB basics',
    description: 'Complete the first query tutorial',
    completed: true,
    priority: 'high',
    tags: ['learning', 'evodb'],
  });
  console.log(`Created: ${todo1.title}`);

  const todo2 = await todoService.create({
    title: 'Build TODO app',
    description: 'Follow the TODO app tutorial',
    completed: false,
    priority: 'high',
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 1 week from now
    tags: ['project', 'evodb'],
  });
  console.log(`Created: ${todo2.title}`);

  const todo3 = await todoService.create({
    title: 'Set up production deployment',
    description: 'Deploy to Cloudflare Workers',
    completed: false,
    priority: 'medium',
    tags: ['deployment'],
  });
  console.log(`Created: ${todo3.title}`);

  const todo4 = await todoService.create({
    title: 'Write documentation',
    completed: false,
    priority: 'low',
  });
  console.log(`Created: ${todo4.title}`);

  const todo5 = await todoService.create({
    title: 'Review EvoDB features',
    completed: false,
    priority: 'medium',
    dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Yesterday (overdue)
  });
  console.log(`Created: ${todo5.title}`);

  // READ: List all todos
  const allTodos = await todoService.getAll();
  printTodos(allTodos, 'All Todos');

  // READ: Filter by status
  const pendingTodos = await todoService.getByStatus(false);
  printTodos(pendingTodos, 'Pending Todos');

  const completedTodos = await todoService.getByStatus(true);
  printTodos(completedTodos, 'Completed Todos');

  // READ: Filter by priority
  const highPriority = await todoService.getByPriority('high');
  printTodos(highPriority, 'High Priority Todos');

  // READ: Search by title
  const searchResults = await todoService.searchByTitle('evodb');
  printTodos(searchResults, 'Search: "evodb"');

  // READ: Get overdue todos
  const overdue = await todoService.getOverdue();
  printTodos(overdue, 'Overdue Todos');

  // UPDATE: Mark a todo as complete
  console.log('--- Updating todos ---');
  const updated = await todoService.markComplete(todo2._id);
  if (updated) {
    console.log(`Marked complete: ${updated.title}`);
  }

  // UPDATE: Change priority
  const priorityUpdated = await todoService.update(todo4._id, {
    priority: 'high',
    description: 'Documentation is important!',
  });
  if (priorityUpdated) {
    console.log(`Updated priority: ${priorityUpdated.title} -> ${priorityUpdated.priority}`);
  }

  // READ: Show updated list
  const updatedTodos = await todoService.getAll();
  printTodos(updatedTodos, 'Updated Todos List');

  // DELETE: Remove a todo
  console.log('--- Deleting todos ---');
  const deleted = await todoService.delete(todo5._id);
  console.log(`Deleted overdue todo: ${deleted ? 'success' : 'failed'}`);

  // STATS: Show statistics
  const stats = await todoService.getStats();
  console.log('\n=== Todo Statistics ===');
  console.log(`  Total: ${stats.total}`);
  console.log(`  Completed: ${stats.completed}`);
  console.log(`  Pending: ${stats.pending}`);
  console.log(`  By Priority:`);
  console.log(`    - High: ${stats.byPriority.high}`);
  console.log(`    - Medium: ${stats.byPriority.medium}`);
  console.log(`    - Low: ${stats.byPriority.low}`);

  // Final list
  const finalTodos = await todoService.getAll();
  printTodos(finalTodos, 'Final Todo List');

  // DELETE: Clean up completed todos
  console.log('--- Cleanup ---');
  const deletedCount = await todoService.deleteCompleted();
  console.log(`Deleted ${deletedCount} completed todo(s)`);

  const remaining = await todoService.getAll();
  printTodos(remaining, 'Remaining Todos');

  console.log('===========================================');
  console.log('       Tutorial Complete!');
  console.log('===========================================');
}

main().catch(console.error);
```

## Step 6: Run the Application

Add a script to `package.json`:

```json
{
  "scripts": {
    "start": "tsx src/cli.ts"
  }
}
```

Run the application:

```bash
npm start
```

Expected output:

```
===========================================
       EvoDB TODO App Tutorial
===========================================

--- Creating todos ---
Created: Learn EvoDB basics
Created: Build TODO app
Created: Set up production deployment
Created: Write documentation
Created: Review EvoDB features

=== All Todos ===
  1. [ ] [MEDIUM] Review EvoDB features (due: 2024-01-14)
  2. [ ] [LOW] Write documentation
  3. [ ] [MEDIUM] Set up production deployment
     Deploy to Cloudflare Workers
  4. [ ] [HIGH] Build TODO app (due: 2024-01-22)
     Follow the TODO app tutorial
  5. [x] [HIGH] Learn EvoDB basics
     Complete the first query tutorial

=== Pending Todos ===
  1. [ ] [MEDIUM] Review EvoDB features (due: 2024-01-14)
  2. [ ] [LOW] Write documentation
  3. [ ] [MEDIUM] Set up production deployment
  4. [ ] [HIGH] Build TODO app (due: 2024-01-22)

...
```

## Understanding the CRUD Operations

### Create

```typescript
// Insert returns an array of inserted documents with generated _id
const [todo] = await db.insert('todos', {
  title: 'My task',
  completed: false,
  priority: 'medium',
  createdAt: new Date().toISOString(),
});
```

### Read

```typescript
// Get all documents
const all = await db.query('todos');

// Filter with where clauses
const pending = await db.query('todos')
  .where('completed', '=', false);

// Multiple filters (AND logic)
const urgentPending = await db.query('todos')
  .where('completed', '=', false)
  .where('priority', '=', 'high');

// Select specific fields
const titles = await db.query('todos')
  .select(['title', 'completed']);

// Sort and limit
const recent = await db.query('todos')
  .orderBy('createdAt', 'desc')
  .limit(10);
```

### Update

```typescript
// Update by filter - returns matched and modified counts
const result = await db.update('todos',
  { _id: 'some-id' },           // filter
  { completed: true }            // changes
);

// Get the updated documents
const resultWithDocs = await db.update('todos',
  { _id: 'some-id' },
  { completed: true },
  { returnDocuments: true }
);
console.log(resultWithDocs.documents); // Updated documents

// Update multiple documents
await db.update('todos',
  { priority: 'low' },           // all low priority todos
  { priority: 'medium' }         // change to medium
);
```

### Delete

```typescript
// Delete by filter
const result = await db.delete('todos', { _id: 'some-id' });
console.log(`Deleted ${result.deletedCount} document(s)`);

// Delete multiple documents
await db.delete('todos', { completed: true });

// Get deleted documents
const deleteResult = await db.delete('todos',
  { _id: 'some-id' },
  { returnDocuments: true }
);
console.log(deleteResult.documents); // Deleted documents
```

## Extending the Application

Here are some ideas for extending this TODO application:

### Add Due Date Reminders

```typescript
async getDueSoon(days: number = 3): Promise<Todo[]> {
  const now = new Date();
  const soon = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  return db.query<Todo>(TODOS_TABLE)
    .where('completed', '=', false)
    .where('dueDate', '>=', now.toISOString())
    .where('dueDate', '<=', soon.toISOString())
    .orderBy('dueDate', 'asc');
}
```

### Add Tag Filtering

```typescript
// Note: Array field querying may vary based on implementation
async getByTag(tag: string): Promise<Todo[]> {
  const all = await this.getAll();
  return all.filter(todo => todo.tags?.includes(tag));
}
```

### Add Pagination

```typescript
async getPaginated(page: number, pageSize: number = 10): Promise<{
  todos: Todo[];
  total: number;
  hasMore: boolean;
}> {
  const result = await db.query<Todo>(TODOS_TABLE)
    .orderBy('createdAt', 'desc')
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .executeWithMeta();

  return {
    todos: result.rows,
    total: result.totalCount,
    hasMore: result.hasMore,
  };
}
```

## What You Learned

In this tutorial, you learned how to:

1. **Structure a project** - Organize code with types, services, and CLI
2. **Create documents** - Use `db.insert()` to add new records
3. **Read documents** - Use `db.query()` with filters, sorting, and limiting
4. **Update documents** - Use `db.update()` with filters and return options
5. **Delete documents** - Use `db.delete()` to remove records
6. **Build a service layer** - Encapsulate database operations in a reusable class

## Next Steps

- [Real-time Chat](./03-realtime-chat.md) - Add real-time subscriptions for live updates
- [Vector Search for RAG](./04-vector-search.md) - Build AI-powered semantic search
- [Getting Started Guide](../GETTING_STARTED.md) - Deep dive into EvoDB configuration
