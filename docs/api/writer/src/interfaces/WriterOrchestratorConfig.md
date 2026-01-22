[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / WriterOrchestratorConfig

# Interface: WriterOrchestratorConfig

Defined in: [writer/src/strategies/interfaces.ts:247](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L247)

Configuration for the writer orchestrator

## Properties

### buffer

> **buffer**: [`CDCBufferStrategy`](CDCBufferStrategy.md)

Defined in: [writer/src/strategies/interfaces.ts:249](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L249)

Buffer strategy

***

### writer

> **writer**: [`BlockWriter`](BlockWriter.md)

Defined in: [writer/src/strategies/interfaces.ts:251](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L251)

Block writer

***

### compactor

> **compactor**: [`ICompactionStrategy`](ICompactionStrategy.md)

Defined in: [writer/src/strategies/interfaces.ts:253](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L253)

Compaction strategy

***

### manifest?

> `optional` **manifest**: [`ManifestManager`](ManifestManager.md)

Defined in: [writer/src/strategies/interfaces.ts:255](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L255)

Optional manifest manager
