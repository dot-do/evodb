[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / TracingConfig

# Interface: TracingConfig

Defined in: [core/src/tracing-types.ts:131](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L131)

Tracing configuration

## Properties

### serviceName?

> `optional` **serviceName**: `string`

Defined in: [core/src/tracing-types.ts:133](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L133)

Service name for span metadata

***

### exporter?

> `optional` **exporter**: [`TraceExporter`](TraceExporter.md)

Defined in: [core/src/tracing-types.ts:135](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L135)

Custom trace exporter

***

### sampler()?

> `optional` **sampler**: (`traceId`, `name`) => `boolean`

Defined in: [core/src/tracing-types.ts:137](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L137)

Sampling function (return true to sample)

#### Parameters

##### traceId

`string`

##### name

`string`

#### Returns

`boolean`

***

### batchSize?

> `optional` **batchSize**: `number`

Defined in: [core/src/tracing-types.ts:139](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L139)

Batch size for export
