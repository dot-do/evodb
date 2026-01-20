# @evodb/benchmark

Scale-out benchmark harness for EvoDB + Cloudflare Workers.

## Installation

```bash
npm install @evodb/benchmark
```

## Overview

This package provides benchmarking tools to demonstrate EvoDB's parallel query execution advantage:

- **Concurrent Queries**: Simulate 1K-10K concurrent users
- **Partition Parallel Scan**: Multi-worker partition scanning
- **Edge Cache Effectiveness**: Cold vs warm comparison
- **Scatter-Gather Pattern**: Distributed aggregation
- **Baseline Comparisons**: Compare against ClickHouse, DuckDB, BigQuery

## Quick Start

```typescript
import {
  runBenchmark,
  generateForSize,
  USER_ACTIVITY_SCHEMA,
} from '@evodb/benchmark';

// Run full benchmark suite
const report = await runBenchmark({
  dataSizes: ['10K', '100K', '1M'],
  workerCounts: [1, 2, 4, 8],
  scenarios: ['concurrent-queries', 'partition-parallel-scan'],
});

console.log(report.summary);

// Generate test dataset
const dataset = generateForSize(USER_ACTIVITY_SCHEMA, '100K');
console.log(`Generated ${dataset.rowCount} rows in ${dataset.partitions.length} partitions`);
```

## API Reference

### Benchmark Runner

```typescript
import { runBenchmark, createBenchmarkRunner } from '@evodb/benchmark';

// Quick run
const report = await runBenchmark(config);

// Custom runner
const runner = createBenchmarkRunner({
  warmupRuns: 3,
  measureRuns: 10,
  cooldownMs: 1000,
});

const result = await runner.run('concurrent-queries', dataset, config);
```

### Scenarios

```typescript
// Concurrent queries (1K, 10K users)
import { benchmarkConcurrentQueries } from '@evodb/benchmark';
const result = await benchmarkConcurrentQueries(dataset, {
  concurrency: 1000,
  queryMix: ['point', 'range', 'aggregate'],
});

// Partition parallel scan
import { benchmarkParallelScan } from '@evodb/benchmark';
const result = await benchmarkParallelScan(partitions, {
  workerCount: 8,
  strategy: 'round-robin',
});

// Cache effectiveness
import { benchmarkCacheEffectiveness } from '@evodb/benchmark';
const result = await benchmarkCacheEffectiveness(dataset, {
  coldRuns: 5,
  warmRuns: 10,
});

// Scatter-gather
import { benchmarkScatterGather } from '@evodb/benchmark';
const result = await benchmarkScatterGather(dataset, {
  scatterFactor: 10,
  aggregation: 'sum',
});
```

### Data Generation

```typescript
import {
  generateForSize,
  DataGenerator,
  USER_ACTIVITY_SCHEMA,
  ECOMMERCE_EVENTS_SCHEMA,
  IOT_SENSOR_SCHEMA,
} from '@evodb/benchmark';

// Quick generation
const dataset = generateForSize(USER_ACTIVITY_SCHEMA, '100K');

// Custom generator
const generator = new DataGenerator({
  seed: 12345,
  partitionSize: 10000,
});

const data = generator.generate(schema, {
  rowCount: 1_000_000,
  partitionBy: 'day',
});
```

### Built-in Schemas

```typescript
USER_ACTIVITY_SCHEMA     // User events (clicks, views, etc.)
ECOMMERCE_EVENTS_SCHEMA  // E-commerce transactions
IOT_SENSOR_SCHEMA        // IoT sensor readings
LOG_ANALYTICS_SCHEMA     // Application logs
FINANCIAL_TRANSACTIONS_SCHEMA // Financial data

// List all schemas
const schemas = listSchemas();
const schema = getSchema('user-activity');
```

### Worker Simulation

```typescript
import { createWorkerSimulator, createTaskScheduler } from '@evodb/benchmark';

// Simulate workers
const simulator = createWorkerSimulator({
  workerCount: 8,
  cpuLimitMs: 30,
  memoryLimitMb: 128,
});

// Schedule tasks
const scheduler = createTaskScheduler({
  strategy: 'least-loaded',
  maxQueueSize: 1000,
});

const batch = scheduler.schedule(tasks, simulator.getWorkers());
```

### Baseline Comparisons

```typescript
import {
  compareToBaseline,
  CLICKBENCH_BASELINE,
  DUCKDB_BASELINE,
  EVODB_THEORETICAL_TARGETS,
} from '@evodb/benchmark';

const comparison = compareToBaseline(evodbResult, CLICKBENCH_BASELINE);
console.log(`Speedup vs ClickHouse: ${comparison.speedup}x`);
console.log(`Cost ratio: ${comparison.costRatio}`);

// Generate comparison table
const table = generateComparisonTable([
  { name: 'EvoDB', result: evodbResult },
  { name: 'ClickHouse', result: CLICKBENCH_BASELINE },
  { name: 'DuckDB', result: DUCKDB_BASELINE },
]);
```

### Metrics

```typescript
import {
  computeLatencyMetrics,
  computeThroughputMetrics,
  percentile,
} from '@evodb/benchmark';

const latency = computeLatencyMetrics(durations);
// { p50, p90, p99, p999, min, max, mean, stddev }

const throughput = computeThroughputMetrics(requests, durationMs);
// { rps, bytesPerSecond, rowsPerSecond }

const p99 = percentile(durations, 0.99);
```

### Result Types

```typescript
interface BenchmarkResult {
  scenario: string;
  dataSize: DataSize;
  latency: LatencyMetrics;
  throughput: ThroughputMetrics;
  cache: CacheMetrics;
  resources: ResourceMetrics;
  cost: CostMetrics;
}

interface BenchmarkReport {
  summary: ReportSummary;
  scenarios: ScenarioReport[];
  comparisons: ComparisonReport[];
  timestamp: Date;
}
```

## Data Sizes

```typescript
type DataSize = '1K' | '10K' | '100K' | '1M' | '10M' | '100M';

const DATA_SIZE_ROWS = {
  '1K': 1_000,
  '10K': 10_000,
  '100K': 100_000,
  '1M': 1_000_000,
  '10M': 10_000_000,
  '100M': 100_000_000,
};
```

## Related Packages

- `@evodb/core` - Columnar encoding
- `@evodb/reader` - Query engine
- `@evodb/writer` - Write path

## License

MIT
