[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / EncodingValidationDetails

# Interface: EncodingValidationDetails

Defined in: [core/src/errors.ts:395](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L395)

Details about encoding validation failure for debugging and logging

## Properties

### path?

> `optional` **path**: `string`

Defined in: [core/src/errors.ts:397](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L397)

Column path where the error occurred

***

### index?

> `optional` **index**: `number`

Defined in: [core/src/errors.ts:399](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L399)

Index in the values array where the error was found

***

### expectedType?

> `optional` **expectedType**: `string`

Defined in: [core/src/errors.ts:401](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L401)

Expected type name (e.g., 'Int32', 'String')

***

### actualType?

> `optional` **actualType**: `string`

Defined in: [core/src/errors.ts:403](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L403)

Actual type found (e.g., 'string', 'number')

***

### actualValue?

> `optional` **actualValue**: `unknown`

Defined in: [core/src/errors.ts:405](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L405)

The actual value that caused the error (truncated for logging)
