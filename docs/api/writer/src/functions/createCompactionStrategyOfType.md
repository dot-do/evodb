[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / createCompactionStrategyOfType

# Function: createCompactionStrategyOfType()

> **createCompactionStrategyOfType**(`type`, `r2Bucket`, `options`): [`ICompactionStrategy`](../interfaces/ICompactionStrategy.md)

Defined in: [writer/src/strategies/compaction-strategy.ts:373](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/compaction-strategy.ts#L373)

Create a specific compaction strategy type

## Parameters

### type

[`CompactionStrategyType`](../type-aliases/CompactionStrategyType.md)

### r2Bucket

[`R2Bucket`](../interfaces/R2Bucket.md)

### options

[`ResolvedWriterOptions`](../interfaces/ResolvedWriterOptions.md)

## Returns

[`ICompactionStrategy`](../interfaces/ICompactionStrategy.md)
