[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / CacheableQueryExecutor

# Interface: CacheableQueryExecutor

Defined in: [core/src/query-executor.ts:330](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L330)

Extended QueryExecutor with cache control

## Extends

- [`QueryExecutor`](QueryExecutor.md)

## Methods

### execute()

> **execute**\<`T`\>(`query`): `Promise`\<[`ExecutorResult`](ExecutorResult.md)\<`T`\>\>

Defined in: [core/src/query-executor.ts:275](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L275)

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

Defined in: [core/src/query-executor.ts:288](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L288)

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

### getCacheStats()

> **getCacheStats**(): [`ExecutorCacheStats`](ExecutorCacheStats.md)

Defined in: [core/src/query-executor.ts:334](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L334)

Get cache statistics

#### Returns

[`ExecutorCacheStats`](ExecutorCacheStats.md)

***

### clearCache()

> **clearCache**(): `Promise`\<`void`\>

Defined in: [core/src/query-executor.ts:339](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L339)

Clear the query cache

#### Returns

`Promise`\<`void`\>

***

### invalidateCache()

> **invalidateCache**(`paths`): `Promise`\<`void`\>

Defined in: [core/src/query-executor.ts:344](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L344)

Invalidate specific cache entries

#### Parameters

##### paths

`string`[]

#### Returns

`Promise`\<`void`\>
