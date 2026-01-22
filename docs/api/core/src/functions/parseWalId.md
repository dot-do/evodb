[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / parseWalId

# Function: parseWalId()

> **parseWalId**(`id`): `bigint`

Defined in: [core/src/storage.ts:974](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L974)

Parse a WalId to extract the LSN.

## Parameters

### id

`string`

WalId or plain string to parse

## Returns

`bigint`

Parsed LSN as bigint or null if invalid format
