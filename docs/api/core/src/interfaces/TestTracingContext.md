[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / TestTracingContext

# Interface: TestTracingContext

Defined in: [core/src/tracing-types.ts:161](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L161)

Test tracing context with additional inspection methods

## Extends

- [`TracingContext`](TracingContext.md)

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

#### Inherited from

[`TracingContext`](TracingContext.md).[`startSpan`](TracingContext.md#startspan)

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

#### Inherited from

[`TracingContext`](TracingContext.md).[`endSpan`](TracingContext.md#endspan)

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

#### Inherited from

[`TracingContext`](TracingContext.md).[`extractContext`](TracingContext.md#extractcontext)

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

#### Inherited from

[`TracingContext`](TracingContext.md).[`injectContext`](TracingContext.md#injectcontext)

***

### flush()

> **flush**(): `Promise`\<`void`\>

Defined in: [core/src/tracing-types.ts:155](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L155)

Flush pending spans to exporter

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`TracingContext`](TracingContext.md).[`flush`](TracingContext.md#flush)

***

### getSpans()

> **getSpans**(): [`Span`](Span.md)[]

Defined in: [core/src/tracing-types.ts:163](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L163)

Get all recorded spans

#### Returns

[`Span`](Span.md)[]

***

### getSpansByName()

> **getSpansByName**(`name`): [`Span`](Span.md)[]

Defined in: [core/src/tracing-types.ts:165](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L165)

Get spans by name

#### Parameters

##### name

`string`

#### Returns

[`Span`](Span.md)[]

***

### getSpansByAttribute()

> **getSpansByAttribute**(`key`, `value`): [`Span`](Span.md)[]

Defined in: [core/src/tracing-types.ts:167](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L167)

Get spans by attribute

#### Parameters

##### key

`string`

##### value

`unknown`

#### Returns

[`Span`](Span.md)[]

***

### clear()

> **clear**(): `void`

Defined in: [core/src/tracing-types.ts:169](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L169)

Clear all recorded spans

#### Returns

`void`
