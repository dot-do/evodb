[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / ManifestManager

# Interface: ManifestManager

Defined in: [writer/src/strategies/interfaces.ts:211](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L211)

Strategy for managing block manifests

## Methods

### addBlock()

> **addBlock**(`entry`): `Promise`\<`void`\>

Defined in: [writer/src/strategies/interfaces.ts:216](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L216)

Add a block to the manifest

#### Parameters

##### entry

[`ManifestBlockEntry`](ManifestBlockEntry.md)

Block entry to add

#### Returns

`Promise`\<`void`\>

***

### removeBlocks()

> **removeBlocks**(`blockIds`): `Promise`\<`void`\>

Defined in: [writer/src/strategies/interfaces.ts:222](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L222)

Remove blocks from the manifest

#### Parameters

##### blockIds

`string`[]

Block IDs to remove

#### Returns

`Promise`\<`void`\>

***

### getBlocks()

> **getBlocks**(): `Promise`\<[`ManifestBlockEntry`](ManifestBlockEntry.md)[]\>

Defined in: [writer/src/strategies/interfaces.ts:227](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L227)

Get all blocks in the manifest

#### Returns

`Promise`\<[`ManifestBlockEntry`](ManifestBlockEntry.md)[]\>

***

### getSnapshotId()

> **getSnapshotId**(): `number`

Defined in: [writer/src/strategies/interfaces.ts:232](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L232)

Get the current snapshot ID

#### Returns

`number`

***

### persist()

> **persist**(): `Promise`\<`void`\>

Defined in: [writer/src/strategies/interfaces.ts:237](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L237)

Write manifest to storage

#### Returns

`Promise`\<`void`\>
