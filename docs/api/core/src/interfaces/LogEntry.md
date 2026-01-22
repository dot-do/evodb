[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / LogEntry

# Interface: LogEntry

Defined in: [core/src/logging-types.ts:44](https://github.com/dot-do/evodb/blob/main/core/src/logging-types.ts#L44)

A single log entry with all metadata

## Properties

### level

> **level**: [`LogLevel`](../type-aliases/LogLevel.md)

Defined in: [core/src/logging-types.ts:45](https://github.com/dot-do/evodb/blob/main/core/src/logging-types.ts#L45)

***

### message

> **message**: `string`

Defined in: [core/src/logging-types.ts:46](https://github.com/dot-do/evodb/blob/main/core/src/logging-types.ts#L46)

***

### timestamp

> **timestamp**: `number`

Defined in: [core/src/logging-types.ts:47](https://github.com/dot-do/evodb/blob/main/core/src/logging-types.ts#L47)

***

### context?

> `optional` **context**: [`LogContext`](LogContext.md)

Defined in: [core/src/logging-types.ts:48](https://github.com/dot-do/evodb/blob/main/core/src/logging-types.ts#L48)

***

### error?

> `optional` **error**: `Error`

Defined in: [core/src/logging-types.ts:49](https://github.com/dot-do/evodb/blob/main/core/src/logging-types.ts#L49)
