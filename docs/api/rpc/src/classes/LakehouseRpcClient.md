[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [rpc/src](../README.md) / LakehouseRpcClient

# Class: LakehouseRpcClient

Defined in: [rpc/src/client.ts:155](https://github.com/dot-do/evodb/blob/main/rpc/src/client.ts#L155)

RPC Client for streaming CDC to Parent DO

## Extends

- `EventEmitter`

## Constructors

### Constructor

> **new LakehouseRpcClient**(`sourceDoId`, `config`, `sourceShardName?`): `LakehouseRpcClient`

Defined in: [rpc/src/client.ts:176](https://github.com/dot-do/evodb/blob/main/rpc/src/client.ts#L176)

#### Parameters

##### sourceDoId

`string`

##### config

`Partial`\<[`ChildConfig`](../interfaces/ChildConfig.md)\> = `{}`

##### sourceShardName?

`string`

#### Returns

`LakehouseRpcClient`

#### Overrides

`EventEmitter.constructor`

## Properties

### onHandlerError?

> `protected` `optional` **onHandlerError**: [`OnHandlerErrorCallback`](../type-aliases/OnHandlerErrorCallback.md)

Defined in: [rpc/src/client.ts:100](https://github.com/dot-do/evodb/blob/main/rpc/src/client.ts#L100)

#### Inherited from

`EventEmitter.onHandlerError`

## Methods

### on()

> **on**\<`T`\>(`event`, `handler`): `void`

Defined in: [rpc/src/client.ts:106](https://github.com/dot-do/evodb/blob/main/rpc/src/client.ts#L106)

#### Type Parameters

##### T

`T`

#### Parameters

##### event

`string`

##### handler

`EventHandler`\<`T`\>

#### Returns

`void`

#### Inherited from

`EventEmitter.on`

***

### off()

> **off**\<`T`\>(`event`, `handler`): `void`

Defined in: [rpc/src/client.ts:115](https://github.com/dot-do/evodb/blob/main/rpc/src/client.ts#L115)

#### Type Parameters

##### T

`T`

#### Parameters

##### event

`string`

##### handler

`EventHandler`\<`T`\>

#### Returns

`void`

#### Inherited from

`EventEmitter.off`

***

### emit()

> **emit**\<`T`\>(`event`, `data`): `void`

Defined in: [rpc/src/client.ts:122](https://github.com/dot-do/evodb/blob/main/rpc/src/client.ts#L122)

#### Type Parameters

##### T

`T`

#### Parameters

##### event

`string`

##### data

`T`

#### Returns

`void`

#### Inherited from

`EventEmitter.emit`

***

### connect()

> **connect**(): `Promise`\<`void`\>

Defined in: [rpc/src/client.ts:194](https://github.com/dot-do/evodb/blob/main/rpc/src/client.ts#L194)

Connect to the Parent DO

#### Returns

`Promise`\<`void`\>

***

### disconnect()

> **disconnect**(): `Promise`\<`void`\>

Defined in: [rpc/src/client.ts:252](https://github.com/dot-do/evodb/blob/main/rpc/src/client.ts#L252)

Disconnect from the Parent DO

#### Returns

`Promise`\<`void`\>

***

### isConnected()

> **isConnected**(): `boolean`

Defined in: [rpc/src/client.ts:278](https://github.com/dot-do/evodb/blob/main/rpc/src/client.ts#L278)

Check if connected

#### Returns

`boolean`

***

### getState()

> **getState**(): [`ClientState`](../type-aliases/ClientState.md)

Defined in: [rpc/src/client.ts:285](https://github.com/dot-do/evodb/blob/main/rpc/src/client.ts#L285)

Get current state

#### Returns

[`ClientState`](../type-aliases/ClientState.md)

***

### send()

> **send**(`entry`): `Promise`\<`void`\>

Defined in: [rpc/src/client.ts:296](https://github.com/dot-do/evodb/blob/main/rpc/src/client.ts#L296)

Send a single WAL entry (will be batched)

#### Parameters

##### entry

[`WalEntry`](../type-aliases/WalEntry.md)

#### Returns

`Promise`\<`void`\>

***

### sendMany()

> **sendMany**(`entries`): `Promise`\<`void`\>

Defined in: [rpc/src/client.ts:303](https://github.com/dot-do/evodb/blob/main/rpc/src/client.ts#L303)

Send multiple WAL entries (will be batched)

#### Parameters

##### entries

[`WalEntry`](../type-aliases/WalEntry.md)[]

#### Returns

`Promise`\<`void`\>

***

### sendBatch()

> **sendBatch**(`entries`): `Promise`\<[`AckMessage`](../interfaces/AckMessage.md)\>

Defined in: [rpc/src/client.ts:312](https://github.com/dot-do/evodb/blob/main/rpc/src/client.ts#L312)

Send a batch immediately (bypasses batching)

#### Parameters

##### entries

[`WalEntry`](../type-aliases/WalEntry.md)[]

#### Returns

`Promise`\<[`AckMessage`](../interfaces/AckMessage.md)\>

***

### requestFlush()

> **requestFlush**(`reason`): `Promise`\<`void`\>

Defined in: [rpc/src/client.ts:323](https://github.com/dot-do/evodb/blob/main/rpc/src/client.ts#L323)

Request Parent to flush its buffers

#### Parameters

##### reason

`"buffer_full"` | `"manual"` | `"shutdown"` | `"time_threshold"`

#### Returns

`Promise`\<`void`\>

***

### getStats()

> **getStats**(): [`ClientStats`](../interfaces/ClientStats.md)

Defined in: [rpc/src/client.ts:739](https://github.com/dot-do/evodb/blob/main/rpc/src/client.ts#L739)

Get statistics

#### Returns

[`ClientStats`](../interfaces/ClientStats.md)
