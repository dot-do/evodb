[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / ExecutorCost

# Interface: ExecutorCost

Defined in: [core/src/query-executor.ts:217](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L217)

Query cost estimation

## Properties

### rowsToScan

> **rowsToScan**: `number`

Defined in: [core/src/query-executor.ts:219](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L219)

Estimated rows to scan

***

### bytesToRead

> **bytesToRead**: `number`

Defined in: [core/src/query-executor.ts:222](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L222)

Estimated bytes to read

***

### outputRows

> **outputRows**: `number`

Defined in: [core/src/query-executor.ts:225](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L225)

Estimated output rows

***

### totalCost

> **totalCost**: `number`

Defined in: [core/src/query-executor.ts:228](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L228)

Total cost (relative, for comparison)
