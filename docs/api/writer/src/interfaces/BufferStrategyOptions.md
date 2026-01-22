[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / BufferStrategyOptions

# Interface: BufferStrategyOptions

Defined in: [writer/src/strategies/buffer-strategy.ts:17](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/buffer-strategy.ts#L17)

Options for buffer strategies

## Properties

### maxEntries

> **maxEntries**: `number`

Defined in: [writer/src/strategies/buffer-strategy.ts:19](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/buffer-strategy.ts#L19)

Max entries before automatic flush

***

### maxAgeMs

> **maxAgeMs**: `number`

Defined in: [writer/src/strategies/buffer-strategy.ts:21](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/buffer-strategy.ts#L21)

Max milliseconds before automatic flush

***

### targetSizeBytes

> **targetSizeBytes**: `number`

Defined in: [writer/src/strategies/buffer-strategy.ts:23](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/buffer-strategy.ts#L23)

Target size in bytes before flush
