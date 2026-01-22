[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / ModeSelectionResult

# Interface: ModeSelectionResult

Defined in: [core/src/partition-modes.ts:130](https://github.com/dot-do/evodb/blob/main/core/src/partition-modes.ts#L130)

Mode selection result

## Properties

### mode

> **mode**: [`PartitionMode`](../type-aliases/PartitionMode.md)

Defined in: [core/src/partition-modes.ts:132](https://github.com/dot-do/evodb/blob/main/core/src/partition-modes.ts#L132)

Selected partition mode

***

### config

> **config**: [`PartitionModeConfig`](PartitionModeConfig.md)

Defined in: [core/src/partition-modes.ts:135](https://github.com/dot-do/evodb/blob/main/core/src/partition-modes.ts#L135)

Configuration for the selected mode

***

### reason

> **reason**: `string`

Defined in: [core/src/partition-modes.ts:138](https://github.com/dot-do/evodb/blob/main/core/src/partition-modes.ts#L138)

Reason for selection

***

### alternatives

> **alternatives**: `object`[]

Defined in: [core/src/partition-modes.ts:141](https://github.com/dot-do/evodb/blob/main/core/src/partition-modes.ts#L141)

Alternative modes considered

#### mode

> **mode**: [`PartitionMode`](../type-aliases/PartitionMode.md)

#### reason

> **reason**: `string`
