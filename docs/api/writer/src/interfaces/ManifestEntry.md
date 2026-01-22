[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / ManifestEntry

# Interface: ManifestEntry

Defined in: [writer/src/types.ts:474](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L474)

Manifest entry for a block

## Properties

### blockId

> **blockId**: `string`

Defined in: [writer/src/types.ts:476](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L476)

Block ID

***

### r2Key

> **r2Key**: `string`

Defined in: [writer/src/types.ts:478](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L478)

R2 key

***

### rowCount

> **rowCount**: `number`

Defined in: [writer/src/types.ts:480](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L480)

Row count

***

### sizeBytes

> **sizeBytes**: `number`

Defined in: [writer/src/types.ts:482](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L482)

Size in bytes

***

### lsnRange

> **lsnRange**: `object`

Defined in: [writer/src/types.ts:484](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L484)

LSN range

#### min

> **min**: `bigint`

#### max

> **max**: `bigint`

***

### partitionValues?

> `optional` **partitionValues**: `Record`\<`string`, `unknown`\>

Defined in: [writer/src/types.ts:486](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L486)

Partition values

***

### columnStats

> **columnStats**: [`ColumnZoneMap`](ColumnZoneMap.md)[]

Defined in: [writer/src/types.ts:488](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L488)

Column stats for zone maps
