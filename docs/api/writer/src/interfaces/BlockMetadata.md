[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / BlockMetadata

# Interface: BlockMetadata

Defined in: [writer/src/types.ts:303](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L303)

Block metadata

## Properties

### id

> **id**: `string`

Defined in: [writer/src/types.ts:305](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L305)

Unique block ID

***

### r2Key

> **r2Key**: `string`

Defined in: [writer/src/types.ts:307](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L307)

R2 key path

***

### rowCount

> **rowCount**: `number`

Defined in: [writer/src/types.ts:309](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L309)

Row count

***

### sizeBytes

> **sizeBytes**: `number`

Defined in: [writer/src/types.ts:311](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L311)

Size in bytes

***

### minLsn

> **minLsn**: `bigint`

Defined in: [writer/src/types.ts:313](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L313)

Minimum LSN

***

### maxLsn

> **maxLsn**: `bigint`

Defined in: [writer/src/types.ts:315](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L315)

Maximum LSN

***

### createdAt

> **createdAt**: `number`

Defined in: [writer/src/types.ts:317](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L317)

Creation timestamp

***

### compacted

> **compacted**: `boolean`

Defined in: [writer/src/types.ts:319](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L319)

Whether block has been compacted

***

### columnStats?

> `optional` **columnStats**: [`ColumnZoneMap`](ColumnZoneMap.md)[]

Defined in: [writer/src/types.ts:321](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L321)

Column statistics for zone maps
