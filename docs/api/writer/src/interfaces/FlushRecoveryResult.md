[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / FlushRecoveryResult

# Interface: FlushRecoveryResult

Defined in: [writer/src/atomic-flush.ts:91](https://github.com/dot-do/evodb/blob/main/writer/src/atomic-flush.ts#L91)

Result of flush recovery

## Properties

### recovered

> **recovered**: [`BlockMetadata`](BlockMetadata.md)[]

Defined in: [writer/src/atomic-flush.ts:93](https://github.com/dot-do/evodb/blob/main/writer/src/atomic-flush.ts#L93)

Flushes that had R2 blocks and were recovered

***

### retried

> **retried**: [`BlockMetadata`](BlockMetadata.md)[]

Defined in: [writer/src/atomic-flush.ts:95](https://github.com/dot-do/evodb/blob/main/writer/src/atomic-flush.ts#L95)

Flushes that were retried (R2 write was missing)

***

### failed

> **failed**: `object`[]

Defined in: [writer/src/atomic-flush.ts:97](https://github.com/dot-do/evodb/blob/main/writer/src/atomic-flush.ts#L97)

Flushes that failed and need manual intervention

#### flush

> **flush**: [`PendingFlush`](PendingFlush.md)

#### error

> **error**: `string`
