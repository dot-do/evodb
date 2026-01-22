[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / ShardAssignment

# Interface: ShardAssignment

Defined in: [writer/src/shard-registry.ts:49](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L49)

Tenant/table assignment to a shard

## Properties

### tenant

> **tenant**: `string`

Defined in: [writer/src/shard-registry.ts:51](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L51)

Tenant identifier

***

### table

> **table**: `string`

Defined in: [writer/src/shard-registry.ts:53](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L53)

Table name

***

### entryCount

> **entryCount**: `number`

Defined in: [writer/src/shard-registry.ts:55](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L55)

Entry count from this assignment

***

### lastActivityTime

> **lastActivityTime**: `number`

Defined in: [writer/src/shard-registry.ts:57](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L57)

Last activity time
