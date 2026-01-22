[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [rpc/src](../README.md) / LakehouseRpcError

# Class: LakehouseRpcError

Defined in: [rpc/src/types.ts:642](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L642)

Base error class for lakehouse RPC

## Extends

- `Error`

## Extended by

- [`ConnectionError`](ConnectionError.md)
- [`BufferOverflowError`](BufferOverflowError.md)
- [`FlushError`](FlushError.md)
- [`ProtocolError`](ProtocolError.md)

## Constructors

### Constructor

> **new LakehouseRpcError**(`message`, `code`, `retryable`): `LakehouseRpcError`

Defined in: [rpc/src/types.ts:643](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L643)

#### Parameters

##### message

`string`

##### code

`string`

##### retryable

`boolean` = `false`

#### Returns

`LakehouseRpcError`

#### Overrides

`Error.constructor`

## Properties

### code

> `readonly` **code**: `string`

Defined in: [rpc/src/types.ts:645](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L645)

***

### retryable

> `readonly` **retryable**: `boolean` = `false`

Defined in: [rpc/src/types.ts:646](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L646)
