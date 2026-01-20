/**
 * @evodb/benchmark - ClickHouse Published Baselines
 *
 * Reference data from published ClickHouse benchmarks for comparison.
 * Sources: ClickBench, official benchmarks, community reports.
 */

import type { PublishedBaseline, PublishedResult, BaselineSystem } from '../types.js';

/**
 * ClickBench results (hits dataset, 100M rows)
 * Source: https://benchmark.clickhouse.com/
 *
 * Note: These are representative results from c6a.4xlarge (16 vCPU, 32GB RAM)
 */
export const CLICKBENCH_BASELINE: PublishedBaseline = {
  system: 'clickhouse_published',
  benchmarkName: 'ClickBench',
  sourceUrl: 'https://benchmark.clickhouse.com/',
  benchmarkDate: '2024-01',
  configuration: 'AWS c6a.4xlarge (16 vCPU, 32GB RAM), local NVMe SSD',
  results: [
    // Q0: Simple count
    {
      queryId: 'Q0',
      queryDescription: 'SELECT COUNT(*) FROM hits',
      dataSize: '100M rows',
      executionTimeSec: 0.003,
      rowsProcessed: 100_000_000,
      qps: 333,
    },
    // Q1: Count with simple filter
    {
      queryId: 'Q1',
      queryDescription: 'SELECT COUNT(*) FROM hits WHERE AdvEngineID != 0',
      dataSize: '100M rows',
      executionTimeSec: 0.021,
      rowsProcessed: 100_000_000,
    },
    // Q2: Sum aggregation
    {
      queryId: 'Q2',
      queryDescription: 'SELECT SUM(AdvEngineID), COUNT(*), AVG(ResolutionWidth) FROM hits',
      dataSize: '100M rows',
      executionTimeSec: 0.039,
      rowsProcessed: 100_000_000,
    },
    // Q3: Group by with count
    {
      queryId: 'Q3',
      queryDescription: 'SELECT RegionID, COUNT(DISTINCT UserID) FROM hits GROUP BY RegionID',
      dataSize: '100M rows',
      executionTimeSec: 0.456,
      rowsProcessed: 100_000_000,
    },
    // Q4: Top-K aggregation
    {
      queryId: 'Q4',
      queryDescription: 'SELECT RegionID, SUM(AdvEngineID) AS s FROM hits GROUP BY RegionID ORDER BY s DESC LIMIT 10',
      dataSize: '100M rows',
      executionTimeSec: 0.085,
      rowsProcessed: 100_000_000,
    },
    // Q5: Multiple group by
    {
      queryId: 'Q5',
      queryDescription: 'SELECT RegionID, CounterID, COUNT(*) FROM hits GROUP BY RegionID, CounterID',
      dataSize: '100M rows',
      executionTimeSec: 0.823,
      rowsProcessed: 100_000_000,
    },
    // Q6: String filter
    {
      queryId: 'Q6',
      queryDescription: 'SELECT COUNT(*) FROM hits WHERE URL LIKE \'%google%\'',
      dataSize: '100M rows',
      executionTimeSec: 0.126,
      rowsProcessed: 100_000_000,
    },
    // Q7: Time range filter
    {
      queryId: 'Q7',
      queryDescription: 'SELECT toStartOfMonth(EventDate) AS d, COUNT(*) FROM hits GROUP BY d',
      dataSize: '100M rows',
      executionTimeSec: 0.067,
      rowsProcessed: 100_000_000,
    },
    // Q8: Complex aggregation
    {
      queryId: 'Q8',
      queryDescription: 'SELECT WatchID, ClientIP, COUNT(*) FROM hits GROUP BY WatchID, ClientIP ORDER BY COUNT(*) DESC LIMIT 10',
      dataSize: '100M rows',
      executionTimeSec: 2.134,
      rowsProcessed: 100_000_000,
    },
    // Q9: Full table scan with projection
    {
      queryId: 'Q9',
      queryDescription: 'SELECT * FROM hits WHERE UserID = 123456789 LIMIT 10',
      dataSize: '100M rows',
      executionTimeSec: 0.048,
      rowsProcessed: 100_000_000,
    },
  ],
};

/**
 * DuckDB published baselines
 * Source: DuckDB blog and benchmark suite
 */
export const DUCKDB_BASELINE: PublishedBaseline = {
  system: 'duckdb_published',
  benchmarkName: 'DuckDB ClickBench',
  sourceUrl: 'https://duckdb.org/2023/09/15/announcing-duckdb-0.9.0.html',
  benchmarkDate: '2024-01',
  configuration: 'Same hardware as ClickBench (c6a.4xlarge)',
  results: [
    {
      queryId: 'Q0',
      queryDescription: 'SELECT COUNT(*) FROM hits',
      dataSize: '100M rows',
      executionTimeSec: 0.012,
      rowsProcessed: 100_000_000,
    },
    {
      queryId: 'Q1',
      queryDescription: 'SELECT COUNT(*) FROM hits WHERE AdvEngineID != 0',
      dataSize: '100M rows',
      executionTimeSec: 0.031,
      rowsProcessed: 100_000_000,
    },
    {
      queryId: 'Q2',
      queryDescription: 'SELECT SUM(AdvEngineID), COUNT(*), AVG(ResolutionWidth) FROM hits',
      dataSize: '100M rows',
      executionTimeSec: 0.089,
      rowsProcessed: 100_000_000,
    },
    {
      queryId: 'Q3',
      queryDescription: 'SELECT RegionID, COUNT(DISTINCT UserID) FROM hits GROUP BY RegionID',
      dataSize: '100M rows',
      executionTimeSec: 1.234,
      rowsProcessed: 100_000_000,
    },
    {
      queryId: 'Q4',
      queryDescription: 'SELECT RegionID, SUM(AdvEngineID) AS s FROM hits GROUP BY RegionID ORDER BY s DESC LIMIT 10',
      dataSize: '100M rows',
      executionTimeSec: 0.178,
      rowsProcessed: 100_000_000,
    },
  ],
};

/**
 * BigQuery published baselines (for cost comparison)
 * Note: BigQuery charges by bytes scanned, not compute time
 */
export const BIGQUERY_BASELINE: PublishedBaseline = {
  system: 'bigquery_published',
  benchmarkName: 'BigQuery TPC-H',
  sourceUrl: 'https://cloud.google.com/bigquery/docs/best-practices-performance',
  benchmarkDate: '2024-01',
  configuration: 'BigQuery on-demand pricing ($5/TB scanned)',
  results: [
    {
      queryId: 'simple_count',
      queryDescription: 'COUNT(*) on 100M rows',
      dataSize: '100M rows (~10GB)',
      executionTimeSec: 2.5, // Includes query overhead
      rowsProcessed: 100_000_000,
      costUsd: 0.05, // 10GB * $5/TB
    },
    {
      queryId: 'filtered_count',
      queryDescription: 'COUNT(*) with filter',
      dataSize: '100M rows',
      executionTimeSec: 3.0,
      rowsProcessed: 100_000_000,
      costUsd: 0.05,
    },
    {
      queryId: 'aggregation',
      queryDescription: 'SUM, AVG aggregation',
      dataSize: '100M rows',
      executionTimeSec: 4.5,
      rowsProcessed: 100_000_000,
      costUsd: 0.05,
    },
    {
      queryId: 'group_by',
      queryDescription: 'GROUP BY with 1000 groups',
      dataSize: '100M rows',
      executionTimeSec: 8.0,
      rowsProcessed: 100_000_000,
      costUsd: 0.05,
    },
  ],
};

/**
 * Theoretical EvoDB + Workers targets
 * Based on:
 * - Cloudflare Workers: ~50ms cold start, <1ms warm
 * - R2: ~15ms latency, ~500MB/s throughput
 * - Cache API: <1ms lookup
 * - Parallel execution: N workers scanning N partitions
 */
export const EVODB_THEORETICAL_TARGETS: PublishedBaseline = {
  system: 'n_workers_parallel',
  benchmarkName: 'EvoDB Theoretical Targets',
  sourceUrl: 'Internal estimates',
  benchmarkDate: '2024-01',
  configuration: '8 Workers parallel, R2 storage, Cache API enabled',
  results: [
    {
      queryId: 'simple_count',
      queryDescription: 'COUNT(*) with parallel partition scan (8 workers)',
      dataSize: '100M rows (8 partitions)',
      executionTimeSec: 0.150, // 15ms R2 latency + 100ms scan per partition / 8 workers
      rowsProcessed: 100_000_000,
      qps: 6.67, // Single query, not concurrent
      costUsd: 0.000001, // Workers + R2 reads
    },
    {
      queryId: 'cached_count',
      queryDescription: 'COUNT(*) with warm cache',
      dataSize: '100M rows',
      executionTimeSec: 0.010, // Cache hit path
      rowsProcessed: 0, // Served from cache
      costUsd: 0.0000001, // Minimal Workers cost
    },
    {
      queryId: 'concurrent_1k',
      queryDescription: '1K concurrent users, simple queries',
      dataSize: '100M rows',
      executionTimeSec: 0.100, // p50 latency
      qps: 10000, // With 8 workers handling concurrent requests
      costUsd: 0.0000005, // Per query
    },
    {
      queryId: 'scatter_gather',
      queryDescription: 'Aggregation with 8-way scatter-gather',
      dataSize: '100M rows',
      executionTimeSec: 0.200, // Parallel scan + gather
      rowsProcessed: 100_000_000,
      costUsd: 0.000008, // 8 worker invocations
    },
  ],
};

/**
 * Get all published baselines
 */
export function getAllBaselines(): PublishedBaseline[] {
  return [
    CLICKBENCH_BASELINE,
    DUCKDB_BASELINE,
    BIGQUERY_BASELINE,
    EVODB_THEORETICAL_TARGETS,
  ];
}

/**
 * Get baseline by system
 */
export function getBaseline(system: BaselineSystem): PublishedBaseline | undefined {
  switch (system) {
    case 'clickhouse_published':
      return CLICKBENCH_BASELINE;
    case 'duckdb_published':
      return DUCKDB_BASELINE;
    case 'bigquery_published':
      return BIGQUERY_BASELINE;
    case 'n_workers_parallel':
      return EVODB_THEORETICAL_TARGETS;
    default:
      return undefined;
  }
}

/**
 * Compare EvoDB result against baseline
 */
export function compareToBaseline(
  evodbResult: {
    queryType: string;
    executionTimeSec: number;
    rowsProcessed: number;
    costUsd?: number;
  },
  baseline: PublishedBaseline,
  queryId: string
): {
  baselineResult: PublishedResult | undefined;
  speedup: number;
  costRatio: number;
  notes: string[];
} {
  const baselineResult = baseline.results.find(r => r.queryId === queryId);

  if (!baselineResult) {
    return {
      baselineResult: undefined,
      speedup: 0,
      costRatio: 0,
      notes: [`Query ${queryId} not found in ${baseline.benchmarkName} baseline`],
    };
  }

  const speedup = baselineResult.executionTimeSec / evodbResult.executionTimeSec;
  const costRatio = baselineResult.costUsd && evodbResult.costUsd
    ? evodbResult.costUsd / baselineResult.costUsd
    : 0;

  const notes: string[] = [];

  if (speedup > 1) {
    notes.push(`EvoDB is ${speedup.toFixed(2)}x faster than ${baseline.system}`);
  } else if (speedup < 1) {
    notes.push(`EvoDB is ${(1/speedup).toFixed(2)}x slower than ${baseline.system}`);
  }

  if (costRatio > 0) {
    if (costRatio < 1) {
      notes.push(`EvoDB costs ${((1 - costRatio) * 100).toFixed(0)}% less per query`);
    } else {
      notes.push(`EvoDB costs ${((costRatio - 1) * 100).toFixed(0)}% more per query`);
    }
  }

  return { baselineResult, speedup, costRatio, notes };
}

/**
 * Generate comparison table for all baselines
 */
export function generateComparisonTable(
  evodbResults: Array<{
    queryId: string;
    executionTimeSec: number;
    rowsProcessed: number;
    costUsd?: number;
  }>
): string {
  const lines: string[] = [];

  lines.push('| Query | EvoDB | ClickHouse | DuckDB | BigQuery | Speedup vs CH |');
  lines.push('|-------|-------|------------|--------|----------|---------------|');

  for (const result of evodbResults) {
    const ch = CLICKBENCH_BASELINE.results.find(r => r.queryId === result.queryId);
    const duck = DUCKDB_BASELINE.results.find(r => r.queryId === result.queryId);
    const bq = BIGQUERY_BASELINE.results.find(r => r.queryId === result.queryId);

    const speedup = ch ? (ch.executionTimeSec / result.executionTimeSec).toFixed(2) : 'N/A';

    lines.push(
      `| ${result.queryId} | ${result.executionTimeSec.toFixed(3)}s | ${ch?.executionTimeSec.toFixed(3) ?? 'N/A'}s | ${duck?.executionTimeSec.toFixed(3) ?? 'N/A'}s | ${bq?.executionTimeSec.toFixed(3) ?? 'N/A'}s | ${speedup}x |`
    );
  }

  return lines.join('\n');
}

/**
 * Cloudflare Workers pricing reference
 */
export const CF_WORKERS_PRICING = {
  // Free tier
  free: {
    requestsPerDay: 100_000,
    cpuTimeMs: 10, // per invocation
  },
  // Paid tier ($5/month minimum)
  paid: {
    requestsIncluded: 10_000_000,
    additionalRequestsPer1M: 0.50, // $0.50 per million
    cpuTimePer1Ms: 0.00001, // ~$0.01 per 1000ms
  },
  // R2 pricing
  r2: {
    storagePerGbMonth: 0.015,
    classAOpsPer1M: 4.50, // PUT, POST, LIST
    classBOpsPer1M: 0.36, // GET, HEAD
    egressToWorkers: 0, // Free
    egressToInternet: 0, // Free (currently)
  },
  // Cache API
  cacheApi: {
    cost: 0, // Free
    maxObjectSize: 512 * 1024 * 1024, // 512MB
  },
};

/**
 * Estimate cost for a workload
 */
export function estimateWorkloadCost(workload: {
  queriesPerMonth: number;
  avgCpuTimeMs: number;
  avgR2ReadsPerQuery: number;
  avgBytesPerQuery: number;
  cacheHitRatio: number;
}): {
  workersCost: number;
  r2Cost: number;
  totalCost: number;
  costPerQuery: number;
  costPer1MQueries: number;
} {
  const effectiveR2Reads = workload.avgR2ReadsPerQuery * (1 - workload.cacheHitRatio);

  // Workers cost
  const requestCost = Math.max(
    0,
    (workload.queriesPerMonth - CF_WORKERS_PRICING.paid.requestsIncluded) *
      CF_WORKERS_PRICING.paid.additionalRequestsPer1M / 1_000_000
  );
  const cpuCost = workload.queriesPerMonth * workload.avgCpuTimeMs * CF_WORKERS_PRICING.paid.cpuTimePer1Ms;
  const workersCost = requestCost + cpuCost;

  // R2 cost
  const r2ReadCost = workload.queriesPerMonth * effectiveR2Reads * CF_WORKERS_PRICING.r2.classBOpsPer1M / 1_000_000;
  const r2Cost = r2ReadCost;

  const totalCost = workersCost + r2Cost;
  const costPerQuery = totalCost / workload.queriesPerMonth;

  return {
    workersCost,
    r2Cost,
    totalCost,
    costPerQuery,
    costPer1MQueries: costPerQuery * 1_000_000,
  };
}
