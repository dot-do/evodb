[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [rpc/src](../README.md) / ChildConfig

# Interface: ChildConfig

Defined in: [rpc/src/types.ts:501](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L501)

Child DO (client) configuration

## Properties

### parentDoUrl

> **parentDoUrl**: `string`

Defined in: [rpc/src/types.ts:503](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L503)

Parent DO stub or URL

***

### maxBatchSize

> **maxBatchSize**: `number`

Defined in: [rpc/src/types.ts:506](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L506)

Maximum batch size (entries)

***

### maxBatchBytes

> **maxBatchBytes**: `number`

Defined in: [rpc/src/types.ts:509](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L509)

Maximum batch size (bytes)

***

### batchTimeoutMs

> **batchTimeoutMs**: `number`

Defined in: [rpc/src/types.ts:512](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L512)

Batch timeout before sending (ms)

***

### maxRetries

> **maxRetries**: `number`

Defined in: [rpc/src/types.ts:515](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L515)

Retry attempts on failure

***

### initialRetryDelayMs

> **initialRetryDelayMs**: `number`

Defined in: [rpc/src/types.ts:518](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L518)

Initial retry delay (ms)

***

### maxRetryDelayMs

> **maxRetryDelayMs**: `number`

Defined in: [rpc/src/types.ts:521](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L521)

Maximum retry delay (ms)

***

### backoffMultiplier

> **backoffMultiplier**: `number`

Defined in: [rpc/src/types.ts:524](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L524)

Exponential backoff multiplier

***

### autoReconnect

> **autoReconnect**: `boolean`

Defined in: [rpc/src/types.ts:527](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L527)

Enable automatic reconnection

***

### reconnectDelayMs

> **reconnectDelayMs**: `number`

Defined in: [rpc/src/types.ts:530](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L530)

Reconnection delay (ms)

***

### maxReconnectAttempts

> **maxReconnectAttempts**: `number`

Defined in: [rpc/src/types.ts:533](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L533)

Maximum reconnection attempts

***

### heartbeatIntervalMs

> **heartbeatIntervalMs**: `number`

Defined in: [rpc/src/types.ts:536](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L536)

Heartbeat interval (ms)

***

### maxPendingBatches

> **maxPendingBatches**: `number`

Defined in: [rpc/src/types.ts:539](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L539)

Maximum number of pending batches awaiting acknowledgment (prevents unbounded growth)

***

### pendingBatchTtlMs

> **pendingBatchTtlMs**: `number`

Defined in: [rpc/src/types.ts:542](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L542)

TTL for pending batches in milliseconds (batches older than this are cleaned up)

***

### pendingBatchCleanupIntervalMs

> **pendingBatchCleanupIntervalMs**: `number`

Defined in: [rpc/src/types.ts:545](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L545)

Interval for automatic pending batch cleanup in milliseconds

***

### onHandlerError()?

> `optional` **onHandlerError**: (`event`, `error`) => `void`

Defined in: [rpc/src/types.ts:548](https://github.com/dot-do/evodb/blob/main/rpc/src/types.ts#L548)

Optional callback for custom error handling when event handlers throw

#### Parameters

##### event

`string`

##### error

`Error`

#### Returns

`void`
