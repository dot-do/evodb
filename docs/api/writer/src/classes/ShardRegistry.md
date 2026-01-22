[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / ShardRegistry

# Class: ShardRegistry

Defined in: [writer/src/shard-registry.ts:142](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L142)

ShardRegistry - Discovery and metadata service for sharded writers

Used by readers to:
1. Discover which shards exist and their health
2. Find shards containing data for specific tenants/tables
3. Aggregate statistics across all shards
4. Plan read operations across shards

## Example

```typescript
const router = new ShardRouter({ shardCount: 16, namespaceBinding: 'WRITER_SHARDS' });
const registry = new ShardRegistry(router, env.WRITER_SHARDS);

// Get all shard metadata
const metadata = await registry.getAllShardMetadata();

// Find shards for a specific tenant
const result = await registry.findShardsForTenant('acme');

// Get aggregated statistics
const stats = await registry.getRegistryStats();
```

## Constructors

### Constructor

> **new ShardRegistry**(`router`, `namespace`, `options?`): `ShardRegistry`

Defined in: [writer/src/shard-registry.ts:165](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L165)

Create a new ShardRegistry

#### Parameters

##### router

[`ShardRouter`](ShardRouter.md)

ShardRouter instance

##### namespace

`DurableObjectNamespace`

Durable Object namespace for shard DOs

##### options?

Optional configuration

###### cacheTtlMs?

`number`

Cache TTL in milliseconds (default: 30000)

###### queryTimeoutMs?

`number`

Query timeout in milliseconds (default: 5000)

#### Returns

`ShardRegistry`

## Accessors

### shardCount

#### Get Signature

> **get** **shardCount**(): `number`

Defined in: [writer/src/shard-registry.ts:191](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L191)

Get shard count

##### Returns

`number`

## Methods

### getRouter()

> **getRouter**(): [`ShardRouter`](ShardRouter.md)

Defined in: [writer/src/shard-registry.ts:184](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L184)

Get the underlying router

#### Returns

[`ShardRouter`](ShardRouter.md)

***

### getShardMetadata()

> **getShardMetadata**(`shardNumber`, `forceRefresh`): `Promise`\<[`ShardMetadata`](../interfaces/ShardMetadata.md)\>

Defined in: [writer/src/shard-registry.ts:202](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L202)

Get metadata for a specific shard

#### Parameters

##### shardNumber

`number`

Shard number to query

##### forceRefresh

`boolean` = `false`

Bypass cache if true

#### Returns

`Promise`\<[`ShardMetadata`](../interfaces/ShardMetadata.md)\>

Shard metadata

***

### getAllShardMetadata()

> **getAllShardMetadata**(`forceRefresh`): `Promise`\<[`ShardMetadata`](../interfaces/ShardMetadata.md)[]\>

Defined in: [writer/src/shard-registry.ts:254](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L254)

Get metadata for all shards

#### Parameters

##### forceRefresh

`boolean` = `false`

Bypass cache if true

#### Returns

`Promise`\<[`ShardMetadata`](../interfaces/ShardMetadata.md)[]\>

Array of shard metadata

***

### getRegistryStats()

> **getRegistryStats**(`forceRefresh`): `Promise`\<[`RegistryStats`](../interfaces/RegistryStats.md)\>

Defined in: [writer/src/shard-registry.ts:270](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L270)

Get aggregated registry statistics

#### Parameters

##### forceRefresh

`boolean` = `false`

Bypass cache if true

#### Returns

`Promise`\<[`RegistryStats`](../interfaces/RegistryStats.md)\>

Aggregated statistics

***

### findShardsForTenant()

> **findShardsForTenant**(`tenant`): `Promise`\<[`ShardQueryResult`](../interfaces/ShardQueryResult.md)\>

Defined in: [writer/src/shard-registry.ts:345](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L345)

Find shards for a specific tenant

#### Parameters

##### tenant

`string`

Tenant identifier

#### Returns

`Promise`\<[`ShardQueryResult`](../interfaces/ShardQueryResult.md)\>

Query result with matching shards

***

### findShardsForKey()

> **findShardsForKey**(`key`): `Promise`\<[`ShardQueryResult`](../interfaces/ShardQueryResult.md)\>

Defined in: [writer/src/shard-registry.ts:366](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L366)

Find shards for a specific tenant/table combination

#### Parameters

##### key

[`ShardKey`](../interfaces/ShardKey.md)

Shard routing key

#### Returns

`Promise`\<[`ShardQueryResult`](../interfaces/ShardQueryResult.md)\>

Query result with matching shards

***

### getBlocksForKey()

> **getBlocksForKey**(`key`): `Promise`\<[`ShardedBlockLocation`](../interfaces/ShardedBlockLocation.md)[]\>

Defined in: [writer/src/shard-registry.ts:386](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L386)

Get all blocks across all shards for a tenant/table

#### Parameters

##### key

[`ShardKey`](../interfaces/ShardKey.md)

Shard routing key

#### Returns

`Promise`\<[`ShardedBlockLocation`](../interfaces/ShardedBlockLocation.md)[]\>

Array of block locations

***

### getAllBlocks()

> **getAllBlocks**(): `Promise`\<[`ShardedBlockLocation`](../interfaces/ShardedBlockLocation.md)[]\>

Defined in: [writer/src/shard-registry.ts:412](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L412)

Get all blocks across all shards

#### Returns

`Promise`\<[`ShardedBlockLocation`](../interfaces/ShardedBlockLocation.md)[]\>

Array of all block locations

***

### getHealthyShards()

> **getHealthyShards**(): `Promise`\<[`ShardMetadata`](../interfaces/ShardMetadata.md)[]\>

Defined in: [writer/src/shard-registry.ts:451](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L451)

Find healthy shards

#### Returns

`Promise`\<[`ShardMetadata`](../interfaces/ShardMetadata.md)[]\>

Array of healthy shard metadata

***

### getProblematicShards()

> **getProblematicShards**(): `Promise`\<[`ShardMetadata`](../interfaces/ShardMetadata.md)[]\>

Defined in: [writer/src/shard-registry.ts:461](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L461)

Find degraded or unhealthy shards

#### Returns

`Promise`\<[`ShardMetadata`](../interfaces/ShardMetadata.md)[]\>

Array of problematic shard metadata

***

### getShardInfo()

> **getShardInfo**(`key`): [`ShardInfo`](../interfaces/ShardInfo.md)

Defined in: [writer/src/shard-registry.ts:472](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L472)

Get shard info for a key without fetching full metadata

#### Parameters

##### key

[`ShardKey`](../interfaces/ShardKey.md)

Shard routing key

#### Returns

[`ShardInfo`](../interfaces/ShardInfo.md)

Shard info from router

***

### clearCache()

> **clearCache**(): `void`

Defined in: [writer/src/shard-registry.ts:479](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L479)

Clear the metadata cache

#### Returns

`void`

***

### getCacheStats()

> **getCacheStats**(): `object`

Defined in: [writer/src/shard-registry.ts:486](https://github.com/dot-do/evodb/blob/main/writer/src/shard-registry.ts#L486)

Get cache statistics

#### Returns

`object`

##### size

> **size**: `number`

##### hitRate

> **hitRate**: `number`
