[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / PlanOperator

# Type Alias: PlanOperator

> **PlanOperator** = [`ScanOperator`](../interfaces/ScanOperator.md) \| [`FilterOperator`](../interfaces/FilterOperator.md) \| [`ProjectOperator`](../interfaces/ProjectOperator.md) \| [`AggregateOperator`](../interfaces/AggregateOperator.md) \| [`SortOperator`](../interfaces/SortOperator.md) \| [`LimitOperator`](../interfaces/LimitOperator.md) \| [`MergeOperator`](../interfaces/MergeOperator.md)

Defined in: [query/src/types.ts:628](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L628)

Plan operator types (execution tree nodes).

Represents all possible operator types in a query execution plan.
The plan forms a tree structure where operators pull data from their
child operators (volcano-style iterator model).

## Example

```typescript
// Type guard for operator types
function isScanOperator(op: PlanOperator): op is ScanOperator {
  return op.type === 'scan';
}

// Recursive plan traversal
function countScans(op: PlanOperator): number {
  if (op.type === 'scan') return 1;
  if (op.type === 'merge') return op.inputs.reduce((sum, i) => sum + countScans(i), 0);
  if ('input' in op) return countScans(op.input);
  return 0;
}
```
