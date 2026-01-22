[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / ExecutorQuery

# Interface: ExecutorQuery

Defined in: core/dist/query-executor.d.ts:13

Unified query specification for the QueryExecutor interface.
This is a simplified version that captures the common elements
between @evodb/reader's QueryRequest and @evodb/query's Query.

## Properties

### table

> **table**: `string`

Defined in: core/dist/query-executor.d.ts:15

Table name or path to query

***

### columns?

> `optional` **columns**: `string`[]

Defined in: core/dist/query-executor.d.ts:17

Columns to project (undefined = all columns)

***

### predicates?

> `optional` **predicates**: `ExecutorPredicate`[]

Defined in: core/dist/query-executor.d.ts:19

Filter predicates

***

### groupBy?

> `optional` **groupBy**: `string`[]

Defined in: core/dist/query-executor.d.ts:21

Group by columns for aggregations

***

### aggregations?

> `optional` **aggregations**: `ExecutorAggregation`[]

Defined in: core/dist/query-executor.d.ts:23

Aggregations to compute

***

### orderBy?

> `optional` **orderBy**: `ExecutorOrderBy`[]

Defined in: core/dist/query-executor.d.ts:25

Sort specification

***

### limit?

> `optional` **limit**: `number`

Defined in: core/dist/query-executor.d.ts:27

Maximum rows to return

***

### offset?

> `optional` **offset**: `number`

Defined in: core/dist/query-executor.d.ts:29

Rows to skip

***

### timeoutMs?

> `optional` **timeoutMs**: `number`

Defined in: core/dist/query-executor.d.ts:31

Query timeout in milliseconds

***

### hints?

> `optional` **hints**: `Record`\<`string`, `unknown`\>

Defined in: core/dist/query-executor.d.ts:33

Additional query hints (implementation-specific)
