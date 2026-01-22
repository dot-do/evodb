[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / CircuitBreakerError

# Class: CircuitBreakerError

Defined in: [core/src/circuit-breaker.ts:94](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L94)

Error thrown when circuit is open and request is rejected

## Extends

- `Error`

## Constructors

### Constructor

> **new CircuitBreakerError**(`message`, `state`): `CircuitBreakerError`

Defined in: [core/src/circuit-breaker.ts:98](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L98)

#### Parameters

##### message

`string`

##### state

[`CircuitState`](../enumerations/CircuitState.md)

#### Returns

`CircuitBreakerError`

#### Overrides

`Error.constructor`

## Properties

### isCircuitBreakerError

> `readonly` **isCircuitBreakerError**: `true` = `true`

Defined in: [core/src/circuit-breaker.ts:95](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L95)

***

### circuitState

> `readonly` **circuitState**: [`CircuitState`](../enumerations/CircuitState.md)

Defined in: [core/src/circuit-breaker.ts:96](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L96)
