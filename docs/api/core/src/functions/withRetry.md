[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / withRetry

# Function: withRetry()

> **withRetry**\<`T`\>(`fn`, `options?`): `Promise`\<`T`\>

Defined in: core/src/retry.ts:297

Executes a function with automatic retry on transient failures.

Features:
- Automatic retry on network errors and timeouts
- Exponential backoff to reduce load on failing services
- Jitter to prevent thundering herd
- Configurable retry limits and delays
- Custom retry predicate for fine-grained control

## Type Parameters

### T

`T`

Return type of the function

## Parameters

### fn

() => `Promise`\<`T`\>

Async function to execute (will be retried on failure)

### options?

[`RetryOptions`](../interfaces/RetryOptions.md)

Retry configuration options

## Returns

`Promise`\<`T`\>

Promise resolving to the function's result

## Throws

RetryError when all retry attempts are exhausted

## Throws

Original error when it's not retryable

## Example

```typescript
// Basic usage with defaults (3 retries, 100ms base delay)
const data = await withRetry(() => storage.read(key));

// Custom configuration
const data = await withRetry(
  () => externalApi.fetch(params),
  {
    maxRetries: 5,
    baseDelay: 500,
    maxDelay: 30000,
    jitter: true,
  }
);

// Custom retry predicate
const data = await withRetry(
  () => customOperation(),
  {
    retryIf: (error) => error.code === 'RATE_LIMITED',
  }
);
```
