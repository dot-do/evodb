[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [rpc/src](../README.md) / RecoveryConfig

# Interface: RecoveryConfig

Defined in: [rpc/src/fallback.ts:421](https://github.com/dot-do/evodb/blob/main/rpc/src/fallback.ts#L421)

Configuration for fallback recovery

## Properties

### maxRetries

> **maxRetries**: `number`

Defined in: [rpc/src/fallback.ts:423](https://github.com/dot-do/evodb/blob/main/rpc/src/fallback.ts#L423)

Maximum retry attempts before giving up

***

### retryDelayMs

> **retryDelayMs**: `number`

Defined in: [rpc/src/fallback.ts:426](https://github.com/dot-do/evodb/blob/main/rpc/src/fallback.ts#L426)

Delay between retries (ms)

***

### backoffMultiplier

> **backoffMultiplier**: `number`

Defined in: [rpc/src/fallback.ts:429](https://github.com/dot-do/evodb/blob/main/rpc/src/fallback.ts#L429)

Exponential backoff multiplier

***

### maxDelayMs

> **maxDelayMs**: `number`

Defined in: [rpc/src/fallback.ts:432](https://github.com/dot-do/evodb/blob/main/rpc/src/fallback.ts#L432)

Maximum delay between retries (ms)
