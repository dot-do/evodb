[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / LakehouseWriterDeps

# Interface: LakehouseWriterDeps

Defined in: [writer/src/writer.ts:64](https://github.com/dot-do/evodb/blob/main/writer/src/writer.ts#L64)

Configuration for dependency injection

## Properties

### bufferStrategy?

> `optional` **bufferStrategy**: [`CDCBufferStrategy`](CDCBufferStrategy.md)

Defined in: [writer/src/writer.ts:66](https://github.com/dot-do/evodb/blob/main/writer/src/writer.ts#L66)

Custom buffer strategy

***

### blockWriter?

> `optional` **blockWriter**: [`BlockWriter`](BlockWriter.md)

Defined in: [writer/src/writer.ts:68](https://github.com/dot-do/evodb/blob/main/writer/src/writer.ts#L68)

Custom block writer

***

### compactionStrategy?

> `optional` **compactionStrategy**: [`ICompactionStrategy`](ICompactionStrategy.md)

Defined in: [writer/src/writer.ts:70](https://github.com/dot-do/evodb/blob/main/writer/src/writer.ts#L70)

Custom compaction strategy
