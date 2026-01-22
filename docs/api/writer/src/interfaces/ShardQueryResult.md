[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / ShardQueryResult

# Interface: ShardQueryResult

Defined in: [writer/src/shard-registry.ts:95](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L95)

Query result for finding shards with specific data

## Properties

### shards

> **shards**: [`ShardMetadata`](ShardMetadata.md)[]

Defined in: [writer/src/shard-registry.ts:97](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L97)

Shards containing the requested data

***

### totalCount

> **totalCount**: `number`

Defined in: [writer/src/shard-registry.ts:99](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L99)

Total result count

***

### queryTimeMs

> **queryTimeMs**: `number`

Defined in: [writer/src/shard-registry.ts:101](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L101)

Query execution time in ms
