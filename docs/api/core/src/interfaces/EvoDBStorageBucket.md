[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / EvoDBStorageBucket

# Interface: EvoDBStorageBucket

Defined in: [core/src/evodb.ts:116](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L116)

EvoDB storage bucket interface (R2-compatible)

## Methods

### get()

> **get**(`key`): `Promise`\<[`EvoDBStorageObject`](EvoDBStorageObject.md)\>

Defined in: [core/src/evodb.ts:117](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L117)

#### Parameters

##### key

`string`

#### Returns

`Promise`\<[`EvoDBStorageObject`](EvoDBStorageObject.md)\>

***

### put()

> **put**(`key`, `data`, `options?`): `Promise`\<[`EvoDBStorageObject`](EvoDBStorageObject.md)\>

Defined in: [core/src/evodb.ts:118](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L118)

#### Parameters

##### key

`string`

##### data

`string` | `ArrayBuffer` | `Uint8Array`\<`ArrayBufferLike`\>

##### options?

[`EvoDBPutOptions`](EvoDBPutOptions.md)

#### Returns

`Promise`\<[`EvoDBStorageObject`](EvoDBStorageObject.md)\>

***

### delete()

> **delete**(`key`): `Promise`\<`void`\>

Defined in: [core/src/evodb.ts:119](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L119)

#### Parameters

##### key

`string` | `string`[]

#### Returns

`Promise`\<`void`\>

***

### list()

> **list**(`options?`): `Promise`\<[`EvoDBObjectList`](EvoDBObjectList.md)\>

Defined in: [core/src/evodb.ts:120](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L120)

#### Parameters

##### options?

[`EvoDBListOptions`](EvoDBListOptions.md)

#### Returns

`Promise`\<[`EvoDBObjectList`](EvoDBObjectList.md)\>
