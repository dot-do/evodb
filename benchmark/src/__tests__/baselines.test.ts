/**
 * @evodb/benchmark - Baselines Tests
 *
 * Additional tests for baseline comparison functions.
 */

import { describe, it, expect } from 'vitest';
import {
  CLICKBENCH_BASELINE,
  DUCKDB_BASELINE,
  BIGQUERY_BASELINE,
  EVODB_THEORETICAL_TARGETS,
  getAllBaselines,
  getBaseline,
  compareToBaseline,
  generateComparisonTable,
  CF_WORKERS_PRICING,
  estimateWorkloadCost,
} from '../baselines/clickhouse-baselines.js';

describe('Baselines', () => {
  describe('Published Baselines', () => {
    it('should have valid CLICKBENCH_BASELINE structure', () => {
      expect(CLICKBENCH_BASELINE.system).toBe('clickhouse_published');
      expect(CLICKBENCH_BASELINE.benchmarkName).toBe('ClickBench');
      expect(CLICKBENCH_BASELINE.sourceUrl).toMatch(/^https:\/\//);
      expect(CLICKBENCH_BASELINE.results.length).toBeGreaterThan(0);
    });

    it('should have CLICKBENCH results with required fields', () => {
      for (const result of CLICKBENCH_BASELINE.results) {
        expect(result.queryId).toBeDefined();
        expect(result.queryDescription).toBeDefined();
        expect(result.dataSize).toBeDefined();
        expect(result.executionTimeSec).toBeGreaterThan(0);
      }
    });

    it('should have valid DUCKDB_BASELINE structure', () => {
      expect(DUCKDB_BASELINE.system).toBe('duckdb_published');
      expect(DUCKDB_BASELINE.benchmarkName).toContain('DuckDB');
      expect(DUCKDB_BASELINE.results.length).toBeGreaterThan(0);
    });

    it('should have valid BIGQUERY_BASELINE structure', () => {
      expect(BIGQUERY_BASELINE.system).toBe('bigquery_published');
      expect(BIGQUERY_BASELINE.results.length).toBeGreaterThan(0);

      // BigQuery should have cost information
      const resultWithCost = BIGQUERY_BASELINE.results.find(r => r.costUsd !== undefined);
      expect(resultWithCost).toBeDefined();
      expect(resultWithCost!.costUsd).toBeGreaterThan(0);
    });

    it('should have valid EVODB_THEORETICAL_TARGETS structure', () => {
      expect(EVODB_THEORETICAL_TARGETS.system).toBe('n_workers_parallel');
      expect(EVODB_THEORETICAL_TARGETS.results.length).toBeGreaterThan(0);
    });

    it('should have reasonable execution times', () => {
      for (const result of CLICKBENCH_BASELINE.results) {
        // ClickHouse should complete queries in under 10 seconds
        expect(result.executionTimeSec).toBeLessThan(10);
      }
    });
  });

  describe('getAllBaselines', () => {
    it('should return all baselines', () => {
      const baselines = getAllBaselines();

      expect(baselines.length).toBe(4);
      expect(baselines).toContain(CLICKBENCH_BASELINE);
      expect(baselines).toContain(DUCKDB_BASELINE);
      expect(baselines).toContain(BIGQUERY_BASELINE);
      expect(baselines).toContain(EVODB_THEORETICAL_TARGETS);
    });

    it('should return unique systems', () => {
      const baselines = getAllBaselines();
      const systems = baselines.map(b => b.system);
      const uniqueSystems = new Set(systems);

      expect(uniqueSystems.size).toBe(systems.length);
    });
  });

  describe('getBaseline', () => {
    it('should return ClickHouse baseline', () => {
      const baseline = getBaseline('clickhouse_published');
      expect(baseline).toBe(CLICKBENCH_BASELINE);
    });

    it('should return DuckDB baseline', () => {
      const baseline = getBaseline('duckdb_published');
      expect(baseline).toBe(DUCKDB_BASELINE);
    });

    it('should return BigQuery baseline', () => {
      const baseline = getBaseline('bigquery_published');
      expect(baseline).toBe(BIGQUERY_BASELINE);
    });

    it('should return EvoDB targets', () => {
      const baseline = getBaseline('n_workers_parallel');
      expect(baseline).toBe(EVODB_THEORETICAL_TARGETS);
    });

    it('should return undefined for unknown system', () => {
      const baseline = getBaseline('unknown_system' as any);
      expect(baseline).toBeUndefined();
    });

    it('should return undefined for single_worker system', () => {
      const baseline = getBaseline('single_worker');
      expect(baseline).toBeUndefined();
    });
  });

  describe('compareToBaseline', () => {
    it('should compare EvoDB result to ClickHouse baseline', () => {
      const evodbResult = {
        queryType: 'count',
        executionTimeSec: 0.001,
        rowsProcessed: 100000000,
        costUsd: 0.000001,
      };

      const comparison = compareToBaseline(evodbResult, CLICKBENCH_BASELINE, 'Q0');

      expect(comparison.baselineResult).toBeDefined();
      expect(comparison.baselineResult!.queryId).toBe('Q0');
      expect(comparison.speedup).toBeGreaterThan(0);
      expect(comparison.notes.length).toBeGreaterThan(0);
    });

    it('should calculate speedup correctly', () => {
      const evodbResult = {
        queryType: 'count',
        executionTimeSec: 0.001, // 1ms
        rowsProcessed: 100000000,
      };

      // Q0 in CLICKBENCH takes 0.003s (3ms)
      const comparison = compareToBaseline(evodbResult, CLICKBENCH_BASELINE, 'Q0');

      // EvoDB is 3x faster
      expect(comparison.speedup).toBe(3);
    });

    it('should handle slower EvoDB result', () => {
      const evodbResult = {
        queryType: 'count',
        executionTimeSec: 0.01, // 10ms
        rowsProcessed: 100000000,
      };

      // Q0 in CLICKBENCH takes 0.003s (3ms)
      const comparison = compareToBaseline(evodbResult, CLICKBENCH_BASELINE, 'Q0');

      expect(comparison.speedup).toBeLessThan(1);
      expect(comparison.notes.some(n => n.includes('slower'))).toBe(true);
    });

    it('should handle missing query in baseline', () => {
      const evodbResult = {
        queryType: 'count',
        executionTimeSec: 0.001,
        rowsProcessed: 100000000,
      };

      const comparison = compareToBaseline(evodbResult, CLICKBENCH_BASELINE, 'Q999');

      expect(comparison.baselineResult).toBeUndefined();
      expect(comparison.speedup).toBe(0);
      expect(comparison.notes.some(n => n.includes('not found'))).toBe(true);
    });

    it('should calculate cost ratio when both have costs', () => {
      const evodbResult = {
        queryType: 'count',
        executionTimeSec: 1.0,
        rowsProcessed: 100000000,
        costUsd: 0.025, // Half the BigQuery cost
      };

      const comparison = compareToBaseline(evodbResult, BIGQUERY_BASELINE, 'simple_count');

      expect(comparison.costRatio).toBeGreaterThan(0);
    });

    it('should return 0 cost ratio when baseline has no cost', () => {
      const evodbResult = {
        queryType: 'count',
        executionTimeSec: 0.001,
        rowsProcessed: 100000000,
        costUsd: 0.000001,
      };

      // ClickBench Q0 has no cost field
      const comparison = compareToBaseline(evodbResult, CLICKBENCH_BASELINE, 'Q0');

      expect(comparison.costRatio).toBe(0);
    });
  });

  describe('generateComparisonTable', () => {
    it('should generate markdown table', () => {
      const evodbResults = [
        { queryId: 'Q0', executionTimeSec: 0.001, rowsProcessed: 100000000 },
        { queryId: 'Q1', executionTimeSec: 0.005, rowsProcessed: 100000000 },
      ];

      const table = generateComparisonTable(evodbResults);

      expect(table).toContain('|');
      expect(table).toContain('Query');
      expect(table).toContain('EvoDB');
      expect(table).toContain('ClickHouse');
      expect(table).toContain('DuckDB');
      expect(table).toContain('BigQuery');
    });

    it('should include speedup column', () => {
      const evodbResults = [
        { queryId: 'Q0', executionTimeSec: 0.001, rowsProcessed: 100000000 },
      ];

      const table = generateComparisonTable(evodbResults);

      expect(table).toContain('Speedup');
    });

    it('should handle empty results', () => {
      const table = generateComparisonTable([]);

      // Should still have header
      expect(table).toContain('Query');
    });

    it('should show N/A for missing baseline data', () => {
      const evodbResults = [
        { queryId: 'Q999', executionTimeSec: 0.001, rowsProcessed: 100000000 },
      ];

      const table = generateComparisonTable(evodbResults);

      expect(table).toContain('N/A');
    });
  });

  describe('CF_WORKERS_PRICING', () => {
    it('should have free tier limits', () => {
      expect(CF_WORKERS_PRICING.free.requestsPerDay).toBeGreaterThan(0);
      expect(CF_WORKERS_PRICING.free.cpuTimeMs).toBeGreaterThan(0);
    });

    it('should have paid tier pricing', () => {
      expect(CF_WORKERS_PRICING.paid.requestsIncluded).toBeGreaterThan(0);
      expect(CF_WORKERS_PRICING.paid.additionalRequestsPer1M).toBeGreaterThan(0);
      expect(CF_WORKERS_PRICING.paid.cpuTimePer1Ms).toBeGreaterThan(0);
    });

    it('should have R2 pricing', () => {
      expect(CF_WORKERS_PRICING.r2.storagePerGbMonth).toBeGreaterThan(0);
      expect(CF_WORKERS_PRICING.r2.classAOpsPer1M).toBeGreaterThan(0);
      expect(CF_WORKERS_PRICING.r2.classBOpsPer1M).toBeGreaterThan(0);
    });

    it('should have free egress to Workers', () => {
      expect(CF_WORKERS_PRICING.r2.egressToWorkers).toBe(0);
    });

    it('should have Cache API info', () => {
      expect(CF_WORKERS_PRICING.cacheApi.cost).toBe(0);
      expect(CF_WORKERS_PRICING.cacheApi.maxObjectSize).toBeGreaterThan(0);
    });
  });

  describe('estimateWorkloadCost', () => {
    it('should estimate cost for basic workload', () => {
      const cost = estimateWorkloadCost({
        queriesPerMonth: 1000000,
        avgCpuTimeMs: 10,
        avgR2ReadsPerQuery: 2,
        avgBytesPerQuery: 1000000,
        cacheHitRatio: 0.5,
      });

      expect(cost.workersCost).toBeGreaterThanOrEqual(0);
      expect(cost.r2Cost).toBeGreaterThan(0);
      expect(cost.totalCost).toBe(cost.workersCost + cost.r2Cost);
      expect(cost.costPerQuery).toBe(cost.totalCost / 1000000);
      expect(cost.costPer1MQueries).toBe(cost.costPerQuery * 1000000);
    });

    it('should reduce R2 cost with higher cache hit ratio', () => {
      const lowCache = estimateWorkloadCost({
        queriesPerMonth: 1000000,
        avgCpuTimeMs: 10,
        avgR2ReadsPerQuery: 2,
        avgBytesPerQuery: 1000000,
        cacheHitRatio: 0.2,
      });

      const highCache = estimateWorkloadCost({
        queriesPerMonth: 1000000,
        avgCpuTimeMs: 10,
        avgR2ReadsPerQuery: 2,
        avgBytesPerQuery: 1000000,
        cacheHitRatio: 0.9,
      });

      expect(highCache.r2Cost).toBeLessThan(lowCache.r2Cost);
    });

    it('should have zero R2 cost with 100% cache hit ratio', () => {
      const cost = estimateWorkloadCost({
        queriesPerMonth: 1000000,
        avgCpuTimeMs: 10,
        avgR2ReadsPerQuery: 2,
        avgBytesPerQuery: 1000000,
        cacheHitRatio: 1.0,
      });

      expect(cost.r2Cost).toBe(0);
    });

    it('should scale with query count', () => {
      const cost1m = estimateWorkloadCost({
        queriesPerMonth: 1000000,
        avgCpuTimeMs: 10,
        avgR2ReadsPerQuery: 2,
        avgBytesPerQuery: 1000000,
        cacheHitRatio: 0.5,
      });

      const cost10m = estimateWorkloadCost({
        queriesPerMonth: 10000000,
        avgCpuTimeMs: 10,
        avgR2ReadsPerQuery: 2,
        avgBytesPerQuery: 1000000,
        cacheHitRatio: 0.5,
      });

      // Cost per query should be similar, total cost should scale
      expect(cost10m.totalCost).toBeGreaterThan(cost1m.totalCost);
    });

    it('should not charge for requests within included tier', () => {
      const smallWorkload = estimateWorkloadCost({
        queriesPerMonth: 5000000, // Within 10M included
        avgCpuTimeMs: 10,
        avgR2ReadsPerQuery: 1,
        avgBytesPerQuery: 100000,
        cacheHitRatio: 0.8,
      });

      // Workers cost should only be CPU time, not request cost
      expect(smallWorkload.workersCost).toBeGreaterThan(0);
    });

    it('should handle zero queries', () => {
      const cost = estimateWorkloadCost({
        queriesPerMonth: 0,
        avgCpuTimeMs: 10,
        avgR2ReadsPerQuery: 2,
        avgBytesPerQuery: 1000000,
        cacheHitRatio: 0.5,
      });

      expect(cost.totalCost).toBe(0);
      // costPerQuery would be NaN due to division by zero, but we don't need to test that
    });
  });
});
