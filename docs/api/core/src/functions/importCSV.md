[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / importCSV

# Function: importCSV()

> **importCSV**(`db`, `data`, `options`): `Promise`\<`number`\>

Defined in: core/src/import-export.ts:220

Import data from CSV format

## Parameters

### db

[`EvoDB`](../classes/EvoDB.md)

EvoDB instance

### data

`string`

CSV string data

### options

[`ImportOptions`](../interfaces/ImportOptions.md)

Import options

## Returns

`Promise`\<`number`\>

Number of rows imported

## Example

```typescript
const csv = `name,email
Alice,alice@example.com
Bob,bob@example.com`;

const count = await importCSV(db, csv, { table: 'users' });
console.log(`Imported ${count} rows`);
```
