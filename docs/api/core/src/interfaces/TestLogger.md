[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / TestLogger

# Interface: TestLogger

Defined in: [core/src/logging-types.ts:80](https://github.com/dot-do/evodb/blob/main/core/src/logging-types.ts#L80)

Test logger with additional methods for assertions

## Extends

- [`Logger`](Logger.md)

## Methods

### debug()

> **debug**(`message`, `context?`): `void`

Defined in: [core/src/logging-types.ts:56](https://github.com/dot-do/evodb/blob/main/core/src/logging-types.ts#L56)

#### Parameters

##### message

`string`

##### context?

[`LogContext`](LogContext.md)

#### Returns

`void`

#### Inherited from

[`Logger`](Logger.md).[`debug`](Logger.md#debug)

***

### info()

> **info**(`message`, `context?`): `void`

Defined in: [core/src/logging-types.ts:57](https://github.com/dot-do/evodb/blob/main/core/src/logging-types.ts#L57)

#### Parameters

##### message

`string`

##### context?

[`LogContext`](LogContext.md)

#### Returns

`void`

#### Inherited from

[`Logger`](Logger.md).[`info`](Logger.md#info)

***

### warn()

> **warn**(`message`, `context?`): `void`

Defined in: [core/src/logging-types.ts:58](https://github.com/dot-do/evodb/blob/main/core/src/logging-types.ts#L58)

#### Parameters

##### message

`string`

##### context?

[`LogContext`](LogContext.md)

#### Returns

`void`

#### Inherited from

[`Logger`](Logger.md).[`warn`](Logger.md#warn)

***

### error()

> **error**(`message`, `error?`, `context?`): `void`

Defined in: [core/src/logging-types.ts:59](https://github.com/dot-do/evodb/blob/main/core/src/logging-types.ts#L59)

#### Parameters

##### message

`string`

##### error?

`Error`

##### context?

[`LogContext`](LogContext.md)

#### Returns

`void`

#### Inherited from

[`Logger`](Logger.md).[`error`](Logger.md#error)

***

### getLogs()

> **getLogs**(): [`LogEntry`](LogEntry.md)[]

Defined in: [core/src/logging-types.ts:81](https://github.com/dot-do/evodb/blob/main/core/src/logging-types.ts#L81)

#### Returns

[`LogEntry`](LogEntry.md)[]

***

### getLogsByLevel()

> **getLogsByLevel**(`level`): [`LogEntry`](LogEntry.md)[]

Defined in: [core/src/logging-types.ts:82](https://github.com/dot-do/evodb/blob/main/core/src/logging-types.ts#L82)

#### Parameters

##### level

[`LogLevel`](../type-aliases/LogLevel.md)

#### Returns

[`LogEntry`](LogEntry.md)[]

***

### clear()

> **clear**(): `void`

Defined in: [core/src/logging-types.ts:83](https://github.com/dot-do/evodb/blob/main/core/src/logging-types.ts#L83)

#### Returns

`void`
