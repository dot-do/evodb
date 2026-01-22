[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / EnterpriseParentDO

# Abstract Class: EnterpriseParentDO

Defined in: [writer/src/parent-do.ts:696](https://github.com/dot-do/evodb/blob/main/writer/src/parent-do.ts#L696)

Pre-configured Parent DO for enterprise mode (5GB blocks)

## Extends

- [`LakehouseParentDO`](LakehouseParentDO.md)

## Constructors

### Constructor

> **new EnterpriseParentDO**(`state`, `env`): `EnterpriseParentDO`

Defined in: [writer/src/parent-do.ts:59](https://github.com/dot-do/evodb/blob/main/writer/src/parent-do.ts#L59)

#### Parameters

##### state

`DurableObjectState`

##### env

[`ParentDOEnv`](../interfaces/ParentDOEnv.md)

#### Returns

`EnterpriseParentDO`

#### Inherited from

[`LakehouseParentDO`](LakehouseParentDO.md).[`constructor`](LakehouseParentDO.md#constructor)

## Properties

### state

> `protected` `readonly` **state**: `DurableObjectState`

Defined in: [writer/src/parent-do.ts:54](https://github.com/dot-do/evodb/blob/main/writer/src/parent-do.ts#L54)

#### Inherited from

[`LakehouseParentDO`](LakehouseParentDO.md).[`state`](LakehouseParentDO.md#state)

***

### env

> `protected` `readonly` **env**: [`ParentDOEnv`](../interfaces/ParentDOEnv.md)

Defined in: [writer/src/parent-do.ts:55](https://github.com/dot-do/evodb/blob/main/writer/src/parent-do.ts#L55)

#### Inherited from

[`LakehouseParentDO`](LakehouseParentDO.md).[`env`](LakehouseParentDO.md#env)

***

### writer

> `protected` **writer**: [`LakehouseWriter`](LakehouseWriter.md)

Defined in: [writer/src/parent-do.ts:56](https://github.com/dot-do/evodb/blob/main/writer/src/parent-do.ts#L56)

#### Inherited from

[`LakehouseParentDO`](LakehouseParentDO.md).[`writer`](LakehouseParentDO.md#writer)

***

### connectedSockets

> `protected` **connectedSockets**: `Map`\<`string`, `TrackedWebSocket`\>

Defined in: [writer/src/parent-do.ts:57](https://github.com/dot-do/evodb/blob/main/writer/src/parent-do.ts#L57)

#### Inherited from

[`LakehouseParentDO`](LakehouseParentDO.md).[`connectedSockets`](LakehouseParentDO.md#connectedsockets)

## Methods

### initialize()

> `protected` **initialize**(): `Promise`\<`void`\>

Defined in: [writer/src/parent-do.ts:97](https://github.com/dot-do/evodb/blob/main/writer/src/parent-do.ts#L97)

Initialize the writer (call in fetch/webSocketMessage)

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`LakehouseParentDO`](LakehouseParentDO.md).[`initialize`](LakehouseParentDO.md#initialize)

***

### fetch()

> **fetch**(`request`): `Promise`\<`Response`\>

Defined in: [writer/src/parent-do.ts:105](https://github.com/dot-do/evodb/blob/main/writer/src/parent-do.ts#L105)

Handle HTTP requests

#### Parameters

##### request

`Request`

#### Returns

`Promise`\<`Response`\>

#### Inherited from

[`LakehouseParentDO`](LakehouseParentDO.md).[`fetch`](LakehouseParentDO.md#fetch)

***

### webSocketMessage()

> **webSocketMessage**(`ws`, `message`): `Promise`\<`void`\>

Defined in: [writer/src/parent-do.ts:162](https://github.com/dot-do/evodb/blob/main/writer/src/parent-do.ts#L162)

Handle incoming WebSocket message (hibernation-compatible)

#### Parameters

##### ws

`WebSocket`

##### message

`string` | `ArrayBuffer`

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`LakehouseParentDO`](LakehouseParentDO.md).[`webSocketMessage`](LakehouseParentDO.md#websocketmessage)

***

### webSocketClose()

> **webSocketClose**(`ws`, `_code`, `_reason`): `Promise`\<`void`\>

Defined in: [writer/src/parent-do.ts:455](https://github.com/dot-do/evodb/blob/main/writer/src/parent-do.ts#L455)

Handle WebSocket close (hibernation-compatible)

#### Parameters

##### ws

`WebSocket`

##### \_code

`number`

##### \_reason

`string`

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`LakehouseParentDO`](LakehouseParentDO.md).[`webSocketClose`](LakehouseParentDO.md#websocketclose)

***

### webSocketError()

> **webSocketError**(`ws`, `error`): `Promise`\<`void`\>

Defined in: [writer/src/parent-do.ts:468](https://github.com/dot-do/evodb/blob/main/writer/src/parent-do.ts#L468)

Handle WebSocket error (hibernation-compatible)

#### Parameters

##### ws

`WebSocket`

##### error

`unknown`

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`LakehouseParentDO`](LakehouseParentDO.md).[`webSocketError`](LakehouseParentDO.md#websocketerror)

***

### alarm()

> **alarm**(): `Promise`\<`void`\>

Defined in: [writer/src/parent-do.ts:476](https://github.com/dot-do/evodb/blob/main/writer/src/parent-do.ts#L476)

Handle alarm (called periodically by DO runtime)

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`LakehouseParentDO`](LakehouseParentDO.md).[`alarm`](LakehouseParentDO.md#alarm)

***

### onFlush()

> `protected` **onFlush**(`_result`): `Promise`\<`void`\>

Defined in: [writer/src/parent-do.ts:521](https://github.com/dot-do/evodb/blob/main/writer/src/parent-do.ts#L521)

Callback when flush completes (override to customize)

#### Parameters

##### \_result

[`FlushResult`](../interfaces/FlushResult.md)

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`LakehouseParentDO`](LakehouseParentDO.md).[`onFlush`](LakehouseParentDO.md#onflush)

***

### onCompact()

> `protected` **onCompact**(`_result`): `Promise`\<`void`\>

Defined in: [writer/src/parent-do.ts:528](https://github.com/dot-do/evodb/blob/main/writer/src/parent-do.ts#L528)

Callback when compaction completes (override to customize)

#### Parameters

##### \_result

[`CompactResult`](../interfaces/CompactResult.md)

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`LakehouseParentDO`](LakehouseParentDO.md).[`onCompact`](LakehouseParentDO.md#oncompact)

***

### broadcastMessage()

> `protected` **broadcastMessage**(`message`): `void`

Defined in: [writer/src/parent-do.ts:612](https://github.com/dot-do/evodb/blob/main/writer/src/parent-do.ts#L612)

Broadcast message to all connected sockets

#### Parameters

##### message

`unknown`

#### Returns

`void`

#### Inherited from

[`LakehouseParentDO`](LakehouseParentDO.md).[`broadcastMessage`](LakehouseParentDO.md#broadcastmessage)

***

### getWriter()

> `protected` **getWriter**(): [`LakehouseWriter`](LakehouseWriter.md)

Defined in: [writer/src/parent-do.ts:626](https://github.com/dot-do/evodb/blob/main/writer/src/parent-do.ts#L626)

Get writer for direct access

#### Returns

[`LakehouseWriter`](LakehouseWriter.md)

#### Inherited from

[`LakehouseParentDO`](LakehouseParentDO.md).[`getWriter`](LakehouseParentDO.md#getwriter)

***

### getTableLocation()

> `abstract` `protected` **getTableLocation**(): `string`

Defined in: [writer/src/parent-do.ts:697](https://github.com/dot-do/evodb/blob/main/writer/src/parent-do.ts#L697)

Get the table location for this DO (override in subclass)

#### Returns

`string`

#### Overrides

[`LakehouseParentDO`](LakehouseParentDO.md).[`getTableLocation`](LakehouseParentDO.md#gettablelocation)

***

### getPartitionMode()

> `protected` **getPartitionMode**(): [`PartitionMode`](../type-aliases/PartitionMode.md)

Defined in: [writer/src/parent-do.ts:699](https://github.com/dot-do/evodb/blob/main/writer/src/parent-do.ts#L699)

Get the partition mode (override to customize)

#### Returns

[`PartitionMode`](../type-aliases/PartitionMode.md)

#### Overrides

[`LakehouseParentDO`](LakehouseParentDO.md).[`getPartitionMode`](LakehouseParentDO.md#getpartitionmode)

***

### getWriterOptions()

> `protected` **getWriterOptions**(): `Partial`\<[`WriterOptions`](../interfaces/WriterOptions.md)\>

Defined in: [writer/src/parent-do.ts:703](https://github.com/dot-do/evodb/blob/main/writer/src/parent-do.ts#L703)

Get additional writer options (override to customize)

#### Returns

`Partial`\<[`WriterOptions`](../interfaces/WriterOptions.md)\>

#### Overrides

[`LakehouseParentDO`](LakehouseParentDO.md).[`getWriterOptions`](LakehouseParentDO.md#getwriteroptions)
