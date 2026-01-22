[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / IndexOptions

# Interface: IndexOptions

Defined in: core/src/indexes.ts:63

Options for creating an index

## Properties

### name?

> `optional` **name**: `string`

Defined in: core/src/indexes.ts:65

Custom index name (auto-generated if not provided)

***

### type?

> `optional` **type**: [`IndexType`](../type-aliases/IndexType.md)

Defined in: core/src/indexes.ts:67

Index type: 'btree' (default) or 'hash'

***

### unique?

> `optional` **unique**: `boolean`

Defined in: core/src/indexes.ts:69

Whether to enforce uniqueness constraint
