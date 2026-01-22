[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [rpc/src](../README.md) / CircuitBreakerError

# Class: CircuitBreakerError

Defined in: core/dist/circuit-breaker.d.ts:73

Error thrown when circuit is open and request is rejected

## Extends

- `Error`

## Constructors

### Constructor

> **new CircuitBreakerError**(`message`, `state`): `CircuitBreakerError`

Defined in: core/dist/circuit-breaker.d.ts:76

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

Defined in: core/dist/circuit-breaker.d.ts:74

***

### circuitState

> `readonly` **circuitState**: [`CircuitState`](../enumerations/CircuitState.md)

Defined in: core/dist/circuit-breaker.d.ts:75
