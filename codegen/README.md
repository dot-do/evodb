# @evodb/codegen

**From Schema to TypeScript**

CLI tool for managing EvoDB schemas. Pull types, push changes, lock versions, diff schemas - all from the command line.

## The Workflow

```
Development                     Production
───────────────                 ──────────────────

1. Write data                   4. Lock schema
   (schema evolves)                evodb lock --env prod
        │                               │
        ▼                               ▼
2. Pull types                   5. Deploy with confidence
   evodb pull                      (types are frozen)
        │                               │
        ▼                               ▼
3. Review diff                  6. Push new versions
   evodb diff                      evodb push --migration
```

**Development**: Schema evolves automatically. Pull types to stay in sync.

**Production**: Lock the schema. TypeScript ensures nothing breaks.

## Installation

```bash
npm install @evodb/codegen
```

## Quick Start

```bash
# Pull schema and generate TypeScript types
npx evodb pull --db users

# Output: .evodb/users.d.ts
```

Generated types:

```typescript
// .evodb/users.d.ts

export interface UsersTable {
  id: number;
  name: string;
  email: string | null;
  created_at: Date;
}

export interface UsersInsert {
  id?: number;           // auto-increment
  name: string;
  email?: string | null;
  created_at?: Date;     // defaults to now()
}
```

## Commands

### pull

Generate TypeScript types from your database schema.

```bash
evodb pull [--db <name>] [--output <path>]
```

```bash
# Pull specific database
evodb pull --db users

# Pull all databases
evodb pull --all

# Custom output path
evodb pull --db users --output src/types/users.d.ts
```

### push

Push schema changes to the database.

```bash
evodb push [--db <name>] [--dry-run]
```

```bash
# Preview changes (recommended)
evodb push --db users --dry-run

# Apply changes
evodb push --db users

# Apply with migration script
evodb push --db users --migration
```

### lock

Lock the schema at its current version.

```bash
evodb lock [--db <name>]
```

Creates `.evodb/<name>.lock` with the schema hash. Any schema changes will require explicit migrations.

```bash
# Lock schema
evodb lock --db users

# Verify lock
evodb lock --db users --verify
```

### diff

Show differences between local types and remote schema.

```bash
evodb diff [--db <name>]
```

Output:
```
Schema diff for 'users':

+ ADD COLUMN age: int32
~ MODIFY COLUMN email: string -> string (nullable)
- DROP COLUMN legacy_field

3 changes detected
```

## Configuration

Create `.evodbrc.json` in your project root:

```json
{
  "databases": {
    "users": {
      "connection": "evodb://localhost:5432/users",
      "output": ".evodb/users.d.ts"
    },
    "analytics": {
      "connection": "evodb://localhost:5432/analytics",
      "output": ".evodb/analytics.d.ts"
    }
  },
  "defaultDb": "users"
}
```

## Programmatic API

```typescript
import { pullCommand, pushCommand, lockCommand, diffCommand } from '@evodb/codegen';

// Pull schema
const pullResult = await pullCommand({
  db: 'users',
  output: '.evodb/users.d.ts',
});
console.log(`Generated types for ${pullResult.tables.length} tables`);

// Push changes (dry run)
const pushResult = await pushCommand({
  db: 'users',
  dryRun: true,
});
console.log(`${pushResult.changes.length} changes would be applied`);

// Lock schema
const lockResult = await lockCommand({
  db: 'users',
});
console.log(`Schema locked with hash: ${lockResult.hash}`);

// Get diff
const diffResult = await diffCommand({
  db: 'users',
});
if (diffResult.hasChanges) {
  for (const change of diffResult.changes) {
    console.log(`${change.type}: ${change.table}.${change.column}`);
  }
}
```

## Type Mapping

EvoDB types map to TypeScript:

| EvoDB Type | TypeScript |
|------------|------------|
| `int32` | `number` |
| `int64` | `bigint` |
| `float32` | `number` |
| `float64` | `number` |
| `string` | `string` |
| `boolean` | `boolean` |
| `timestamp` | `Date` |
| `date` | `Date` |
| `binary` | `Uint8Array` |
| `json` | `unknown` |
| `variant` | `unknown` |

Nullable types become `T | null`.

## Schema Evolution

When schema changes are detected:

```bash
$ evodb diff --db users

Schema diff for 'users':

+ ADD COLUMN preferences: json (nullable)
  └─ Safe: Adding nullable column

~ MODIFY COLUMN score: int32 -> int64
  └─ Safe: Widening integer type

- DROP COLUMN deprecated_field
  └─ Breaking: Column in use by 3 queries

1 breaking change, 2 safe changes
```

### Safe Changes (auto-applied)

- Add nullable column
- Widen type (int32 → int64)
- Make required field optional

### Breaking Changes (require migration)

- Remove column
- Narrow type
- Make optional field required
- Rename column

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

interface SchemaChange {
  type: 'ADD_TABLE' | 'DROP_TABLE' | 'ADD_COLUMN' | 'DROP_COLUMN' | 'MODIFY_COLUMN';
  table: string;
  column?: string;
  before?: ColumnDefinition;
  after?: ColumnDefinition;
  breaking: boolean;
}
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
  breakingChanges: number;
  safeChanges: number;
}
```

## Related Packages

- [@evodb/core](../core) - Schema types and utilities
- [@evodb/lakehouse](../lakehouse) - Schema storage

## License

MIT - Copyright 2026 .do
