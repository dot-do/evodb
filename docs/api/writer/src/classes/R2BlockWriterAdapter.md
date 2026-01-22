[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / R2BlockWriterAdapter

# Class: R2BlockWriterAdapter

Defined in: [writer/src/strategies/block-writer.ts:16](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/block-writer.ts#L16)

Adapter that wraps R2BlockWriter to implement BlockWriter interface

## Implements

- [`BlockWriter`](../interfaces/BlockWriter.md)

## Constructors

### Constructor

> **new R2BlockWriterAdapter**(`r2Bucket`, `options`): `R2BlockWriterAdapter`

Defined in: [writer/src/strategies/block-writer.ts:19](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/block-writer.ts#L19)

#### Parameters

##### r2Bucket

[`R2Bucket`](../interfaces/R2Bucket.md)

##### options

[`ResolvedWriterOptions`](../interfaces/ResolvedWriterOptions.md)

#### Returns

`R2BlockWriterAdapter`

## Methods

### fromWriterOptions()

> `static` **fromWriterOptions**(`r2Bucket`, `options`): `R2BlockWriterAdapter`

Defined in: [writer/src/strategies/block-writer.ts:26](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/block-writer.ts#L26)

Create from resolved writer options

#### Parameters

##### r2Bucket

[`R2Bucket`](../interfaces/R2Bucket.md)

##### options

[`ResolvedWriterOptions`](../interfaces/ResolvedWriterOptions.md)

#### Returns

`R2BlockWriterAdapter`

***

### getR2Writer()

> **getR2Writer**(): [`R2BlockWriter`](R2BlockWriter.md)

Defined in: [writer/src/strategies/block-writer.ts:33](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/block-writer.ts#L33)

Get the underlying R2BlockWriter for advanced operations

#### Returns

[`R2BlockWriter`](R2BlockWriter.md)

***

### write()

> **write**(`entries`, `minLsn`, `maxLsn`, `seq`): `Promise`\<[`BlockWriteResult`](../type-aliases/BlockWriteResult.md)\>

Defined in: [writer/src/strategies/block-writer.ts:37](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/block-writer.ts#L37)

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

> **writeRaw**(`r2Key`, `data`, `metadata`): `Promise`\<`void`\>

Defined in: [writer/src/strategies/block-writer.ts:46](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/block-writer.ts#L46)

Write raw block data (for compaction)

#### Parameters

##### r2Key

`string`

Storage key

##### data

`Uint8Array`

Raw block data

##### metadata

Block metadata

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

Defined in: [writer/src/strategies/block-writer.ts:54](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/block-writer.ts#L54)

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

Defined in: [writer/src/strategies/block-writer.ts:58](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/block-writer.ts#L58)

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

Defined in: [writer/src/strategies/block-writer.ts:62](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/block-writer.ts#L62)

Check if a block exists

#### Parameters

##### r2Key

`string`

Storage key

#### Returns

`Promise`\<`boolean`\>

#### Implementation of

[`BlockWriter`](../interfaces/BlockWriter.md).[`exists`](../interfaces/BlockWriter.md#exists)
