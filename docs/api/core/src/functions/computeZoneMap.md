[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / computeZoneMap

# Function: computeZoneMap()

> **computeZoneMap**(`values`, `nulls`, `type`): [`ZoneMap`](../interfaces/ZoneMap.md)

Defined in: [core/src/snippet-format.ts:495](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L495)

Compute zone map for a column.

Type assertions rationale:
Each case in the switch handles a specific Type enum value. The Type enum acts as a
discriminant that guarantees the runtime type of non-null values:
- Type.Int32/Float64: values are numbers (validated during shredding)
- Type.Int64: values are bigints (inferred from typeof bigint in inferType)
- Type.Timestamp: values are Date objects (inferred from instanceof Date)
- Type.String: values are strings (inferred from typeof string)

We skip null values via the nulls[i] check, so assertions are safe for non-null entries.

## Parameters

### values

`unknown`[]

### nulls

`boolean`[]

### type

[`Type`](../enumerations/Type.md)

## Returns

[`ZoneMap`](../interfaces/ZoneMap.md)
