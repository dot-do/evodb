[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / BlockWriter

# Interface: BlockWriter

Defined in: [writer/src/strategies/interfaces.ts:92](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L92)

Strategy for writing blocks to storage (R2 or other)

## Methods

### write()

> **write**(`entries`, `minLsn`, `maxLsn`, `seq`): `Promise`\<[`BlockWriteResult`](../type-aliases/BlockWriteResult.md)\>

Defined in: [writer/src/strategies/interfaces.ts:100](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L100)

Write WAL entries as a block

#### Parameters

##### entries

[`WalEntry`](WalEntry.md)[]

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

***

### writeRaw()

> **writeRaw**(`r2Key`, `data`, `metadata`): `Promise`\<`void`\>

Defined in: [writer/src/strategies/interfaces.ts:113](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L113)

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

***

### read()

> **read**(`r2Key`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in: [writer/src/strategies/interfaces.ts:123](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L123)

Read a block from storage

#### Parameters

##### r2Key

`string`

Storage key

#### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

***

### delete()

> **delete**(`r2Keys`): `Promise`\<`void`\>

Defined in: [writer/src/strategies/interfaces.ts:129](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L129)

Delete blocks from storage

#### Parameters

##### r2Keys

`string`[]

Keys to delete

#### Returns

`Promise`\<`void`\>

***

### exists()

> **exists**(`r2Key`): `Promise`\<`boolean`\>

Defined in: [writer/src/strategies/interfaces.ts:135](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L135)

Check if a block exists

#### Parameters

##### r2Key

`string`

Storage key

#### Returns

`Promise`\<`boolean`\>
