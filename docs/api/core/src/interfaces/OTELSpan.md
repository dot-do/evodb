[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / OTELSpan

# Interface: OTELSpan

Defined in: [core/src/tracing-types.ts:197](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L197)

OTEL span format

## Properties

### traceId

> **traceId**: `string`

Defined in: [core/src/tracing-types.ts:198](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L198)

***

### spanId

> **spanId**: `string`

Defined in: [core/src/tracing-types.ts:199](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L199)

***

### parentSpanId?

> `optional` **parentSpanId**: `string`

Defined in: [core/src/tracing-types.ts:200](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L200)

***

### name

> **name**: `string`

Defined in: [core/src/tracing-types.ts:201](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L201)

***

### kind

> **kind**: `number`

Defined in: [core/src/tracing-types.ts:202](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L202)

***

### startTimeUnixNano

> **startTimeUnixNano**: `string`

Defined in: [core/src/tracing-types.ts:203](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L203)

***

### endTimeUnixNano

> **endTimeUnixNano**: `string`

Defined in: [core/src/tracing-types.ts:204](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L204)

***

### attributes

> **attributes**: [`OTELAttribute`](OTELAttribute.md)[]

Defined in: [core/src/tracing-types.ts:205](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L205)

***

### events?

> `optional` **events**: [`OTELEvent`](OTELEvent.md)[]

Defined in: [core/src/tracing-types.ts:206](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L206)

***

### status

> **status**: `object`

Defined in: [core/src/tracing-types.ts:207](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L207)

#### code

> **code**: `number`

#### message?

> `optional` **message**: `string`
