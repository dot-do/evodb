[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / createShardRouter

# Function: createShardRouter()

> **createShardRouter**(`shardCount`, `namespaceBinding`): [`ShardRouter`](../classes/ShardRouter.md)

Defined in: [writer/src/shard-router.ts:468](https://github.com/dot-do/evodb/blob/main/writer/src/shard-router.ts#L468)

Create a ShardRouter with sensible defaults

## Parameters

### shardCount

`number`

Number of shards

### namespaceBinding

`string` = `'WRITER_SHARDS'`

Binding name for shard namespace

## Returns

[`ShardRouter`](../classes/ShardRouter.md)

Configured ShardRouter
