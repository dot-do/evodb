[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / SourceStats

# Interface: SourceStats

Defined in: [writer/src/types.ts:454](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L454)

Per-source statistics

## Properties

### sourceDoId

> **sourceDoId**: `string`

Defined in: [writer/src/types.ts:456](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L456)

Source DO ID

***

### entriesReceived

> **entriesReceived**: `number`

Defined in: [writer/src/types.ts:458](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L458)

Total entries received

***

### lastLsn

> **lastLsn**: `bigint`

Defined in: [writer/src/types.ts:460](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L460)

Last LSN received

***

### lastEntryTime

> **lastEntryTime**: `number`

Defined in: [writer/src/types.ts:462](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L462)

Last entry timestamp

***

### connected

> **connected**: `boolean`

Defined in: [writer/src/types.ts:464](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L464)

Connection status
