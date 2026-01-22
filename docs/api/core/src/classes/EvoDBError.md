[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / EvoDBError

# Class: EvoDBError

Defined in: [core/src/errors.ts:152](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L152)

Base error class for all EvoDB errors

All EvoDB-specific errors extend this class, allowing for:
- Catching all EvoDB errors with a single catch block
- Programmatic error identification via the `code` property
- Proper stack traces and error inheritance
- Optional details object for additional debugging info

## Extends

- `Error`

## Extended by

- [`TransactionError`](TransactionError.md)
- [`RetryError`](RetryError.md)
- [`IndexError`](IndexError.md)
- [`RLSError`](RLSError.md)
- [`QueryError`](QueryError.md)
- [`TimeoutError`](TimeoutError.md)
- [`ValidationError`](ValidationError.md)
- [`StorageError`](StorageError.md)

## Constructors

### Constructor

> **new EvoDBError**(`message`, `code`, `details?`): `EvoDBError`

Defined in: [core/src/errors.ts:176](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L176)

Create a new EvoDBError

#### Parameters

##### message

`string`

Human-readable error message

##### code

`string`

Error code for programmatic identification

##### details?

`Record`\<`string`, `unknown`\>

Optional additional details for debugging

#### Returns

`EvoDBError`

#### Overrides

`Error.constructor`

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

***

### details?

> `readonly` `optional` **details**: `Record`\<`string`, `unknown`\>

Defined in: [core/src/errors.ts:167](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L167)

Optional details for debugging (used by validation and storage errors)
