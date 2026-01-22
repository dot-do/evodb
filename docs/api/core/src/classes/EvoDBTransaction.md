[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / EvoDBTransaction

# Class: EvoDBTransaction

Defined in: [core/src/evodb.ts:1461](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L1461)

Transaction context for EvoDB operations

Provides CRUD operations within a transaction scope.
Changes are isolated until commit and can be rolled back.

## Constructors

### Constructor

> **new EvoDBTransaction**(`evodb`, `tx`): `EvoDBTransaction`

Defined in: [core/src/evodb.ts:1466](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L1466)

#### Parameters

##### evodb

[`EvoDB`](EvoDB.md)

##### tx

[`Transaction`](Transaction.md)

#### Returns

`EvoDBTransaction`

## Accessors

### transaction

#### Get Signature

> **get** **transaction**(): [`Transaction`](Transaction.md)

Defined in: [core/src/evodb.ts:1474](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L1474)

Get the underlying transaction

##### Returns

[`Transaction`](Transaction.md)

## Methods

### insert()

> **insert**\<`T`\>(`table`, `data`): `Promise`\<`T`[]\>

Defined in: [core/src/evodb.ts:1481](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L1481)

Insert documents within this transaction

#### Type Parameters

##### T

`T` *extends* `Record`\<`string`, `unknown`\>

#### Parameters

##### table

`string`

##### data

`T` | `T`[]

#### Returns

`Promise`\<`T`[]\>

***

### update()

> **update**\<`T`\>(`table`, `filter`, `changes`): `Promise`\<[`UpdateResult`](../interfaces/UpdateResult.md)\<`T`\>\>

Defined in: [core/src/evodb.ts:1514](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L1514)

Update documents within this transaction

#### Type Parameters

##### T

`T` *extends* `Record`\<`string`, `unknown`\>

#### Parameters

##### table

`string`

##### filter

[`FilterObject`](../type-aliases/FilterObject.md)

##### changes

`Partial`\<`T`\>

#### Returns

`Promise`\<[`UpdateResult`](../interfaces/UpdateResult.md)\<`T`\>\>

***

### delete()

> **delete**\<`T`\>(`table`, `filter`): `Promise`\<[`DeleteResult`](../interfaces/DeleteResult.md)\<`T`\>\>

Defined in: [core/src/evodb.ts:1539](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L1539)

Delete documents within this transaction

#### Type Parameters

##### T

`T` *extends* `Record`\<`string`, `unknown`\>

#### Parameters

##### table

`string`

##### filter

[`FilterObject`](../type-aliases/FilterObject.md)

#### Returns

`Promise`\<[`DeleteResult`](../interfaces/DeleteResult.md)\<`T`\>\>

***

### query()

> **query**\<`T`\>(`table`): [`QueryBuilder`](QueryBuilder.md)\<`T`\>

Defined in: [core/src/evodb.ts:1561](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L1561)

Query documents within this transaction
Sees both committed data and uncommitted changes from this transaction

#### Type Parameters

##### T

`T` = `Record`\<`string`, `unknown`\>

#### Parameters

##### table

`string`

#### Returns

[`QueryBuilder`](QueryBuilder.md)\<`T`\>

***

### nestedTransaction()

> **nestedTransaction**\<`T`\>(`fn`): `Promise`\<`T`\>

Defined in: [core/src/evodb.ts:1627](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L1627)

Create a nested transaction (savepoint)

#### Type Parameters

##### T

`T`

#### Parameters

##### fn

(`tx`) => `Promise`\<`T`\>

#### Returns

`Promise`\<`T`\>

***

### commit()

> **commit**(): `Promise`\<`void`\>

Defined in: [core/src/evodb.ts:1642](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L1642)

Commit this transaction

#### Returns

`Promise`\<`void`\>

***

### rollback()

> **rollback**(): `Promise`\<`void`\>

Defined in: [core/src/evodb.ts:1651](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L1651)

Rollback this transaction

#### Returns

`Promise`\<`void`\>
