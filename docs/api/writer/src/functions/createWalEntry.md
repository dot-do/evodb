[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / createWalEntry

# Function: createWalEntry()

> **createWalEntry**(`doc`, `lsn`, `op?`): [`WalEntry`](../interfaces/WalEntry.md)

Defined in: core/dist/wal.d.ts:3

Create WAL entry from document

## Parameters

### doc

`unknown`

### lsn

`bigint`

### op?

[`WalOp`](../enumerations/WalOp.md)

## Returns

[`WalEntry`](../interfaces/WalEntry.md)
