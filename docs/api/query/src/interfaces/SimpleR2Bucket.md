[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / SimpleR2Bucket

# Interface: SimpleR2Bucket

Defined in: [query/src/simple-engine.ts:251](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L251)

R2 bucket interface (subset)

## Methods

### get()

> **get**(`key`): `Promise`\<[`SimpleR2Object`](SimpleR2Object.md)\>

Defined in: [query/src/simple-engine.ts:252](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L252)

#### Parameters

##### key

`string`

#### Returns

`Promise`\<[`SimpleR2Object`](SimpleR2Object.md)\>

***

### head()

> **head**(`key`): `Promise`\<[`SimpleR2Object`](SimpleR2Object.md)\>

Defined in: [query/src/simple-engine.ts:253](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L253)

#### Parameters

##### key

`string`

#### Returns

`Promise`\<[`SimpleR2Object`](SimpleR2Object.md)\>

***

### list()

> **list**(`options?`): `Promise`\<[`SimpleR2Objects`](SimpleR2Objects.md)\>

Defined in: [query/src/simple-engine.ts:254](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L254)

#### Parameters

##### options?

[`SimpleR2ListOptions`](SimpleR2ListOptions.md)

#### Returns

`Promise`\<[`SimpleR2Objects`](SimpleR2Objects.md)\>
