[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [rpc/src](../README.md) / LakehouseParentDO

# Class: LakehouseParentDO

Defined in: [rpc/src/server.ts:261](https://github.com/dot-do/evodb/blob/main/rpc/src/server.ts#L261)

Lakehouse Parent Durable Object

Receives CDC from child DOs and flushes to R2.
Uses WebSocket Hibernation for cost-effective real-time streaming.

## Implements

- `DurableObject`

## Constructors

### Constructor

> **new LakehouseParentDO**(`ctx`, `env`): `LakehouseParentDO`

Defined in: [rpc/src/server.ts:271](https://github.com/dot-do/evodb/blob/main/rpc/src/server.ts#L271)

#### Parameters

##### ctx

`DurableObjectState`

##### env

[`LakehouseParentEnv`](../interfaces/LakehouseParentEnv.md)

#### Returns

`LakehouseParentDO`

## Methods

### fetch()

> **fetch**(`request`): `Promise`\<`Response`\>

Defined in: [rpc/src/server.ts:297](https://github.com/dot-do/evodb/blob/main/rpc/src/server.ts#L297)

Handle incoming HTTP requests

For WebSocket upgrades, this establishes the hibernation-aware connection.
For regular HTTP, provides status and management endpoints.

#### Parameters

##### request

`Request`

#### Returns

`Promise`\<`Response`\>

***

### webSocketMessage()

> **webSocketMessage**(`ws`, `message`): `Promise`\<`void`\>

Defined in: [rpc/src/server.ts:378](https://github.com/dot-do/evodb/blob/main/rpc/src/server.ts#L378)

Handle incoming WebSocket message

This is called by the runtime when a hibernated DO receives a message.
The DO is automatically woken up, constructor runs, then this handler.

#### Parameters

##### ws

`WebSocket`

##### message

`string` | `ArrayBuffer`

#### Returns

`Promise`\<`void`\>

***

### webSocketClose()

> **webSocketClose**(`ws`, `_code`, `_reason`, `_wasClean`): `Promise`\<`void`\>

Defined in: [rpc/src/server.ts:418](https://github.com/dot-do/evodb/blob/main/rpc/src/server.ts#L418)

Handle WebSocket close

Called when a WebSocket connection is closed.
Flush any remaining buffer before the connection is fully closed.

#### Parameters

##### ws

`WebSocket`

##### \_code

`number`

##### \_reason

`string`

##### \_wasClean

`boolean`

#### Returns

`Promise`\<`void`\>

***

### webSocketError()

> **webSocketError**(`ws`, `error`): `Promise`\<`void`\>

Defined in: [rpc/src/server.ts:440](https://github.com/dot-do/evodb/blob/main/rpc/src/server.ts#L440)

Handle WebSocket error

#### Parameters

##### ws

`WebSocket`

##### error

`unknown`

#### Returns

`Promise`\<`void`\>

***

### flush()

> **flush**(`trigger`): `Promise`\<[`FlushResult`](../interfaces/FlushResult.md)\>

Defined in: [rpc/src/server.ts:675](https://github.com/dot-do/evodb/blob/main/rpc/src/server.ts#L675)

Flush buffer to R2

#### Parameters

##### trigger

[`FlushTrigger`](../type-aliases/FlushTrigger.md) = `'manual'`

#### Returns

`Promise`\<[`FlushResult`](../interfaces/FlushResult.md)\>

***

### alarm()

> **alarm**(): `Promise`\<`void`\>

Defined in: [rpc/src/server.ts:811](https://github.com/dot-do/evodb/blob/main/rpc/src/server.ts#L811)

Handle scheduled alarm

Used for periodic flushes when DO is not receiving messages.

#### Returns

`Promise`\<`void`\>
