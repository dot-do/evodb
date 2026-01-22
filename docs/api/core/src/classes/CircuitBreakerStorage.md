[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / CircuitBreakerStorage

# Class: CircuitBreakerStorage

Defined in: [core/src/circuit-breaker.ts:209](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L209)

Storage wrapper with circuit breaker protection

## Implements

- [`Storage`](../interfaces/Storage.md)

## Constructors

### Constructor

> **new CircuitBreakerStorage**(`storage`, `options`): `CircuitBreakerStorage`

Defined in: [core/src/circuit-breaker.ts:213](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L213)

#### Parameters

##### storage

[`Storage`](../interfaces/Storage.md)

##### options

[`CircuitBreakerOptions`](../interfaces/CircuitBreakerOptions.md) = `{}`

#### Returns

`CircuitBreakerStorage`

## Methods

### read()

> **read**(`path`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in: [core/src/circuit-breaker.ts:218](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L218)

Read data from a path, returns null if not found

#### Parameters

##### path

`string`

#### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

#### Implementation of

[`Storage`](../interfaces/Storage.md).[`read`](../interfaces/Storage.md#read)

***

### write()

> **write**(`path`, `data`): `Promise`\<`void`\>

Defined in: [core/src/circuit-breaker.ts:222](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L222)

Write data to a path

#### Parameters

##### path

`string`

##### data

`Uint8Array`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`Storage`](../interfaces/Storage.md).[`write`](../interfaces/Storage.md#write)

***

### list()

> **list**(`prefix`): `Promise`\<\{ `paths`: `string`[]; \}\>

Defined in: [core/src/circuit-breaker.ts:226](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L226)

List objects with a prefix, returns array of paths

#### Parameters

##### prefix

`string`

#### Returns

`Promise`\<\{ `paths`: `string`[]; \}\>

#### Implementation of

[`Storage`](../interfaces/Storage.md).[`list`](../interfaces/Storage.md#list)

***

### delete()

> **delete**(`path`): `Promise`\<`void`\>

Defined in: [core/src/circuit-breaker.ts:230](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L230)

Delete an object at path

#### Parameters

##### path

`string`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`Storage`](../interfaces/Storage.md).[`delete`](../interfaces/Storage.md#delete)

***

### exists()

> **exists**(`path`): `Promise`\<`boolean`\>

Defined in: [core/src/circuit-breaker.ts:234](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L234)

Check if an object exists (optional - can be derived from read)

#### Parameters

##### path

`string`

#### Returns

`Promise`\<`boolean`\>

#### Implementation of

[`Storage`](../interfaces/Storage.md).[`exists`](../interfaces/Storage.md#exists)

***

### head()

> **head**(`path`): `Promise`\<[`StorageMetadata`](../interfaces/StorageMetadata.md)\>

Defined in: [core/src/circuit-breaker.ts:242](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L242)

Get object metadata without reading body (optional)

#### Parameters

##### path

`string`

#### Returns

`Promise`\<[`StorageMetadata`](../interfaces/StorageMetadata.md)\>

#### Implementation of

[`Storage`](../interfaces/Storage.md).[`head`](../interfaces/Storage.md#head)

***

### readRange()

> **readRange**(`path`, `offset`, `length`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in: [core/src/circuit-breaker.ts:249](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L249)

Read a byte range from an object (optional - for efficient partial reads)

#### Parameters

##### path

`string`

##### offset

`number`

##### length

`number`

#### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

#### Implementation of

[`Storage`](../interfaces/Storage.md).[`readRange`](../interfaces/Storage.md#readrange)

***

### getCircuitState()

> **getCircuitState**(): [`CircuitState`](../enumerations/CircuitState.md)

Defined in: [core/src/circuit-breaker.ts:259](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L259)

#### Returns

[`CircuitState`](../enumerations/CircuitState.md)

***

### getFailureCount()

> **getFailureCount**(): `number`

Defined in: [core/src/circuit-breaker.ts:263](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L263)

#### Returns

`number`

***

### getStats()

> **getStats**(): [`CircuitBreakerStats`](../interfaces/CircuitBreakerStats.md)

Defined in: [core/src/circuit-breaker.ts:267](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L267)

#### Returns

[`CircuitBreakerStats`](../interfaces/CircuitBreakerStats.md)

***

### resetCircuit()

> **resetCircuit**(): `void`

Defined in: [core/src/circuit-breaker.ts:271](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L271)

#### Returns

`void`

***

### tripCircuit()

> **tripCircuit**(): `void`

Defined in: [core/src/circuit-breaker.ts:275](https://github.com/dot-do/evodb/blob/main/core/src/circuit-breaker.ts#L275)

#### Returns

`void`
