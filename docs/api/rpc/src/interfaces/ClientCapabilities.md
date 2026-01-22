[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [rpc/src](../README.md) / ClientCapabilities

# Interface: ClientCapabilities

Defined in: [rpc/src/types.ts:298](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L298)

Capabilities advertised by the client during connection

## Properties

### binaryProtocol

> **binaryProtocol**: `boolean`

Defined in: [rpc/src/types.ts:300](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L300)

Supports binary protocol

***

### compression

> **compression**: `boolean`

Defined in: [rpc/src/types.ts:303](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L303)

Supports compression

***

### batching

> **batching**: `boolean`

Defined in: [rpc/src/types.ts:306](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L306)

Supports batching

***

### maxBatchSize

> **maxBatchSize**: `number`

Defined in: [rpc/src/types.ts:309](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L309)

Maximum batch size client can send

***

### maxMessageSize

> **maxMessageSize**: `number`

Defined in: [rpc/src/types.ts:312](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L312)

Maximum message size client can send
