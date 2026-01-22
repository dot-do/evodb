[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / CircuitBreakerStats

# Interface: CircuitBreakerStats

Defined in: [core/src/circuit-breaker.ts:77](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L77)

Circuit breaker statistics

## Properties

### state

> **state**: [`CircuitState`](../enumerations/CircuitState.md)

Defined in: [core/src/circuit-breaker.ts:78](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L78)

***

### failureCount

> **failureCount**: `number`

Defined in: [core/src/circuit-breaker.ts:79](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L79)

***

### successCount

> **successCount**: `number`

Defined in: [core/src/circuit-breaker.ts:80](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L80)

***

### totalFailureCount

> **totalFailureCount**: `number`

Defined in: [core/src/circuit-breaker.ts:81](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L81)

***

### rejectedCount

> **rejectedCount**: `number`

Defined in: [core/src/circuit-breaker.ts:82](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L82)

***

### lastOpenedAt?

> `optional` **lastOpenedAt**: `number`

Defined in: [core/src/circuit-breaker.ts:83](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L83)

***

### lastClosedAt?

> `optional` **lastClosedAt**: `number`

Defined in: [core/src/circuit-breaker.ts:84](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L84)
