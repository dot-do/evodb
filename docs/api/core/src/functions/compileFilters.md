[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / compileFilters

# Function: compileFilters()

> **compileFilters**(`filters`): [`CompiledFilter`](../interfaces/CompiledFilter.md)[]

Defined in: [core/src/query-ops.ts:508](https://github.com/dot-do/evodb/blob/main/core/src/query-ops.ts#L508)

Compile filters for fast evaluation.
This validates column names and parses paths once, not per row.

## Parameters

### filters

[`FilterPredicate`](../interfaces/FilterPredicate.md)[]

## Returns

[`CompiledFilter`](../interfaces/CompiledFilter.md)[]

## Example

```ts
// Compile once before iterating
const compiled = compileFilters(filters);

// Use in tight loop
const results = rows.filter(row => evaluateCompiledFilters(row, compiled));
```
