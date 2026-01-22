[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / CompactResult

# Interface: CompactResult

Defined in: [writer/src/types.ts:372](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L372)

Result of a compaction operation

## Properties

### status

> **status**: `"completed"` \| `"skipped"` \| `"failed"`

Defined in: [writer/src/types.ts:374](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L374)

Status of the compaction

***

### blocksMerged

> **blocksMerged**: `number`

Defined in: [writer/src/types.ts:376](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L376)

Blocks merged

***

### newBlock?

> `optional` **newBlock**: [`BlockMetadata`](BlockMetadata.md)

Defined in: [writer/src/types.ts:378](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L378)

New block created (if completed)

***

### blocksDeleted

> **blocksDeleted**: `string`[]

Defined in: [writer/src/types.ts:380](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L380)

Blocks deleted

***

### durationMs

> **durationMs**: `number`

Defined in: [writer/src/types.ts:382](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L382)

Duration in milliseconds

***

### error?

> `optional` **error**: `string`

Defined in: [writer/src/types.ts:384](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L384)

Error message (if failed)
