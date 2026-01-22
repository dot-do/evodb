[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / RelationshipOptions

# Interface: RelationshipOptions

Defined in: [core/src/evodb.ts:172](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L172)

Relationship options

## Properties

### type?

> `optional` **type**: `"one-to-one"` \| `"one-to-many"` \| `"many-to-many"`

Defined in: [core/src/evodb.ts:173](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L173)

***

### foreignKey?

> `optional` **foreignKey**: `string`

Defined in: [core/src/evodb.ts:174](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L174)

***

### onDelete?

> `optional` **onDelete**: `"cascade"` \| `"set-null"` \| `"restrict"`

Defined in: [core/src/evodb.ts:175](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L175)

***

### onUpdate?

> `optional` **onUpdate**: `"cascade"` \| `"set-null"` \| `"restrict"`

Defined in: [core/src/evodb.ts:176](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L176)
