/**
 * @evodb/benchmark - Benchmark Runner
 *
 * Orchestrates benchmark execution and reporting.
 */

import type {
  BenchmarkConfig,
  BenchmarkResult,
  BenchmarkReport,
  ScenarioReport,
  ComparisonReport,
  AnyScenarioConfig,
  DataSize,
} from './types.js';
import { generateForSize } from './generators/data-generator.js';
import { getSchema, USER_ACTIVITY_SCHEMA } from './generators/schemas.js';
import {
  createConcurrentQueriesScenario,
  benchmarkConcurrentQueries,
} from './scenarios/concurrent-queries.js';
import {
  benchmarkParallelScan,
} from './scenarios/partition-parallel-scan.js';
import {
  benchmarkCacheEffectiveness,
} from './scenarios/cache-effectiveness.js';
import {
  createScatterGatherScenario,
} from './scenarios/scatter-gather.js';
import {
  compareToBaseline,
  CLICKBENCH_BASELINE,
} from './baselines/clickhouse-baselines.js';
import { formatBytes, formatDuration, formatNumber } from './utils/metrics.js';

/**
 * Default benchmark configuration
 */
export const DEFAULT_CONFIG: BenchmarkConfig = {
  name: 'EvoDB Scale-out Benchmark',
  description: 'Demonstrates Workers parallel query execution advantage',
  warmupIterations: 3,
  measurementIterations: 10,
  concurrencyLevels: [1, 10, 100, 1000],
  dataSizes: ['10K', '100K', '1M'],
  detailedMetrics: true,
  operationTimeoutMs: 30_000,
};

/**
 * Benchmark Runner
 */
export class BenchmarkRunner {
  private readonly config: BenchmarkConfig;
  private results: BenchmarkResult[] = [];
  private scenarioReports: ScenarioReport[] = [];
  private comparisonReports: ComparisonReport[] = [];

  constructor(config: Partial<BenchmarkConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run all benchmark scenarios
   */
  async runAll(options?: {
    schemaName?: string;
    workerCounts?: number[];
    skipScenarios?: string[];
  }): Promise<BenchmarkReport> {
    const schemaName = options?.schemaName ?? 'user_activity';
    const workerCounts = options?.workerCounts ?? [1, 2, 4, 8];
    const skipScenarios = new Set(options?.skipScenarios ?? []);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`EvoDB Scale-out Benchmark`);
    console.log(`${'='.repeat(60)}\n`);

    const startTime = performance.now();

    // Generate test data for each size
    for (const dataSize of this.config.dataSizes) {
      console.log(`\nGenerating ${dataSize} dataset...`);
      const schema = getSchema(schemaName) ?? USER_ACTIVITY_SCHEMA;
      const dataset = generateForSize(schema, dataSize, { includeData: true });

      console.log(`  Partitions: ${dataset.partitions.length}`);
      console.log(`  Total size: ${formatBytes(dataset.totalSizeBytes)}`);

      // Run scenarios
      if (!skipScenarios.has('concurrent_queries')) {
        await this.runConcurrentQueriesScenario(dataset, schemaName, workerCounts);
      }

      if (!skipScenarios.has('partition_parallel_scan')) {
        await this.runPartitionParallelScanScenario(dataset, workerCounts);
      }

      if (!skipScenarios.has('cache_effectiveness')) {
        await this.runCacheEffectivenessScenario(dataset, schemaName);
      }

      if (!skipScenarios.has('scatter_gather')) {
        await this.runScatterGatherScenario(dataset, schemaName, workerCounts);
      }
    }

    const totalDuration = performance.now() - startTime;

    // Generate report
    return this.generateReport(totalDuration);
  }

  /**
   * Run concurrent queries scenario
   */
  private async runConcurrentQueriesScenario(
    dataset: ReturnType<typeof generateForSize>,
    schemaName: string,
    workerCounts: number[]
  ): Promise<void> {
    console.log(`\n${'─'.repeat(40)}`);
    console.log(`Concurrent Queries Scenario`);
    console.log(`${'─'.repeat(40)}`);

    const scenario = createConcurrentQueriesScenario();
    const resultsByWorkerCount = new Map<number, BenchmarkResult>();
    const resultsByConcurrency = new Map<number, BenchmarkResult>();

    // Test different worker counts
    const scalingResults = await scenario.runScalingBenchmark(
      dataset.partitions,
      workerCounts,
      dataset.partitionData,
      { schemaName, queriesPerRun: 500 }
    );

    for (const [workerCount, result] of scalingResults) {
      resultsByWorkerCount.set(workerCount, result);
      this.results.push(result);
    }

    // Test different concurrency levels
    for (const concurrency of this.config.concurrencyLevels) {
      console.log(`\n  Testing concurrency level ${concurrency}...`);

      const result = await benchmarkConcurrentQueries(
        dataset.partitions,
        {
          workerCount: 4,
          simulatedUsers: concurrency,
          queries: 300,
          schemaName,
          data: dataset.partitionData,
        }
      );

      resultsByConcurrency.set(concurrency, result);
      this.results.push(result);
    }

    // Calculate optimal configuration
    let bestQps = 0;
    let optimalWorkerCount = 1;
    let optimalConcurrency = 1;

    for (const [workerCount, result] of resultsByWorkerCount) {
      if (result.throughput.qps > bestQps) {
        bestQps = result.throughput.qps;
        optimalWorkerCount = workerCount;
      }
    }

    for (const [concurrency, result] of resultsByConcurrency) {
      if (result.throughput.qps > bestQps) {
        bestQps = result.throughput.qps;
        optimalConcurrency = concurrency;
      }
    }

    const baselineResult = resultsByWorkerCount.get(1);
    const bestResult = resultsByWorkerCount.get(optimalWorkerCount);
    const scalingEfficiency = bestResult && baselineResult
      ? (bestResult.throughput.qps / baselineResult.throughput.qps) / optimalWorkerCount
      : 1;

    this.scenarioReports.push({
      name: 'Concurrent Queries',
      type: 'concurrent_queries',
      config: scenario['config'] as AnyScenarioConfig,
      resultsByConcurrency,
      resultsByWorkerCount,
      scalingEfficiency,
      optimalConfig: {
        workerCount: optimalWorkerCount,
        concurrency: optimalConcurrency,
        qps: bestQps,
        costPerQuery: bestResult?.cost.costPerQuery ?? 0,
      },
    });
  }

  /**
   * Run partition parallel scan scenario
   */
  private async runPartitionParallelScanScenario(
    dataset: ReturnType<typeof generateForSize>,
    workerCounts: number[]
  ): Promise<void> {
    console.log(`\n${'─'.repeat(40)}`);
    console.log(`Partition Parallel Scan Scenario`);
    console.log(`${'─'.repeat(40)}`);

    const { results, speedups, scalingEfficiencies } = await benchmarkParallelScan(
      dataset.partitions,
      {
        workerCounts,
        data: dataset.partitionData,
      }
    );

    const resultsByWorkerCount = new Map<number, BenchmarkResult>();
    for (const [workerCount, result] of results) {
      resultsByWorkerCount.set(workerCount, result);
      this.results.push(result);
    }

    // Find optimal
    let bestSpeedup = 0;
    let optimalWorkerCount = 1;

    for (const [workerCount, speedup] of speedups) {
      if (speedup > bestSpeedup) {
        bestSpeedup = speedup;
        optimalWorkerCount = workerCount;
      }
    }

    console.log(`\n  Scaling Summary:`);
    for (const [workerCount, speedup] of speedups) {
      const efficiency = scalingEfficiencies.get(workerCount) ?? 1;
      console.log(`    ${workerCount} workers: ${speedup.toFixed(2)}x speedup, ${(efficiency * 100).toFixed(1)}% efficiency`);
    }

    const bestResult = resultsByWorkerCount.get(optimalWorkerCount);
    const avgEfficiency = Array.from(scalingEfficiencies.values()).reduce((a, b) => a + b, 0) /
      scalingEfficiencies.size;

    this.scenarioReports.push({
      name: 'Partition Parallel Scan',
      type: 'partition_parallel_scan',
      config: {
        type: 'partition_parallel_scan',
        concurrency: 1,
        dataSize: '100K',
        workerCount: optimalWorkerCount,
        enableCache: false,
        cacheTtlSeconds: 0,
        partitionCount: dataset.partitions.length,
        partitionScheme: 'hash',
        filesPerPartition: 1,
        rowsPerFile: dataset.rowCount / dataset.partitions.length,
        scanType: 'full',
        filterSelectivity: 1.0,
      },
      resultsByConcurrency: new Map(),
      resultsByWorkerCount,
      scalingEfficiency: avgEfficiency,
      optimalConfig: {
        workerCount: optimalWorkerCount,
        concurrency: 1,
        qps: bestResult?.throughput.qps ?? 0,
        costPerQuery: bestResult?.cost.costPerQuery ?? 0,
      },
    });
  }

  /**
   * Run cache effectiveness scenario
   */
  private async runCacheEffectivenessScenario(
    dataset: ReturnType<typeof generateForSize>,
    _schemaName: string
  ): Promise<void> {
    console.log(`\n${'─'.repeat(40)}`);
    console.log(`Cache Effectiveness Scenario`);
    console.log(`${'─'.repeat(40)}`);

    const { cold, warm, improvement } = await benchmarkCacheEffectiveness(
      dataset.partitions,
      {
        workerCount: 4,
        warmupQueries: 200,
        measurementQueries: 500,
        hotDataPercentage: 0.2,
        accessPattern: 'zipf',
        data: dataset.partitionData,
      }
    );

    this.results.push(cold, warm);

    console.log(`\n  Cache Effectiveness Summary:`);
    console.log(`    Cold cache p50: ${cold.latency.p50.toFixed(2)}ms`);
    console.log(`    Warm cache p50: ${warm.latency.p50.toFixed(2)}ms`);
    console.log(`    Latency reduction: ${improvement.latencyReduction.p50.toFixed(1)}%`);
    console.log(`    QPS improvement: ${improvement.qpsImprovement.toFixed(2)}x`);
    console.log(`    Cost reduction: ${improvement.costReduction.toFixed(1)}%`);

    const resultsByWorkerCount = new Map<number, BenchmarkResult>();
    resultsByWorkerCount.set(4, warm);

    this.scenarioReports.push({
      name: 'Cache Effectiveness',
      type: 'cache_effectiveness',
      config: warm.config as AnyScenarioConfig,
      resultsByConcurrency: new Map(),
      resultsByWorkerCount,
      scalingEfficiency: improvement.qpsImprovement,
      optimalConfig: {
        workerCount: 4,
        concurrency: 50,
        qps: warm.throughput.qps,
        costPerQuery: warm.cost.costPerQuery,
      },
    });
  }

  /**
   * Run scatter-gather scenario
   */
  private async runScatterGatherScenario(
    dataset: ReturnType<typeof generateForSize>,
    schemaName: string,
    workerCounts: number[]
  ): Promise<void> {
    console.log(`\n${'─'.repeat(40)}`);
    console.log(`Scatter-Gather Scenario`);
    console.log(`${'─'.repeat(40)}`);

    const scenario = createScatterGatherScenario();

    const { results, speedups } = await scenario.runFanOutComparison(
      dataset.partitions,
      workerCounts,
      dataset.partitionData,
      { queriesPerLevel: 50, schemaName }
    );

    const resultsByWorkerCount = new Map<number, BenchmarkResult>();
    for (const [fanOut, result] of results) {
      resultsByWorkerCount.set(fanOut, result);
      this.results.push(result);
    }

    // Find optimal fan-out
    let bestSpeedup = 0;
    let optimalFanOut = 1;

    for (const [fanOut, speedup] of speedups) {
      if (speedup > bestSpeedup) {
        bestSpeedup = speedup;
        optimalFanOut = fanOut;
      }
    }

    console.log(`\n  Scatter-Gather Summary:`);
    for (const [fanOut, speedup] of speedups) {
      console.log(`    Fan-out ${fanOut}: ${speedup.toFixed(2)}x speedup`);
    }

    const bestResult = resultsByWorkerCount.get(optimalFanOut);

    this.scenarioReports.push({
      name: 'Scatter-Gather',
      type: 'scatter_gather',
      config: bestResult?.config as AnyScenarioConfig,
      resultsByConcurrency: new Map(),
      resultsByWorkerCount,
      scalingEfficiency: bestSpeedup / optimalFanOut,
      optimalConfig: {
        workerCount: optimalFanOut,
        concurrency: 10,
        qps: bestResult?.throughput.qps ?? 0,
        costPerQuery: bestResult?.cost.costPerQuery ?? 0,
      },
    });
  }

  /**
   * Generate final benchmark report
   */
  private generateReport(totalDurationMs: number): BenchmarkReport {
    // Find best metrics across all results
    let bestQps = 0;
    let bestP99 = Infinity;
    let totalCost = 0;
    let maxWorkers = 0;

    for (const result of this.results) {
      if (result.throughput.qps > bestQps) bestQps = result.throughput.qps;
      if (result.latency.p99 < bestP99) bestP99 = result.latency.p99;
      totalCost += result.cost.costPerQuery;
      if ((result.metadata?.workerCount as number) > maxWorkers) {
        maxWorkers = result.metadata?.workerCount as number;
      }
    }

    // Generate comparison with ClickHouse baseline
    for (const scenario of this.scenarioReports) {
      const bestResult = scenario.resultsByWorkerCount.get(scenario.optimalConfig.workerCount);
      if (bestResult) {
        // Map to ClickBench query
        const queryMapping: Record<string, string> = {
          'concurrent_queries': 'Q0',
          'partition_parallel_scan': 'Q2',
          'cache_effectiveness': 'Q0',
          'scatter_gather': 'Q3',
        };

        const comparison = compareToBaseline(
          {
            queryType: scenario.type,
            executionTimeSec: bestResult.latency.p50 / 1000,
            rowsProcessed: bestResult.throughput.rowsPerSecond * bestResult.durationMs / 1000,
            costUsd: bestResult.cost.costPerQuery,
          },
          CLICKBENCH_BASELINE,
          queryMapping[scenario.type]
        );

        if (comparison.baselineResult) {
          this.comparisonReports.push({
            baseline: 'clickhouse_published',
            evodbResult: bestResult,
            baselineResult: CLICKBENCH_BASELINE,
            speedupFactor: comparison.speedup,
            costRatio: comparison.costRatio,
            notes: comparison.notes,
          });
        }
      }
    }

    const recommendations = this.generateRecommendations();

    return {
      title: this.config.name,
      generatedAt: Date.now(),
      summary: {
        scenariosRun: this.scenarioReports.length,
        totalDurationMs,
        bestQps,
        bestP99Ms: bestP99,
        avgCostPerQuery: this.results.length > 0 ? totalCost / this.results.length : 0,
        maxWorkersUsed: maxWorkers,
      },
      scenarios: this.scenarioReports,
      comparisons: this.comparisonReports,
      recommendations,
    };
  }

  /**
   * Generate recommendations based on results
   */
  private generateRecommendations(): string[] {
    const recommendations: string[] = [];

    // Analyze scaling efficiency
    for (const scenario of this.scenarioReports) {
      if (scenario.scalingEfficiency < 0.7) {
        recommendations.push(
          `Consider tuning ${scenario.name}: scaling efficiency is ${(scenario.scalingEfficiency * 100).toFixed(0)}%`
        );
      }

      if (scenario.scalingEfficiency > 0.9) {
        recommendations.push(
          `${scenario.name} shows excellent scaling (${(scenario.scalingEfficiency * 100).toFixed(0)}%) - consider more workers`
        );
      }
    }

    // Check cache effectiveness
    const cacheScenario = this.scenarioReports.find(s => s.type === 'cache_effectiveness');
    if (cacheScenario) {
      const warmResult = Array.from(cacheScenario.resultsByWorkerCount.values())[0];
      if (warmResult?.cache?.hitRatio && warmResult.cache.hitRatio < 0.7) {
        recommendations.push(
          `Cache hit ratio is ${(warmResult.cache.hitRatio * 100).toFixed(0)}% - consider increasing cache TTL or pre-warming`
        );
      }
    }

    // Check cost efficiency
    const avgCost = this.results.reduce((sum, r) => sum + r.cost.costPerQuery, 0) / this.results.length;
    if (avgCost > 0.001) {
      recommendations.push(
        `Average cost per query is $${avgCost.toFixed(6)} - consider caching more aggressively`
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('All scenarios show good performance characteristics');
    }

    return recommendations;
  }

  /**
   * Print report to console
   */
  printReport(report: BenchmarkReport): void {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`BENCHMARK REPORT`);
    console.log(`${'='.repeat(60)}\n`);

    console.log(`Summary:`);
    console.log(`  Scenarios run: ${report.summary.scenariosRun}`);
    console.log(`  Total duration: ${formatDuration(report.summary.totalDurationMs)}`);
    console.log(`  Best QPS: ${formatNumber(report.summary.bestQps)}`);
    console.log(`  Best p99 latency: ${report.summary.bestP99Ms.toFixed(2)}ms`);
    console.log(`  Avg cost per query: $${report.summary.avgCostPerQuery.toFixed(8)}`);
    console.log(`  Max workers used: ${report.summary.maxWorkersUsed}`);

    console.log(`\nScenario Results:`);
    for (const scenario of report.scenarios) {
      console.log(`\n  ${scenario.name}:`);
      console.log(`    Optimal workers: ${scenario.optimalConfig.workerCount}`);
      console.log(`    Best QPS: ${formatNumber(scenario.optimalConfig.qps)}`);
      console.log(`    Scaling efficiency: ${(scenario.scalingEfficiency * 100).toFixed(1)}%`);
      console.log(`    Cost per query: $${scenario.optimalConfig.costPerQuery.toFixed(8)}`);
    }

    if (report.comparisons.length > 0) {
      console.log(`\nComparison with Baselines:`);
      for (const comparison of report.comparisons) {
        console.log(`\n  vs ${comparison.baseline}:`);
        console.log(`    Speedup: ${comparison.speedupFactor.toFixed(2)}x`);
        for (const note of comparison.notes) {
          console.log(`    - ${note}`);
        }
      }
    }

    console.log(`\nRecommendations:`);
    for (const rec of report.recommendations) {
      console.log(`  - ${rec}`);
    }

    console.log(`\n${'='.repeat(60)}\n`);
  }
}

/**
 * Create benchmark runner
 */
export function createBenchmarkRunner(
  config?: Partial<BenchmarkConfig>
): BenchmarkRunner {
  return new BenchmarkRunner(config);
}

/**
 * Quick benchmark function
 */
export async function runBenchmark(
  options?: {
    dataSizes?: DataSize[];
    workerCounts?: number[];
    schemaName?: string;
  }
): Promise<BenchmarkReport> {
  const runner = createBenchmarkRunner({
    dataSizes: options?.dataSizes ?? ['10K', '100K'],
  });

  const report = await runner.runAll({
    schemaName: options?.schemaName ?? 'user_activity',
    workerCounts: options?.workerCounts ?? [1, 2, 4, 8],
  });

  runner.printReport(report);

  return report;
}
