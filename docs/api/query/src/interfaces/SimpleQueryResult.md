[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / SimpleQueryResult

# Interface: SimpleQueryResult

Defined in: [query/src/simple-engine.ts:146](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L146)

Simple query result

## Properties

### columns

> **columns**: `string`[]

Defined in: [query/src/simple-engine.ts:148](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L148)

Column names in order

***

### rows

> **rows**: `unknown`[][]

Defined in: [query/src/simple-engine.ts:150](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L150)

Rows as arrays of values

***

### totalRows?

> `optional` **totalRows**: `number`

Defined in: [query/src/simple-engine.ts:152](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L152)

Total rows matched (before limit)

***

### stats

> **stats**: [`SimpleQueryStats`](SimpleQueryStats.md)

Defined in: [query/src/simple-engine.ts:154](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L154)

Execution statistics
