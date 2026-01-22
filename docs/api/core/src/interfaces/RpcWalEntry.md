[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / RpcWalEntry

# Interface: RpcWalEntry\<T\>

Defined in: [core/src/types.ts:437](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L437)

WAL entry for RPC communication (high-level format).
Used for DO-to-DO CDC streaming and parent aggregation.

Different from Core `WalEntry` which uses:
- `lsn: bigint` instead of `sequence: number`
- `timestamp: bigint` instead of `timestamp: number`
- `op: WalOp` enum instead of `operation: string`
- `data: Uint8Array` instead of `before`/`after` JSON

## Type Parameters

### T

`T` = `unknown`

## Properties

### sequence

> **sequence**: `number`

Defined in: [core/src/types.ts:439](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L439)

Monotonically increasing sequence number within the source DO

***

### timestamp

> **timestamp**: `number`

Defined in: [core/src/types.ts:441](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L441)

Unix timestamp in milliseconds when the change occurred

***

### operation

> **operation**: [`RpcWalOperation`](../type-aliases/RpcWalOperation.md)

Defined in: [core/src/types.ts:443](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L443)

Type of database operation

***

### table

> **table**: `string`

Defined in: [core/src/types.ts:445](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L445)

Table name where the change occurred

***

### rowId

> **rowId**: `string`

Defined in: [core/src/types.ts:447](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L447)

Primary key or row identifier

***

### before?

> `optional` **before**: `T`

Defined in: [core/src/types.ts:449](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L449)

Row data before the change (for UPDATE/DELETE)

***

### after?

> `optional` **after**: `T`

Defined in: [core/src/types.ts:451](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L451)

Row data after the change (for INSERT/UPDATE)

***

### metadata?

> `optional` **metadata**: [`WalEntryMetadata`](WalEntryMetadata.md)

Defined in: [core/src/types.ts:453](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L453)

Optional metadata (e.g., transaction ID, user ID)
