[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / walEntryToRpcEntry

# Function: walEntryToRpcEntry()

> **walEntryToRpcEntry**\<`T`\>(`entry`, `table`, `rowId`): [`RpcWalEntry`](../interfaces/RpcWalEntry.md)\<`T`\>

Defined in: [core/src/types.ts:543](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L543)

Convert Core WalEntry to RpcWalEntry format.
Note: data must be JSON-parseable for this conversion.

## Type Parameters

### T

`T` = `unknown`

## Parameters

### entry

[`WalEntry`](../interfaces/WalEntry.md)

### table

`string`

### rowId

`string`

## Returns

[`RpcWalEntry`](../interfaces/RpcWalEntry.md)\<`T`\>
