[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [rpc/src](../README.md) / CircuitBreakerRpcStats

# Interface: CircuitBreakerRpcStats

Defined in: rpc/src/circuit-breaker-client.ts:83

Extended stats including RPC-specific information

## Extends

- [`CircuitBreakerStats`](CircuitBreakerStats.md)

## Properties

### state

> **state**: [`CircuitState`](../enumerations/CircuitState.md)

Defined in: core/dist/circuit-breaker.d.ts:62

#### Inherited from

[`CircuitBreakerStats`](CircuitBreakerStats.md).[`state`](CircuitBreakerStats.md#state)

***

### failureCount

> **failureCount**: `number`

Defined in: core/dist/circuit-breaker.d.ts:63

#### Inherited from

[`CircuitBreakerStats`](CircuitBreakerStats.md).[`failureCount`](CircuitBreakerStats.md#failurecount)

***

### successCount

> **successCount**: `number`

Defined in: core/dist/circuit-breaker.d.ts:64

#### Inherited from

[`CircuitBreakerStats`](CircuitBreakerStats.md).[`successCount`](CircuitBreakerStats.md#successcount)

***

### totalFailureCount

> **totalFailureCount**: `number`

Defined in: core/dist/circuit-breaker.d.ts:65

#### Inherited from

[`CircuitBreakerStats`](CircuitBreakerStats.md).[`totalFailureCount`](CircuitBreakerStats.md#totalfailurecount)

***

### rejectedCount

> **rejectedCount**: `number`

Defined in: core/dist/circuit-breaker.d.ts:66

#### Inherited from

[`CircuitBreakerStats`](CircuitBreakerStats.md).[`rejectedCount`](CircuitBreakerStats.md#rejectedcount)

***

### lastOpenedAt?

> `optional` **lastOpenedAt**: `number`

Defined in: core/dist/circuit-breaker.d.ts:67

#### Inherited from

[`CircuitBreakerStats`](CircuitBreakerStats.md).[`lastOpenedAt`](CircuitBreakerStats.md#lastopenedat)

***

### lastClosedAt?

> `optional` **lastClosedAt**: `number`

Defined in: core/dist/circuit-breaker.d.ts:68

#### Inherited from

[`CircuitBreakerStats`](CircuitBreakerStats.md).[`lastClosedAt`](CircuitBreakerStats.md#lastclosedat)

***

### sourceDoId

> **sourceDoId**: `string`

Defined in: rpc/src/circuit-breaker-client.ts:85

Source DO identifier

***

### parentDoUrl

> **parentDoUrl**: `string`

Defined in: rpc/src/circuit-breaker-client.ts:88

Parent DO URL
