[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / RetryOptions

# Interface: RetryOptions

Defined in: core/src/retry.ts:40

Configuration options for retry behavior

## Properties

### maxRetries?

> `optional` **maxRetries**: `number`

Defined in: core/src/retry.ts:46

Maximum number of retry attempts after initial failure.
Set to 0 for no retries (only initial attempt).

#### Default

```ts
3
```

***

### baseDelay?

> `optional` **baseDelay**: `number`

Defined in: core/src/retry.ts:53

Base delay in milliseconds between retries.
Actual delay doubles with each retry (exponential backoff).

#### Default

```ts
100
```

***

### maxDelay?

> `optional` **maxDelay**: `number`

Defined in: core/src/retry.ts:60

Maximum delay in milliseconds between retries.
Caps the exponential growth to prevent very long waits.

#### Default

```ts
10000 (10 seconds)
```

***

### jitter?

> `optional` **jitter**: `boolean`

Defined in: core/src/retry.ts:68

Whether to add random jitter to delays.
Jitter helps prevent thundering herd when many clients retry simultaneously.
When enabled, actual delay is: delay * (0.5 + Math.random() * 0.5)

#### Default

```ts
true
```

***

### retryIf()?

> `optional` **retryIf**: (`error`) => `boolean`

Defined in: core/src/retry.ts:80

Custom predicate to determine if an error should trigger a retry.
When provided, overrides the default isRetryableError logic.
Return true to retry, false to fail immediately.

#### Parameters

##### error

`Error`

#### Returns

`boolean`

#### Example

```typescript
retryIf: (error) => error instanceof NetworkError
```
