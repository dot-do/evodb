[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / CompactionScheduler

# Class: CompactionScheduler

Defined in: [writer/src/compactor.ts:471](https://github.com/dot-do/evodb/blob/main/writer/src/compactor.ts#L471)

Automatic compaction scheduler

## Constructors

### Constructor

> **new CompactionScheduler**(`compactor`): `CompactionScheduler`

Defined in: [writer/src/compactor.ts:478](https://github.com/dot-do/evodb/blob/main/writer/src/compactor.ts#L478)

#### Parameters

##### compactor

[`BlockCompactor`](BlockCompactor.md)

#### Returns

`CompactionScheduler`

## Accessors

### running

#### Get Signature

> **get** **running**(): `boolean`

Defined in: [writer/src/compactor.ts:564](https://github.com/dot-do/evodb/blob/main/writer/src/compactor.ts#L564)

Check if compaction is currently running

##### Returns

`boolean`

***

### timeSinceLastCompaction

#### Get Signature

> **get** **timeSinceLastCompaction**(): `number`

Defined in: [writer/src/compactor.ts:571](https://github.com/dot-do/evodb/blob/main/writer/src/compactor.ts#L571)

Get time since last compaction

##### Returns

`number`

***

### failureCount

#### Get Signature

> **get** **failureCount**(): `number`

Defined in: [writer/src/compactor.ts:579](https://github.com/dot-do/evodb/blob/main/writer/src/compactor.ts#L579)

Get consecutive failure count

##### Returns

`number`

## Methods

### runIfNeeded()

> **runIfNeeded**(`blocks`, `getNextSeq`): `Promise`\<[`CompactResult`](../interfaces/CompactResult.md)\>

Defined in: [writer/src/compactor.ts:485](https://github.com/dot-do/evodb/blob/main/writer/src/compactor.ts#L485)

Run compaction if needed

#### Parameters

##### blocks

[`BlockMetadata`](../interfaces/BlockMetadata.md)[]

##### getNextSeq

() => `number`

#### Returns

`Promise`\<[`CompactResult`](../interfaces/CompactResult.md)\>

***

### forceCompaction()

> **forceCompaction**(`blocks`, `getNextSeq`): `Promise`\<[`CompactResult`](../interfaces/CompactResult.md)\>

Defined in: [writer/src/compactor.ts:530](https://github.com/dot-do/evodb/blob/main/writer/src/compactor.ts#L530)

Force a compaction run regardless of thresholds

#### Parameters

##### blocks

[`BlockMetadata`](../interfaces/BlockMetadata.md)[]

##### getNextSeq

() => `number`

#### Returns

`Promise`\<[`CompactResult`](../interfaces/CompactResult.md)\>

***

### resetFailures()

> **resetFailures**(): `void`

Defined in: [writer/src/compactor.ts:586](https://github.com/dot-do/evodb/blob/main/writer/src/compactor.ts#L586)

Reset failure counter

#### Returns

`void`

***

### getStatus()

> **getStatus**(): `object`

Defined in: [writer/src/compactor.ts:593](https://github.com/dot-do/evodb/blob/main/writer/src/compactor.ts#L593)

Get scheduler status for monitoring

#### Returns

`object`

##### running

> **running**: `boolean`

##### lastCompactionTime

> **lastCompactionTime**: `number`

##### consecutiveFailures

> **consecutiveFailures**: `number`

##### partitionMode

> **partitionMode**: [`PartitionMode`](../type-aliases/PartitionMode.md)
