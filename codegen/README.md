# @evodb/codegen

CLI tool for EvoDB schema code generation.

## Installation

```bash
npm install @evodb/codegen
```

## Overview

Generate TypeScript type definitions from EvoDB database schemas:

- **Pull**: Generate `.evodb/[db].d.ts` from schema
- **Push**: Push schema changes to database
- **Lock**: Lock schema at current version
- **Diff**: Show schema differences

## Quick Start

```bash
# Generate types from database schema
npx evodb pull --db users

# Push schema changes
npx evodb push --db users

# Lock schema version
npx evodb lock --db users

# Show schema diff
npx evodb diff --db users
```

## Commands

### Pull

Generate TypeScript definitions from database schema.

```bash
evodb pull [--db <name>]
```

Output: `.evodb/<name>.d.ts`

```typescript
// .evodb/users.d.ts (generated)
export interface UsersTable {
  id: number;
  name: string;
  email: string | null;
  created_at: Date;
}

export interface UsersInsert {
  id?: number;  // auto-increment
  name: string;
  email?: string | null;
  created_at?: Date;
}
```

### Push

Push schema changes to the database.

```bash
evodb push [--db <name>]
```

This will:
1. Compare local schema with remote
2. Generate migration SQL
3. Apply changes (with confirmation)

### Lock

Lock schema at current version (prevent accidental changes).

```bash
evodb lock [--db <name>]
```

Creates `.evodb/<name>.lock` with schema hash.

### Diff

Show differences between local and remote schemas.

```bash
evodb diff [--db <name>]
```

Output:
```
Schema diff for 'users':
+ ADD COLUMN age: int32
~ MODIFY COLUMN email: string -> string (nullable)
- DROP COLUMN legacy_field
```

## API Reference

### Types

```typescript
interface ColumnDefinition {
  name: string;
  type: SqlType;
  nullable: boolean;
  default?: unknown;
  primaryKey?: boolean;
  autoIncrement?: boolean;
}

interface TableDefinition {
  name: string;
  columns: ColumnDefinition[];
  primaryKey?: string[];
  indexes?: IndexDefinition[];
}

interface Schema {
  tables: TableDefinition[];
  version: number;
}

interface SchemaLock {
  hash: string;
  version: number;
  lockedAt: Date;
}

interface SchemaChange {
  type: ChangeType;
  table: string;
  column?: string;
  before?: ColumnDefinition;
  after?: ColumnDefinition;
}

type ChangeType = 'ADD_TABLE' | 'DROP_TABLE' | 'ADD_COLUMN' | 'DROP_COLUMN' | 'MODIFY_COLUMN';
```

### SQL Types

```typescript
type SqlType =
  | 'int32'
  | 'int64'
  | 'float32'
  | 'float64'
  | 'string'
  | 'boolean'
  | 'timestamp'
  | 'date'
  | 'binary'
  | 'json';
```

### Programmatic Usage

```typescript
import {
  pullCommand,
  pushCommand,
  lockCommand,
  diffCommand,
} from '@evodb/codegen';

// Pull schema
const result = await pullCommand({
  db: 'users',
  output: '.evodb/users.d.ts',
});

// Push changes
const pushResult = await pushCommand({
  db: 'users',
  dryRun: true, // Preview only
});

// Lock schema
const lockResult = await lockCommand({
  db: 'users',
});

// Get diff
const diffResult = await diffCommand({
  db: 'users',
});
console.log(diffResult.changes);
```

### Command Results

```typescript
interface PullResult {
  success: boolean;
  outputPath: string;
  tables: string[];
  generatedAt: Date;
}

interface PushResult {
  success: boolean;
  changes: SchemaChange[];
  appliedAt?: Date;
  dryRun: boolean;
}

interface LockResult {
  success: boolean;
  hash: string;
  lockPath: string;
}

interface DiffResult {
  changes: SchemaChange[];
  hasChanges: boolean;
}
```

## Configuration

Create `.evodbrc.json` in project root:

```json
{
  "databases": {
    "users": {
      "connection": "evodb://localhost:5432/users",
      "output": ".evodb/users.d.ts"
    }
  },
  "defaultDb": "users"
}
```

## Related Packages

- `@evodb/core` - Core types and encoding
- `@evodb/lakehouse` - Schema management

## License

MIT
