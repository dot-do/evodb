[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / SimpleQueryRequest

# Interface: SimpleQueryRequest

Defined in: [query/src/simple-engine.ts:122](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L122)

Simple query request

## Properties

### table

> **table**: `string`

Defined in: [query/src/simple-engine.ts:124](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L124)

Table name to query

***

### columns?

> `optional` **columns**: `string`[]

Defined in: [query/src/simple-engine.ts:126](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L126)

Columns to select (undefined = all)

***

### filters?

> `optional` **filters**: [`SimpleFilterPredicate`](SimpleFilterPredicate.md)[]

Defined in: [query/src/simple-engine.ts:128](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L128)

Filter predicates (AND)

***

### groupBy?

> `optional` **groupBy**: `string`[]

Defined in: [query/src/simple-engine.ts:130](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L130)

Group by columns

***

### aggregates?

> `optional` **aggregates**: [`SimpleAggregateSpec`](SimpleAggregateSpec.md)[]

Defined in: [query/src/simple-engine.ts:132](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L132)

Aggregations

***

### orderBy?

> `optional` **orderBy**: [`SimpleSortSpec`](SimpleSortSpec.md)[]

Defined in: [query/src/simple-engine.ts:134](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L134)

Sort specifications

***

### limit?

> `optional` **limit**: `number`

Defined in: [query/src/simple-engine.ts:136](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L136)

Maximum rows to return

***

### offset?

> `optional` **offset**: `number`

Defined in: [query/src/simple-engine.ts:138](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L138)

Rows to skip

***

### timeoutMs?

> `optional` **timeoutMs**: `number`

Defined in: [query/src/simple-engine.ts:140](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L140)

Query timeout in milliseconds
