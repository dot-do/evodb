[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / LabeledHistogram

# Interface: LabeledHistogram

Defined in: [core/src/metrics-types.ts:143](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L143)

Labeled histogram instance

## Methods

### observe()

> **observe**(`value`): `void`

Defined in: [core/src/metrics-types.ts:145](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L145)

Observe a value

#### Parameters

##### value

`number`

#### Returns

`void`

***

### startTimer()

> **startTimer**(): [`TimerEnd`](../type-aliases/TimerEnd.md)

Defined in: [core/src/metrics-types.ts:147](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L147)

Start a timer and return a function to stop it

#### Returns

[`TimerEnd`](../type-aliases/TimerEnd.md)

***

### get()

> **get**(): [`HistogramData`](HistogramData.md)

Defined in: [core/src/metrics-types.ts:149](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L149)

Get histogram data

#### Returns

[`HistogramData`](HistogramData.md)
