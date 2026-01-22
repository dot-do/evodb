[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / toReaderQueryRequest

# Function: toReaderQueryRequest()

> **toReaderQueryRequest**(`query`): `object`

Defined in: [core/src/query-executor.ts:397](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L397)

Convert a simplified ExecutorQuery to @evodb/reader's QueryRequest format.
This is a convenience function for adapting queries between interfaces.

## Parameters

### query

[`ExecutorQuery`](../interfaces/ExecutorQuery.md)

## Returns

`object`

### table

> **table**: `string`

### columns?

> `optional` **columns**: `string`[]

### filters?

> `optional` **filters**: `object`[]

### groupBy?

> `optional` **groupBy**: `string`[]

### aggregates?

> `optional` **aggregates**: `object`[]

### orderBy?

> `optional` **orderBy**: `object`[]

### limit?

> `optional` **limit**: `number`

### offset?

> `optional` **offset**: `number`

### timeoutMs?

> `optional` **timeoutMs**: `number`
