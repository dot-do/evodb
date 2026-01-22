[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / rpcEntryToWalEntry

# Function: rpcEntryToWalEntry()

> **rpcEntryToWalEntry**\<`T`\>(`entry`, `checksum`): [`WalEntry`](../interfaces/WalEntry.md)

Defined in: [core/src/types.ts:574](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L574)

Convert RpcWalEntry to Core WalEntry format.

## Type Parameters

### T

`T`

## Parameters

### entry

[`RpcWalEntry`](../interfaces/RpcWalEntry.md)\<`T`\>

### checksum

`number` = `0`

## Returns

[`WalEntry`](../interfaces/WalEntry.md)
