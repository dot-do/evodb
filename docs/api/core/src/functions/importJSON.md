[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / importJSON

# Function: importJSON()

> **importJSON**(`db`, `data`, `options`): `Promise`\<`number`\>

Defined in: core/src/import-export.ts:261

Import data from JSON format

## Parameters

### db

[`EvoDB`](../classes/EvoDB.md)

EvoDB instance

### data

`string`

JSON string (must be an array of objects)

### options

[`ImportOptions`](../interfaces/ImportOptions.md)

Import options

## Returns

`Promise`\<`number`\>

Number of rows imported

## Example

```typescript
const json = JSON.stringify([
  { name: 'Alice', email: 'alice@example.com' },
  { name: 'Bob', email: 'bob@example.com' }
]);

const count = await importJSON(db, json, { table: 'users' });
console.log(`Imported ${count} rows`);
```
