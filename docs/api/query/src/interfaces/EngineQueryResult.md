[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / EngineQueryResult

# Interface: EngineQueryResult\<T\>

Defined in: [query/src/types.ts:1016](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1016)

Query result container (engine-specific format).

Contains the result rows from query execution along with metadata
about the total result set and execution statistics.

Note: For cross-package compatibility, use `ExecutorResult` from `@evodb/core`
which provides a unified interface. This type is internal to `@evodb/query`.

## Example

```typescript
interface SalesRow {
  region: string;
  total_sales: number;
  order_count: number;
}

const result: EngineQueryResult<SalesRow> = await engine.execute(query);

console.log(`Returned ${result.rows.length} of ${result.totalRowCount} rows`);
console.log(`Execution time: ${result.stats.executionTimeMs}ms`);

for (const row of result.rows) {
  console.log(`${row.region}: $${row.total_sales} (${row.order_count} orders)`);
}

// Pagination
if (result.hasMore && result.continuationToken) {
  const nextPage = await engine.execute(query, {
    continuationToken: result.continuationToken
  });
}
```

## Type Parameters

### T

`T` = `Record`\<`string`, `unknown`\>

Row type, defaults to Record<string, unknown>

## Properties

### rows

> **rows**: `T`[]

Defined in: [query/src/types.ts:1018](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1018)

Result rows

***

### totalRowCount

> **totalRowCount**: `number`

Defined in: [query/src/types.ts:1021](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1021)

Total row count (before LIMIT)

***

### hasMore

> **hasMore**: `boolean`

Defined in: [query/src/types.ts:1024](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1024)

Whether more rows are available

***

### stats

> **stats**: [`EngineQueryStats`](EngineQueryStats.md)

Defined in: [query/src/types.ts:1027](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1027)

Execution statistics

***

### continuationToken?

> `optional` **continuationToken**: `string`

Defined in: [query/src/types.ts:1030](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1030)

Continuation token for pagination
