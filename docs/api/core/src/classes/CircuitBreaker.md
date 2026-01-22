[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / CircuitBreaker

# Class: CircuitBreaker

Defined in: [core/src/circuit-breaker.ts:113](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L113)

Simplified circuit breaker using failure counter + exponential backoff.
Optimized for Cloudflare Workers' ephemeral execution model.

## Constructors

### Constructor

> **new CircuitBreaker**(`options`): `CircuitBreaker`

Defined in: [core/src/circuit-breaker.ts:127](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L127)

#### Parameters

##### options

[`CircuitBreakerOptions`](../interfaces/CircuitBreakerOptions.md) = `{}`

#### Returns

`CircuitBreaker`

## Methods

### execute()

> **execute**\<`T`\>(`operation`): `Promise`\<`T`\>

Defined in: [core/src/circuit-breaker.ts:134](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L134)

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

Defined in: [core/src/circuit-breaker.ts:169](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L169)

#### Returns

[`CircuitState`](../enumerations/CircuitState.md)

***

### getFailureCount()

> **getFailureCount**(): `number`

Defined in: [core/src/circuit-breaker.ts:174](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L174)

#### Returns

`number`

***

### getStats()

> **getStats**(): [`CircuitBreakerStats`](../interfaces/CircuitBreakerStats.md)

Defined in: [core/src/circuit-breaker.ts:178](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L178)

#### Returns

[`CircuitBreakerStats`](../interfaces/CircuitBreakerStats.md)

***

### reset()

> **reset**(): `void`

Defined in: [core/src/circuit-breaker.ts:190](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L190)

#### Returns

`void`

***

### trip()

> **trip**(): `void`

Defined in: [core/src/circuit-breaker.ts:196](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L196)

#### Returns

`void`
