[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / RegistryStats

# Interface: RegistryStats

Defined in: [writer/src/shard-registry.ts:63](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L63)

Aggregated registry statistics

## Properties

### totalShards

> **totalShards**: `number`

Defined in: [writer/src/shard-registry.ts:65](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L65)

Total number of shards

***

### healthyShards

> **healthyShards**: `number`

Defined in: [writer/src/shard-registry.ts:67](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L67)

Number of healthy shards

***

### degradedShards

> **degradedShards**: `number`

Defined in: [writer/src/shard-registry.ts:69](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L69)

Number of degraded shards

***

### unhealthyShards

> **unhealthyShards**: `number`

Defined in: [writer/src/shard-registry.ts:71](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L71)

Number of unhealthy shards

***

### totalBlocks

> **totalBlocks**: `number`

Defined in: [writer/src/shard-registry.ts:73](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L73)

Total blocks across all shards

***

### totalPendingBlocks

> **totalPendingBlocks**: `number`

Defined in: [writer/src/shard-registry.ts:75](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L75)

Total pending blocks across all shards

***

### totalRows

> **totalRows**: `number`

Defined in: [writer/src/shard-registry.ts:77](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L77)

Total rows across all shards

***

### totalBytesR2

> **totalBytesR2**: `number`

Defined in: [writer/src/shard-registry.ts:79](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L79)

Total bytes in R2 across all shards

***

### totalConnectedSources

> **totalConnectedSources**: `number`

Defined in: [writer/src/shard-registry.ts:81](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L81)

Total connected sources across all shards

***

### avgBlocksPerShard

> **avgBlocksPerShard**: `number`

Defined in: [writer/src/shard-registry.ts:83](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L83)

Average blocks per shard

***

### maxBlocksOnShard

> **maxBlocksOnShard**: `number`

Defined in: [writer/src/shard-registry.ts:85](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L85)

Max blocks on a single shard

***

### minBlocksOnShard

> **minBlocksOnShard**: `number`

Defined in: [writer/src/shard-registry.ts:87](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L87)

Min blocks on a single shard

***

### blockDistributionStdDev

> **blockDistributionStdDev**: `number`

Defined in: [writer/src/shard-registry.ts:89](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L89)

Standard deviation of block distribution
