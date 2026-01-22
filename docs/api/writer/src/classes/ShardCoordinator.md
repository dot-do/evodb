[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / ShardCoordinator

# Abstract Class: ShardCoordinator

Defined in: [writer/src/sharded-parent-do.ts:129](https://github.com/dot-do/evodb/blob/main/writer/src/sharded-parent-do.ts#L129)

ShardCoordinator - Routes CDC messages to appropriate shard writers

This is the entry point for CDC streams. It:
1. Receives WebSocket connections from child DOs
2. Extracts routing key (tenant/table) from messages
3. Routes messages to appropriate shard writers
4. Forwards acknowledgments back to child DOs

## Example

```typescript
// In wrangler.toml:
// [[durable_objects.bindings]]
// name = "SHARD_COORDINATOR"
// class_name = "ShardCoordinator"
//
// [[durable_objects.bindings]]
// name = "SHARD_WRITERS"
// class_name = "ShardWriterDO"

export class MyShardCoordinator extends ShardCoordinator {
  protected getConfig(): ShardedParentDOConfig {
    return {
      shardCount: 16,
      tableLocation: 'com/example/api',
    };
  }
}
```

## Constructors

### Constructor

> **new ShardCoordinator**(`state`, `env`): `ShardCoordinator`

Defined in: [writer/src/sharded-parent-do.ts:142](https://github.com/dot-do/evodb/blob/main/writer/src/sharded-parent-do.ts#L142)

#### Parameters

##### state

`DurableObjectState`

##### env

[`ShardedParentDOEnv`](../interfaces/ShardedParentDOEnv.md)

#### Returns

`ShardCoordinator`

## Properties

### state

> `protected` `readonly` **state**: `DurableObjectState`

Defined in: [writer/src/sharded-parent-do.ts:130](https://github.com/dot-do/evodb/blob/main/writer/src/sharded-parent-do.ts#L130)

***

### env

> `protected` `readonly` **env**: [`ShardedParentDOEnv`](../interfaces/ShardedParentDOEnv.md)

Defined in: [writer/src/sharded-parent-do.ts:131](https://github.com/dot-do/evodb/blob/main/writer/src/sharded-parent-do.ts#L131)

***

### router

> `protected` `readonly` **router**: [`ShardRouter`](ShardRouter.md)

Defined in: [writer/src/sharded-parent-do.ts:132](https://github.com/dot-do/evodb/blob/main/writer/src/sharded-parent-do.ts#L132)

***

### connectedSockets

> `protected` `readonly` **connectedSockets**: `Map`\<`string`, `RoutedWebSocket`\>

Defined in: [writer/src/sharded-parent-do.ts:133](https://github.com/dot-do/evodb/blob/main/writer/src/sharded-parent-do.ts#L133)

***

### pendingAcks

> `protected` `readonly` **pendingAcks**: `Map`\<`string`, \{ `ws`: `WebSocket`; `sequenceNumber`: `bigint`; `timestamp`: `number`; \}\>

Defined in: [writer/src/sharded-parent-do.ts:136](https://github.com/dot-do/evodb/blob/main/writer/src/sharded-parent-do.ts#L136)

Pending acks waiting for shard responses

## Methods

### getConfig()

> `abstract` `protected` **getConfig**(): [`ShardedParentDOConfig`](../interfaces/ShardedParentDOConfig.md)

Defined in: [writer/src/sharded-parent-do.ts:157](https://github.com/dot-do/evodb/blob/main/writer/src/sharded-parent-do.ts#L157)

Get sharded parent DO configuration (override in subclass)

#### Returns

[`ShardedParentDOConfig`](../interfaces/ShardedParentDOConfig.md)

***

### fetch()

> **fetch**(`request`): `Promise`\<`Response`\>

Defined in: [writer/src/sharded-parent-do.ts:162](https://github.com/dot-do/evodb/blob/main/writer/src/sharded-parent-do.ts#L162)

Handle HTTP requests

#### Parameters

##### request

`Request`

#### Returns

`Promise`\<`Response`\>

***

### webSocketMessage()

> **webSocketMessage**(`ws`, `message`): `Promise`\<`void`\>

Defined in: [writer/src/sharded-parent-do.ts:224](https://github.com/dot-do/evodb/blob/main/writer/src/sharded-parent-do.ts#L224)

Handle incoming WebSocket message

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

Defined in: [writer/src/sharded-parent-do.ts:508](https://github.com/dot-do/evodb/blob/main/writer/src/sharded-parent-do.ts#L508)

Handle WebSocket close

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

Defined in: [writer/src/sharded-parent-do.ts:518](https://github.com/dot-do/evodb/blob/main/writer/src/sharded-parent-do.ts#L518)

Handle WebSocket error

#### Parameters

##### ws

`WebSocket`

##### error

`unknown`

#### Returns

`Promise`\<`void`\>
