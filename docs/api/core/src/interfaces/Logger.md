[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / Logger

# Interface: Logger

Defined in: [core/src/logging-types.ts:55](https://github.com/dot-do/evodb/blob/main/core/src/logging-types.ts#L55)

Logger interface - the core abstraction for logging

## Extended by

- [`TestLogger`](TestLogger.md)

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
