[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / ShardedParentDOConfig

# Interface: ShardedParentDOConfig

Defined in: [writer/src/sharded-parent-do.ts:51](https://github.com/dot-do/evodb/blob/main/writer/src/sharded-parent-do.ts#L51)

Configuration for sharded parent DO

## Properties

### shardCount

> **shardCount**: `number`

Defined in: [writer/src/sharded-parent-do.ts:53](https://github.com/dot-do/evodb/blob/main/writer/src/sharded-parent-do.ts#L53)

Number of shards

***

### tableLocation

> **tableLocation**: `string`

Defined in: [writer/src/sharded-parent-do.ts:55](https://github.com/dot-do/evodb/blob/main/writer/src/sharded-parent-do.ts#L55)

Base table location

***

### partitionMode?

> `optional` **partitionMode**: [`PartitionMode`](../type-aliases/PartitionMode.md)

Defined in: [writer/src/sharded-parent-do.ts:57](https://github.com/dot-do/evodb/blob/main/writer/src/sharded-parent-do.ts#L57)

Partition mode

***

### writerOptions?

> `optional` **writerOptions**: `Partial`\<[`WriterOptions`](WriterOptions.md)\>

Defined in: [writer/src/sharded-parent-do.ts:59](https://github.com/dot-do/evodb/blob/main/writer/src/sharded-parent-do.ts#L59)

Writer options

***

### shardIdPrefix?

> `optional` **shardIdPrefix**: `string`

Defined in: [writer/src/sharded-parent-do.ts:61](https://github.com/dot-do/evodb/blob/main/writer/src/sharded-parent-do.ts#L61)

Shard ID prefix
