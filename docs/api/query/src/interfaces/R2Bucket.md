[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / R2Bucket

# Interface: R2Bucket

Defined in: [query/src/types.ts:1463](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1463)

R2 Bucket interface (subset needed for query engine).

Minimal interface for R2 bucket operations required by the query engine.
Compatible with Cloudflare Workers R2 API.

## Methods

### get()

> **get**(`key`, `options?`): `Promise`\<[`R2Object`](R2Object.md)\>

Defined in: [query/src/types.ts:1464](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1464)

#### Parameters

##### key

`string`

##### options?

[`R2GetOptions`](R2GetOptions.md)

#### Returns

`Promise`\<[`R2Object`](R2Object.md)\>

***

### head()

> **head**(`key`): `Promise`\<[`R2Object`](R2Object.md)\>

Defined in: [query/src/types.ts:1465](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1465)

#### Parameters

##### key

`string`

#### Returns

`Promise`\<[`R2Object`](R2Object.md)\>

***

### list()

> **list**(`options?`): `Promise`\<[`R2Objects`](R2Objects.md)\>

Defined in: [query/src/types.ts:1466](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1466)

#### Parameters

##### options?

[`R2ListOptions`](R2ListOptions.md)

#### Returns

`Promise`\<[`R2Objects`](R2Objects.md)\>
