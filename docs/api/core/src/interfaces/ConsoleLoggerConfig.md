[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / ConsoleLoggerConfig

# Interface: ConsoleLoggerConfig

Defined in: [core/src/logging-types.ts:73](https://github.com/dot-do/evodb/blob/main/core/src/logging-types.ts#L73)

Configuration options for console logger

## Extends

- [`LoggerConfig`](LoggerConfig.md)

## Properties

### minLevel?

> `optional` **minLevel**: [`LogLevel`](../type-aliases/LogLevel.md)

Defined in: [core/src/logging-types.ts:66](https://github.com/dot-do/evodb/blob/main/core/src/logging-types.ts#L66)

#### Inherited from

[`LoggerConfig`](LoggerConfig.md).[`minLevel`](LoggerConfig.md#minlevel)

***

### output()?

> `optional` **output**: (`entry`) => `void`

Defined in: [core/src/logging-types.ts:67](https://github.com/dot-do/evodb/blob/main/core/src/logging-types.ts#L67)

#### Parameters

##### entry

[`LogEntry`](LogEntry.md)

#### Returns

`void`

#### Inherited from

[`LoggerConfig`](LoggerConfig.md).[`output`](LoggerConfig.md#output)

***

### format?

> `optional` **format**: `"json"` \| `"pretty"`

Defined in: [core/src/logging-types.ts:74](https://github.com/dot-do/evodb/blob/main/core/src/logging-types.ts#L74)
