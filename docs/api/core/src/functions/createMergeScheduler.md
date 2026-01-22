[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / createMergeScheduler

# Function: createMergeScheduler()

> **createMergeScheduler**(`adapter`, `config`): `object`

Defined in: [core/src/merge.ts:175](https://github.com/dot-do/evodb/blob/main/core/src/merge.ts#L175)

Alarm-based merge scheduler

## Parameters

### adapter

[`StorageAdapter`](../interfaces/StorageAdapter.md)

### config

`Partial`\<[`MergeConfig`](../interfaces/MergeConfig.md)\> = `{}`

## Returns

`object`

### onAlarm()

> **onAlarm**: () => `Promise`\<`number`\>

#### Returns

`Promise`\<`number`\>

### scheduleNext()

> **scheduleNext**: (`setState`) => `Promise`\<`void`\>

#### Parameters

##### setState

(`alarm`) => `void`

#### Returns

`Promise`\<`void`\>
