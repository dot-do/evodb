[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / ShardWriterDO

# Abstract Class: ShardWriterDO

Defined in: [writer/src/sharded-parent-do.ts:615](https://github.com/dot-do/evodb/blob/main/writer/src/sharded-parent-do.ts#L615)

ShardWriterDO - Individual shard writer

Handles CDC writes for a specific shard partition.
Extends the functionality of LakehouseParentDO but operates as one of many shards.

## Example

```typescript
export class MyShardWriterDO extends ShardWriterDO {
  protected getTableLocation(): string {
    return 'com/example/api';
  }
}
```

## Constructors

### Constructor

> **new ShardWriterDO**(`state`, `env`): `ShardWriterDO`

Defined in: [writer/src/sharded-parent-do.ts:621](https://github.com/dot-do/evodb/blob/main/writer/src/sharded-parent-do.ts#L621)

#### Parameters

##### state

`DurableObjectState`

##### env

[`ShardedParentDOEnv`](../interfaces/ShardedParentDOEnv.md)

#### Returns

`ShardWriterDO`

## Properties

### state

> `protected` `readonly` **state**: `DurableObjectState`

Defined in: [writer/src/sharded-parent-do.ts:616](https://github.com/dot-do/evodb/blob/main/writer/src/sharded-parent-do.ts#L616)

***

### env

> `protected` `readonly` **env**: [`ShardedParentDOEnv`](../interfaces/ShardedParentDOEnv.md)

Defined in: [writer/src/sharded-parent-do.ts:617](https://github.com/dot-do/evodb/blob/main/writer/src/sharded-parent-do.ts#L617)

***

### writer

> `protected` **writer**: [`LakehouseWriter`](LakehouseWriter.md) = `null`

Defined in: [writer/src/sharded-parent-do.ts:618](https://github.com/dot-do/evodb/blob/main/writer/src/sharded-parent-do.ts#L618)

***

### shardNumber

> `protected` **shardNumber**: `number` = `null`

Defined in: [writer/src/sharded-parent-do.ts:619](https://github.com/dot-do/evodb/blob/main/writer/src/sharded-parent-do.ts#L619)

## Methods

### getTableLocation()

> `abstract` `protected` **getTableLocation**(): `string`

Defined in: [writer/src/sharded-parent-do.ts:629](https://github.com/dot-do/evodb/blob/main/writer/src/sharded-parent-do.ts#L629)

Get the base table location (override in subclass)

#### Returns

`string`

***

### getPartitionMode()

> `protected` **getPartitionMode**(): [`PartitionMode`](../type-aliases/PartitionMode.md)

Defined in: [writer/src/sharded-parent-do.ts:634](https://github.com/dot-do/evodb/blob/main/writer/src/sharded-parent-do.ts#L634)

Get the partition mode (override to customize)

#### Returns

[`PartitionMode`](../type-aliases/PartitionMode.md)

***

### getWriterOptions()

> `protected` **getWriterOptions**(): `Partial`\<[`WriterOptions`](../interfaces/WriterOptions.md)\>

Defined in: [writer/src/sharded-parent-do.ts:641](https://github.com/dot-do/evodb/blob/main/writer/src/sharded-parent-do.ts#L641)

Get additional writer options (override to customize)

#### Returns

`Partial`\<[`WriterOptions`](../interfaces/WriterOptions.md)\>

***

### initialize()

> `protected` **initialize**(): `Promise`\<`void`\>

Defined in: [writer/src/sharded-parent-do.ts:648](https://github.com/dot-do/evodb/blob/main/writer/src/sharded-parent-do.ts#L648)

Initialize the writer for this shard

#### Returns

`Promise`\<`void`\>

***

### fetch()

> **fetch**(`request`): `Promise`\<`Response`\>

Defined in: [writer/src/sharded-parent-do.ts:673](https://github.com/dot-do/evodb/blob/main/writer/src/sharded-parent-do.ts#L673)

Handle HTTP requests

#### Parameters

##### request

`Request`

#### Returns

`Promise`\<`Response`\>

***

### alarm()

> **alarm**(): `Promise`\<`void`\>

Defined in: [writer/src/sharded-parent-do.ts:841](https://github.com/dot-do/evodb/blob/main/writer/src/sharded-parent-do.ts#L841)

Handle alarm

#### Returns

`Promise`\<`void`\>
