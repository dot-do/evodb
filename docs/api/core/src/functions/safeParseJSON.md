[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / safeParseJSON

# Function: safeParseJSON()

> **safeParseJSON**\<`T`\>(`json`, `schema`): [`SafeParseJSONResult`](../type-aliases/SafeParseJSONResult.md)\<`T`\>

Defined in: core/src/validation.ts:752

Safely parse JSON string and validate against a Zod schema

Unlike parseJSON, this function never throws. Instead, it returns a result
object indicating success or failure with either the data or error.

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

[`SafeParseJSONResult`](../type-aliases/SafeParseJSONResult.md)\<`T`\>

A result object with either the data or error

## Example

```typescript
import { z } from 'zod';
import { safeParseJSON } from './validation.js';

const ManifestSchema = z.object({
  version: z.number(),
  files: z.array(z.string()),
});

const result = safeParseJSON(manifestJson, ManifestSchema);

if (result.success) {
  console.log(`Found ${result.data.files.length} files`);
} else {
  console.error('Invalid manifest:', result.error.issues);
}
```
