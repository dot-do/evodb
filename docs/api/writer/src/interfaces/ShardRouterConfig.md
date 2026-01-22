[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / ShardRouterConfig

# Interface: ShardRouterConfig

Defined in: [writer/src/shard-router.ts:14](https://github.com/dot-do/evodb/blob/main/writer/src/shard-router.ts#L14)

Shard configuration options

## Properties

### shardCount

> **shardCount**: `number`

Defined in: [writer/src/shard-router.ts:16](https://github.com/dot-do/evodb/blob/main/writer/src/shard-router.ts#L16)

Total number of shards (power of 2 recommended)

***

### namespaceBinding

> **namespaceBinding**: `string`

Defined in: [writer/src/shard-router.ts:18](https://github.com/dot-do/evodb/blob/main/writer/src/shard-router.ts#L18)

Shard namespace binding name (e.g., 'WRITER_SHARDS')

***

### shardIdPrefix?

> `optional` **shardIdPrefix**: `string`

Defined in: [writer/src/shard-router.ts:20](https://github.com/dot-do/evodb/blob/main/writer/src/shard-router.ts#L20)

Optional: Prefix for shard DO IDs

***

### hashFn()?

> `optional` **hashFn**: (`key`) => `number`

Defined in: [writer/src/shard-router.ts:22](https://github.com/dot-do/evodb/blob/main/writer/src/shard-router.ts#L22)

Optional: Custom hash function

#### Parameters

##### key

`string`

#### Returns

`number`

***

### virtualNodesPerShard?

> `optional` **virtualNodesPerShard**: `number`

Defined in: [writer/src/shard-router.ts:24](https://github.com/dot-do/evodb/blob/main/writer/src/shard-router.ts#L24)

Optional: Virtual nodes per shard for better distribution

***

### maxCacheSize?

> `optional` **maxCacheSize**: `number`

Defined in: [writer/src/shard-router.ts:26](https://github.com/dot-do/evodb/blob/main/writer/src/shard-router.ts#L26)

Optional: Maximum cache size for routing cache (default: 10000)
