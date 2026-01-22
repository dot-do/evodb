[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / ShardStats

# Interface: ShardStats

Defined in: [writer/src/shard-router.ts:65](https://github.com/dot-do/evodb/blob/main/writer/src/shard-router.ts#L65)

Shard statistics

## Properties

### shardNumber

> **shardNumber**: `number`

Defined in: [writer/src/shard-router.ts:67](https://github.com/dot-do/evodb/blob/main/writer/src/shard-router.ts#L67)

Shard number

***

### tenantCount

> **tenantCount**: `number`

Defined in: [writer/src/shard-router.ts:69](https://github.com/dot-do/evodb/blob/main/writer/src/shard-router.ts#L69)

Number of tenants routed to this shard

***

### tableCount

> **tableCount**: `number`

Defined in: [writer/src/shard-router.ts:71](https://github.com/dot-do/evodb/blob/main/writer/src/shard-router.ts#L71)

Number of tables routed to this shard

***

### keys

> **keys**: [`ShardKey`](ShardKey.md)[]

Defined in: [writer/src/shard-router.ts:73](https://github.com/dot-do/evodb/blob/main/writer/src/shard-router.ts#L73)

List of routing keys assigned to this shard
