[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / ShardInfo

# Interface: ShardInfo

Defined in: [writer/src/shard-router.ts:51](https://github.com/dot-do/evodb/blob/main/writer/src/shard-router.ts#L51)

Resolved shard information

## Properties

### shardNumber

> **shardNumber**: `number`

Defined in: [writer/src/shard-router.ts:53](https://github.com/dot-do/evodb/blob/main/writer/src/shard-router.ts#L53)

Shard number (0 to shardCount - 1)

***

### shardId

> **shardId**: `string`

Defined in: [writer/src/shard-router.ts:55](https://github.com/dot-do/evodb/blob/main/writer/src/shard-router.ts#L55)

Shard DO ID string

***

### hashValue

> **hashValue**: `number`

Defined in: [writer/src/shard-router.ts:57](https://github.com/dot-do/evodb/blob/main/writer/src/shard-router.ts#L57)

Hash value used for routing

***

### key

> **key**: [`ShardKey`](ShardKey.md)

Defined in: [writer/src/shard-router.ts:59](https://github.com/dot-do/evodb/blob/main/writer/src/shard-router.ts#L59)

Original routing key
