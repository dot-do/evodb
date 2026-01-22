[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / WalEntry

# Interface: WalEntry

Defined in: [core/src/types.ts:192](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L192)

WAL entry

## Properties

### lsn

> **lsn**: `bigint`

Defined in: [core/src/types.ts:193](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L193)

***

### timestamp

> **timestamp**: `bigint`

Defined in: [core/src/types.ts:194](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L194)

***

### op

> **op**: [`WalOp`](../enumerations/WalOp.md)

Defined in: [core/src/types.ts:195](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L195)

***

### flags

> **flags**: `number`

Defined in: [core/src/types.ts:196](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L196)

***

### data

> **data**: `Uint8Array`

Defined in: [core/src/types.ts:197](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L197)

***

### checksum

> **checksum**: `number`

Defined in: [core/src/types.ts:198](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L198)
