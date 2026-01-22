[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / ExecutorCost

# Interface: ExecutorCost

Defined in: core/dist/query-executor.d.ts:136

Query cost estimation

## Properties

### rowsToScan

> **rowsToScan**: `number`

Defined in: core/dist/query-executor.d.ts:138

Estimated rows to scan

***

### bytesToRead

> **bytesToRead**: `number`

Defined in: core/dist/query-executor.d.ts:140

Estimated bytes to read

***

### outputRows

> **outputRows**: `number`

Defined in: core/dist/query-executor.d.ts:142

Estimated output rows

***

### totalCost

> **totalCost**: `number`

Defined in: core/dist/query-executor.d.ts:144

Total cost (relative, for comparison)
