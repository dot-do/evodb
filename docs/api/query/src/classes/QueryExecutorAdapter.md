[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / QueryExecutorAdapter

# Class: QueryExecutorAdapter

Defined in: [query/src/index.ts:244](https://github.com/dot-do/evodb/blob/main/query/src/index.ts#L244)

QueryExecutorAdapter wraps the @evodb/query QueryEngine to provide
the unified QueryExecutor interface from @evodb/core.

This adapter allows @evodb/query's QueryEngine to be used interchangeably
with @evodb/reader when only basic query execution is needed.

## Example

```typescript
import { createQueryEngine, QueryExecutorAdapter, type QueryExecutor } from '@evodb/query';

const engine = createQueryEngine({ bucket: env.R2_BUCKET });
const executor: QueryExecutor = new QueryExecutorAdapter(engine);

// Use unified interface
const result = await executor.execute({
  table: 'com/example/api/users',
  predicates: [{ column: 'status', operator: 'eq', value: 'active' }],
  columns: ['id', 'name'],
  limit: 100,
});
```

## Implements

- [`StreamingQueryExecutor`](../interfaces/StreamingQueryExecutor.md)
- [`CacheableQueryExecutor`](../interfaces/CacheableQueryExecutor.md)

## Constructors

### Constructor

> **new QueryExecutorAdapter**(`engine`): `QueryExecutorAdapter`

Defined in: [query/src/index.ts:247](https://github.com/dot-do/evodb/blob/main/query/src/index.ts#L247)

#### Parameters

##### engine

[`QueryEngine`](QueryEngine.md)

#### Returns

`QueryExecutorAdapter`

## Methods

### execute()

> **execute**\<`T`\>(`executorQuery`): `Promise`\<[`ExecutorResult`](../interfaces/ExecutorResult.md)\<`T`\>\>

Defined in: [query/src/index.ts:254](https://github.com/dot-do/evodb/blob/main/query/src/index.ts#L254)

Execute a query using the unified QueryExecutor interface.

#### Type Parameters

##### T

`T` = `Record`\<`string`, `unknown`\>

#### Parameters

##### executorQuery

[`ExecutorQuery`](../interfaces/ExecutorQuery.md)

#### Returns

`Promise`\<[`ExecutorResult`](../interfaces/ExecutorResult.md)\<`T`\>\>

#### Implementation of

[`CacheableQueryExecutor`](../interfaces/CacheableQueryExecutor.md).[`execute`](../interfaces/CacheableQueryExecutor.md#execute)

***

### explain()

> **explain**(`executorQuery`): `Promise`\<[`ExecutorPlan`](../interfaces/ExecutorPlan.md)\>

Defined in: [query/src/index.ts:315](https://github.com/dot-do/evodb/blob/main/query/src/index.ts#L315)

Explain the execution plan for a query without executing it.

#### Parameters

##### executorQuery

[`ExecutorQuery`](../interfaces/ExecutorQuery.md)

#### Returns

`Promise`\<[`ExecutorPlan`](../interfaces/ExecutorPlan.md)\>

#### Implementation of

[`CacheableQueryExecutor`](../interfaces/CacheableQueryExecutor.md).[`explain`](../interfaces/CacheableQueryExecutor.md#explain)

***

### executeStream()

> **executeStream**\<`T`\>(`executorQuery`): `Promise`\<[`StreamingExecutorResult`](../interfaces/StreamingExecutorResult.md)\<`T`\>\>

Defined in: [query/src/index.ts:367](https://github.com/dot-do/evodb/blob/main/query/src/index.ts#L367)

Execute a query and stream results.

#### Type Parameters

##### T

`T` = `Record`\<`string`, `unknown`\>

#### Parameters

##### executorQuery

[`ExecutorQuery`](../interfaces/ExecutorQuery.md)

#### Returns

`Promise`\<[`StreamingExecutorResult`](../interfaces/StreamingExecutorResult.md)\<`T`\>\>

#### Implementation of

[`StreamingQueryExecutor`](../interfaces/StreamingQueryExecutor.md).[`executeStream`](../interfaces/StreamingQueryExecutor.md#executestream)

***

### getCacheStats()

> **getCacheStats**(): [`ExecutorCacheStats`](../interfaces/ExecutorCacheStats.md)

Defined in: [query/src/index.ts:419](https://github.com/dot-do/evodb/blob/main/query/src/index.ts#L419)

Get cache statistics in the unified ExecutorCacheStats format.

#### Returns

[`ExecutorCacheStats`](../interfaces/ExecutorCacheStats.md)

#### Implementation of

[`CacheableQueryExecutor`](../interfaces/CacheableQueryExecutor.md).[`getCacheStats`](../interfaces/CacheableQueryExecutor.md#getcachestats)

***

### clearCache()

> **clearCache**(): `Promise`\<`void`\>

Defined in: [query/src/index.ts:433](https://github.com/dot-do/evodb/blob/main/query/src/index.ts#L433)

Clear the query cache.

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`CacheableQueryExecutor`](../interfaces/CacheableQueryExecutor.md).[`clearCache`](../interfaces/CacheableQueryExecutor.md#clearcache)

***

### invalidateCache()

> **invalidateCache**(`paths`): `Promise`\<`void`\>

Defined in: [query/src/index.ts:440](https://github.com/dot-do/evodb/blob/main/query/src/index.ts#L440)

Invalidate specific cache entries.

#### Parameters

##### paths

`string`[]

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`CacheableQueryExecutor`](../interfaces/CacheableQueryExecutor.md).[`invalidateCache`](../interfaces/CacheableQueryExecutor.md#invalidatecache)
