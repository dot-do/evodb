[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [rpc/src](../README.md) / CircuitBreakerRpcConfig

# Interface: CircuitBreakerRpcConfig

Defined in: rpc/src/circuit-breaker-client.ts:60

Configuration for CircuitBreakerRpcClient

## Properties

### parentDoUrl

> **parentDoUrl**: `string`

Defined in: rpc/src/circuit-breaker-client.ts:62

Parent DO WebSocket URL

***

### sourceDoId

> **sourceDoId**: `string`

Defined in: rpc/src/circuit-breaker-client.ts:65

Source DO identifier

***

### sourceShardName?

> `optional` **sourceShardName**: `string`

Defined in: rpc/src/circuit-breaker-client.ts:68

Source shard name (optional)

***

### circuitBreaker?

> `optional` **circuitBreaker**: [`CircuitBreakerOptions`](CircuitBreakerOptions.md)

Defined in: rpc/src/circuit-breaker-client.ts:71

Circuit breaker configuration

***

### send()

> **send**: (`entries`) => `Promise`\<[`RpcSendResult`](RpcSendResult.md)\>

Defined in: rpc/src/circuit-breaker-client.ts:77

The underlying send function to wrap with circuit breaker.
This should be the actual RPC implementation.

#### Parameters

##### entries

[`WalEntry`](../type-aliases/WalEntry.md)[]

#### Returns

`Promise`\<[`RpcSendResult`](RpcSendResult.md)\>
