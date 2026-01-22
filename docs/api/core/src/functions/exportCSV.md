[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / exportCSV

# Function: exportCSV()

> **exportCSV**(`db`, `table`, `options`): `Promise`\<`string`\>

Defined in: core/src/import-export.ts:315

Export table data to CSV format

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

CSV string

## Example

```typescript
const csv = await exportCSV(db, 'users');
console.log(csv);
// name,email
// Alice,alice@example.com
// Bob,bob@example.com
```
