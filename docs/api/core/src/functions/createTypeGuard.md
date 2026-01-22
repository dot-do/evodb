[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / createTypeGuard

# Function: createTypeGuard()

> **createTypeGuard**\<`T`\>(`schema`): (`value`) => `value is T`

Defined in: core/src/validation.ts:894

Create a type guard function from a Zod schema

This is useful for creating reusable type guards that can be used
with TypeScript's type narrowing.

## Type Parameters

### T

`T`

## Parameters

### schema

[`ZodSchemaLike`](../interfaces/ZodSchemaLike.md)\<`T`\>

A Zod schema to create a guard for

## Returns

A type guard function

> (`value`): `value is T`

### Parameters

#### value

`unknown`

### Returns

`value is T`

## Example

```typescript
import { z } from 'zod';
import { createTypeGuard } from './validation.js';

const UserSchema = z.object({ name: z.string(), age: z.number() });
const isUser = createTypeGuard(UserSchema);

function processValue(value: unknown) {
  if (isUser(value)) {
    // value is typed as { name: string; age: number } here
    console.log(value.name);
  }
}
```
