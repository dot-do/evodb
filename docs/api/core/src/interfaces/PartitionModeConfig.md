[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / PartitionModeConfig

# Interface: PartitionModeConfig

Defined in: [core/src/partition-modes.ts:55](https://github.com/dot-do/evodb/blob/main/core/src/partition-modes.ts#L55)

Configuration for a partition mode

## Properties

### mode

> **mode**: [`PartitionMode`](../type-aliases/PartitionMode.md)

Defined in: [core/src/partition-modes.ts:57](https://github.com/dot-do/evodb/blob/main/core/src/partition-modes.ts#L57)

Mode identifier

***

### maxPartitionSizeBytes

> **maxPartitionSizeBytes**: `number`

Defined in: [core/src/partition-modes.ts:60](https://github.com/dot-do/evodb/blob/main/core/src/partition-modes.ts#L60)

Maximum partition size in bytes

***

### description

> **description**: `string`

Defined in: [core/src/partition-modes.ts:63](https://github.com/dot-do/evodb/blob/main/core/src/partition-modes.ts#L63)

Human-readable description

***

### recommendedBlockSizeBytes

> **recommendedBlockSizeBytes**: `number`

Defined in: [core/src/partition-modes.ts:66](https://github.com/dot-do/evodb/blob/main/core/src/partition-modes.ts#L66)

Recommended block size for writes

***

### minEfficientDataSizeBytes

> **minEfficientDataSizeBytes**: `number`

Defined in: [core/src/partition-modes.ts:69](https://github.com/dot-do/evodb/blob/main/core/src/partition-modes.ts#L69)

Minimum data size where this mode is efficient

***

### maxEfficientDataSizeBytes

> **maxEfficientDataSizeBytes**: `number`

Defined in: [core/src/partition-modes.ts:72](https://github.com/dot-do/evodb/blob/main/core/src/partition-modes.ts#L72)

Maximum data size this mode supports efficiently

***

### targetRowsPerPartition

> **targetRowsPerPartition**: `number`

Defined in: [core/src/partition-modes.ts:75](https://github.com/dot-do/evodb/blob/main/core/src/partition-modes.ts#L75)

Target number of rows per partition (guideline)

***

### usesR2

> **usesR2**: `boolean`

Defined in: [core/src/partition-modes.ts:78](https://github.com/dot-do/evodb/blob/main/core/src/partition-modes.ts#L78)

Whether this mode uses R2 storage

***

### usesDOSqlite

> **usesDOSqlite**: `boolean`

Defined in: [core/src/partition-modes.ts:81](https://github.com/dot-do/evodb/blob/main/core/src/partition-modes.ts#L81)

Whether this mode uses DO SQLite

***

### cacheTtlHintSeconds

> **cacheTtlHintSeconds**: `number`

Defined in: [core/src/partition-modes.ts:84](https://github.com/dot-do/evodb/blob/main/core/src/partition-modes.ts#L84)

Cache TTL hint in seconds
