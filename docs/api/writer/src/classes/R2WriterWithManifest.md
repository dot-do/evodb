[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / R2WriterWithManifest

# Class: R2WriterWithManifest

Defined in: [writer/src/r2-writer.ts:518](https://github.com/dot-do/evodb/blob/main/writer/src/r2-writer.ts#L518)

R2 writer with manifest integration

## Extends

- [`R2BlockWriter`](R2BlockWriter.md)

## Constructors

### Constructor

> **new R2WriterWithManifest**(`r2Bucket`, `options`): `R2WriterWithManifest`

Defined in: [writer/src/r2-writer.ts:69](https://github.com/dot-do/evodb/blob/main/writer/src/r2-writer.ts#L69)

#### Parameters

##### r2Bucket

[`R2Bucket`](../interfaces/R2Bucket.md)

##### options

[`R2WriterOptions`](../interfaces/R2WriterOptions.md)

#### Returns

`R2WriterWithManifest`

#### Inherited from

[`R2BlockWriter`](R2BlockWriter.md).[`constructor`](R2BlockWriter.md#constructor)

## Methods

### fromWriterOptions()

> `static` **fromWriterOptions**(`r2Bucket`, `options`): [`R2BlockWriter`](R2BlockWriter.md)

Defined in: [writer/src/r2-writer.ts:81](https://github.com/dot-do/evodb/blob/main/writer/src/r2-writer.ts#L81)

Create an R2BlockWriter from resolved writer options

#### Parameters

##### r2Bucket

[`R2Bucket`](../interfaces/R2Bucket.md)

##### options

[`ResolvedWriterOptions`](../interfaces/ResolvedWriterOptions.md)

#### Returns

[`R2BlockWriter`](R2BlockWriter.md)

#### Inherited from

[`R2BlockWriter`](R2BlockWriter.md).[`fromWriterOptions`](R2BlockWriter.md#fromwriteroptions)

***

### writeEntries()

> **writeEntries**(`entries`, `minLsn`, `maxLsn`, `seq`): `Promise`\<\{ `success`: `true`; `metadata`: [`BlockMetadata`](../interfaces/BlockMetadata.md); \} \| \{ `success`: `false`; `error`: `string`; \}\>

Defined in: [writer/src/r2-writer.ts:94](https://github.com/dot-do/evodb/blob/main/writer/src/r2-writer.ts#L94)

Write a block of WAL entries to R2

#### Parameters

##### entries

[`WalEntry`](../interfaces/WalEntry.md)[]

##### minLsn

`bigint`

##### maxLsn

`bigint`

##### seq

`number`

#### Returns

`Promise`\<\{ `success`: `true`; `metadata`: [`BlockMetadata`](../interfaces/BlockMetadata.md); \} \| \{ `success`: `false`; `error`: `string`; \}\>

#### Inherited from

[`R2BlockWriter`](R2BlockWriter.md).[`writeEntries`](R2BlockWriter.md#writeentries)

***

### writeRawBlock()

> **writeRawBlock**(`r2Key`, `data`, `metadata`): `Promise`\<`void`\>

Defined in: [writer/src/r2-writer.ts:154](https://github.com/dot-do/evodb/blob/main/writer/src/r2-writer.ts#L154)

Write raw block data to R2 (for compaction)

#### Parameters

##### r2Key

`string`

##### data

`Uint8Array`

##### metadata

###### rowCount

`number`

###### compacted

`boolean`

###### mergedCount?

`number`

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`R2BlockWriter`](R2BlockWriter.md).[`writeRawBlock`](R2BlockWriter.md#writerawblock)

***

### deleteBlock()

> **deleteBlock**(`r2Key`): `Promise`\<`void`\>

Defined in: [writer/src/r2-writer.ts:371](https://github.com/dot-do/evodb/blob/main/writer/src/r2-writer.ts#L371)

Delete a block from R2

#### Parameters

##### r2Key

`string`

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`R2BlockWriter`](R2BlockWriter.md).[`deleteBlock`](R2BlockWriter.md#deleteblock)

***

### deleteBlocks()

> **deleteBlocks**(`r2Keys`): `Promise`\<`void`\>

Defined in: [writer/src/r2-writer.ts:378](https://github.com/dot-do/evodb/blob/main/writer/src/r2-writer.ts#L378)

Delete multiple blocks from R2

#### Parameters

##### r2Keys

`string`[]

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`R2BlockWriter`](R2BlockWriter.md).[`deleteBlocks`](R2BlockWriter.md#deleteblocks)

***

### listBlocks()

> **listBlocks**(`options?`): `Promise`\<\{ `blocks`: `object`[]; `cursor?`: `string`; `truncated`: `boolean`; \}\>

Defined in: [writer/src/r2-writer.ts:386](https://github.com/dot-do/evodb/blob/main/writer/src/r2-writer.ts#L386)

List blocks in R2 for this table

#### Parameters

##### options?

###### limit?

`number`

###### cursor?

`string`

#### Returns

`Promise`\<\{ `blocks`: `object`[]; `cursor?`: `string`; `truncated`: `boolean`; \}\>

#### Inherited from

[`R2BlockWriter`](R2BlockWriter.md).[`listBlocks`](R2BlockWriter.md#listblocks)

***

### readBlock()

> **readBlock**(`r2Key`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in: [writer/src/r2-writer.ts:412](https://github.com/dot-do/evodb/blob/main/writer/src/r2-writer.ts#L412)

Read a block from R2

#### Parameters

##### r2Key

`string`

#### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

#### Inherited from

[`R2BlockWriter`](R2BlockWriter.md).[`readBlock`](R2BlockWriter.md#readblock)

***

### blockExists()

> **blockExists**(`r2Key`): `Promise`\<`boolean`\>

Defined in: [writer/src/r2-writer.ts:423](https://github.com/dot-do/evodb/blob/main/writer/src/r2-writer.ts#L423)

Check if a block exists in R2

#### Parameters

##### r2Key

`string`

#### Returns

`Promise`\<`boolean`\>

#### Inherited from

[`R2BlockWriter`](R2BlockWriter.md).[`blockExists`](R2BlockWriter.md#blockexists)

***

### getBlockMetadata()

> **getBlockMetadata**(`r2Key`): `Promise`\<\{ `size`: `number`; `uploaded`: `Date`; `rowCount?`: `number`; `compacted?`: `boolean`; `partitionMode?`: `string`; \}\>

Defined in: [writer/src/r2-writer.ts:431](https://github.com/dot-do/evodb/blob/main/writer/src/r2-writer.ts#L431)

Get block metadata from R2

#### Parameters

##### r2Key

`string`

#### Returns

`Promise`\<\{ `size`: `number`; `uploaded`: `Date`; `rowCount?`: `number`; `compacted?`: `boolean`; `partitionMode?`: `string`; \}\>

#### Inherited from

[`R2BlockWriter`](R2BlockWriter.md).[`getBlockMetadata`](R2BlockWriter.md#getblockmetadata)

***

### trackBlock()

> **trackBlock**(`metadata`): `void`

Defined in: [writer/src/r2-writer.ts:532](https://github.com/dot-do/evodb/blob/main/writer/src/r2-writer.ts#L532)

Track a written block for manifest update

#### Parameters

##### metadata

[`BlockMetadata`](../interfaces/BlockMetadata.md)

#### Returns

`void`

***

### drainManifestUpdates()

> **drainManifestUpdates**(): `object`[]

Defined in: [writer/src/r2-writer.ts:547](https://github.com/dot-do/evodb/blob/main/writer/src/r2-writer.ts#L547)

Get and clear pending manifest updates

#### Returns

`object`[]

***

### hasPendingManifestUpdates()

> **hasPendingManifestUpdates**(): `boolean`

Defined in: [writer/src/r2-writer.ts:556](https://github.com/dot-do/evodb/blob/main/writer/src/r2-writer.ts#L556)

Check if there are pending manifest updates

#### Returns

`boolean`
