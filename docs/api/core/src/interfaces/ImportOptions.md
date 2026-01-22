[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / ImportOptions

# Interface: ImportOptions

Defined in: core/src/import-export.ts:19

Options for import operations

## Properties

### table

> **table**: `string`

Defined in: core/src/import-export.ts:21

Target table name

***

### batchSize?

> `optional` **batchSize**: `number`

Defined in: core/src/import-export.ts:23

Number of rows to process in each batch (default: 100)

***

### onProgress()?

> `optional` **onProgress**: (`count`) => `void`

Defined in: core/src/import-export.ts:25

Callback function called with the count of processed rows

#### Parameters

##### count

`number`

#### Returns

`void`
