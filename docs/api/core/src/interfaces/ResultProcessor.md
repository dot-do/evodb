[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / ResultProcessor

# Interface: ResultProcessor

Defined in: [core/src/query-ops.ts:140](https://github.com/dot-do/evodb/blob/main/core/src/query-ops.ts#L140)

Result processor interface

## Methods

### sort()

> **sort**\<`T`\>(`rows`, `orderBy`): `T`[]

Defined in: [core/src/query-ops.ts:144](https://github.com/dot-do/evodb/blob/main/core/src/query-ops.ts#L144)

Sort rows by multiple columns

#### Type Parameters

##### T

`T` *extends* `Record`\<`string`, `unknown`\>

#### Parameters

##### rows

`T`[]

##### orderBy

[`SortSpec`](SortSpec.md)[]

#### Returns

`T`[]

***

### limit()

> **limit**\<`T`\>(`rows`, `limit`, `offset?`): `T`[]

Defined in: [core/src/query-ops.ts:149](https://github.com/dot-do/evodb/blob/main/core/src/query-ops.ts#L149)

Apply limit and offset

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
