[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / ExecutorQuery

# Interface: ExecutorQuery

Defined in: [core/src/query-executor.ts:18](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L18)

Unified query specification for the QueryExecutor interface.
This is a simplified version that captures the common elements
between @evodb/reader's QueryRequest and @evodb/query's Query.

## Properties

### table

> **table**: `string`

Defined in: [core/src/query-executor.ts:20](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L20)

Table name or path to query

***

### columns?

> `optional` **columns**: `string`[]

Defined in: [core/src/query-executor.ts:23](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L23)

Columns to project (undefined = all columns)

***

### predicates?

> `optional` **predicates**: [`ExecutorPredicate`](ExecutorPredicate.md)[]

Defined in: [core/src/query-executor.ts:26](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L26)

Filter predicates

***

### groupBy?

> `optional` **groupBy**: `string`[]

Defined in: [core/src/query-executor.ts:29](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L29)

Group by columns for aggregations

***

### aggregations?

> `optional` **aggregations**: [`ExecutorAggregation`](ExecutorAggregation.md)[]

Defined in: [core/src/query-executor.ts:32](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L32)

Aggregations to compute

***

### orderBy?

> `optional` **orderBy**: [`ExecutorOrderBy`](ExecutorOrderBy.md)[]

Defined in: [core/src/query-executor.ts:35](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L35)

Sort specification

***

### limit?

> `optional` **limit**: `number`

Defined in: [core/src/query-executor.ts:38](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L38)

Maximum rows to return

***

### offset?

> `optional` **offset**: `number`

Defined in: [core/src/query-executor.ts:41](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L41)

Rows to skip

***

### timeoutMs?

> `optional` **timeoutMs**: `number`

Defined in: [core/src/query-executor.ts:44](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L44)

Query timeout in milliseconds

***

### hints?

> `optional` **hints**: `Record`\<`string`, `unknown`\>

Defined in: [core/src/query-executor.ts:47](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L47)

Additional query hints (implementation-specific)
