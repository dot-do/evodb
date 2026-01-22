[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / StreamingQueryExecutor

# Interface: StreamingQueryExecutor

Defined in: core/dist/query-executor.d.ts:203

Extended QueryExecutor with streaming support

## Extends

- [`QueryExecutor`](QueryExecutor.md)

## Methods

### execute()

> **execute**\<`T`\>(`query`): `Promise`\<[`ExecutorResult`](ExecutorResult.md)\<`T`\>\>

Defined in: core/dist/query-executor.d.ts:186

Execute a query and return results.

#### Type Parameters

##### T

`T` = `Record`\<`string`, `unknown`\>

#### Parameters

##### query

[`ExecutorQuery`](ExecutorQuery.md)

The query specification

#### Returns

`Promise`\<[`ExecutorResult`](ExecutorResult.md)\<`T`\>\>

Promise resolving to query results

#### Throws

Error if query execution fails

#### Inherited from

[`QueryExecutor`](QueryExecutor.md).[`execute`](QueryExecutor.md#execute)

***

### explain()

> **explain**(`query`): `Promise`\<[`ExecutorPlan`](ExecutorPlan.md)\>

Defined in: core/dist/query-executor.d.ts:198

Explain the execution plan for a query without executing it.

This is useful for:
- Understanding how the query will be executed
- Estimating query cost before execution
- Debugging slow queries

#### Parameters

##### query

[`ExecutorQuery`](ExecutorQuery.md)

The query specification

#### Returns

`Promise`\<[`ExecutorPlan`](ExecutorPlan.md)\>

Promise resolving to the query plan

#### Inherited from

[`QueryExecutor`](QueryExecutor.md).[`explain`](QueryExecutor.md#explain)

***

### executeStream()

> **executeStream**\<`T`\>(`query`): `Promise`\<[`StreamingExecutorResult`](StreamingExecutorResult.md)\<`T`\>\>

Defined in: core/dist/query-executor.d.ts:210

Execute a query and stream results.

#### Type Parameters

##### T

`T` = `Record`\<`string`, `unknown`\>

#### Parameters

##### query

[`ExecutorQuery`](ExecutorQuery.md)

The query specification

#### Returns

`Promise`\<[`StreamingExecutorResult`](StreamingExecutorResult.md)\<`T`\>\>

Promise resolving to a streaming result
