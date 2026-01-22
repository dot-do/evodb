[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / LakehouseParentDO

# Abstract Class: LakehouseParentDO

Defined in: [writer/src/parent-do.ts:53](https://github.com/dot-do/evodb/blob/main/writer/src/parent-do.ts#L53)

Abstract base class for Parent DO
Extend this with your own implementation

## Extended by

- [`ExampleLakehouseParentDO`](ExampleLakehouseParentDO.md)
- [`EdgeCacheParentDO`](EdgeCacheParentDO.md)
- [`EnterpriseParentDO`](EnterpriseParentDO.md)

## Constructors

### Constructor

> **new LakehouseParentDO**(`state`, `env`): `LakehouseParentDO`

Defined in: [writer/src/parent-do.ts:59](https://github.com/dot-do/evodb/blob/main/writer/src/parent-do.ts#L59)

#### Parameters

##### state

`DurableObjectState`

##### env

[`ParentDOEnv`](../interfaces/ParentDOEnv.md)

#### Returns

`LakehouseParentDO`

## Properties

### state

> `protected` `readonly` **state**: `DurableObjectState`

Defined in: [writer/src/parent-do.ts:54](https://github.com/dot-do/evodb/blob/main/writer/src/parent-do.ts#L54)

***

### env

> `protected` `readonly` **env**: [`ParentDOEnv`](../interfaces/ParentDOEnv.md)

Defined in: [writer/src/parent-do.ts:55](https://github.com/dot-do/evodb/blob/main/writer/src/parent-do.ts#L55)

***

### writer

> `protected` **writer**: [`LakehouseWriter`](LakehouseWriter.md)

Defined in: [writer/src/parent-do.ts:56](https://github.com/dot-do/evodb/blob/main/writer/src/parent-do.ts#L56)

***

### connectedSockets

> `protected` **connectedSockets**: `Map`\<`string`, `TrackedWebSocket`\>

Defined in: [writer/src/parent-do.ts:57](https://github.com/dot-do/evodb/blob/main/writer/src/parent-do.ts#L57)

## Methods

### getTableLocation()

> `abstract` `protected` **getTableLocation**(): `string`

Defined in: [writer/src/parent-do.ts:78](https://github.com/dot-do/evodb/blob/main/writer/src/parent-do.ts#L78)

Get the table location for this DO (override in subclass)

#### Returns

`string`

***

### getPartitionMode()

> `protected` **getPartitionMode**(): [`PartitionMode`](../type-aliases/PartitionMode.md)

Defined in: [writer/src/parent-do.ts:83](https://github.com/dot-do/evodb/blob/main/writer/src/parent-do.ts#L83)

Get the partition mode (override to customize)

#### Returns

[`PartitionMode`](../type-aliases/PartitionMode.md)

***

### getWriterOptions()

> `protected` **getWriterOptions**(): `Partial`\<[`WriterOptions`](../interfaces/WriterOptions.md)\>

Defined in: [writer/src/parent-do.ts:90](https://github.com/dot-do/evodb/blob/main/writer/src/parent-do.ts#L90)

Get additional writer options (override to customize)

#### Returns

`Partial`\<[`WriterOptions`](../interfaces/WriterOptions.md)\>

***

### initialize()

> `protected` **initialize**(): `Promise`\<`void`\>

Defined in: [writer/src/parent-do.ts:97](https://github.com/dot-do/evodb/blob/main/writer/src/parent-do.ts#L97)

Initialize the writer (call in fetch/webSocketMessage)

#### Returns

`Promise`\<`void`\>

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

***

### alarm()

> **alarm**(): `Promise`\<`void`\>

Defined in: [writer/src/parent-do.ts:476](https://github.com/dot-do/evodb/blob/main/writer/src/parent-do.ts#L476)

Handle alarm (called periodically by DO runtime)

#### Returns

`Promise`\<`void`\>

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

***

### getWriter()

> `protected` **getWriter**(): [`LakehouseWriter`](LakehouseWriter.md)

Defined in: [writer/src/parent-do.ts:626](https://github.com/dot-do/evodb/blob/main/writer/src/parent-do.ts#L626)

Get writer for direct access

#### Returns

[`LakehouseWriter`](LakehouseWriter.md)
