[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / StreamingExecutorResult

# Interface: StreamingExecutorResult\<T\>

Defined in: [core/src/query-executor.ts:313](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L313)

Streaming query result with async iteration

## Type Parameters

### T

`T` = `Record`\<`string`, `unknown`\>

## Properties

### rows

> **rows**: `AsyncIterableIterator`\<`T`\>

Defined in: [core/src/query-executor.ts:315](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L315)

Async iterator for rows

## Methods

### getStats()

> **getStats**(): `Promise`\<[`ExecutorStats`](ExecutorStats.md)\>

Defined in: [core/src/query-executor.ts:318](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L318)

Get execution stats (available after iteration completes)

#### Returns

`Promise`\<[`ExecutorStats`](ExecutorStats.md)\>

***

### cancel()

> **cancel**(): `Promise`\<`void`\>

Defined in: [core/src/query-executor.ts:321](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L321)

Cancel the query

#### Returns

`Promise`\<`void`\>

***

### isRunning()

> **isRunning**(): `boolean`

Defined in: [core/src/query-executor.ts:324](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L324)

Check if query is still running

#### Returns

`boolean`
