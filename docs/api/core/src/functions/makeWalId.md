[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / makeWalId

# Function: makeWalId()

> **makeWalId**(`lsn`): `string`

Defined in: [core/src/storage.ts:965](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L965)

Create a WalId from an LSN.
Format: wal:lsn(base36,12-padded)

## Parameters

### lsn

`bigint`

## Returns

`string`

Branded WalId type for compile-time safety
