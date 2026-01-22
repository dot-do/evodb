[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [rpc/src](../README.md) / CircuitBreakerStats

# Interface: CircuitBreakerStats

Defined in: core/dist/circuit-breaker.d.ts:61

Circuit breaker statistics

## Extended by

- [`CircuitBreakerRpcStats`](CircuitBreakerRpcStats.md)

## Properties

### state

> **state**: [`CircuitState`](../enumerations/CircuitState.md)

Defined in: core/dist/circuit-breaker.d.ts:62

***

### failureCount

> **failureCount**: `number`

Defined in: core/dist/circuit-breaker.d.ts:63

***

### successCount

> **successCount**: `number`

Defined in: core/dist/circuit-breaker.d.ts:64

***

### totalFailureCount

> **totalFailureCount**: `number`

Defined in: core/dist/circuit-breaker.d.ts:65

***

### rejectedCount

> **rejectedCount**: `number`

Defined in: core/dist/circuit-breaker.d.ts:66

***

### lastOpenedAt?

> `optional` **lastOpenedAt**: `number`

Defined in: core/dist/circuit-breaker.d.ts:67

***

### lastClosedAt?

> `optional` **lastClosedAt**: `number`

Defined in: core/dist/circuit-breaker.d.ts:68
