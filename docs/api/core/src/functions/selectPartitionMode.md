[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / selectPartitionMode

# Function: selectPartitionMode()

> **selectPartitionMode**(`dataSizeBytes`, `tier`, `options`): [`ModeSelectionResult`](../interfaces/ModeSelectionResult.md)

Defined in: [core/src/partition-modes.ts:421](https://github.com/dot-do/evodb/blob/main/core/src/partition-modes.ts#L421)

Auto-select the best partition mode based on data size and account tier

## Parameters

### dataSizeBytes

`number`

Total data size in bytes

### tier

[`AccountTier`](../type-aliases/AccountTier.md) = `'pro'`

Account tier (affects available modes)

### options

Additional selection options

#### preferDOSqlite?

`boolean`

Prefer DO-SQLite even if data fits

#### forceMode?

[`PartitionMode`](../type-aliases/PartitionMode.md)

Force a specific mode

#### queryPattern?

`"realtime"` \| `"analytical"` \| `"batch"`

Expected query pattern

## Returns

[`ModeSelectionResult`](../interfaces/ModeSelectionResult.md)

Mode selection result with reasoning

## Example

```ts
const result = selectPartitionMode(1024 * 1024 * 100, 'pro'); // 100MB
console.log(result.mode); // 'standard'
console.log(result.reason); // 'Data size (100MB) fits standard mode efficiently'
```
