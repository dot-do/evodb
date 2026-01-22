[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [rpc/src](../README.md) / ProtocolError

# Class: ProtocolError

Defined in: [rpc/src/types.ts:689](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L689)

Protocol error

## Extends

- [`LakehouseRpcError`](LakehouseRpcError.md)

## Constructors

### Constructor

> **new ProtocolError**(`message`): `ProtocolError`

Defined in: [rpc/src/types.ts:690](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L690)

#### Parameters

##### message

`string`

#### Returns

`ProtocolError`

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
