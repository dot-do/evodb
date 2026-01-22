[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / parseJSON

# Function: parseJSON()

> **parseJSON**\<`T`\>(`json`, `schema`): `T`

Defined in: core/src/validation.ts:699

Parse JSON string and validate against a Zod schema

This function provides type-safe JSON parsing by:
1. Parsing the JSON string
2. Validating the result against the provided Zod schema
3. Returning the typed and validated data

## Type Parameters

### T

`T`

## Parameters

### json

`string`

The JSON string to parse

### schema

[`ZodSchemaLike`](../interfaces/ZodSchemaLike.md)\<`T`\>

A Zod schema to validate against

## Returns

`T`

The parsed and validated data

## Throws

If JSON parsing fails

## Throws

If schema validation fails

## Example

```typescript
import { z } from 'zod';
import { parseJSON } from './validation.js';

const ConfigSchema = z.object({
  version: z.number(),
  settings: z.record(z.string()),
});

const config = parseJSON(configJson, ConfigSchema);
// config is typed as { version: number; settings: Record<string, string> }
```
