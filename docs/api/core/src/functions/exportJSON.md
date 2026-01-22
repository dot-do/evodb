[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / exportJSON

# Function: exportJSON()

> **exportJSON**(`db`, `table`, `options`): `Promise`\<`string`\>

Defined in: core/src/import-export.ts:342

Export table data to JSON format

## Parameters

### db

[`EvoDB`](../classes/EvoDB.md)

EvoDB instance

### table

`string`

Table name to export

### options

[`ExportOptions`](../interfaces/ExportOptions.md) = `{}`

Export options

## Returns

`Promise`\<`string`\>

JSON string (array of objects)

## Example

```typescript
const json = await exportJSON(db, 'users');
const data = JSON.parse(json);
console.log(data);
// [{ name: 'Alice', email: 'alice@example.com' }, ...]
```
