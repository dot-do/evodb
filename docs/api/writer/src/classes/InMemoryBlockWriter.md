[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / InMemoryBlockWriter

# Class: InMemoryBlockWriter

Defined in: [writer/src/strategies/block-writer.ts:70](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/block-writer.ts#L70)

In-memory block writer for testing

## Implements

- [`BlockWriter`](../interfaces/BlockWriter.md)

## Constructors

### Constructor

> **new InMemoryBlockWriter**(): `InMemoryBlockWriter`

#### Returns

`InMemoryBlockWriter`

## Methods

### write()

> **write**(`entries`, `minLsn`, `maxLsn`, `seq`): `Promise`\<[`BlockWriteResult`](../type-aliases/BlockWriteResult.md)\>

Defined in: [writer/src/strategies/block-writer.ts:74](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/block-writer.ts#L74)

Write WAL entries as a block

#### Parameters

##### entries

[`WalEntry`](../interfaces/WalEntry.md)[]

Entries to write

##### minLsn

`bigint`

Minimum LSN in the block

##### maxLsn

`bigint`

Maximum LSN in the block

##### seq

`number`

Block sequence number

#### Returns

`Promise`\<[`BlockWriteResult`](../type-aliases/BlockWriteResult.md)\>

#### Implementation of

[`BlockWriter`](../interfaces/BlockWriter.md).[`write`](../interfaces/BlockWriter.md#write)

***

### writeRaw()

> **writeRaw**(`r2Key`, `data`, `_metadata`): `Promise`\<`void`\>

Defined in: [writer/src/strategies/block-writer.ts:116](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/block-writer.ts#L116)

Write raw block data (for compaction)

#### Parameters

##### r2Key

`string`

Storage key

##### data

`Uint8Array`

Raw block data

##### \_metadata

###### rowCount

`number`

###### compacted

`boolean`

###### mergedCount?

`number`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`BlockWriter`](../interfaces/BlockWriter.md).[`writeRaw`](../interfaces/BlockWriter.md#writeraw)

***

### read()

> **read**(`r2Key`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in: [writer/src/strategies/block-writer.ts:124](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/block-writer.ts#L124)

Read a block from storage

#### Parameters

##### r2Key

`string`

Storage key

#### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

#### Implementation of

[`BlockWriter`](../interfaces/BlockWriter.md).[`read`](../interfaces/BlockWriter.md#read)

***

### delete()

> **delete**(`r2Keys`): `Promise`\<`void`\>

Defined in: [writer/src/strategies/block-writer.ts:128](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/block-writer.ts#L128)

Delete blocks from storage

#### Parameters

##### r2Keys

`string`[]

Keys to delete

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`BlockWriter`](../interfaces/BlockWriter.md).[`delete`](../interfaces/BlockWriter.md#delete)

***

### exists()

> **exists**(`r2Key`): `Promise`\<`boolean`\>

Defined in: [writer/src/strategies/block-writer.ts:134](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/block-writer.ts#L134)

Check if a block exists

#### Parameters

##### r2Key

`string`

Storage key

#### Returns

`Promise`\<`boolean`\>

#### Implementation of

[`BlockWriter`](../interfaces/BlockWriter.md).[`exists`](../interfaces/BlockWriter.md#exists)

***

### getAllBlocks()

> **getAllBlocks**(): `Map`\<`string`, `Uint8Array`\<`ArrayBufferLike`\>\>

Defined in: [writer/src/strategies/block-writer.ts:141](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/block-writer.ts#L141)

Get all stored blocks (for testing)

#### Returns

`Map`\<`string`, `Uint8Array`\<`ArrayBufferLike`\>\>

***

### getBlockMetadata()

> **getBlockMetadata**(`blockId`): [`BlockMetadata`](../interfaces/BlockMetadata.md)

Defined in: [writer/src/strategies/block-writer.ts:148](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/block-writer.ts#L148)

Get block metadata (for testing)

#### Parameters

##### blockId

`string`

#### Returns

[`BlockMetadata`](../interfaces/BlockMetadata.md)

***

### clear()

> **clear**(): `void`

Defined in: [writer/src/strategies/block-writer.ts:155](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/block-writer.ts#L155)

Clear all storage (for testing)

#### Returns

`void`
