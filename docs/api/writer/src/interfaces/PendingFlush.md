[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / PendingFlush

# Interface: PendingFlush

Defined in: [writer/src/atomic-flush.ts:36](https://github.com/dot-do/evodb/blob/main/writer/src/atomic-flush.ts#L36)

Pending flush record stored in DO for crash recovery

## Properties

### id

> **id**: `string`

Defined in: [writer/src/atomic-flush.ts:38](https://github.com/dot-do/evodb/blob/main/writer/src/atomic-flush.ts#L38)

Unique flush ID

***

### r2Key

> **r2Key**: `string`

Defined in: [writer/src/atomic-flush.ts:40](https://github.com/dot-do/evodb/blob/main/writer/src/atomic-flush.ts#L40)

R2 key where the block will be/was written

***

### minLsn

> **minLsn**: `string`

Defined in: [writer/src/atomic-flush.ts:42](https://github.com/dot-do/evodb/blob/main/writer/src/atomic-flush.ts#L42)

Minimum LSN in the block

***

### maxLsn

> **maxLsn**: `string`

Defined in: [writer/src/atomic-flush.ts:44](https://github.com/dot-do/evodb/blob/main/writer/src/atomic-flush.ts#L44)

Maximum LSN in the block

***

### seq

> **seq**: `number`

Defined in: [writer/src/atomic-flush.ts:46](https://github.com/dot-do/evodb/blob/main/writer/src/atomic-flush.ts#L46)

Block sequence number

***

### timestamp

> **timestamp**: `number`

Defined in: [writer/src/atomic-flush.ts:48](https://github.com/dot-do/evodb/blob/main/writer/src/atomic-flush.ts#L48)

Timestamp when flush started

***

### entriesJson

> **entriesJson**: `string`

Defined in: [writer/src/atomic-flush.ts:50](https://github.com/dot-do/evodb/blob/main/writer/src/atomic-flush.ts#L50)

Serialized WAL entries for retry

***

### status

> **status**: [`FlushStatus`](../type-aliases/FlushStatus.md)

Defined in: [writer/src/atomic-flush.ts:52](https://github.com/dot-do/evodb/blob/main/writer/src/atomic-flush.ts#L52)

Current status

***

### rowCount?

> `optional` **rowCount**: `number`

Defined in: [writer/src/atomic-flush.ts:54](https://github.com/dot-do/evodb/blob/main/writer/src/atomic-flush.ts#L54)

Row count (if known)

***

### sizeBytes?

> `optional` **sizeBytes**: `number`

Defined in: [writer/src/atomic-flush.ts:56](https://github.com/dot-do/evodb/blob/main/writer/src/atomic-flush.ts#L56)

Size in bytes (if known)

***

### columnStats?

> `optional` **columnStats**: [`ColumnZoneMap`](ColumnZoneMap.md)[]

Defined in: [writer/src/atomic-flush.ts:58](https://github.com/dot-do/evodb/blob/main/writer/src/atomic-flush.ts#L58)

Column stats (if known)

***

### error?

> `optional` **error**: `string`

Defined in: [writer/src/atomic-flush.ts:60](https://github.com/dot-do/evodb/blob/main/writer/src/atomic-flush.ts#L60)

Error message if failed
