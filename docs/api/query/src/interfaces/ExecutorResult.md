[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / ExecutorResult

# Interface: ExecutorResult\<T\>

Defined in: core/dist/query-executor.d.ts:79

Unified query result from the QueryExecutor

## Type Parameters

### T

`T` = `Record`\<`string`, `unknown`\>

## Properties

### rows

> **rows**: `T`[]

Defined in: core/dist/query-executor.d.ts:81

Result rows

***

### columns?

> `optional` **columns**: `string`[]

Defined in: core/dist/query-executor.d.ts:83

Column names (if available)

***

### totalRowCount?

> `optional` **totalRowCount**: `number`

Defined in: core/dist/query-executor.d.ts:85

Total row count (before LIMIT, if available)

***

### hasMore?

> `optional` **hasMore**: `boolean`

Defined in: core/dist/query-executor.d.ts:87

Whether more rows are available

***

### stats

> **stats**: [`ExecutorStats`](ExecutorStats.md)

Defined in: core/dist/query-executor.d.ts:89

Execution statistics
