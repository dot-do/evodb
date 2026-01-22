[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / Span

# Interface: Span

Defined in: [core/src/tracing-types.ts:66](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L66)

Span interface - represents a unit of work

## Properties

### traceId

> `readonly` **traceId**: `string`

Defined in: [core/src/tracing-types.ts:68](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L68)

32-character hex trace ID

***

### spanId

> `readonly` **spanId**: `string`

Defined in: [core/src/tracing-types.ts:70](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L70)

16-character hex span ID

***

### parentSpanId?

> `readonly` `optional` **parentSpanId**: `string`

Defined in: [core/src/tracing-types.ts:72](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L72)

Parent span ID (undefined for root spans)

***

### name

> `readonly` **name**: `string`

Defined in: [core/src/tracing-types.ts:74](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L74)

Span name

***

### startTime

> **startTime**: `number`

Defined in: [core/src/tracing-types.ts:76](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L76)

Start time in milliseconds

***

### endTime?

> `optional` **endTime**: `number`

Defined in: [core/src/tracing-types.ts:78](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L78)

End time in milliseconds (undefined until ended)

***

### kind

> `readonly` **kind**: [`SpanKind`](../type-aliases/SpanKind.md)

Defined in: [core/src/tracing-types.ts:80](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L80)

Span kind

***

### status

> **status**: [`SpanStatus`](SpanStatus.md)

Defined in: [core/src/tracing-types.ts:82](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L82)

Span status

***

### attributes

> `readonly` **attributes**: `Record`\<`string`, `unknown`\>

Defined in: [core/src/tracing-types.ts:84](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L84)

Span attributes

***

### events

> `readonly` **events**: [`SpanEvent`](SpanEvent.md)[]

Defined in: [core/src/tracing-types.ts:86](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L86)

Span events

***

### isRecording

> `readonly` **isRecording**: `boolean`

Defined in: [core/src/tracing-types.ts:88](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L88)

Whether this span is recording (sampled)

## Methods

### setAttribute()

> **setAttribute**(`key`, `value`): `void`

Defined in: [core/src/tracing-types.ts:91](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L91)

Set a single attribute

#### Parameters

##### key

`string`

##### value

[`AttributeValue`](../type-aliases/AttributeValue.md)

#### Returns

`void`

***

### setAttributes()

> **setAttributes**(`attributes`): `void`

Defined in: [core/src/tracing-types.ts:93](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L93)

Set multiple attributes

#### Parameters

##### attributes

`Record`\<`string`, [`AttributeValue`](../type-aliases/AttributeValue.md)\>

#### Returns

`void`

***

### addEvent()

> **addEvent**(`name`, `attributes?`): `void`

Defined in: [core/src/tracing-types.ts:95](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L95)

Add an event

#### Parameters

##### name

`string`

##### attributes?

`Record`\<`string`, `unknown`\>

#### Returns

`void`

***

### recordException()

> **recordException**(`error`): `void`

Defined in: [core/src/tracing-types.ts:97](https://github.com/dot-do/evodb/blob/main/core/src/tracing-types.ts#L97)

Record an exception

#### Parameters

##### error

`Error`

#### Returns

`void`
