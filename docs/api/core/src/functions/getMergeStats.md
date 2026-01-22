[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / getMergeStats

# Function: getMergeStats()

> **getMergeStats**(`adapter`, `prefix`): `Promise`\<\{ `blockCount`: `number`; `totalRows`: `number`; `oldestBlock`: `number`; `newestBlock`: `number`; \}\>

Defined in: [core/src/merge.ts:210](https://github.com/dot-do/evodb/blob/main/core/src/merge.ts#L210)

Get merge statistics

## Parameters

### adapter

[`StorageAdapter`](../interfaces/StorageAdapter.md)

### prefix

`string` = `'blk'`

## Returns

`Promise`\<\{ `blockCount`: `number`; `totalRows`: `number`; `oldestBlock`: `number`; `newestBlock`: `number`; \}\>
