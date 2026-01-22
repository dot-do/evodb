[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / stringToTypeEnum

# Function: stringToTypeEnum()

> **stringToTypeEnum**(`type`): [`Type`](../enumerations/Type.md)

Defined in: [core/src/types.ts:484](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L484)

Convert TableColumnType string to Core Type enum.
Complex types (array, map, struct) are stored as Object/JSON.

## Parameters

### type

[`TableColumnType`](../type-aliases/TableColumnType.md)

## Returns

[`Type`](../enumerations/Type.md)
