[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / QueryCost

# Interface: QueryCost

Defined in: [query/src/types.ts:950](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L950)

Query cost estimation.

Contains estimated metrics for a query plan used by the optimizer
to choose between alternative execution strategies and for capacity
planning.

## Example

```typescript
const cost: QueryCost = {
  rowsToScan: 1000000,
  bytesToRead: 104857600,
  outputRows: 5000,
  memoryBytes: 52428800,
  cpuCost: 1000,
  ioCost: 500,
  totalCost: 1500
};
```

## Properties

### rowsToScan

> **rowsToScan**: `number`

Defined in: [query/src/types.ts:952](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L952)

Estimated rows to scan

***

### bytesToRead

> **bytesToRead**: `number`

Defined in: [query/src/types.ts:955](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L955)

Estimated bytes to read from R2

***

### outputRows

> **outputRows**: `number`

Defined in: [query/src/types.ts:958](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L958)

Estimated output rows

***

### memoryBytes

> **memoryBytes**: `number`

Defined in: [query/src/types.ts:961](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L961)

Estimated memory usage

***

### cpuCost

> **cpuCost**: `number`

Defined in: [query/src/types.ts:964](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L964)

Estimated CPU cost (relative)

***

### ioCost

> **ioCost**: `number`

Defined in: [query/src/types.ts:967](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L967)

Estimated I/O cost (relative)

***

### totalCost

> **totalCost**: `number`

Defined in: [query/src/types.ts:970](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L970)

Total cost (weighted combination)

***

### estimatedSubrequests?

> `optional` **estimatedSubrequests**: `number`

Defined in: [query/src/types.ts:973](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L973)

Estimated subrequests needed for this query
