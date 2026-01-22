[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / R2BlockWriter

# Class: R2BlockWriter

Defined in: [writer/src/r2-writer.ts:65](https://github.com/dot-do/evodb/blob/main/writer/src/r2-writer.ts#L65)

R2 writer for columnar blocks

## Extended by

- [`R2WriterWithManifest`](R2WriterWithManifest.md)

## Constructors

### Constructor

> **new R2BlockWriter**(`r2Bucket`, `options`): `R2BlockWriter`

Defined in: [writer/src/r2-writer.ts:69](https://github.com/dot-do/evodb/blob/main/writer/src/r2-writer.ts#L69)

#### Parameters

##### r2Bucket

[`R2Bucket`](../interfaces/R2Bucket.md)

##### options

[`R2WriterOptions`](../interfaces/R2WriterOptions.md)

#### Returns

`R2BlockWriter`

## Methods

### fromWriterOptions()

> `static` **fromWriterOptions**(`r2Bucket`, `options`): `R2BlockWriter`

Defined in: [writer/src/r2-writer.ts:81](https://github.com/dot-do/evodb/blob/main/writer/src/r2-writer.ts#L81)

Create an R2BlockWriter from resolved writer options

#### Parameters

##### r2Bucket

[`R2Bucket`](../interfaces/R2Bucket.md)

##### options

[`ResolvedWriterOptions`](../interfaces/ResolvedWriterOptions.md)

#### Returns

`R2BlockWriter`

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
