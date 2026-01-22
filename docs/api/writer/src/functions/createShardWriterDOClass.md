[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / createShardWriterDOClass

# Function: createShardWriterDOClass()

> **createShardWriterDOClass**(`tableLocation`, `partitionMode`, `options?`): (`state`, `env`) => [`ShardWriterDO`](../classes/ShardWriterDO.md)

Defined in: [writer/src/sharded-parent-do.ts:885](https://github.com/dot-do/evodb/blob/main/writer/src/sharded-parent-do.ts#L885)

Factory function to create a ShardWriterDO class

## Parameters

### tableLocation

`string`

### partitionMode

[`PartitionMode`](../type-aliases/PartitionMode.md) = `'do-sqlite'`

### options?

`Partial`\<[`WriterOptions`](../interfaces/WriterOptions.md)\>

## Returns

> **new createShardWriterDOClass**(`state`, `env`): [`ShardWriterDO`](../classes/ShardWriterDO.md)

### Parameters

#### state

`DurableObjectState`

#### env

[`ShardedParentDOEnv`](../interfaces/ShardedParentDOEnv.md)

### Returns

[`ShardWriterDO`](../classes/ShardWriterDO.md)
