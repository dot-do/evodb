[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [rpc/src](../README.md) / DEFAULT\_RPC\_CIRCUIT\_BREAKER\_OPTIONS

# Variable: DEFAULT\_RPC\_CIRCUIT\_BREAKER\_OPTIONS

> `const` **DEFAULT\_RPC\_CIRCUIT\_BREAKER\_OPTIONS**: [`CircuitBreakerOptions`](../interfaces/CircuitBreakerOptions.md)

Defined in: rpc/src/circuit-breaker-client.ts:233

Default circuit breaker options for RPC clients.

These defaults are tuned for typical RPC scenarios:
- 5 failures before opening circuit
- 30 second maximum backoff
