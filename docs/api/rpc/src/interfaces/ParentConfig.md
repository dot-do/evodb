[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [rpc/src](../README.md) / ParentConfig

# Interface: ParentConfig

Defined in: [rpc/src/types.ts:446](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L446)

Parent DO configuration

## Properties

### r2BucketName

> **r2BucketName**: `string`

Defined in: [rpc/src/types.ts:448](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L448)

R2 bucket name for data storage

***

### r2BasePath

> **r2BasePath**: `string`

Defined in: [rpc/src/types.ts:451](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L451)

Base path in R2 for Iceberg table

***

### flushThresholdEntries

> **flushThresholdEntries**: `number`

Defined in: [rpc/src/types.ts:454](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L454)

Maximum entries before flush

***

### flushThresholdBytes

> **flushThresholdBytes**: `number`

Defined in: [rpc/src/types.ts:457](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L457)

Maximum size in bytes before flush

***

### flushThresholdMs

> **flushThresholdMs**: `number`

Defined in: [rpc/src/types.ts:460](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L460)

Maximum age of buffer before flush (ms)

***

### flushIntervalMs

> **flushIntervalMs**: `number`

Defined in: [rpc/src/types.ts:463](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L463)

Interval for scheduled flushes (ms)

***

### maxBufferSize

> **maxBufferSize**: `number`

Defined in: [rpc/src/types.ts:466](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L466)

Maximum buffer size in bytes

***

### enableFallback

> **enableFallback**: `boolean`

Defined in: [rpc/src/types.ts:469](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L469)

Enable local fallback storage on R2 failure

***

### maxFallbackSize

> **maxFallbackSize**: `number`

Defined in: [rpc/src/types.ts:472](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L472)

Maximum fallback storage size

***

### enableDeduplication

> **enableDeduplication**: `boolean`

Defined in: [rpc/src/types.ts:475](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L475)

Enable deduplication

***

### deduplicationWindowMs

> **deduplicationWindowMs**: `number`

Defined in: [rpc/src/types.ts:478](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L478)

Deduplication window in milliseconds
