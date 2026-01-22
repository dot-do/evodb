[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / WriterOptions

# Interface: WriterOptions

Defined in: [writer/src/types.ts:100](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L100)

Configuration options for LakehouseWriter

## Properties

### r2Bucket

> **r2Bucket**: [`R2Bucket`](R2Bucket.md)

Defined in: [writer/src/types.ts:102](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L102)

R2 bucket for block storage

***

### tableLocation

> **tableLocation**: `string`

Defined in: [writer/src/types.ts:105](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L105)

Table location path in R2 (e.g., 'com/example/api/users')

***

### schemaId?

> `optional` **schemaId**: `number`

Defined in: [writer/src/types.ts:108](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L108)

Schema ID for blocks

***

### partitionMode?

> `optional` **partitionMode**: [`PartitionMode`](../type-aliases/PartitionMode.md)

Defined in: [writer/src/types.ts:111](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L111)

Partition mode (default: 'do-sqlite')

***

### bufferSize

> **bufferSize**: `number`

Defined in: [writer/src/types.ts:115](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L115)

Max entries before automatic flush (default: 10000)

***

### bufferTimeout

> **bufferTimeout**: `number`

Defined in: [writer/src/types.ts:117](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L117)

Max milliseconds before automatic flush (default: 5000)

***

### targetBlockSize?

> `optional` **targetBlockSize**: `number`

Defined in: [writer/src/types.ts:121](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L121)

Target block size in bytes

***

### maxBlockSize?

> `optional` **maxBlockSize**: `number`

Defined in: [writer/src/types.ts:123](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L123)

Maximum block size in bytes

***

### minCompactBlocks

> **minCompactBlocks**: `number`

Defined in: [writer/src/types.ts:127](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L127)

Minimum small blocks to trigger compaction (default: 4)

***

### targetCompactSize?

> `optional` **targetCompactSize**: `number`

Defined in: [writer/src/types.ts:129](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L129)

Target size after compaction in bytes

***

### maxRetries

> **maxRetries**: `number`

Defined in: [writer/src/types.ts:133](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L133)

Maximum retry attempts for R2 writes (default: 3)

***

### retryBackoffMs

> **retryBackoffMs**: `number`

Defined in: [writer/src/types.ts:135](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L135)

Retry backoff base in milliseconds (default: 100)

***

### maxBufferSize?

> `optional` **maxBufferSize**: `number`

Defined in: [writer/src/types.ts:139](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L139)

Hard limit on buffer size in bytes (default: 128MB) - throws BufferOverflowError when exceeded

***

### maxBlockIndexSize?

> `optional` **maxBlockIndexSize**: `number`

Defined in: [writer/src/types.ts:143](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L143)

Maximum number of entries in the block index (default: 100,000)

***

### blockIndexEvictionPolicy?

> `optional` **blockIndexEvictionPolicy**: [`BlockIndexEvictionPolicy`](../type-aliases/BlockIndexEvictionPolicy.md)

Defined in: [writer/src/types.ts:145](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L145)

Eviction policy when block index limit is reached: 'lru' evicts oldest, 'none' throws error (default: 'lru')
