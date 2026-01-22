[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / UpdateResult

# Interface: UpdateResult\<T\>

Defined in: [core/src/evodb.ts:205](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L205)

Update operation result

## Type Parameters

### T

`T` = `Record`\<`string`, `unknown`\>

## Properties

### matchedCount

> **matchedCount**: `number`

Defined in: [core/src/evodb.ts:207](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L207)

Number of documents that matched the filter

***

### modifiedCount

> **modifiedCount**: `number`

Defined in: [core/src/evodb.ts:209](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L209)

Number of documents that were modified

***

### documents?

> `optional` **documents**: `T`[]

Defined in: [core/src/evodb.ts:211](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L211)

Updated documents (only if returnDocuments option is true)
