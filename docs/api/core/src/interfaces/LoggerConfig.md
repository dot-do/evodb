[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / LoggerConfig

# Interface: LoggerConfig

Defined in: [core/src/logging-types.ts:65](https://github.com/dot-do/evodb/blob/main/core/src/logging-types.ts#L65)

Configuration options for creating a logger

## Extended by

- [`ConsoleLoggerConfig`](ConsoleLoggerConfig.md)

## Properties

### minLevel?

> `optional` **minLevel**: [`LogLevel`](../type-aliases/LogLevel.md)

Defined in: [core/src/logging-types.ts:66](https://github.com/dot-do/evodb/blob/main/core/src/logging-types.ts#L66)

***

### output()?

> `optional` **output**: (`entry`) => `void`

Defined in: [core/src/logging-types.ts:67](https://github.com/dot-do/evodb/blob/main/core/src/logging-types.ts#L67)

#### Parameters

##### entry

[`LogEntry`](LogEntry.md)

#### Returns

`void`
