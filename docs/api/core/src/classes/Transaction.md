[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / Transaction

# Class: Transaction

Defined in: core/src/transactions.ts:143

Represents a single database transaction

## Constructors

### Constructor

> **new Transaction**(`id`, `manager`, `options`): `Transaction`

Defined in: core/src/transactions.ts:174

#### Parameters

##### id

`string`

##### manager

[`TransactionManager`](TransactionManager.md)

##### options

[`TransactionOptions`](../interfaces/TransactionOptions.md) = `{}`

#### Returns

`Transaction`

## Properties

### id

> `readonly` **id**: `string`

Defined in: core/src/transactions.ts:145

Unique transaction identifier

***

### isolationLevel

> `readonly` **isolationLevel**: [`IsolationLevel`](../enumerations/IsolationLevel.md)

Defined in: core/src/transactions.ts:148

Isolation level for this transaction

***

### startTime

> `readonly` **startTime**: `number`

Defined in: core/src/transactions.ts:151

Transaction start time (Unix timestamp)

***

### endTime?

> `optional` **endTime**: `number`

Defined in: core/src/transactions.ts:154

Transaction end time (set on commit/rollback)

## Accessors

### state

#### Get Signature

> **get** **state**(): [`TransactionState`](../enumerations/TransactionState.md)

Defined in: core/src/transactions.ts:189

Get current transaction state

##### Returns

[`TransactionState`](../enumerations/TransactionState.md)

## Methods

### addOperation()

> **addOperation**(`operation`): `void`

Defined in: core/src/transactions.ts:196

Add an operation to this transaction

#### Parameters

##### operation

[`TransactionOperation`](../interfaces/TransactionOperation.md)

#### Returns

`void`

***

### getOperations()

> **getOperations**(): [`TransactionOperation`](../interfaces/TransactionOperation.md)[]

Defined in: core/src/transactions.ts:230

Get all operations in this transaction

#### Returns

[`TransactionOperation`](../interfaces/TransactionOperation.md)[]

***

### getOwnOperations()

> **getOwnOperations**(`table`): [`TransactionOperation`](../interfaces/TransactionOperation.md)[]

Defined in: core/src/transactions.ts:237

Get operations for a specific table from this transaction

#### Parameters

##### table

`string`

#### Returns

[`TransactionOperation`](../interfaces/TransactionOperation.md)[]

***

### getVisibleOperations()

> **getVisibleOperations**(`table`): [`TransactionOperation`](../interfaces/TransactionOperation.md)[]

Defined in: core/src/transactions.ts:245

Get visible operations from committed transactions
Under read committed isolation, sees all committed changes

#### Parameters

##### table

`string`

#### Returns

[`TransactionOperation`](../interfaces/TransactionOperation.md)[]

***

### commit()

> **commit**(): `Promise`\<`void`\>

Defined in: core/src/transactions.ts:252

Commit this transaction

#### Returns

`Promise`\<`void`\>

***

### rollback()

> **rollback**(): `Promise`\<`void`\>

Defined in: core/src/transactions.ts:301

Rollback this transaction

#### Returns

`Promise`\<`void`\>

***

### savepoint()

> **savepoint**(`name`): [`Savepoint`](../interfaces/Savepoint.md)

Defined in: core/src/transactions.ts:333

Create a savepoint

#### Parameters

##### name

`string`

#### Returns

[`Savepoint`](../interfaces/Savepoint.md)

***

### rollbackToSavepoint()

> **rollbackToSavepoint**(`savepoint`): `Promise`\<`void`\>

Defined in: core/src/transactions.ts:354

Rollback to a savepoint

#### Parameters

##### savepoint

[`Savepoint`](../interfaces/Savepoint.md)

#### Returns

`Promise`\<`void`\>

***

### acquireLock()

> **acquireLock**(`table`, `key`): `void`

Defined in: core/src/transactions.ts:386

Acquire a lock on a resource

#### Parameters

##### table

`string`

##### key

`string`

#### Returns

`void`

***

### tryAcquireLock()

> **tryAcquireLock**(`table`, `key`): `boolean`

Defined in: core/src/transactions.ts:411

Try to acquire a lock, returns false if already locked

#### Parameters

##### table

`string`

##### key

`string`

#### Returns

`boolean`

***

### hasLock()

> **hasLock**(`table`, `key`): `boolean`

Defined in: core/src/transactions.ts:427

Check if this transaction holds a lock

#### Parameters

##### table

`string`

##### key

`string`

#### Returns

`boolean`
