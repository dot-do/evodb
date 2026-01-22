[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / EvoDBMetricsCollection

# Interface: EvoDBMetricsCollection

Defined in: [core/src/metrics-types.ts:211](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L211)

EvoDB metrics interface

## Properties

### registry

> **registry**: [`MetricsRegistry`](MetricsRegistry.md)

Defined in: [core/src/metrics-types.ts:213](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L213)

Registry containing all metrics

***

### queryDurationSeconds

> **queryDurationSeconds**: [`Histogram`](Histogram.md)

Defined in: [core/src/metrics-types.ts:216](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L216)

Query duration histogram (seconds)

***

### blocksScannedTotal

> **blocksScannedTotal**: [`Counter`](Counter.md)

Defined in: [core/src/metrics-types.ts:219](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L219)

Total blocks scanned counter

***

### cacheHitsTotal

> **cacheHitsTotal**: [`Counter`](Counter.md)

Defined in: [core/src/metrics-types.ts:222](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L222)

Cache hits counter

***

### cacheMissesTotal

> **cacheMissesTotal**: [`Counter`](Counter.md)

Defined in: [core/src/metrics-types.ts:225](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L225)

Cache misses counter

***

### bufferSizeBytes

> **bufferSizeBytes**: [`Gauge`](Gauge.md)

Defined in: [core/src/metrics-types.ts:228](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L228)

Buffer size gauge (bytes)

***

### cdcEntriesProcessedTotal

> **cdcEntriesProcessedTotal**: [`Counter`](Counter.md)

Defined in: [core/src/metrics-types.ts:231](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L231)

CDC entries processed counter
