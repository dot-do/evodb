[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / QueryExecutionOptions

# Interface: QueryExecutionOptions

Defined in: [query/src/types.ts:526](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L526)

Query execution options.

Options passed to query execution methods like `execute()`, `executeStream()`,
and `plan()`. These are runtime options separate from query hints.

## Example

```typescript
// Execute with cancellation support
const controller = new AbortController();
const result = await engine.execute(query, { signal: controller.signal });

// Cancel the query if needed
controller.abort('User cancelled');

// Use AbortSignal.timeout() for automatic timeout
const result = await engine.execute(query, {
  signal: AbortSignal.timeout(5000)
});
```

## Properties

### signal?

> `optional` **signal**: `AbortSignal`

Defined in: [query/src/types.ts:544](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L544)

AbortSignal for query cancellation.

When the signal is aborted, the query will stop execution and throw
an error. This allows cancelling long-running queries from outside.

#### Example

```typescript
const controller = new AbortController();

// Start a query
const queryPromise = engine.execute(query, { signal: controller.signal });

// Cancel it later
controller.abort('Query took too long');
```
