[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / ShardRouter

# Class: ShardRouter

Defined in: [writer/src/shard-router.ts:149](https://github.com/dot-do/evodb/blob/main/writer/src/shard-router.ts#L149)

ShardRouter - Routes writes to appropriate shard DOs

Uses consistent hashing on tenant/table combination to determine
which shard DO should handle writes for that partition.

## Example

```typescript
const router = new ShardRouter({
  shardCount: 16,
  namespaceBinding: 'WRITER_SHARDS'
});

// Get shard for a tenant/table
const shard = router.getShard({ tenant: 'acme', table: 'users' });
console.log(shard.shardNumber, shard.shardId);

// Get the actual DO stub
const stub = router.getShardStub(env.WRITER_SHARDS, {
  tenant: 'acme',
  table: 'users'
});
```

## Constructors

### Constructor

> **new ShardRouter**(`config`): `ShardRouter`

Defined in: [writer/src/shard-router.ts:165](https://github.com/dot-do/evodb/blob/main/writer/src/shard-router.ts#L165)

Create a new ShardRouter

#### Parameters

##### config

[`ShardRouterConfig`](../interfaces/ShardRouterConfig.md)

Shard configuration

#### Returns

`ShardRouter`

## Accessors

### shardCount

#### Get Signature

> **get** **shardCount**(): `number`

Defined in: [writer/src/shard-router.ts:188](https://github.com/dot-do/evodb/blob/main/writer/src/shard-router.ts#L188)

Get the shard count

##### Returns

`number`

## Methods

### getShard()

> **getShard**(`key`): [`ShardInfo`](../interfaces/ShardInfo.md)

Defined in: [writer/src/shard-router.ts:198](https://github.com/dot-do/evodb/blob/main/writer/src/shard-router.ts#L198)

Get shard information for a given key

#### Parameters

##### key

[`ShardKey`](../interfaces/ShardKey.md)

Shard routing key (tenant/table)

#### Returns

[`ShardInfo`](../interfaces/ShardInfo.md)

Shard information including shard number and DO ID

***

### getShardNumber()

> **getShardNumber**(`rawKey`): `number`

Defined in: [writer/src/shard-router.ts:249](https://github.com/dot-do/evodb/blob/main/writer/src/shard-router.ts#L249)

Get the shard number for a raw key string

#### Parameters

##### rawKey

`string`

Raw key string (will be hashed)

#### Returns

`number`

Shard number

***

### getShardStub()

> **getShardStub**(`namespace`, `key`): `DurableObjectStub`

Defined in: [writer/src/shard-router.ts:261](https://github.com/dot-do/evodb/blob/main/writer/src/shard-router.ts#L261)

Get shard DO stub from namespace

#### Parameters

##### namespace

`DurableObjectNamespace`

Durable Object namespace

##### key

[`ShardKey`](../interfaces/ShardKey.md)

Shard routing key

#### Returns

`DurableObjectStub`

Durable Object stub for the shard

***

### getAllShardStubs()

> **getAllShardStubs**(`namespace`): `object`[]

Defined in: [writer/src/shard-router.ts:273](https://github.com/dot-do/evodb/blob/main/writer/src/shard-router.ts#L273)

Get all shard stubs from namespace

#### Parameters

##### namespace

`DurableObjectNamespace`

Durable Object namespace

#### Returns

`object`[]

Array of shard stubs with their shard numbers

***

### generateShardId()

> **generateShardId**(`shardNumber`): `string`

Defined in: [writer/src/shard-router.ts:294](https://github.com/dot-do/evodb/blob/main/writer/src/shard-router.ts#L294)

Generate shard DO ID for a given shard number

#### Parameters

##### shardNumber

`number`

Shard number

#### Returns

`string`

Shard DO ID string

***

### parseShardId()

> **parseShardId**(`shardId`): `number`

Defined in: [writer/src/shard-router.ts:308](https://github.com/dot-do/evodb/blob/main/writer/src/shard-router.ts#L308)

Parse shard number from shard ID

#### Parameters

##### shardId

`string`

Shard DO ID string

#### Returns

`number`

Shard number or null if invalid

***

### getDistributionStats()

> **getDistributionStats**(`keys`): [`ShardStats`](../interfaces/ShardStats.md)[]

Defined in: [writer/src/shard-router.ts:330](https://github.com/dot-do/evodb/blob/main/writer/src/shard-router.ts#L330)

Get statistics about shard distribution

#### Parameters

##### keys

[`ShardKey`](../interfaces/ShardKey.md)[]

Array of routing keys to analyze

#### Returns

[`ShardStats`](../interfaces/ShardStats.md)[]

Per-shard statistics

***

### areColocated()

> **areColocated**(`key1`, `key2`): `boolean`

Defined in: [writer/src/shard-router.ts:378](https://github.com/dot-do/evodb/blob/main/writer/src/shard-router.ts#L378)

Check if keys would be colocated on the same shard

#### Parameters

##### key1

[`ShardKey`](../interfaces/ShardKey.md)

First routing key

##### key2

[`ShardKey`](../interfaces/ShardKey.md)

Second routing key

#### Returns

`boolean`

True if both keys route to the same shard

***

### getKeysForShard()

> **getKeysForShard**(`keys`, `shardNumber`): [`ShardKey`](../interfaces/ShardKey.md)[]

Defined in: [writer/src/shard-router.ts:389](https://github.com/dot-do/evodb/blob/main/writer/src/shard-router.ts#L389)

Get all keys that would route to a specific shard

#### Parameters

##### keys

[`ShardKey`](../interfaces/ShardKey.md)[]

Array of routing keys to filter

##### shardNumber

`number`

Target shard number

#### Returns

[`ShardKey`](../interfaces/ShardKey.md)[]

Keys that route to the specified shard

***

### clearCache()

> **clearCache**(): `void`

Defined in: [writer/src/shard-router.ts:396](https://github.com/dot-do/evodb/blob/main/writer/src/shard-router.ts#L396)

Clear the routing cache

#### Returns

`void`

***

### getCacheSize()

> **getCacheSize**(): `number`

Defined in: [writer/src/shard-router.ts:403](https://github.com/dot-do/evodb/blob/main/writer/src/shard-router.ts#L403)

Get cache size

#### Returns

`number`

***

### getMaxCacheSize()

> **getMaxCacheSize**(): `number`

Defined in: [writer/src/shard-router.ts:410](https://github.com/dot-do/evodb/blob/main/writer/src/shard-router.ts#L410)

Get the maximum cache size

#### Returns

`number`

***

### isCached()

> **isCached**(`key`): `boolean`

Defined in: [writer/src/shard-router.ts:420](https://github.com/dot-do/evodb/blob/main/writer/src/shard-router.ts#L420)

Check if a key is currently in the cache

#### Parameters

##### key

[`ShardKey`](../interfaces/ShardKey.md)

Shard routing key (tenant/table)

#### Returns

`boolean`

True if the key is cached

***

### toConfig()

> **toConfig**(): [`ShardRouterConfig`](../interfaces/ShardRouterConfig.md)

Defined in: [writer/src/shard-router.ts:428](https://github.com/dot-do/evodb/blob/main/writer/src/shard-router.ts#L428)

Export configuration for serialization

#### Returns

[`ShardRouterConfig`](../interfaces/ShardRouterConfig.md)
