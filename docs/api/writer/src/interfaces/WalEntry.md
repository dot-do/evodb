[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / WalEntry

# Interface: WalEntry

Defined in: core/dist/types.d.ts:169

WAL entry

## Properties

### lsn

> **lsn**: `bigint`

Defined in: core/dist/types.d.ts:170

***

### timestamp

> **timestamp**: `bigint`

Defined in: core/dist/types.d.ts:171

***

### op

> **op**: [`WalOp`](../enumerations/WalOp.md)

Defined in: core/dist/types.d.ts:172

***

### flags

> **flags**: `number`

Defined in: core/dist/types.d.ts:173

***

### data

> **data**: `Uint8Array`

Defined in: core/dist/types.d.ts:174

***

### checksum

> **checksum**: `number`

Defined in: core/dist/types.d.ts:175
