[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / toQueryEngineQuery

# Function: toQueryEngineQuery()

> **toQueryEngineQuery**(`query`): `object`

Defined in: [core/src/query-executor.ts:455](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L455)

Convert a simplified ExecutorQuery to @evodb/query's Query format.
This is a convenience function for adapting queries between interfaces.

## Parameters

### query

[`ExecutorQuery`](../interfaces/ExecutorQuery.md)

## Returns

`object`

### table

> **table**: `string`

### projection?

> `optional` **projection**: `object`

#### projection.columns

> **columns**: `string`[]

### predicates?

> `optional` **predicates**: `object`[]

### groupBy?

> `optional` **groupBy**: `string`[]

### aggregations?

> `optional` **aggregations**: `object`[]

### orderBy?

> `optional` **orderBy**: `object`[]

### limit?

> `optional` **limit**: `number`

### offset?

> `optional` **offset**: `number`

### hints?

> `optional` **hints**: `object`

#### Index Signature

\[`key`: `string`\]: `unknown`

#### hints.timeoutMs?

> `optional` **timeoutMs**: `number`
