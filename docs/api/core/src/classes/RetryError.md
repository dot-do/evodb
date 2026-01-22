[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / RetryError

# Class: RetryError

Defined in: core/src/retry.ts:101

Error thrown when all retry attempts have been exhausted

Contains the original error that caused the final failure and
the total number of attempts made.

## Example

```typescript
try {
  await withRetry(riskyOperation, { maxRetries: 3 });
} catch (error) {
  if (error instanceof RetryError) {
    console.log(`Failed after ${error.attempts} attempts`);
    console.log(`Original error: ${error.cause.message}`);
  }
}
```

## Extends

- [`EvoDBError`](EvoDBError.md)

## Constructors

### Constructor

> **new RetryError**(`message`, `cause`, `attempts`): `RetryError`

Defined in: core/src/retry.ts:119

Create a new RetryError

#### Parameters

##### message

`string`

Human-readable error message

##### cause

`Error`

The original error that caused the failure

##### attempts

`number`

Total number of attempts made

#### Returns

`RetryError`

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

***

### cause

> `readonly` **cause**: `Error`

Defined in: core/src/retry.ts:105

The original error that caused the final failure

***

### attempts

> `readonly` **attempts**: `number`

Defined in: core/src/retry.ts:110

Total number of attempts made (initial + retries)
