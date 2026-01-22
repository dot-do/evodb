[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [rpc/src](../README.md) / WalEntry

# Type Alias: WalEntry\<T\>

> **WalEntry**\<`T`\> = `CoreRpcWalEntry`\<`T`\>

Defined in: [rpc/src/types.ts:65](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L65)

A single WAL (Write-Ahead Log) entry from a Child DO.
Uses unified RpcWalEntry type from @evodb/core.

These entries are captured from SQLite triggers in the Child DO's
columnar JSON storage and sent to the Parent DO for aggregation.

## Type Parameters

### T

`T` = `unknown`
