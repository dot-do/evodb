[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [rpc/src](../README.md) / FlushError

# Class: FlushError

Defined in: [rpc/src/types.ts:676](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L676)

Flush error

## Extends

- [`LakehouseRpcError`](LakehouseRpcError.md)

## Constructors

### Constructor

> **new FlushError**(`message`, `usedFallback`): `FlushError`

Defined in: [rpc/src/types.ts:677](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L677)

#### Parameters

##### message

`string`

##### usedFallback

`boolean`

#### Returns

`FlushError`

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

***

### usedFallback

> `readonly` **usedFallback**: `boolean`

Defined in: [rpc/src/types.ts:679](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L679)
