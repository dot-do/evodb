[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [rpc/src](../README.md) / CircuitBreakerOptions

# Interface: CircuitBreakerOptions

Defined in: core/dist/circuit-breaker.d.ts:44

Circuit breaker configuration options

## Properties

### failureThreshold?

> `optional` **failureThreshold**: `number`

Defined in: core/dist/circuit-breaker.d.ts:46

Number of consecutive failures before opening circuit (default: 5)

***

### ~~resetTimeoutMs?~~

> `optional` **resetTimeoutMs**: `number`

Defined in: core/dist/circuit-breaker.d.ts:48

#### Deprecated

Use maxBackoffMs instead. Kept for backward compatibility

***

### maxBackoffMs?

> `optional` **maxBackoffMs**: `number`

Defined in: core/dist/circuit-breaker.d.ts:50

Maximum backoff time in ms (default: 30000)

***

### ~~halfOpenMaxAttempts?~~

> `optional` **halfOpenMaxAttempts**: `number`

Defined in: core/dist/circuit-breaker.d.ts:52

#### Deprecated

Ignored in simplified implementation

***

### isFailure()?

> `optional` **isFailure**: (`error`) => `boolean`

Defined in: core/dist/circuit-breaker.d.ts:54

Custom predicate to determine if an error should count as a failure

#### Parameters

##### error

`unknown`

#### Returns

`boolean`

***

### timeProvider?

> `optional` **timeProvider**: [`MonotonicTimeProvider`](MonotonicTimeProvider.md)

Defined in: core/dist/circuit-breaker.d.ts:56

Custom time provider (for testing)
