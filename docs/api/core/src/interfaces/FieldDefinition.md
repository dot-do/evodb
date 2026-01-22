[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / FieldDefinition

# Interface: FieldDefinition

Defined in: [core/src/evodb.ts:149](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L149)

Schema field definition for locking

## Properties

### type

> **type**: `"string"` \| `"number"` \| `"boolean"` \| `"object"` \| `"array"` \| `"date"` \| `"binary"`

Defined in: [core/src/evodb.ts:150](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L150)

***

### required?

> `optional` **required**: `boolean`

Defined in: [core/src/evodb.ts:151](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L151)

***

### format?

> `optional` **format**: `"email"` \| `"url"` \| `"uuid"` \| `"iso-date"` \| `"iso-datetime"`

Defined in: [core/src/evodb.ts:152](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L152)

***

### enum?

> `optional` **enum**: `unknown`[]

Defined in: [core/src/evodb.ts:153](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L153)

***

### maxLength?

> `optional` **maxLength**: `number`

Defined in: [core/src/evodb.ts:154](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L154)

***

### minLength?

> `optional` **minLength**: `number`

Defined in: [core/src/evodb.ts:155](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L155)

***

### min?

> `optional` **min**: `number`

Defined in: [core/src/evodb.ts:156](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L156)

***

### max?

> `optional` **max**: `number`

Defined in: [core/src/evodb.ts:157](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L157)

***

### ref?

> `optional` **ref**: `string`

Defined in: [core/src/evodb.ts:158](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L158)

***

### default?

> `optional` **default**: `unknown`

Defined in: [core/src/evodb.ts:159](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L159)
