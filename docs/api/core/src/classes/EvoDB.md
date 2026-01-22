[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / EvoDB

# Class: EvoDB

Defined in: [core/src/evodb.ts:605](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L605)

EvoDB - The Schema-Evolving Database for the Edge

Main entry point for all database operations.

## Constructors

### Constructor

> **new EvoDB**(`config`): `EvoDB`

Defined in: [core/src/evodb.ts:618](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L618)

#### Parameters

##### config

[`EvoDBConfig`](../interfaces/EvoDBConfig.md)

#### Returns

`EvoDB`

## Properties

### schema

> `readonly` **schema**: [`SchemaManager`](SchemaManager.md)

Defined in: [core/src/evodb.ts:616](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L616)

Schema management operations

## Methods

### insert()

> **insert**\<`T`\>(`table`, `data`): `Promise`\<`T`[]\>

Defined in: [core/src/evodb.ts:651](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L651)

Insert documents into a table

In development mode, schema evolves automatically.
In production mode with locked schema, data is validated.

#### Type Parameters

##### T

`T` *extends* `Record`\<`string`, `unknown`\>

#### Parameters

##### table

`string`

Table name

##### data

Single document or array of documents

`T` | `T`[]

#### Returns

`Promise`\<`T`[]\>

The inserted documents with generated IDs

***

### update()

> **update**\<`T`\>(`table`, `filter`, `changes`, `options`): `Promise`\<[`UpdateResult`](../interfaces/UpdateResult.md)\<`T`\>\>

Defined in: [core/src/evodb.ts:728](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L728)

Update documents in a table

Updates all documents that match the filter with the provided changes.
In production mode with locked schema, updates are validated.

#### Type Parameters

##### T

`T` *extends* `Record`\<`string`, `unknown`\>

#### Parameters

##### table

`string`

Table name

##### filter

[`FilterObject`](../type-aliases/FilterObject.md)

Filter object to match documents (empty object matches all)

##### changes

`Partial`\<`T`\>

Object with field values to update

##### options

[`UpdateOptions`](../interfaces/UpdateOptions.md) = `{}`

Update options

#### Returns

`Promise`\<[`UpdateResult`](../interfaces/UpdateResult.md)\<`T`\>\>

Update result with matched and modified counts

#### Example

```typescript
// Update a single document by ID
await db.update('users', { _id: 'user-1' }, { name: 'New Name' });

// Update multiple documents matching a filter
await db.update('users', { role: 'user' }, { role: 'member' });

// Get the updated documents
const result = await db.update('users', { _id: 'user-1' }, { name: 'New Name' }, { returnDocuments: true });
console.log(result.documents);
```

***

### delete()

> **delete**\<`T`\>(`table`, `filter`, `options`): `Promise`\<[`DeleteResult`](../interfaces/DeleteResult.md)\<`T`\>\>

Defined in: [core/src/evodb.ts:827](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L827)

Delete documents from a table

Deletes all documents that match the filter.

#### Type Parameters

##### T

`T` *extends* `Record`\<`string`, `unknown`\>

#### Parameters

##### table

`string`

Table name

##### filter

[`FilterObject`](../type-aliases/FilterObject.md)

Filter object to match documents (empty object matches all)

##### options

[`DeleteOptions`](../interfaces/DeleteOptions.md) = `{}`

Delete options

#### Returns

`Promise`\<[`DeleteResult`](../interfaces/DeleteResult.md)\<`T`\>\>

Delete result with deleted count

#### Example

```typescript
// Delete a single document by ID
await db.delete('users', { _id: 'user-1' });

// Delete multiple documents matching a filter
await db.delete('users', { role: 'inactive' });

// Delete all documents
await db.delete('users', {});

// Get the deleted documents
const result = await db.delete('users', { _id: 'user-1' }, { returnDocuments: true });
console.log(result.documents);
```

***

### query()

> **query**\<`T`\>(`table`): [`QueryBuilder`](QueryBuilder.md)\<`T`\>

Defined in: [core/src/evodb.ts:900](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L900)

Create a query builder for a table

#### Type Parameters

##### T

`T` = `Record`\<`string`, `unknown`\>

#### Parameters

##### table

`string`

Table name to query

#### Returns

[`QueryBuilder`](QueryBuilder.md)\<`T`\>

A QueryBuilder instance for fluent query construction

***

### getMode()

> **getMode**(): `"development"` \| `"production"`

Defined in: [core/src/evodb.ts:907](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L907)

Get the current operating mode

#### Returns

`"development"` \| `"production"`

***

### transaction()

> **transaction**\<`T`\>(`fn`, `options?`): `Promise`\<`T`\>

Defined in: [core/src/evodb.ts:1051](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L1051)

Execute a function within a transaction

The transaction is automatically committed if the function succeeds,
or rolled back if it throws an error.

#### Type Parameters

##### T

`T`

#### Parameters

##### fn

(`tx`) => `Promise`\<`T`\>

Function to execute within the transaction

##### options?

[`TransactionOptions`](../interfaces/TransactionOptions.md)

Transaction options

#### Returns

`Promise`\<`T`\>

The result of the function

#### Example

```typescript
await db.transaction(async (tx) => {
  await tx.insert('users', { name: 'Alice' });
  await tx.insert('posts', { title: 'Hello', authorId: 'alice' });
});
```

***

### beginTransaction()

> **beginTransaction**(`options?`): [`EvoDBTransaction`](EvoDBTransaction.md)

Defined in: [core/src/evodb.ts:1084](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L1084)

Begin a new explicit transaction

#### Parameters

##### options?

[`TransactionOptions`](../interfaces/TransactionOptions.md)

Transaction options

#### Returns

[`EvoDBTransaction`](EvoDBTransaction.md)

A transaction context with CRUD operations

#### Example

```typescript
const tx = db.beginTransaction();
try {
  await tx.insert('users', { name: 'Alice' });
  await tx.commit();
} catch (error) {
  await tx.rollback();
}
```
