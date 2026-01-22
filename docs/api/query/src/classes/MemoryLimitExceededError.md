[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / MemoryLimitExceededError

# Class: MemoryLimitExceededError

Defined in: [query/src/engine.ts:367](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L367)

Error thrown when query execution exceeds the configured memory limit.
This allows callers to catch specifically for memory issues.

## Extends

- `Error`

## Constructors

### Constructor

> **new MemoryLimitExceededError**(`currentBytes`, `limitBytes`): `MemoryLimitExceededError`

Defined in: [query/src/engine.ts:371](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L371)

#### Parameters

##### currentBytes

`number`

##### limitBytes

`number`

#### Returns

`MemoryLimitExceededError`

#### Overrides

`Error.constructor`

## Properties

### currentBytes

> `readonly` **currentBytes**: `number`

Defined in: [query/src/engine.ts:368](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L368)

***

### limitBytes

> `readonly` **limitBytes**: `number`

Defined in: [query/src/engine.ts:369](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L369)
