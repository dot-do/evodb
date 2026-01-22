[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / SimpleR2Object

# Interface: SimpleR2Object

Defined in: [query/src/simple-engine.ts:260](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L260)

R2 object interface (subset)

## Properties

### key

> `readonly` **key**: `string`

Defined in: [query/src/simple-engine.ts:261](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L261)

***

### size

> `readonly` **size**: `number`

Defined in: [query/src/simple-engine.ts:262](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L262)

***

### etag

> `readonly` **etag**: `string`

Defined in: [query/src/simple-engine.ts:263](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L263)

***

### httpEtag

> `readonly` **httpEtag**: `string`

Defined in: [query/src/simple-engine.ts:264](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L264)

***

### uploaded

> `readonly` **uploaded**: `Date`

Defined in: [query/src/simple-engine.ts:265](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L265)

***

### customMetadata?

> `readonly` `optional` **customMetadata**: `Record`\<`string`, `string`\>

Defined in: [query/src/simple-engine.ts:266](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L266)

## Methods

### arrayBuffer()

> **arrayBuffer**(): `Promise`\<`ArrayBuffer`\>

Defined in: [query/src/simple-engine.ts:267](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L267)

#### Returns

`Promise`\<`ArrayBuffer`\>

***

### text()

> **text**(): `Promise`\<`string`\>

Defined in: [query/src/simple-engine.ts:268](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L268)

#### Returns

`Promise`\<`string`\>

***

### json()

> **json**\<`T`\>(): `Promise`\<`T`\>

Defined in: [query/src/simple-engine.ts:269](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L269)

#### Type Parameters

##### T

`T` = `unknown`

#### Returns

`Promise`\<`T`\>
