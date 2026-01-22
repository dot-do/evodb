[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / TransactionManager

# Class: TransactionManager

Defined in: core/src/transactions.ts:450

Manages transaction lifecycle and state

## Constructors

### Constructor

> **new TransactionManager**(): `TransactionManager`

#### Returns

`TransactionManager`

## Methods

### begin()

> **begin**(`options`): [`Transaction`](Transaction.md)

Defined in: core/src/transactions.ts:469

Begin a new transaction

#### Parameters

##### options

[`TransactionOptions`](../interfaces/TransactionOptions.md) = `{}`

#### Returns

[`Transaction`](Transaction.md)

***

### getActiveTransactions()

> **getActiveTransactions**(): [`Transaction`](Transaction.md)[]

Defined in: core/src/transactions.ts:479

Get all active transactions

#### Returns

[`Transaction`](Transaction.md)[]

***

### getTransactionHistory()

> **getTransactionHistory**(): [`Transaction`](Transaction.md)[]

Defined in: core/src/transactions.ts:486

Get transaction history (completed transactions)

#### Returns

[`Transaction`](Transaction.md)[]

***

### getCommittedOperations()

> **getCommittedOperations**(`table`): [`TransactionOperation`](../interfaces/TransactionOperation.md)[]

Defined in: core/src/transactions.ts:493

Get committed operations for a table

#### Parameters

##### table

`string`

#### Returns

[`TransactionOperation`](../interfaces/TransactionOperation.md)[]

***

### isLocked()

> **isLocked**(`table`, `key`): `boolean`

Defined in: core/src/transactions.ts:500

Check if a resource is locked

#### Parameters

##### table

`string`

##### key

`string`

#### Returns

`boolean`

***

### getLockholder()

> **getLockholder**(`table`, `key`): `string`

Defined in: core/src/transactions.ts:507

Get the transaction ID holding a lock

#### Parameters

##### table

`string`

##### key

`string`

#### Returns

`string`
