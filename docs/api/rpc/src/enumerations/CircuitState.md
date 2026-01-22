[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [rpc/src](../README.md) / CircuitState

# Enumeration: CircuitState

Defined in: core/dist/circuit-breaker.d.ts:26

Circuit breaker states (simplified: only CLOSED and OPEN)
HALF_OPEN is kept for backward compatibility but maps to CLOSED after backoff expires

## Enumeration Members

### CLOSED

> **CLOSED**: `"CLOSED"`

Defined in: core/dist/circuit-breaker.d.ts:28

Normal operation - requests pass through

***

### OPEN

> **OPEN**: `"OPEN"`

Defined in: core/dist/circuit-breaker.d.ts:30

Circuit tripped - requests fail fast during backoff period

***

### ~~HALF\_OPEN~~

> **HALF\_OPEN**: `"HALF_OPEN"`

Defined in: core/dist/circuit-breaker.d.ts:32

#### Deprecated

Kept for backward compatibility, behaves like CLOSED
