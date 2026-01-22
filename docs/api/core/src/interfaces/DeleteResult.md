[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / DeleteResult

# Interface: DeleteResult\<T\>

Defined in: [core/src/evodb.ts:225](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L225)

Delete operation result

## Type Parameters

### T

`T` = `Record`\<`string`, `unknown`\>

## Properties

### deletedCount

> **deletedCount**: `number`

Defined in: [core/src/evodb.ts:227](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L227)

Number of documents that were deleted

***

### documents?

> `optional` **documents**: `T`[]

Defined in: [core/src/evodb.ts:229](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L229)

Deleted documents (only if returnDocuments option is true)
