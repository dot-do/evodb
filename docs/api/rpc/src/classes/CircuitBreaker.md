[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [rpc/src](../README.md) / CircuitBreaker

# Class: CircuitBreaker

Defined in: core/dist/circuit-breaker.d.ts:82

Simplified circuit breaker using failure counter + exponential backoff.
Optimized for Cloudflare Workers' ephemeral execution model.

## Constructors

### Constructor

> **new CircuitBreaker**(`options?`): `CircuitBreaker`

Defined in: core/dist/circuit-breaker.d.ts:94

#### Parameters

##### options?

[`CircuitBreakerOptions`](../interfaces/CircuitBreakerOptions.md)

#### Returns

`CircuitBreaker`

## Methods

### execute()

> **execute**\<`T`\>(`operation`): `Promise`\<`T`\>

Defined in: core/dist/circuit-breaker.d.ts:95

#### Type Parameters

##### T

`T`

#### Parameters

##### operation

() => `Promise`\<`T`\>

#### Returns

`Promise`\<`T`\>

***

### getState()

> **getState**(): [`CircuitState`](../enumerations/CircuitState.md)

Defined in: core/dist/circuit-breaker.d.ts:96

#### Returns

[`CircuitState`](../enumerations/CircuitState.md)

***

### getFailureCount()

> **getFailureCount**(): `number`

Defined in: core/dist/circuit-breaker.d.ts:97

#### Returns

`number`

***

### getStats()

> **getStats**(): [`CircuitBreakerStats`](../interfaces/CircuitBreakerStats.md)

Defined in: core/dist/circuit-breaker.d.ts:98

#### Returns

[`CircuitBreakerStats`](../interfaces/CircuitBreakerStats.md)

***

### reset()

> **reset**(): `void`

Defined in: core/dist/circuit-breaker.d.ts:99

#### Returns

`void`

***

### trip()

> **trip**(): `void`

Defined in: core/dist/circuit-breaker.d.ts:100

#### Returns

`void`
