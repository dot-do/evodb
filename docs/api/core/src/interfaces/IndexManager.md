[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / IndexManager

# Interface: IndexManager

Defined in: core/src/indexes.ts:119

Interface for managing secondary indexes

## Methods

### createIndex()

> **createIndex**(`table`, `columns`, `options?`): `Promise`\<`void`\>

Defined in: core/src/indexes.ts:126

Create a new index on a table

#### Parameters

##### table

`string`

Table name

##### columns

`string`[]

Columns to index (order matters for composite indexes)

##### options?

[`IndexOptions`](IndexOptions.md)

Index creation options

#### Returns

`Promise`\<`void`\>

***

### dropIndex()

> **dropIndex**(`table`, `indexName`, `options?`): `Promise`\<`void`\>

Defined in: core/src/indexes.ts:134

Drop an existing index

#### Parameters

##### table

`string`

Table name

##### indexName

`string`

Name of the index to drop

##### options?

[`DropIndexOptions`](DropIndexOptions.md)

Drop options (e.g., ifExists)

#### Returns

`Promise`\<`void`\>

***

### listIndexes()

> **listIndexes**(`table`): `Promise`\<[`IndexMetadata`](IndexMetadata.md)[]\>

Defined in: core/src/indexes.ts:141

List all indexes for a table

#### Parameters

##### table

`string`

Table name

#### Returns

`Promise`\<[`IndexMetadata`](IndexMetadata.md)[]\>

Array of index metadata

***

### getQueryPlan()

> **getQueryPlan**(`table`, `filter`): [`QueryPlan`](QueryPlan.md)

Defined in: core/src/indexes.ts:149

Get query execution plan showing if/how indexes will be used

#### Parameters

##### table

`string`

Table name

##### filter

`Record`\<`string`, `unknown`\>

Query filter conditions

#### Returns

[`QueryPlan`](QueryPlan.md)

Query plan with index usage information

***

### onInsert()

> **onInsert**(`table`, `row`): `void`

Defined in: core/src/indexes.ts:156

Hook called when a row is inserted

#### Parameters

##### table

`string`

Table name

##### row

`Record`\<`string`, `unknown`\>

The inserted row data including id

#### Returns

`void`

***

### onBulkInsert()

> **onBulkInsert**(`table`, `rows`): `void`

Defined in: core/src/indexes.ts:163

Hook called when multiple rows are inserted

#### Parameters

##### table

`string`

Table name

##### rows

`Record`\<`string`, `unknown`\>[]

Array of inserted rows

#### Returns

`void`

***

### onUpdate()

> **onUpdate**(`table`, `rowId`, `oldValues`, `newValues`): `void`

Defined in: core/src/indexes.ts:172

Hook called when a row is updated

#### Parameters

##### table

`string`

Table name

##### rowId

`string`

ID of the updated row

##### oldValues

`Record`\<`string`, `unknown`\>

Previous values of changed columns

##### newValues

`Record`\<`string`, `unknown`\>

New values of changed columns

#### Returns

`void`

***

### onDelete()

> **onDelete**(`table`, `rowId`, `row`): `void`

Defined in: core/src/indexes.ts:185

Hook called when a row is deleted

#### Parameters

##### table

`string`

Table name

##### rowId

`string`

ID of the deleted row

##### row

`Record`\<`string`, `unknown`\>

The deleted row data

#### Returns

`void`

***

### getIndexEntries()

> **getIndexEntries**(`table`, `indexName`): [`IndexEntry`](IndexEntry.md)[]

Defined in: core/src/indexes.ts:193

Get all entries in an index (for testing/debugging)

#### Parameters

##### table

`string`

Table name

##### indexName

`string`

Index name

#### Returns

[`IndexEntry`](IndexEntry.md)[]

Array of index entries

***

### getIndexStats()

> **getIndexStats**(`table`, `indexName`): [`IndexStats`](IndexStats.md)

Defined in: core/src/indexes.ts:201

Get statistics for an index

#### Parameters

##### table

`string`

Table name

##### indexName

`string`

Index name

#### Returns

[`IndexStats`](IndexStats.md)

Index statistics
