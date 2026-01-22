# TypeScript Guide

This guide documents TypeScript patterns, strict mode configuration, and best practices used in the EvoDB codebase.

## Table of Contents

- [Discriminated Union Patterns](#discriminated-union-patterns)
- [Strict Mode Configuration](#strict-mode-configuration)
- [Exhaustiveness Checking with assertNever](#exhaustiveness-checking-with-assertnever)

---

## Discriminated Union Patterns

Discriminated unions (also known as tagged unions) are a powerful TypeScript pattern for modeling data that can take multiple forms. They use a common "discriminant" property to enable type narrowing in control flow.

### Basic Pattern

A discriminated union has:
1. A **discriminant property** - a literal type shared by all variants (commonly `type` or `kind`)
2. **Variant-specific properties** - each variant can have its own shape

### Current Usage in EvoDB

#### Transaction Operations

From `core/src/transactions.ts`:

```typescript
// Discriminant type
export type OperationType = 'insert' | 'update' | 'delete';

// Discriminated union
export interface TransactionOperation {
  /** Type of operation - the discriminant */
  type: OperationType;
  /** Target table name */
  table: string;
  /** Primary key for update/delete operations */
  key?: string;
  /** Data for insert/update operations */
  data: Record<string, unknown>;
}
```

Usage with type narrowing:

```typescript
function applyOperation(op: TransactionOperation): void {
  switch (op.type) {
    case 'insert':
      // TypeScript knows this is an insert operation
      await this.insert(op.table, op.data);
      break;
    case 'update':
      // TypeScript knows key may be needed for updates
      if (op.key) {
        await this.update(op.table, { _id: op.key }, op.data);
      }
      break;
    case 'delete':
      if (op.key) {
        await this.delete(op.table, { _id: op.key });
      }
      break;
  }
}
```

#### Schema Change Events

From `core/src/__tests__/exhaustiveness.unit.test.ts`:

```typescript
type SchemaChange =
  | { type: 'add_column'; column: string }
  | { type: 'drop_column'; columnName: string }
  | { type: 'rename_column'; oldName: string; newName: string };

function describeSchemaChange(change: SchemaChange): string {
  switch (change.type) {
    case 'add_column':
      return `Add column: ${change.column}`;
    case 'drop_column':
      return `Drop column: ${change.columnName}`;
    case 'rename_column':
      return `Rename column: ${change.oldName} -> ${change.newName}`;
    default:
      return assertNever(change, 'Unhandled schema change type');
  }
}
```

#### WAL Operations

From `core/src/types.ts`:

```typescript
export type RpcWalOperation = 'INSERT' | 'UPDATE' | 'DELETE';

export interface RpcWalEntry<T = unknown> {
  sequence: number;
  timestamp: number;
  operation: RpcWalOperation;  // discriminant
  table: string;
  rowId: string;
  before?: T;  // present for UPDATE/DELETE
  after?: T;   // present for INSERT/UPDATE
}
```

#### Table Column Types (Complex Discriminated Union)

From `core/src/types.ts`:

```typescript
export type TableColumnType =
  | 'null'
  | 'boolean'
  | 'int32'
  | 'int64'
  | 'float64'
  | 'string'
  | 'binary'
  | 'timestamp'
  | 'date'
  | 'uuid'
  | 'json'
  | { type: 'array'; elementType: TableColumnType }
  | { type: 'map'; keyType: TableColumnType; valueType: TableColumnType }
  | { type: 'struct'; fields: TableSchemaColumn[] };
```

This is a recursive discriminated union where primitive types are strings, and complex types are objects with a `type` discriminant.

### Best Practices for Type Narrowing

#### 1. Use `switch` statements for exhaustiveness

```typescript
function handleType(type: Type): string {
  switch (type) {
    case Type.Null: return 'null';
    case Type.Bool: return 'boolean';
    case Type.Int32: return 'int32';
    // ... all cases
    default:
      return assertNever(type, `Unhandled type: ${type}`);
  }
}
```

#### 2. Use type guards for runtime validation

```typescript
// Type guard for discriminated unions
function isAddColumn(change: SchemaChange): change is { type: 'add_column'; column: string } {
  return change.type === 'add_column';
}

// Usage
if (isAddColumn(change)) {
  console.log(change.column); // TypeScript knows `column` exists
}
```

#### 3. Prefer `in` operator for property checks

```typescript
interface InsertOp { type: 'insert'; data: unknown[] }
interface UpdateOp { type: 'update'; id: string; data: unknown }

type Operation = InsertOp | UpdateOp;

function handle(op: Operation) {
  if ('id' in op) {
    // TypeScript narrows to UpdateOp
    console.log(op.id);
  }
}
```

#### 4. Use `typeof` and `Array.isArray` for primitives

```typescript
function processColumnType(type: TableColumnType): void {
  if (typeof type === 'string') {
    // Primitive column type
    console.log(`Primitive: ${type}`);
  } else {
    // Complex column type (array, map, struct)
    switch (type.type) {
      case 'array':
        processColumnType(type.elementType);
        break;
      case 'map':
        processColumnType(type.keyType);
        processColumnType(type.valueType);
        break;
      case 'struct':
        type.fields.forEach(f => processColumnType(f.type));
        break;
    }
  }
}
```

---

## Strict Mode Configuration

EvoDB uses TypeScript's strictest configuration to maximize type safety and catch errors at compile time.

### tsconfig.base.json Settings

The base configuration in `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitAny": true,
    "noImplicitThis": true,
    "useUnknownInCatchVariables": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  }
}
```

### Why Each Strict Option is Enabled

#### Core Strict Mode (`strict: true`)

Enables all strict type-checking options as a baseline. Individual options below are explicitly set for documentation and to prevent accidental override.

#### `strictNullChecks: true`

**Purpose**: Prevents `null` and `undefined` from being assignable to other types unless explicitly declared.

**Why it matters**: Catches null reference errors at compile time.

```typescript
// Without strictNullChecks - compiles but crashes at runtime
function getLength(str: string) {
  return str.length;
}
getLength(null); // Runtime error!

// With strictNullChecks - compile error
function getLength(str: string | null) {
  if (str === null) return 0;
  return str.length; // Safe - TypeScript knows str is string here
}
```

#### `strictFunctionTypes: true`

**Purpose**: Enables stricter checking of function parameter types (contravariance).

**Why it matters**: Prevents subtle bugs with callback functions.

```typescript
type Handler = (e: MouseEvent) => void;

// Without strictFunctionTypes - dangerous!
const handler: Handler = (e: Event) => { /* ... */ };

// With strictFunctionTypes - compile error
// MouseEvent is a subtype of Event, but handlers should accept MouseEvent
```

#### `strictBindCallApply: true`

**Purpose**: Ensures correct types for `bind`, `call`, and `apply` methods.

**Why it matters**: Catches incorrect function invocations.

```typescript
function greet(name: string): string {
  return `Hello, ${name}`;
}

// With strictBindCallApply
greet.call(undefined, 42); // Error: number is not assignable to string
```

#### `strictPropertyInitialization: true`

**Purpose**: Ensures class properties are initialized in the constructor.

**Why it matters**: Prevents accessing undefined properties.

```typescript
class User {
  name: string; // Error: not initialized

  constructor() {
    // Must initialize `name` here
  }
}

// Correct patterns:
class User {
  name: string;
  constructor(name: string) {
    this.name = name;
  }
}

// Or with definite assignment assertion (use sparingly)
class User {
  name!: string; // Tells TS "I'll initialize this elsewhere"
}
```

#### `noImplicitAny: true`

**Purpose**: Requires explicit type annotations when TypeScript cannot infer the type.

**Why it matters**: Prevents accidental `any` types from weakening type safety.

```typescript
// Without noImplicitAny
function process(data) { // data is implicitly `any`
  return data.foo; // No error, but unsafe
}

// With noImplicitAny - must be explicit
function process(data: unknown): unknown {
  if (typeof data === 'object' && data && 'foo' in data) {
    return data.foo;
  }
  return undefined;
}
```

#### `noImplicitThis: true`

**Purpose**: Requires explicit `this` type in functions where TypeScript cannot infer it.

**Why it matters**: Prevents bugs with `this` context in callbacks.

```typescript
// Without noImplicitThis
class Button {
  onClick() {
    setTimeout(function() {
      this.doSomething(); // `this` is any - dangerous!
    }, 100);
  }
}

// With noImplicitThis - use arrow functions or explicit this
class Button {
  onClick() {
    setTimeout(() => {
      this.doSomething(); // Arrow functions preserve `this`
    }, 100);
  }
}
```

#### `useUnknownInCatchVariables: true`

**Purpose**: Types `catch` clause variables as `unknown` instead of `any`.

**Why it matters**: Forces proper error handling with type checks.

```typescript
try {
  riskyOperation();
} catch (error) {
  // With useUnknownInCatchVariables, error is `unknown`
  if (error instanceof Error) {
    console.log(error.message); // Safe
  } else {
    console.log('Unknown error:', error);
  }
}
```

#### `noUnusedLocals: true` and `noUnusedParameters: true`

**Purpose**: Reports errors on unused local variables and parameters.

**Why it matters**: Keeps code clean and catches forgotten refactoring.

```typescript
function calculate(a: number, b: number) { // Error if b is unused
  return a * 2;
}

// If parameter is intentionally unused, prefix with underscore
function calculate(a: number, _b: number) {
  return a * 2;
}
```

#### `noImplicitReturns: true`

**Purpose**: Ensures all code paths in a function return a value.

**Why it matters**: Catches missing return statements.

```typescript
// Error with noImplicitReturns
function getValue(condition: boolean): string {
  if (condition) {
    return 'yes';
  }
  // Missing return for else branch!
}

// Correct
function getValue(condition: boolean): string {
  if (condition) {
    return 'yes';
  }
  return 'no';
}
```

#### `noFallthroughCasesInSwitch: true`

**Purpose**: Reports errors for switch cases that fall through without `break` or `return`.

**Why it matters**: Prevents accidental fallthrough bugs.

```typescript
// Error with noFallthroughCasesInSwitch
switch (status) {
  case 'pending':
    console.log('Pending');
    // Missing break - falls through!
  case 'active':
    console.log('Active');
    break;
}

// Intentional fallthrough - use comment
switch (status) {
  case 'pending':
  case 'active': // Intentional grouping
    console.log('In progress');
    break;
}
```

### Maintaining Type Safety

#### 1. Avoid `any` - use `unknown` instead

```typescript
// Bad
function parse(json: string): any {
  return JSON.parse(json);
}

// Good
function parse(json: string): unknown {
  return JSON.parse(json);
}

// Better - with type guard
function parseUser(json: string): User | null {
  const data: unknown = JSON.parse(json);
  if (isUser(data)) {
    return data;
  }
  return null;
}
```

#### 2. Use type assertions sparingly and document them

```typescript
// Avoid when possible
const data = response as UserData;

// Better - validate first
if (isUserData(response)) {
  const data = response; // Type narrowed automatically
}

// If assertion is necessary, document why
// SAFETY: Response validated by API schema (see api/schema/user.ts)
const data = response as UserData;
```

#### 3. Leverage branded types for domain safety

```typescript
// From EvoDB - prevents mixing up IDs
type BlockId = Brand<string, 'BlockId'>;
type TableId = Brand<string, 'TableId'>;

function loadBlock(id: BlockId): Promise<Block>;
function loadTable(id: TableId): Promise<Table>;

// Compile error: cannot pass TableId where BlockId expected
loadBlock(tableId); // Error!
```

---

## Exhaustiveness Checking with assertNever

The `assertNever` helper ensures all cases of a discriminated union are handled at compile time.

### Import

```typescript
import { assertNever } from '@evodb/core';
// or
import { assertNever } from '@evodb/core/types';
```

### Function Signature

```typescript
/**
 * Assert that a value is of type `never` at compile time.
 * Used in switch statements to ensure all cases are handled.
 */
export function assertNever(value: never, message?: string): never {
  throw new Error(message ?? `Unexpected value: ${JSON.stringify(value)}`);
}
```

### Usage Examples

#### With Enums

```typescript
import { Type, assertNever } from '@evodb/core';

function getTypeName(type: Type): string {
  switch (type) {
    case Type.Null: return 'null';
    case Type.Bool: return 'boolean';
    case Type.Int32: return 'int32';
    case Type.Int64: return 'int64';
    case Type.Float64: return 'float64';
    case Type.String: return 'string';
    case Type.Binary: return 'binary';
    case Type.Array: return 'array';
    case Type.Object: return 'object';
    case Type.Timestamp: return 'timestamp';
    case Type.Date: return 'date';
    default:
      // If a new Type is added, TypeScript will error here
      // because `type` won't be assignable to `never`
      return assertNever(type, `Unhandled type: ${type}`);
  }
}
```

#### With String Literal Unions

```typescript
type Status = 'pending' | 'active' | 'completed' | 'cancelled';

function getStatusColor(status: Status): string {
  switch (status) {
    case 'pending': return 'yellow';
    case 'active': return 'blue';
    case 'completed': return 'green';
    case 'cancelled': return 'red';
    default:
      return assertNever(status, `Unknown status: ${status}`);
  }
}
```

#### With Discriminated Unions

```typescript
type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function handleResult<T>(result: Result<T>): T {
  if (result.success) {
    return result.data;
  } else {
    throw new Error(result.error);
  }
  // Note: No need for assertNever here because if/else is exhaustive
}

// For more complex unions, use switch:
type Event =
  | { kind: 'insert'; data: unknown }
  | { kind: 'update'; id: string; data: unknown }
  | { kind: 'delete'; id: string };

function processEvent(event: Event): void {
  switch (event.kind) {
    case 'insert':
      handleInsert(event.data);
      break;
    case 'update':
      handleUpdate(event.id, event.data);
      break;
    case 'delete':
      handleDelete(event.id);
      break;
    default:
      assertNever(event, 'Unhandled event kind');
  }
}
```

### How It Works

1. When all cases of a union are handled in a switch statement, TypeScript narrows the type in the `default` case to `never`
2. The `assertNever` function accepts only `never` type
3. If you add a new case to the union but forget to handle it, TypeScript will error because the type won't be `never` anymore

### Compile-Time Safety

```typescript
// If we add a new operation type:
type Operation = 'read' | 'write' | 'delete' | 'admin'; // Added 'admin'

function handleOp(op: Operation): void {
  switch (op) {
    case 'read': /* ... */ break;
    case 'write': /* ... */ break;
    case 'delete': /* ... */ break;
    default:
      // TypeScript error: Argument of type 'string' is not assignable
      // to parameter of type 'never'.
      // The type 'admin' was not handled!
      assertNever(op);
  }
}
```

### Runtime Safety

Even though the primary purpose is compile-time checking, `assertNever` also provides runtime safety by throwing an error if an unexpected value reaches it (useful when data comes from external sources):

```typescript
const operation = getOperationFromAPI(); // Could be anything at runtime

switch (operation) {
  case 'read': /* ... */ break;
  case 'write': /* ... */ break;
  default:
    // Throws: "Unexpected value: \"unknown_op\""
    assertNever(operation as never, `Unknown operation: ${operation}`);
}
```

---

## See Also

- [Getting Started Guide](./GETTING_STARTED.md) - Project setup and basics
- [Security Guide](./SECURITY.md) - Security best practices
- [Performance Guide](./PERFORMANCE.md) - Optimization techniques
