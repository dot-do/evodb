[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [rpc/src](../README.md) / BufferOverflowError

# Class: BufferOverflowError

Defined in: [rpc/src/types.ts:666](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L666)

Buffer overflow error

## Extends

- [`LakehouseRpcError`](LakehouseRpcError.md)

## Constructors

### Constructor

> **new BufferOverflowError**(`message`): `BufferOverflowError`

Defined in: [rpc/src/types.ts:667](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L667)

#### Parameters

##### message

`string`

#### Returns

`BufferOverflowError`

#### Overrides

[`LakehouseRpcError`](LakehouseRpcError.md).[`constructor`](LakehouseRpcError.md#constructor)

## Properties

### code

> `readonly` **code**: `string`

Defined in: [rpc/src/types.ts:645](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L645)

#### Inherited from

[`LakehouseRpcError`](LakehouseRpcError.md).[`code`](LakehouseRpcError.md#code)

***

### retryable

> `readonly` **retryable**: `boolean` = `false`

Defined in: [rpc/src/types.ts:646](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L646)

#### Inherited from

[`LakehouseRpcError`](LakehouseRpcError.md).[`retryable`](LakehouseRpcError.md#retryable)
