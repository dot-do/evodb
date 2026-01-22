[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / CircuitBreakerOptions

# Interface: CircuitBreakerOptions

Defined in: [core/src/circuit-breaker.ts:59](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L59)

Circuit breaker configuration options

## Properties

### failureThreshold?

> `optional` **failureThreshold**: `number`

Defined in: [core/src/circuit-breaker.ts:61](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L61)

Number of consecutive failures before opening circuit (default: 5)

***

### ~~resetTimeoutMs?~~

> `optional` **resetTimeoutMs**: `number`

Defined in: [core/src/circuit-breaker.ts:63](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L63)

#### Deprecated

Use maxBackoffMs instead. Kept for backward compatibility

***

### maxBackoffMs?

> `optional` **maxBackoffMs**: `number`

Defined in: [core/src/circuit-breaker.ts:65](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L65)

Maximum backoff time in ms (default: 30000)

***

### ~~halfOpenMaxAttempts?~~

> `optional` **halfOpenMaxAttempts**: `number`

Defined in: [core/src/circuit-breaker.ts:67](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L67)

#### Deprecated

Ignored in simplified implementation

***

### isFailure()?

> `optional` **isFailure**: (`error`) => `boolean`

Defined in: [core/src/circuit-breaker.ts:69](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L69)

Custom predicate to determine if an error should count as a failure

#### Parameters

##### error

`unknown`

#### Returns

`boolean`

***

### timeProvider?

> `optional` **timeProvider**: [`MonotonicTimeProvider`](MonotonicTimeProvider.md)

Defined in: [core/src/circuit-breaker.ts:71](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L71)

Custom time provider (for testing)
