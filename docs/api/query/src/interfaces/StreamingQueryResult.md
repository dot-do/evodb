[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / StreamingQueryResult

# Interface: StreamingQueryResult\<T\>

Defined in: [query/src/types.ts:1163](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1163)

Streaming query result for large result sets.

Provides an async iterator interface for processing results
incrementally without loading all rows into memory.

## Example

```typescript
const stream: StreamingQueryResult<EventRow> = await engine.stream(query);

try {
  for await (const row of stream.rows) {
    await processEvent(row);

    // Check if we should abort
    if (shouldStop) {
      await stream.cancel();
      break;
    }
  }
} finally {
  // Stats available after iteration completes
  const stats = await stream.getStats();
  console.log(`Processed ${stats.rowsMatched} rows`);
}
```

## Type Parameters

### T

`T` = `Record`\<`string`, `unknown`\>

Row type, defaults to Record<string, unknown>

## Properties

### rows

> **rows**: `AsyncIterableIterator`\<`T`\>

Defined in: [query/src/types.ts:1165](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1165)

Async iterator for rows

## Methods

### getStats()

> **getStats**(): `Promise`\<[`EngineQueryStats`](EngineQueryStats.md)\>

Defined in: [query/src/types.ts:1168](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1168)

Get execution stats (available after iteration)

#### Returns

`Promise`\<[`EngineQueryStats`](EngineQueryStats.md)\>

***

### cancel()

> **cancel**(): `Promise`\<`void`\>

Defined in: [query/src/types.ts:1171](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1171)

Cancel the query

#### Returns

`Promise`\<`void`\>

***

### isRunning()

> **isRunning**(): `boolean`

Defined in: [query/src/types.ts:1174](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1174)

Whether query is still running

#### Returns

`boolean`
