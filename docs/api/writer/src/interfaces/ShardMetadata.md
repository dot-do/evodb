[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / ShardMetadata

# Interface: ShardMetadata

Defined in: [writer/src/shard-registry.ts:19](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L19)

Shard metadata returned by shard DOs

## Properties

### shardNumber

> **shardNumber**: `number`

Defined in: [writer/src/shard-registry.ts:21](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L21)

Shard number

***

### shardId

> **shardId**: `string`

Defined in: [writer/src/shard-registry.ts:23](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L23)

Shard DO ID

***

### status

> **status**: `"healthy"` \| `"degraded"` \| `"unhealthy"`

Defined in: [writer/src/shard-registry.ts:25](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L25)

Health status

***

### blockCount

> **blockCount**: `number`

Defined in: [writer/src/shard-registry.ts:27](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L27)

Number of blocks in R2

***

### pendingBlockCount

> **pendingBlockCount**: `number`

Defined in: [writer/src/shard-registry.ts:29](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L29)

Number of pending blocks in DO storage

***

### totalRows

> **totalRows**: `number`

Defined in: [writer/src/shard-registry.ts:31](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L31)

Total rows written

***

### totalBytesR2

> **totalBytesR2**: `number`

Defined in: [writer/src/shard-registry.ts:33](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L33)

Total bytes written to R2

***

### connectedSources

> **connectedSources**: `number`

Defined in: [writer/src/shard-registry.ts:35](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L35)

Number of connected child DOs

***

### bufferEntryCount

> **bufferEntryCount**: `number`

Defined in: [writer/src/shard-registry.ts:37](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L37)

Buffer entry count

***

### lastFlushTime

> **lastFlushTime**: `number`

Defined in: [writer/src/shard-registry.ts:39](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L39)

Last flush time

***

### partitionMode

> **partitionMode**: [`PartitionMode`](../type-aliases/PartitionMode.md)

Defined in: [writer/src/shard-registry.ts:41](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L41)

Partition mode

***

### assignments

> **assignments**: [`ShardAssignment`](ShardAssignment.md)[]

Defined in: [writer/src/shard-registry.ts:43](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L43)

Tenant/table assignments
