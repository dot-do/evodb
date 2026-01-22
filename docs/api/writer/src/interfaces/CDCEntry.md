[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / CDCEntry

# Interface: CDCEntry

Defined in: [writer/src/types.ts:219](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L219)

CDC entry received from child DO

## Properties

### lsn

> **lsn**: `bigint`

Defined in: [writer/src/types.ts:221](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L221)

Log sequence number (unique, monotonically increasing)

***

### timestamp

> **timestamp**: `bigint`

Defined in: [writer/src/types.ts:223](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L223)

Timestamp when the change occurred

***

### op

> **op**: [`WalOp`](../enumerations/WalOp.md)

Defined in: [writer/src/types.ts:225](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L225)

Operation type

***

### sourceDoId

> **sourceDoId**: `string`

Defined in: [writer/src/types.ts:227](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L227)

Source DO ID that generated this entry

***

### data

> **data**: `unknown`

Defined in: [writer/src/types.ts:229](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L229)

Document data (JSON-serializable)
