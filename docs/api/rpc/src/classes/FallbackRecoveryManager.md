[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [rpc/src](../README.md) / FallbackRecoveryManager

# Class: FallbackRecoveryManager

Defined in: [rpc/src/fallback.ts:448](https://github.com/dot-do/evodb/blob/main/rpc/src/fallback.ts#L448)

Recovery manager for fallback storage

## Constructors

### Constructor

> **new FallbackRecoveryManager**(`fallback`, `config`): `FallbackRecoveryManager`

Defined in: [rpc/src/fallback.ts:453](https://github.com/dot-do/evodb/blob/main/rpc/src/fallback.ts#L453)

#### Parameters

##### fallback

[`FallbackStorage`](FallbackStorage.md)

##### config

`Partial`\<[`RecoveryConfig`](../interfaces/RecoveryConfig.md)\> = `{}`

#### Returns

`FallbackRecoveryManager`

## Methods

### attemptRecovery()

> **attemptRecovery**(`recoverFn`): `Promise`\<`number`\>

Defined in: [rpc/src/fallback.ts:467](https://github.com/dot-do/evodb/blob/main/rpc/src/fallback.ts#L467)

Attempt recovery with retry logic

#### Parameters

##### recoverFn

(`entries`) => `Promise`\<`void`\>

Function to attempt recovery (should write to R2)

#### Returns

`Promise`\<`number`\>

Number of entries recovered, or -1 if still has data

***

### isRecovering()

> **isRecovering**(): `boolean`

Defined in: [rpc/src/fallback.ts:528](https://github.com/dot-do/evodb/blob/main/rpc/src/fallback.ts#L528)

Check if recovery is in progress

#### Returns

`boolean`
