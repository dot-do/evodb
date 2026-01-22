[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / createCompactionStrategy

# Function: createCompactionStrategy()

> **createCompactionStrategy**(`r2Bucket`, `options`): [`ICompactionStrategy`](../interfaces/ICompactionStrategy.md)

Defined in: [writer/src/strategies/compaction-strategy.ts:363](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/compaction-strategy.ts#L363)

Create a compaction strategy from writer options
Defaults to TimeBasedCompaction

## Parameters

### r2Bucket

[`R2Bucket`](../interfaces/R2Bucket.md)

### options

[`ResolvedWriterOptions`](../interfaces/ResolvedWriterOptions.md)

## Returns

[`ICompactionStrategy`](../interfaces/ICompactionStrategy.md)
