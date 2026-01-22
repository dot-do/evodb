[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / TracingContext

# Interface: TracingContext

Defined in: [core/src/tracing-types.ts:145](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L145)

Tracing context interface

## Extended by

- [`TestTracingContext`](TestTracingContext.md)

## Methods

### startSpan()

> **startSpan**(`name`, `options?`): [`Span`](Span.md)

Defined in: [core/src/tracing-types.ts:147](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L147)

Start a new span

#### Parameters

##### name

`string`

##### options?

[`SpanOptions`](SpanOptions.md)

#### Returns

[`Span`](Span.md)

***

### endSpan()

> **endSpan**(`span`, `status?`): `void`

Defined in: [core/src/tracing-types.ts:149](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L149)

End a span

#### Parameters

##### span

[`Span`](Span.md)

##### status?

[`SpanStatus`](SpanStatus.md)

#### Returns

`void`

***

### extractContext()

> **extractContext**(`span`): [`SpanContext`](SpanContext.md)

Defined in: [core/src/tracing-types.ts:151](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L151)

Extract context from span for propagation

#### Parameters

##### span

[`Span`](Span.md)

#### Returns

[`SpanContext`](SpanContext.md)

***

### injectContext()

> **injectContext**(`span`, `headers`, `options?`): `void`

Defined in: [core/src/tracing-types.ts:153](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L153)

Inject context into headers

#### Parameters

##### span

[`Span`](Span.md)

##### headers

`Headers`

##### options?

[`InjectOptions`](InjectOptions.md)

#### Returns

`void`

***

### flush()

> **flush**(): `Promise`\<`void`\>

Defined in: [core/src/tracing-types.ts:155](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L155)

Flush pending spans to exporter

#### Returns

`Promise`\<`void`\>
