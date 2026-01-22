[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / SimpleQueryEngine

# Class: SimpleQueryEngine

Defined in: [query/src/simple-engine.ts:946](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L946)

Simple Query Engine - Lightweight query execution for basic use cases.

This engine provides:
- R2 + Cache API integration
- Manifest-based table discovery
- Columnar JSON block reading
- Basic filter, sort, and aggregation using @evodb/core shared operations

Implements the CacheableQueryExecutor interface for cross-package compatibility.

## Implements

- [`CacheableQueryExecutor`](../interfaces/CacheableQueryExecutor.md)

## Constructors

### Constructor

> **new SimpleQueryEngine**(`config`): `SimpleQueryEngine`

Defined in: [query/src/simple-engine.ts:953](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L953)

#### Parameters

##### config

[`SimpleQueryConfig`](../interfaces/SimpleQueryConfig.md)

#### Returns

`SimpleQueryEngine`

## Methods

### refreshManifest()

> **refreshManifest**(): `Promise`\<`void`\>

Defined in: [query/src/simple-engine.ts:981](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L981)

Refresh the manifest from R2

#### Returns

`Promise`\<`void`\>

***

### listTables()

> **listTables**(): `Promise`\<`string`[]\>

Defined in: [query/src/simple-engine.ts:989](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L989)

List all available tables

#### Returns

`Promise`\<`string`[]\>

***

### getTableMetadata()

> **getTableMetadata**(`tableName`): `Promise`\<[`SimpleTableMetadata`](../interfaces/SimpleTableMetadata.md)\>

Defined in: [query/src/simple-engine.ts:997](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L997)

Get metadata for a specific table

#### Parameters

##### tableName

`string`

#### Returns

`Promise`\<[`SimpleTableMetadata`](../interfaces/SimpleTableMetadata.md)\>

***

### scanBlock()

> **scanBlock**(`request`): `Promise`\<[`SimpleBlockScanResult`](../interfaces/SimpleBlockScanResult.md)\>

Defined in: [query/src/simple-engine.ts:1009](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L1009)

Scan a single data block

#### Parameters

##### request

[`SimpleBlockScanRequest`](../interfaces/SimpleBlockScanRequest.md)

#### Returns

`Promise`\<[`SimpleBlockScanResult`](../interfaces/SimpleBlockScanResult.md)\>

***

### query()

> **query**(`request`): `Promise`\<[`SimpleQueryResult`](../interfaces/SimpleQueryResult.md)\>

Defined in: [query/src/simple-engine.ts:1047](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L1047)

Execute a query against the data (simple mode)

#### Parameters

##### request

[`SimpleQueryRequest`](../interfaces/SimpleQueryRequest.md)

#### Returns

`Promise`\<[`SimpleQueryResult`](../interfaces/SimpleQueryResult.md)\>

***

### execute()

> **execute**\<`T`\>(`executorQuery`): `Promise`\<[`ExecutorResult`](../interfaces/ExecutorResult.md)\<`T`\>\>

Defined in: [query/src/simple-engine.ts:1300](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L1300)

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

Defined in: [query/src/simple-engine.ts:1364](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L1364)

Explain the execution plan for a query without executing it.

#### Parameters

##### executorQuery

[`ExecutorQuery`](../interfaces/ExecutorQuery.md)

#### Returns

`Promise`\<[`ExecutorPlan`](../interfaces/ExecutorPlan.md)\>

#### Implementation of

[`CacheableQueryExecutor`](../interfaces/CacheableQueryExecutor.md).[`explain`](../interfaces/CacheableQueryExecutor.md#explain)

***

### getCacheStats()

> **getCacheStats**(): [`ExecutorCacheStats`](../interfaces/ExecutorCacheStats.md)

Defined in: [query/src/simple-engine.ts:1401](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L1401)

Get cache statistics

#### Returns

[`ExecutorCacheStats`](../interfaces/ExecutorCacheStats.md)

#### Implementation of

[`CacheableQueryExecutor`](../interfaces/CacheableQueryExecutor.md).[`getCacheStats`](../interfaces/CacheableQueryExecutor.md#getcachestats)

***

### clearCache()

> **clearCache**(): `Promise`\<`void`\>

Defined in: [query/src/simple-engine.ts:1417](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L1417)

Clear the query cache (resets stats)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`CacheableQueryExecutor`](../interfaces/CacheableQueryExecutor.md).[`clearCache`](../interfaces/CacheableQueryExecutor.md#clearcache)

***

### invalidateCache()

> **invalidateCache**(`_paths`): `Promise`\<`void`\>

Defined in: [query/src/simple-engine.ts:1424](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L1424)

Invalidate specific cache entries (resets stats as Cache API doesn't support selective invalidation easily)

#### Parameters

##### \_paths

`string`[]

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`CacheableQueryExecutor`](../interfaces/CacheableQueryExecutor.md).[`invalidateCache`](../interfaces/CacheableQueryExecutor.md#invalidatecache)
