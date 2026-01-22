[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / IndexError

# Class: IndexError

Defined in: core/src/indexes.ts:211

Error thrown when an index operation fails

## Extends

- [`EvoDBError`](EvoDBError.md)

## Constructors

### Constructor

> **new IndexError**(`message`, `code`, `details?`): `IndexError`

Defined in: core/src/indexes.ts:212

#### Parameters

##### message

`string`

##### code

`string` = `'INDEX_ERROR'`

##### details?

`Record`\<`string`, `unknown`\>

#### Returns

`IndexError`

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
