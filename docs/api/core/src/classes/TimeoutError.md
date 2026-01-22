[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / TimeoutError

# Class: TimeoutError

Defined in: [core/src/errors.ts:234](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L234)

Error thrown when an operation times out

Examples:
- Query execution timeout
- Storage operation timeout
- Connection timeout

Common codes: TIMEOUT_ERROR, QUERY_TIMEOUT, CONNECTION_TIMEOUT

## Example

```typescript
throw new TimeoutError('Query execution timed out after 30s');
throw new TimeoutError('Connection timed out', 'CONNECTION_TIMEOUT');
```

## Extends

- [`EvoDBError`](EvoDBError.md)

## Constructors

### Constructor

> **new TimeoutError**(`message`, `code`, `details?`): `TimeoutError`

Defined in: [core/src/errors.ts:242](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L242)

Create a new TimeoutError

#### Parameters

##### message

`string`

Human-readable error message

##### code

`string` = `'TIMEOUT_ERROR'`

Error code (default: 'TIMEOUT_ERROR')

##### details?

`Record`\<`string`, `unknown`\>

Optional additional details for debugging

#### Returns

`TimeoutError`

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
