[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / DOStorage

# Interface: DOStorage

Defined in: [writer/src/writer.ts:54](https://github.com/dot-do/evodb/blob/main/writer/src/writer.ts#L54)

Durable Object storage interface

## Methods

### get()

> **get**\<`T`\>(`key`): `Promise`\<`T`\>

Defined in: [writer/src/writer.ts:55](https://github.com/dot-do/evodb/blob/main/writer/src/writer.ts#L55)

#### Type Parameters

##### T

`T`

#### Parameters

##### key

`string`

#### Returns

`Promise`\<`T`\>

***

### put()

> **put**(`key`, `value`): `Promise`\<`void`\>

Defined in: [writer/src/writer.ts:56](https://github.com/dot-do/evodb/blob/main/writer/src/writer.ts#L56)

#### Parameters

##### key

`string`

##### value

`unknown`

#### Returns

`Promise`\<`void`\>

***

### delete()

> **delete**(`key`): `Promise`\<`boolean`\>

Defined in: [writer/src/writer.ts:57](https://github.com/dot-do/evodb/blob/main/writer/src/writer.ts#L57)

#### Parameters

##### key

`string`

#### Returns

`Promise`\<`boolean`\>

***

### list()

> **list**(`options?`): `Promise`\<`Map`\<`string`, `unknown`\>\>

Defined in: [writer/src/writer.ts:58](https://github.com/dot-do/evodb/blob/main/writer/src/writer.ts#L58)

#### Parameters

##### options?

###### prefix?

`string`

#### Returns

`Promise`\<`Map`\<`string`, `unknown`\>\>
