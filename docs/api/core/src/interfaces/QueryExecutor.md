[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / QueryExecutor

# Interface: QueryExecutor

Defined in: [core/src/query-executor.ts:267](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L267)

Unified QueryExecutor interface for query execution.

This interface provides a common API for executing queries across
different EvoDB query engine implementations:

- @evodb/reader: Worker-based reader with Cache API integration
- @evodb/query: Full query engine with zone maps and bloom filters

Implementations can extend this interface with additional methods
specific to their use case (e.g., streaming, caching controls).

## Example

```typescript
// Using QueryExecutor interface
async function runQuery(executor: QueryExecutor) {
  const query: ExecutorQuery = {
    table: 'users',
    predicates: [{ column: 'status', operator: 'eq', value: 'active' }],
    columns: ['id', 'name', 'email'],
    limit: 100,
  };

  const result = await executor.execute(query);
  console.log(`Found ${result.rows.length} users`);

  // Optionally explain the query plan
  const plan = await executor.explain(query);
  console.log(`Estimated cost: ${plan.estimatedCost.totalCost}`);
}
```

## Extended by

- [`StreamingQueryExecutor`](StreamingQueryExecutor.md)
- [`CacheableQueryExecutor`](CacheableQueryExecutor.md)

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
