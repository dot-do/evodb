[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / SimpleQueryConfig

# Interface: SimpleQueryConfig

Defined in: [query/src/simple-engine.ts:325](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L325)

Simple query engine configuration

## Properties

### bucket

> **bucket**: [`SimpleR2Bucket`](SimpleR2Bucket.md)

Defined in: [query/src/simple-engine.ts:327](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L327)

R2 bucket binding

***

### cache?

> `optional` **cache**: `Partial`\<[`SimpleCacheTierConfig`](SimpleCacheTierConfig.md)\>

Defined in: [query/src/simple-engine.ts:329](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L329)

Cache configuration

***

### maxConcurrentReads?

> `optional` **maxConcurrentReads**: `number`

Defined in: [query/src/simple-engine.ts:331](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L331)

Maximum concurrent block reads

***

### enablePlanCache?

> `optional` **enablePlanCache**: `boolean`

Defined in: [query/src/simple-engine.ts:333](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L333)

Enable query plan caching

***

### maxBlockSize?

> `optional` **maxBlockSize**: `number`

Defined in: [query/src/simple-engine.ts:339](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L339)

Maximum allowed block size in bytes.
Blocks exceeding this limit will be rejected to prevent memory exhaustion.
Defaults to 128MB (134,217,728 bytes).
