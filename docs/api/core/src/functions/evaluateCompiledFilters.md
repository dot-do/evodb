[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / evaluateCompiledFilters

# Function: evaluateCompiledFilters()

> **evaluateCompiledFilters**(`row`, `compiledFilters`): `boolean`

Defined in: [core/src/query-ops.ts:613](https://github.com/dot-do/evodb/blob/main/core/src/query-ops.ts#L613)

Evaluate all compiled filters against a row (AND logic).
Uses pre-compiled accessors for fast column value retrieval.

## Parameters

### row

`Record`\<`string`, `unknown`\>

### compiledFilters

[`CompiledFilter`](../interfaces/CompiledFilter.md)[]

## Returns

`boolean`

## Example

```ts
const compiled = compileFilters(filters);
const matchingRows = rows.filter(row => evaluateCompiledFilters(row, compiled));
```
