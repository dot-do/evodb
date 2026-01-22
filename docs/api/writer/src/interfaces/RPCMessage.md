[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / RPCMessage

# Interface: RPCMessage\<T\>

Defined in: [writer/src/types.ts:553](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L553)

RPC message envelope

## Type Parameters

### T

`T` = `unknown`

## Properties

### id

> **id**: `string`

Defined in: [writer/src/types.ts:555](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L555)

Message ID for correlation

***

### type

> **type**: `string`

Defined in: [writer/src/types.ts:557](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L557)

Message type

***

### payload

> **payload**: `T`

Defined in: [writer/src/types.ts:559](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L559)

Payload

***

### timestamp

> **timestamp**: `number`

Defined in: [writer/src/types.ts:561](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L561)

Timestamp
