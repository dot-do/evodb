[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [rpc/src](../README.md) / DOStorage

# Interface: DOStorage

Defined in: [rpc/src/fallback.ts:23](https://github.com/dot-do/evodb/blob/main/rpc/src/fallback.ts#L23)

DO Storage interface (subset of DurableObjectStorage)

## Methods

### get()

#### Call Signature

> **get**\<`T`\>(`key`): `Promise`\<`T`\>

Defined in: [rpc/src/fallback.ts:24](https://github.com/dot-do/evodb/blob/main/rpc/src/fallback.ts#L24)

##### Type Parameters

###### T

`T`

##### Parameters

###### key

`string`

##### Returns

`Promise`\<`T`\>

#### Call Signature

> **get**\<`T`\>(`keys`): `Promise`\<`Map`\<`string`, `T`\>\>

Defined in: [rpc/src/fallback.ts:25](https://github.com/dot-do/evodb/blob/main/rpc/src/fallback.ts#L25)

##### Type Parameters

###### T

`T`

##### Parameters

###### keys

`string`[]

##### Returns

`Promise`\<`Map`\<`string`, `T`\>\>

***

### put()

#### Call Signature

> **put**\<`T`\>(`key`, `value`): `Promise`\<`void`\>

Defined in: [rpc/src/fallback.ts:26](https://github.com/dot-do/evodb/blob/main/rpc/src/fallback.ts#L26)

##### Type Parameters

###### T

`T`

##### Parameters

###### key

`string`

###### value

`T`

##### Returns

`Promise`\<`void`\>

#### Call Signature

> **put**\<`T`\>(`entries`): `Promise`\<`void`\>

Defined in: [rpc/src/fallback.ts:27](https://github.com/dot-do/evodb/blob/main/rpc/src/fallback.ts#L27)

##### Type Parameters

###### T

`T`

##### Parameters

###### entries

`Map`\<`string`, `T`\>

##### Returns

`Promise`\<`void`\>

***

### delete()

#### Call Signature

> **delete**(`key`): `Promise`\<`boolean`\>

Defined in: [rpc/src/fallback.ts:28](https://github.com/dot-do/evodb/blob/main/rpc/src/fallback.ts#L28)

##### Parameters

###### key

`string`

##### Returns

`Promise`\<`boolean`\>

#### Call Signature

> **delete**(`keys`): `Promise`\<`number`\>

Defined in: [rpc/src/fallback.ts:29](https://github.com/dot-do/evodb/blob/main/rpc/src/fallback.ts#L29)

##### Parameters

###### keys

`string`[]

##### Returns

`Promise`\<`number`\>

***

### list()

> **list**\<`T`\>(`options?`): `Promise`\<`Map`\<`string`, `T`\>\>

Defined in: [rpc/src/fallback.ts:30](https://github.com/dot-do/evodb/blob/main/rpc/src/fallback.ts#L30)

#### Type Parameters

##### T

`T`

#### Parameters

##### options?

###### prefix?

`string`

###### limit?

`number`

#### Returns

`Promise`\<`Map`\<`string`, `T`\>\>
