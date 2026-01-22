[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / CircuitState

# Enumeration: CircuitState

Defined in: [core/src/circuit-breaker.ts:36](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L36)

Circuit breaker states (simplified: only CLOSED and OPEN)
HALF_OPEN is kept for backward compatibility but maps to CLOSED after backoff expires

## Enumeration Members

### CLOSED

> **CLOSED**: `"CLOSED"`

Defined in: [core/src/circuit-breaker.ts:38](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L38)

Normal operation - requests pass through

***

### OPEN

> **OPEN**: `"OPEN"`

Defined in: [core/src/circuit-breaker.ts:40](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L40)

Circuit tripped - requests fail fast during backoff period

***

### ~~HALF\_OPEN~~

> **HALF\_OPEN**: `"HALF_OPEN"`

Defined in: [core/src/circuit-breaker.ts:42](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L42)

#### Deprecated

Kept for backward compatibility, behaves like CLOSED
