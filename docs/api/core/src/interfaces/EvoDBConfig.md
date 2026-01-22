[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / EvoDBConfig

# Interface: EvoDBConfig

Defined in: [core/src/evodb.ts:73](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L73)

EvoDB configuration options

## Properties

### mode

> **mode**: `"development"` \| `"production"`

Defined in: [core/src/evodb.ts:79](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L79)

Operating mode:
- 'development': Schema evolves automatically as data is written
- 'production': Schema is locked, changes require explicit migrations

***

### storage?

> `optional` **storage**: [`EvoDBStorageBucket`](EvoDBStorageBucket.md)

Defined in: [core/src/evodb.ts:84](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L84)

Storage backend - R2 bucket or compatible object storage

***

### schemaEvolution?

> `optional` **schemaEvolution**: `"automatic"` \| `"locked"`

Defined in: [core/src/evodb.ts:89](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L89)

Schema evolution behavior

***

### inferTypes?

> `optional` **inferTypes**: `boolean`

Defined in: [core/src/evodb.ts:94](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L94)

Whether to infer types from data

***

### validateOnWrite?

> `optional` **validateOnWrite**: `boolean`

Defined in: [core/src/evodb.ts:99](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L99)

Validate data on write in production mode

***

### rejectUnknownFields?

> `optional` **rejectUnknownFields**: `boolean`

Defined in: [core/src/evodb.ts:104](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L104)

Whether to reject fields not in schema

***

### logger?

> `optional` **logger**: [`Logger`](Logger.md)

Defined in: [core/src/evodb.ts:110](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L110)

Logger instance for structured logging
If not provided, logging is disabled (noop logger)
