[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / WriterMetrics

# Interface: WriterMetrics

Defined in: [writer/src/strategies/interfaces.ts:261](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L261)

Metrics tracked by the writer

## Properties

### cdcEntriesReceived

> **cdcEntriesReceived**: `number`

Defined in: [writer/src/strategies/interfaces.ts:263](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L263)

Total CDC entries received

***

### flushCount

> **flushCount**: `number`

Defined in: [writer/src/strategies/interfaces.ts:265](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L265)

Total flushes performed

***

### compactCount

> **compactCount**: `number`

Defined in: [writer/src/strategies/interfaces.ts:267](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L267)

Total compactions performed

***

### r2WriteFailures

> **r2WriteFailures**: `number`

Defined in: [writer/src/strategies/interfaces.ts:269](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L269)

R2 write failures

***

### retryCount

> **retryCount**: `number`

Defined in: [writer/src/strategies/interfaces.ts:271](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L271)

Retry attempts
