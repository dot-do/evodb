[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / TransactionError

# Class: TransactionError

Defined in: core/src/transactions.ts:128

Error thrown when a transaction operation fails

## Extends

- [`EvoDBError`](EvoDBError.md)

## Constructors

### Constructor

> **new TransactionError**(`message`, `code`, `details?`): `TransactionError`

Defined in: core/src/transactions.ts:129

#### Parameters

##### message

`string`

##### code

`string` = `'TRANSACTION_ERROR'`

##### details?

`Record`\<`string`, `unknown`\>

#### Returns

`TransactionError`

#### Overrides

[`EvoDBError`](EvoDBError.md).[`constructor`](EvoDBError.md#constructor)

## Properties

### code

> `readonly` **code**: `string`

Defined in: [core/src/errors.ts:162](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L162)

Error code for programmatic identification

Common codes:
- QUERY_ERROR: Query-related errors
- TIMEOUT_ERROR: Operation timeout
- VALIDATION_ERROR: Data validation failures
- STORAGE_ERROR: Storage operation failures

#### Inherited from

[`EvoDBError`](EvoDBError.md).[`code`](EvoDBError.md#code)

***

### details?

> `readonly` `optional` **details**: `Record`\<`string`, `unknown`\>

Defined in: [core/src/errors.ts:167](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L167)

Optional details for debugging (used by validation and storage errors)

#### Inherited from

[`EvoDBError`](EvoDBError.md).[`details`](EvoDBError.md#details)
