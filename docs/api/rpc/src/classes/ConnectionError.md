[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [rpc/src](../README.md) / ConnectionError

# Class: ConnectionError

Defined in: [rpc/src/types.ts:656](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L656)

Connection error

## Extends

- [`LakehouseRpcError`](LakehouseRpcError.md)

## Constructors

### Constructor

> **new ConnectionError**(`message`, `retryable`): `ConnectionError`

Defined in: [rpc/src/types.ts:657](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L657)

#### Parameters

##### message

`string`

##### retryable

`boolean` = `true`

#### Returns

`ConnectionError`

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
