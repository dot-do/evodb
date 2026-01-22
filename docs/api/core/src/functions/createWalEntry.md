[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / createWalEntry

# Function: createWalEntry()

> **createWalEntry**(`doc`, `lsn`, `op`): [`WalEntry`](../interfaces/WalEntry.md)

Defined in: [core/src/wal.ts:23](https://github.com/dot-do/evodb/blob/main/core/src/wal.ts#L23)

Create WAL entry from document

## Parameters

### doc

`unknown`

### lsn

`bigint`

### op

[`WalOp`](../enumerations/WalOp.md) = `WalOp.Insert`

## Returns

[`WalEntry`](../interfaces/WalEntry.md)
