[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / AckRPCPayload

# Interface: AckRPCPayload

Defined in: [writer/src/types.ts:579](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L579)

Acknowledgment RPC payload

## Properties

### sourceDoId

> **sourceDoId**: `string`

Defined in: [writer/src/types.ts:581](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L581)

Source DO ID

***

### sequenceNumber

> **sequenceNumber**: `string`

Defined in: [writer/src/types.ts:583](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L583)

Acknowledged sequence number

***

### success

> **success**: `boolean`

Defined in: [writer/src/types.ts:585](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L585)

Success flag

***

### error?

> `optional` **error**: `string`

Defined in: [writer/src/types.ts:587](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L587)

Error message
