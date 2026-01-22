[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / R2Bucket

# Interface: R2Bucket

Defined in: [writer/src/types.ts:597](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L597)

R2 bucket interface (from @cloudflare/workers-types)

## Methods

### put()

> **put**(`key`, `value`, `options?`): `Promise`\<[`R2Object`](R2Object.md)\>

Defined in: [writer/src/types.ts:598](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L598)

#### Parameters

##### key

`string`

##### value

`string` | `ArrayBuffer` | `Uint8Array`\<`ArrayBufferLike`\> | `ReadableStream`\<`any`\> | `Blob`

##### options?

[`R2PutOptions`](R2PutOptions.md)

#### Returns

`Promise`\<[`R2Object`](R2Object.md)\>

***

### get()

> **get**(`key`, `options?`): `Promise`\<[`R2ObjectBody`](R2ObjectBody.md)\>

Defined in: [writer/src/types.ts:599](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L599)

#### Parameters

##### key

`string`

##### options?

[`R2GetOptions`](R2GetOptions.md)

#### Returns

`Promise`\<[`R2ObjectBody`](R2ObjectBody.md)\>

***

### delete()

> **delete**(`keys`): `Promise`\<`void`\>

Defined in: [writer/src/types.ts:600](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L600)

#### Parameters

##### keys

`string` | `string`[]

#### Returns

`Promise`\<`void`\>

***

### list()

> **list**(`options?`): `Promise`\<[`R2Objects`](R2Objects.md)\>

Defined in: [writer/src/types.ts:601](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L601)

#### Parameters

##### options?

[`R2ListOptions`](R2ListOptions.md)

#### Returns

`Promise`\<[`R2Objects`](R2Objects.md)\>

***

### head()

> **head**(`key`): `Promise`\<[`R2Object`](R2Object.md)\>

Defined in: [writer/src/types.ts:602](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L602)

#### Parameters

##### key

`string`

#### Returns

`Promise`\<[`R2Object`](R2Object.md)\>
