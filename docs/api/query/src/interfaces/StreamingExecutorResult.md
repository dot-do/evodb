[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / StreamingExecutorResult

# Interface: StreamingExecutorResult\<T\>

Defined in: core/dist/query-executor.d.ts:215

Streaming query result with async iteration

## Type Parameters

### T

`T` = `Record`\<`string`, `unknown`\>

## Properties

### rows

> **rows**: `AsyncIterableIterator`\<`T`\>

Defined in: core/dist/query-executor.d.ts:217

Async iterator for rows

## Methods

### getStats()

> **getStats**(): `Promise`\<[`ExecutorStats`](ExecutorStats.md)\>

Defined in: core/dist/query-executor.d.ts:219

Get execution stats (available after iteration completes)

#### Returns

`Promise`\<[`ExecutorStats`](ExecutorStats.md)\>

***

### cancel()

> **cancel**(): `Promise`\<`void`\>

Defined in: core/dist/query-executor.d.ts:221

Cancel the query

#### Returns

`Promise`\<`void`\>

***

### isRunning()

> **isRunning**(): `boolean`

Defined in: core/dist/query-executor.d.ts:223

Check if query is still running

#### Returns

`boolean`
