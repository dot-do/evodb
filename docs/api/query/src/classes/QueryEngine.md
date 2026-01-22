[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / QueryEngine

# Class: QueryEngine

Defined in: [query/src/engine.ts:1823](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L1823)

EvoDB Query Engine

Executes queries against R2-stored columnar data with:
- Zone map optimization for partition pruning
- Bloom filter support for point lookups
- Edge cache integration
- Streaming results for large queries

## Constructors

### Constructor

> **new QueryEngine**(`config`): `QueryEngine`

Defined in: [query/src/engine.ts:1850](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L1850)

#### Parameters

##### config

[`QueryEngineConfig`](../interfaces/QueryEngineConfig.md)

#### Returns

`QueryEngine`

## Methods

### execute()

> **execute**\<`T`\>(`query`, `options?`): `Promise`\<[`QueryResult`](../type-aliases/QueryResult.md)\<`T`\>\>

Defined in: [query/src/engine.ts:1902](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L1902)

Execute a query and return all results

#### Type Parameters

##### T

`T` = `Record`\<`string`, `unknown`\>

#### Parameters

##### query

[`Query`](../interfaces/Query.md)

The query to execute

##### options?

[`QueryExecutionOptions`](../interfaces/QueryExecutionOptions.md)

Execution options including AbortSignal for cancellation

#### Returns

`Promise`\<[`QueryResult`](../type-aliases/QueryResult.md)\<`T`\>\>

Query result with rows and statistics

#### Throws

If the query is aborted via AbortSignal

#### Example

```typescript
// Execute with cancellation support
const controller = new AbortController();
const promise = engine.execute(query, { signal: controller.signal });

// Cancel if needed
controller.abort('User cancelled');
```

***

### executeStream()

> **executeStream**\<`T`\>(`query`, `options?`): `Promise`\<[`StreamingQueryResult`](../interfaces/StreamingQueryResult.md)\<`T`\>\>

Defined in: [query/src/engine.ts:2428](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L2428)

Execute a query and stream results

#### Type Parameters

##### T

`T` = `Record`\<`string`, `unknown`\>

#### Parameters

##### query

[`Query`](../interfaces/Query.md)

The query to execute

##### options?

[`QueryExecutionOptions`](../interfaces/QueryExecutionOptions.md)

Execution options including AbortSignal for cancellation

#### Returns

`Promise`\<[`StreamingQueryResult`](../interfaces/StreamingQueryResult.md)\<`T`\>\>

Streaming query result with async iterator

#### Throws

If the query is aborted via AbortSignal

#### Example

```typescript
const controller = new AbortController();
const stream = await engine.executeStream(query, { signal: controller.signal });

for await (const row of stream.rows) {
  // Process row
  if (shouldStop) {
    controller.abort();
    break;
  }
}
```

***

### plan()

> **plan**(`query`, `options?`): `Promise`\<[`QueryPlan`](../interfaces/QueryPlan.md)\>

Defined in: [query/src/engine.ts:2585](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L2585)

Create an execution plan without running the query

#### Parameters

##### query

[`Query`](../interfaces/Query.md)

The query to plan

##### options?

[`QueryExecutionOptions`](../interfaces/QueryExecutionOptions.md)

Execution options including AbortSignal for cancellation

#### Returns

`Promise`\<[`QueryPlan`](../interfaces/QueryPlan.md)\>

Query execution plan

#### Throws

If the planning is aborted via AbortSignal

***

### executePlan()

> **executePlan**\<`T`\>(`plan`): `Promise`\<[`QueryResult`](../type-aliases/QueryResult.md)\<`T`\>\>

Defined in: [query/src/engine.ts:2603](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L2603)

Execute a pre-compiled query plan

#### Type Parameters

##### T

`T` = `Record`\<`string`, `unknown`\>

#### Parameters

##### plan

[`QueryPlan`](../interfaces/QueryPlan.md)

#### Returns

`Promise`\<[`QueryResult`](../type-aliases/QueryResult.md)\<`T`\>\>

***

### getCacheStats()

> **getCacheStats**(): [`CacheStats`](../interfaces/CacheStats.md)

Defined in: [query/src/engine.ts:2610](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L2610)

Get cache statistics

#### Returns

[`CacheStats`](../interfaces/CacheStats.md)

***

### clearCache()

> **clearCache**(): `Promise`\<`void`\>

Defined in: [query/src/engine.ts:2617](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L2617)

Clear the query cache

#### Returns

`Promise`\<`void`\>

***

### invalidateCache()

> **invalidateCache**(`paths`): `Promise`\<`void`\>

Defined in: [query/src/engine.ts:2624](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L2624)

Invalidate cache for specific partitions

#### Parameters

##### paths

`string`[]

#### Returns

`Promise`\<`void`\>

***

### query()

> **query**(`request`): `Promise`\<`SimpleQueryResult`\>

Defined in: [query/src/engine.ts:2641](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L2641)

Execute a simple query (backward compatible with SimpleQueryEngine.query())

This method provides the same interface as SimpleQueryEngine for easy migration.
It accepts SimpleQueryRequest format and returns SimpleQueryResult format.

#### Parameters

##### request

`SimpleQueryRequest`

Simple query request

#### Returns

`Promise`\<`SimpleQueryResult`\>

Simple query result with columnar format

***

### listTables()

> **listTables**(): `Promise`\<`string`[]\>

Defined in: [query/src/engine.ts:2789](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L2789)

List all tables (for simple query mode)

#### Returns

`Promise`\<`string`[]\>

***

### getTableMetadata()

> **getTableMetadata**(`tableName`): `Promise`\<`SimpleTableInfo`\>

Defined in: [query/src/engine.ts:2804](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L2804)

Get table metadata (for simple query mode)

#### Parameters

##### tableName

`string`

#### Returns

`Promise`\<`SimpleTableInfo`\>

***

### refreshManifest()

> **refreshManifest**(): `Promise`\<`void`\>

Defined in: [query/src/engine.ts:2824](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L2824)

Refresh manifest (for simple query mode)

#### Returns

`Promise`\<`void`\>
