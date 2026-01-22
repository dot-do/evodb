[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / ManifestBlockEntry

# Interface: ManifestBlockEntry

Defined in: [writer/src/strategies/interfaces.ts:198](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L198)

Manifest entry for tracking blocks

## Properties

### blockId

> **blockId**: `string`

Defined in: [writer/src/strategies/interfaces.ts:199](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L199)

***

### r2Key

> **r2Key**: `string`

Defined in: [writer/src/strategies/interfaces.ts:200](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L200)

***

### rowCount

> **rowCount**: `number`

Defined in: [writer/src/strategies/interfaces.ts:201](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L201)

***

### sizeBytes

> **sizeBytes**: `number`

Defined in: [writer/src/strategies/interfaces.ts:202](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L202)

***

### minLsn

> **minLsn**: `bigint`

Defined in: [writer/src/strategies/interfaces.ts:203](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L203)

***

### maxLsn

> **maxLsn**: `bigint`

Defined in: [writer/src/strategies/interfaces.ts:204](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L204)

***

### columnStats

> **columnStats**: [`ColumnZoneMap`](ColumnZoneMap.md)[]

Defined in: [writer/src/strategies/interfaces.ts:205](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L205)
