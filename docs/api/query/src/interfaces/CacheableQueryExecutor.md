[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / CacheableQueryExecutor

# Interface: CacheableQueryExecutor

Defined in: core/dist/query-executor.d.ts:228

Extended QueryExecutor with cache control

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

### getCacheStats()

> **getCacheStats**(): [`ExecutorCacheStats`](ExecutorCacheStats.md)

Defined in: core/dist/query-executor.d.ts:232

Get cache statistics

#### Returns

[`ExecutorCacheStats`](ExecutorCacheStats.md)

***

### clearCache()

> **clearCache**(): `Promise`\<`void`\>

Defined in: core/dist/query-executor.d.ts:236

Clear the query cache

#### Returns

`Promise`\<`void`\>

***

### invalidateCache()

> **invalidateCache**(`paths`): `Promise`\<`void`\>

Defined in: core/dist/query-executor.d.ts:240

Invalidate specific cache entries

#### Parameters

##### paths

`string`[]

#### Returns

`Promise`\<`void`\>
