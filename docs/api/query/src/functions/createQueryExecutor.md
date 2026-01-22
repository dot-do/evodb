[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / createQueryExecutor

# Function: createQueryExecutor()

> **createQueryExecutor**(`config`): [`QueryExecutorAdapter`](../classes/QueryExecutorAdapter.md)

Defined in: [query/src/index.ts:459](https://github.com/dot-do/evodb/blob/main/query/src/index.ts#L459)

Create a QueryExecutor adapter from a QueryEngineConfig.

This is a convenience function that creates both the QueryEngine
and wraps it in a QueryExecutorAdapter.

## Parameters

### config

[`QueryEngineConfig`](../interfaces/QueryEngineConfig.md)

## Returns

[`QueryExecutorAdapter`](../classes/QueryExecutorAdapter.md)

## Example

```typescript
import { createQueryExecutor, type QueryExecutor } from '@evodb/query';

const executor: QueryExecutor = createQueryExecutor({ bucket: env.R2_BUCKET });
const result = await executor.execute({ table: 'users', limit: 10 });
```
