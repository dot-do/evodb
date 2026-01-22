[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / SpanOptions

# Interface: SpanOptions

Defined in: [core/src/tracing-types.ts:103](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L103)

Options for starting a span

## Properties

### kind?

> `optional` **kind**: [`SpanKind`](../type-aliases/SpanKind.md)

Defined in: [core/src/tracing-types.ts:105](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L105)

Span kind

***

### attributes?

> `optional` **attributes**: `Record`\<`string`, [`AttributeValue`](../type-aliases/AttributeValue.md)\>

Defined in: [core/src/tracing-types.ts:107](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L107)

Initial attributes

***

### parent?

> `optional` **parent**: [`Span`](Span.md)

Defined in: [core/src/tracing-types.ts:109](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L109)

Parent span

***

### parentContext?

> `optional` **parentContext**: [`SpanContext`](SpanContext.md)

Defined in: [core/src/tracing-types.ts:111](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L111)

Parent context (for cross-process propagation)
