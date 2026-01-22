[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / ShardedBlockLocation

# Interface: ShardedBlockLocation

Defined in: [writer/src/shard-registry.ts:107](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L107)

Block location with shard information

## Properties

### block

> **block**: [`BlockMetadata`](BlockMetadata.md)

Defined in: [writer/src/shard-registry.ts:109](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L109)

Block metadata

***

### shardNumber

> **shardNumber**: `number`

Defined in: [writer/src/shard-registry.ts:111](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L111)

Shard number where block is located

***

### shardId

> **shardId**: `string`

Defined in: [writer/src/shard-registry.ts:113](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L113)

Shard DO ID

***

### r2Key

> **r2Key**: `string`

Defined in: [writer/src/shard-registry.ts:115](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L115)

R2 key for the block
