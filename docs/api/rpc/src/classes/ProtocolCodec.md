[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [rpc/src](../README.md) / ProtocolCodec

# Class: ProtocolCodec

Defined in: [rpc/src/protocol.ts:133](https://github.com/dot-do/evodb/blob/main/rpc/src/protocol.ts#L133)

Protocol codec for encoding/decoding RPC messages

## Constructors

### Constructor

> **new ProtocolCodec**(`bufferSize`): `ProtocolCodec`

Defined in: [rpc/src/protocol.ts:138](https://github.com/dot-do/evodb/blob/main/rpc/src/protocol.ts#L138)

#### Parameters

##### bufferSize

`number` = `MAX_MESSAGE_SIZE`

#### Returns

`ProtocolCodec`

## Methods

### encodeJson()

> **encodeJson**(`message`): `string`

Defined in: [rpc/src/protocol.ts:151](https://github.com/dot-do/evodb/blob/main/rpc/src/protocol.ts#L151)

Encode a message to JSON string

#### Parameters

##### message

[`AnyRpcMessage`](../type-aliases/AnyRpcMessage.md)

#### Returns

`string`

***

### decodeJson()

> **decodeJson**(`json`): [`AnyRpcMessage`](../type-aliases/AnyRpcMessage.md)

Defined in: [rpc/src/protocol.ts:158](https://github.com/dot-do/evodb/blob/main/rpc/src/protocol.ts#L158)

Decode a message from JSON string

#### Parameters

##### json

`string`

#### Returns

[`AnyRpcMessage`](../type-aliases/AnyRpcMessage.md)

***

### encodeCDCBatch()

> **encodeCDCBatch**(`message`): `ArrayBuffer`

Defined in: [rpc/src/protocol.ts:173](https://github.com/dot-do/evodb/blob/main/rpc/src/protocol.ts#L173)

Encode a CDC batch message to binary format

#### Parameters

##### message

[`CDCBatchMessage`](../interfaces/CDCBatchMessage.md)

#### Returns

`ArrayBuffer`

***

### encodeAck()

> **encodeAck**(`message`): `ArrayBuffer`

Defined in: [rpc/src/protocol.ts:322](https://github.com/dot-do/evodb/blob/main/rpc/src/protocol.ts#L322)

Encode an ACK message to binary format

ACK Binary Format (25 bytes minimum):
- magic (2 bytes): 0xCDC2
- version (1 byte): 1
- type (1 byte): 0x02 (ACK)
- flags (1 byte): HAS_CORRELATION_ID if correlationId present
- reserved (3 bytes)
- timestamp (8 bytes, uint64 LE)
- sequenceNumber (8 bytes, uint64 LE)
- statusCode (1 byte)
- correlationIdLength (2 bytes, if HAS_CORRELATION_ID)
- correlationId (variable, if HAS_CORRELATION_ID)

#### Parameters

##### message

[`AckMessage`](../interfaces/AckMessage.md)

#### Returns

`ArrayBuffer`

***

### encodeNack()

> **encodeNack**(`message`): `ArrayBuffer`

Defined in: [rpc/src/protocol.ts:359](https://github.com/dot-do/evodb/blob/main/rpc/src/protocol.ts#L359)

Encode a NACK message to binary format

#### Parameters

##### message

[`NackMessage`](../interfaces/NackMessage.md)

#### Returns

`ArrayBuffer`

***

### decode()

> **decode**(`buffer`): [`AnyRpcMessage`](../type-aliases/AnyRpcMessage.md)

Defined in: [rpc/src/protocol.ts:404](https://github.com/dot-do/evodb/blob/main/rpc/src/protocol.ts#L404)

Decode a binary message

#### Parameters

##### buffer

`ArrayBuffer`

#### Returns

[`AnyRpcMessage`](../type-aliases/AnyRpcMessage.md)
