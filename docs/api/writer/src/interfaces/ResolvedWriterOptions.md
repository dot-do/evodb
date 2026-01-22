[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / ResolvedWriterOptions

# Interface: ResolvedWriterOptions

Defined in: [writer/src/types.ts:151](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L151)

Resolved writer options with partition mode applied

## Extends

- `Omit`\<[`WriterOptions`](WriterOptions.md), `"partitionMode"` \| `"targetBlockSize"` \| `"maxBlockSize"` \| `"targetCompactSize"` \| `"maxBufferSize"` \| `"maxBlockIndexSize"` \| `"blockIndexEvictionPolicy"`\>

## Properties

### r2Bucket

> **r2Bucket**: [`R2Bucket`](R2Bucket.md)

Defined in: [writer/src/types.ts:102](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L102)

R2 bucket for block storage

#### Inherited from

[`WriterOptions`](WriterOptions.md).[`r2Bucket`](WriterOptions.md#r2bucket)

***

### tableLocation

> **tableLocation**: `string`

Defined in: [writer/src/types.ts:105](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L105)

Table location path in R2 (e.g., 'com/example/api/users')

#### Inherited from

[`WriterOptions`](WriterOptions.md).[`tableLocation`](WriterOptions.md#tablelocation)

***

### schemaId?

> `optional` **schemaId**: `number`

Defined in: [writer/src/types.ts:108](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L108)

Schema ID for blocks

#### Inherited from

[`WriterOptions`](WriterOptions.md).[`schemaId`](WriterOptions.md#schemaid)

***

### bufferSize

> **bufferSize**: `number`

Defined in: [writer/src/types.ts:115](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L115)

Max entries before automatic flush (default: 10000)

#### Inherited from

[`WriterOptions`](WriterOptions.md).[`bufferSize`](WriterOptions.md#buffersize)

***

### bufferTimeout

> **bufferTimeout**: `number`

Defined in: [writer/src/types.ts:117](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L117)

Max milliseconds before automatic flush (default: 5000)

#### Inherited from

[`WriterOptions`](WriterOptions.md).[`bufferTimeout`](WriterOptions.md#buffertimeout)

***

### minCompactBlocks

> **minCompactBlocks**: `number`

Defined in: [writer/src/types.ts:127](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L127)

Minimum small blocks to trigger compaction (default: 4)

#### Inherited from

[`WriterOptions`](WriterOptions.md).[`minCompactBlocks`](WriterOptions.md#mincompactblocks)

***

### maxRetries

> **maxRetries**: `number`

Defined in: [writer/src/types.ts:133](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L133)

Maximum retry attempts for R2 writes (default: 3)

#### Inherited from

[`WriterOptions`](WriterOptions.md).[`maxRetries`](WriterOptions.md#maxretries)

***

### retryBackoffMs

> **retryBackoffMs**: `number`

Defined in: [writer/src/types.ts:135](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L135)

Retry backoff base in milliseconds (default: 100)

#### Inherited from

[`WriterOptions`](WriterOptions.md).[`retryBackoffMs`](WriterOptions.md#retrybackoffms)

***

### targetBlockSize

> **targetBlockSize**: `number`

Defined in: [writer/src/types.ts:152](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L152)

***

### maxBlockSize

> **maxBlockSize**: `number`

Defined in: [writer/src/types.ts:153](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L153)

***

### targetCompactSize

> **targetCompactSize**: `number`

Defined in: [writer/src/types.ts:154](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L154)

***

### partitionMode

> **partitionMode**: [`PartitionMode`](../type-aliases/PartitionMode.md)

Defined in: [writer/src/types.ts:155](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L155)

***

### maxBufferSize?

> `optional` **maxBufferSize**: `number`

Defined in: [writer/src/types.ts:157](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L157)

Hard limit on buffer size in bytes (default: 128MB)

***

### maxBlockIndexSize

> **maxBlockIndexSize**: `number`

Defined in: [writer/src/types.ts:159](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L159)

Maximum number of entries in the block index (default: 100,000)

***

### blockIndexEvictionPolicy

> **blockIndexEvictionPolicy**: [`BlockIndexEvictionPolicy`](../type-aliases/BlockIndexEvictionPolicy.md)

Defined in: [writer/src/types.ts:161](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L161)

Eviction policy when block index limit is reached (default: 'lru')
