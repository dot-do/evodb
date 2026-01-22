[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [rpc/src](../README.md) / AckDetails

# Interface: AckDetails

Defined in: [rpc/src/types.ts:222](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L222)

Additional acknowledgment details

## Properties

### entriesProcessed

> **entriesProcessed**: `number`

Defined in: [rpc/src/types.ts:224](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L224)

Number of entries processed

***

### bufferUtilization

> **bufferUtilization**: `number`

Defined in: [rpc/src/types.ts:227](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L227)

Current buffer utilization (0-1)

***

### timeUntilFlush?

> `optional` **timeUntilFlush**: `number`

Defined in: [rpc/src/types.ts:230](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L230)

Estimated time until next flush (ms)

***

### persistedPath?

> `optional` **persistedPath**: `string`

Defined in: [rpc/src/types.ts:233](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L233)

R2 path where data was persisted (if persisted)
