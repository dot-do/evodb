[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [rpc/src](../README.md) / CircuitBreakerRpcClient

# Class: CircuitBreakerRpcClient

Defined in: rpc/src/circuit-breaker-client.ts:111

RPC client wrapper with circuit breaker protection.

This class wraps an underlying RPC send function with circuit breaker
protection, preventing cascading failures when the parent DO becomes
unavailable or unresponsive.

Circuit breaker states:
- CLOSED: Normal operation, requests pass through
- OPEN: Requests fail fast without calling the underlying function
- (After backoff expires, transitions back to CLOSED)

The simplified circuit breaker uses exponential backoff instead of
a traditional HALF_OPEN state, which is more suitable for the
ephemeral execution model of Cloudflare Workers.

## Constructors

### Constructor

> **new CircuitBreakerRpcClient**(`config`): `CircuitBreakerRpcClient`

Defined in: rpc/src/circuit-breaker-client.ts:115

#### Parameters

##### config

[`CircuitBreakerRpcConfig`](../interfaces/CircuitBreakerRpcConfig.md)

#### Returns

`CircuitBreakerRpcClient`

## Methods

### sendBatch()

> **sendBatch**(`entries`): `Promise`\<[`RpcSendResult`](../interfaces/RpcSendResult.md)\>

Defined in: rpc/src/circuit-breaker-client.ts:131

Send a batch of WAL entries with circuit breaker protection.

If the circuit is open, this will reject immediately without
calling the underlying send function.

#### Parameters

##### entries

[`WalEntry`](../type-aliases/WalEntry.md)[]

WAL entries to send

#### Returns

`Promise`\<[`RpcSendResult`](../interfaces/RpcSendResult.md)\>

The result from the underlying send function

#### Throws

CircuitBreakerError if the circuit is open

#### Throws

Error if the underlying send function fails

***

### getCircuitState()

> **getCircuitState**(): `"CLOSED"` \| `"OPEN"` \| `"HALF_OPEN"`

Defined in: rpc/src/circuit-breaker-client.ts:140

Get the current circuit state.

#### Returns

`"CLOSED"` \| `"OPEN"` \| `"HALF_OPEN"`

'CLOSED' or 'OPEN'

***

### getFailureCount()

> **getFailureCount**(): `number`

Defined in: rpc/src/circuit-breaker-client.ts:150

Get the current failure count.

This is the number of consecutive failures. It resets to 0
after a successful request.

#### Returns

`number`

***

### getStats()

> **getStats**(): [`CircuitBreakerRpcStats`](../interfaces/CircuitBreakerRpcStats.md)

Defined in: rpc/src/circuit-breaker-client.ts:159

Get circuit breaker statistics.

#### Returns

[`CircuitBreakerRpcStats`](../interfaces/CircuitBreakerRpcStats.md)

Statistics including success/failure counts and state

***

### resetCircuit()

> **resetCircuit**(): `void`

Defined in: rpc/src/circuit-breaker-client.ts:174

Manually reset the circuit breaker.

This closes the circuit and resets the failure count to 0.
Use this when you know the underlying service has recovered.

#### Returns

`void`

***

### tripCircuit()

> **tripCircuit**(): `void`

Defined in: rpc/src/circuit-breaker-client.ts:184

Manually trip the circuit breaker.

This opens the circuit immediately, causing all requests to
fail fast until the backoff period expires.

#### Returns

`void`

***

### getParentDoUrl()

> **getParentDoUrl**(): `string`

Defined in: rpc/src/circuit-breaker-client.ts:191

Get the parent DO URL.

#### Returns

`string`

***

### getSourceDoId()

> **getSourceDoId**(): `string`

Defined in: rpc/src/circuit-breaker-client.ts:198

Get the source DO identifier.

#### Returns

`string`

***

### getSourceShardName()

> **getSourceShardName**(): `string`

Defined in: rpc/src/circuit-breaker-client.ts:205

Get the source shard name.

#### Returns

`string`
