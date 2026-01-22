[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / ExecutorResult

# Interface: ExecutorResult\<T\>

Defined in: [core/src/query-executor.ts:135](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L135)

Unified query result from the QueryExecutor

## Type Parameters

### T

`T` = `Record`\<`string`, `unknown`\>

## Properties

### rows

> **rows**: `T`[]

Defined in: [core/src/query-executor.ts:137](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L137)

Result rows

***

### columns?

> `optional` **columns**: `string`[]

Defined in: [core/src/query-executor.ts:140](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L140)

Column names (if available)

***

### totalRowCount?

> `optional` **totalRowCount**: `number`

Defined in: [core/src/query-executor.ts:143](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L143)

Total row count (before LIMIT, if available)

***

### hasMore?

> `optional` **hasMore**: `boolean`

Defined in: [core/src/query-executor.ts:146](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L146)

Whether more rows are available

***

### stats

> **stats**: [`ExecutorStats`](ExecutorStats.md)

Defined in: [core/src/query-executor.ts:149](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L149)

Execution statistics
