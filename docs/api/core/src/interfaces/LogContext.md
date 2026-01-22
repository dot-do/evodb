[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / LogContext

# Interface: LogContext

Defined in: [core/src/logging-types.ts:27](https://github.com/dot-do/evodb/blob/main/core/src/logging-types.ts#L27)

Structured context data attached to log entries

## Indexable

\[`key`: `string`\]: [`LogContextValue`](../type-aliases/LogContextValue.md)

## Properties

### requestId?

> `optional` **requestId**: `string`

Defined in: [core/src/logging-types.ts:28](https://github.com/dot-do/evodb/blob/main/core/src/logging-types.ts#L28)

***

### userId?

> `optional` **userId**: `string`

Defined in: [core/src/logging-types.ts:29](https://github.com/dot-do/evodb/blob/main/core/src/logging-types.ts#L29)

***

### sessionId?

> `optional` **sessionId**: `string`

Defined in: [core/src/logging-types.ts:30](https://github.com/dot-do/evodb/blob/main/core/src/logging-types.ts#L30)

***

### service?

> `optional` **service**: `string`

Defined in: [core/src/logging-types.ts:31](https://github.com/dot-do/evodb/blob/main/core/src/logging-types.ts#L31)

***

### operation?

> `optional` **operation**: `string`

Defined in: [core/src/logging-types.ts:32](https://github.com/dot-do/evodb/blob/main/core/src/logging-types.ts#L32)

***

### table?

> `optional` **table**: `string`

Defined in: [core/src/logging-types.ts:33](https://github.com/dot-do/evodb/blob/main/core/src/logging-types.ts#L33)

***

### durationMs?

> `optional` **durationMs**: `number`

Defined in: [core/src/logging-types.ts:34](https://github.com/dot-do/evodb/blob/main/core/src/logging-types.ts#L34)

***

### rowsProcessed?

> `optional` **rowsProcessed**: `number`

Defined in: [core/src/logging-types.ts:35](https://github.com/dot-do/evodb/blob/main/core/src/logging-types.ts#L35)

***

### bytesProcessed?

> `optional` **bytesProcessed**: `number`

Defined in: [core/src/logging-types.ts:36](https://github.com/dot-do/evodb/blob/main/core/src/logging-types.ts#L36)

***

### errorCode?

> `optional` **errorCode**: `string`

Defined in: [core/src/logging-types.ts:37](https://github.com/dot-do/evodb/blob/main/core/src/logging-types.ts#L37)
