[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / resolveWriterOptions

# Function: resolveWriterOptions()

> **resolveWriterOptions**(`options`): [`ResolvedWriterOptions`](../interfaces/ResolvedWriterOptions.md)

Defined in: [writer/src/types.ts:188](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L188)

Resolve writer options with partition mode defaults

## Parameters

### options

`Partial`\<[`WriterOptions`](../interfaces/WriterOptions.md)\> & `Pick`\<[`WriterOptions`](../interfaces/WriterOptions.md), `"r2Bucket"` \| `"tableLocation"`\>

## Returns

[`ResolvedWriterOptions`](../interfaces/ResolvedWriterOptions.md)
