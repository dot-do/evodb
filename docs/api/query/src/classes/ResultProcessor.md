[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / ResultProcessor

# Class: ResultProcessor

Defined in: [query/src/engine.ts:646](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L646)

Result Processor

Processes and transforms query results.

## Constructors

### Constructor

> **new ResultProcessor**(): `ResultProcessor`

#### Returns

`ResultProcessor`

## Methods

### sort()

> **sort**\<`T`\>(`rows`, `orderBy`): `T`[]

Defined in: [query/src/engine.ts:650](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L650)

Sort results

#### Type Parameters

##### T

`T`

#### Parameters

##### rows

`T`[]

##### orderBy

`object`[]

#### Returns

`T`[]

***

### limit()

> **limit**\<`T`\>(`rows`, `limit`, `offset?`): `T`[]

Defined in: [query/src/engine.ts:668](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L668)

Apply LIMIT and OFFSET

#### Type Parameters

##### T

`T`

#### Parameters

##### rows

`T`[]

##### limit

`number`

##### offset?

`number`

#### Returns

`T`[]

***

### mergeSorted()

> **mergeSorted**\<`T`\>(`streams`, `orderBy`): `AsyncIterableIterator`\<`T`\>

Defined in: [query/src/engine.ts:676](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L676)

Merge sorted results from multiple partitions

#### Type Parameters

##### T

`T`

#### Parameters

##### streams

`AsyncIterableIterator`\<`T`, `any`, `any`\>[]

##### orderBy

`object`[]

#### Returns

`AsyncIterableIterator`\<`T`\>

***

### createStream()

> **createStream**\<`T`\>(`source`, `_batchSize`): [`StreamingQueryResult`](../interfaces/StreamingQueryResult.md)\<`T`\>

Defined in: [query/src/engine.ts:724](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L724)

Create streaming result with backpressure

#### Type Parameters

##### T

`T`

#### Parameters

##### source

`AsyncIterableIterator`\<`T`\>

##### \_batchSize

`number`

#### Returns

[`StreamingQueryResult`](../interfaces/StreamingQueryResult.md)\<`T`\>
