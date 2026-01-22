[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [rpc/src](../README.md) / FallbackStorage

# Class: FallbackStorage

Defined in: [rpc/src/fallback.ts:84](https://github.com/dot-do/evodb/blob/main/rpc/src/fallback.ts#L84)

Fallback storage for CDC entries when R2 is unavailable

## Constructors

### Constructor

> **new FallbackStorage**(`storage`, `maxSizeBytes`): `FallbackStorage`

Defined in: [rpc/src/fallback.ts:95](https://github.com/dot-do/evodb/blob/main/rpc/src/fallback.ts#L95)

#### Parameters

##### storage

[`DOStorage`](../interfaces/DOStorage.md)

##### maxSizeBytes

`number` = `...`

#### Returns

`FallbackStorage`

## Methods

### store()

> **store**(`entries`): `Promise`\<`void`\>

Defined in: [rpc/src/fallback.ts:111](https://github.com/dot-do/evodb/blob/main/rpc/src/fallback.ts#L111)

Store WAL entries in fallback storage

#### Parameters

##### entries

[`WalEntry`](../type-aliases/WalEntry.md)[]

#### Returns

`Promise`\<`void`\>

***

### retrieve()

> **retrieve**(): `Promise`\<[`WalEntry`](../type-aliases/WalEntry.md)[]\>

Defined in: [rpc/src/fallback.ts:172](https://github.com/dot-do/evodb/blob/main/rpc/src/fallback.ts#L172)

Retrieve all entries from fallback storage

#### Returns

`Promise`\<[`WalEntry`](../type-aliases/WalEntry.md)[]\>

***

### retrieveBatched()

> **retrieveBatched**(`batchSize`): `AsyncGenerator`\<[`WalEntry`](../type-aliases/WalEntry.md)[]\>

Defined in: [rpc/src/fallback.ts:191](https://github.com/dot-do/evodb/blob/main/rpc/src/fallback.ts#L191)

Retrieve entries in batches (for large recovery operations)

#### Parameters

##### batchSize

`number` = `1000`

#### Returns

`AsyncGenerator`\<[`WalEntry`](../type-aliases/WalEntry.md)[]\>

***

### clear()

> **clear**(): `Promise`\<`void`\>

Defined in: [rpc/src/fallback.ts:224](https://github.com/dot-do/evodb/blob/main/rpc/src/fallback.ts#L224)

Clear all entries from fallback storage

#### Returns

`Promise`\<`void`\>

***

### remove()

> **remove**(`sequences`): `Promise`\<`void`\>

Defined in: [rpc/src/fallback.ts:250](https://github.com/dot-do/evodb/blob/main/rpc/src/fallback.ts#L250)

Remove specific entries by sequence numbers

#### Parameters

##### sequences

`number`[]

#### Returns

`Promise`\<`void`\>

***

### markRecoveryAttempt()

> **markRecoveryAttempt**(`sequences`): `Promise`\<`void`\>

Defined in: [rpc/src/fallback.ts:281](https://github.com/dot-do/evodb/blob/main/rpc/src/fallback.ts#L281)

Mark entries as attempted recovery

#### Parameters

##### sequences

`number`[]

#### Returns

`Promise`\<`void`\>

***

### hasData()

> **hasData**(): `boolean`

Defined in: [rpc/src/fallback.ts:312](https://github.com/dot-do/evodb/blob/main/rpc/src/fallback.ts#L312)

Check if there's data in fallback storage

#### Returns

`boolean`

***

### getMetadata()

> **getMetadata**(): `FallbackMetadata`

Defined in: [rpc/src/fallback.ts:319](https://github.com/dot-do/evodb/blob/main/rpc/src/fallback.ts#L319)

Get metadata about fallback storage

#### Returns

`FallbackMetadata`

***

### getUtilization()

> **getUtilization**(): `number`

Defined in: [rpc/src/fallback.ts:326](https://github.com/dot-do/evodb/blob/main/rpc/src/fallback.ts#L326)

Get storage utilization (0-1)

#### Returns

`number`

***

### getEntryCount()

> **getEntryCount**(): `number`

Defined in: [rpc/src/fallback.ts:333](https://github.com/dot-do/evodb/blob/main/rpc/src/fallback.ts#L333)

Get count of stored entries

#### Returns

`number`
