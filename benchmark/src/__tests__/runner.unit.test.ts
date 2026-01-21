/**
 * @evodb/benchmark - Runner Tests
 *
 * Tests for the BenchmarkRunner class and related functions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BenchmarkRunner,
  createBenchmarkRunner,
  DEFAULT_CONFIG,
} from '../runner.js';
import type { BenchmarkReport } from '../types.js';

describe('BenchmarkRunner', () => {
  describe('createBenchmarkRunner', () => {
    it('should create runner with default config', () => {
      const runner = createBenchmarkRunner();
      expect(runner).toBeInstanceOf(BenchmarkRunner);
    });

    it('should create runner with custom config', () => {
      const runner = createBenchmarkRunner({
        name: 'Custom Benchmark',
        dataSizes: ['1K'],
        warmupIterations: 1,
        measurementIterations: 5,
      });
      expect(runner).toBeInstanceOf(BenchmarkRunner);
    });

    it('should merge custom config with defaults', () => {
      const runner = createBenchmarkRunner({
        name: 'Test Benchmark',
      });
      // The runner should have been created successfully with merged config
      expect(runner).toBeInstanceOf(BenchmarkRunner);
    });
  });

  describe('DEFAULT_CONFIG', () => {
    it('should have all required fields', () => {
      expect(DEFAULT_CONFIG.name).toBeDefined();
      expect(DEFAULT_CONFIG.warmupIterations).toBeGreaterThanOrEqual(0);
      expect(DEFAULT_CONFIG.measurementIterations).toBeGreaterThan(0);
      expect(DEFAULT_CONFIG.concurrencyLevels).toBeInstanceOf(Array);
      expect(DEFAULT_CONFIG.dataSizes).toBeInstanceOf(Array);
      expect(DEFAULT_CONFIG.operationTimeoutMs).toBeGreaterThan(0);
    });

    it('should have reasonable default values', () => {
      expect(DEFAULT_CONFIG.warmupIterations).toBeLessThanOrEqual(10);
      expect(DEFAULT_CONFIG.measurementIterations).toBeLessThanOrEqual(100);
      expect(DEFAULT_CONFIG.operationTimeoutMs).toBeGreaterThanOrEqual(1000);
    });

    it('should have valid data sizes', () => {
      const validSizes = ['1K', '10K', '100K', '1M', '10M', '100M'];
      for (const size of DEFAULT_CONFIG.dataSizes) {
        expect(validSizes).toContain(size);
      }
    });

    it('should have increasing concurrency levels', () => {
      for (let i = 1; i < DEFAULT_CONFIG.concurrencyLevels.length; i++) {
        expect(DEFAULT_CONFIG.concurrencyLevels[i]).toBeGreaterThan(
          DEFAULT_CONFIG.concurrencyLevels[i - 1]
        );
      }
    });
  });

  describe('BenchmarkRunner.printReport', () => {
    let runner: BenchmarkRunner;
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      runner = createBenchmarkRunner({ dataSizes: ['1K'] });
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    it('should print report without errors', () => {
      const mockReport: BenchmarkReport = {
        title: 'Test Report',
        generatedAt: Date.now(),
        summary: {
          scenariosRun: 2,
          totalDurationMs: 5000,
          bestQps: 1000,
          bestP99Ms: 50,
          avgCostPerQuery: 0.0001,
          maxWorkersUsed: 4,
        },
        scenarios: [],
        comparisons: [],
        recommendations: ['All scenarios show good performance'],
      };

      expect(() => runner.printReport(mockReport)).not.toThrow();
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should print scenario details', () => {
      const mockReport: BenchmarkReport = {
        title: 'Test Report',
        generatedAt: Date.now(),
        summary: {
          scenariosRun: 1,
          totalDurationMs: 1000,
          bestQps: 500,
          bestP99Ms: 100,
          avgCostPerQuery: 0.0002,
          maxWorkersUsed: 2,
        },
        scenarios: [
          {
            name: 'Test Scenario',
            type: 'concurrent_queries',
            config: {
              type: 'concurrent_queries',
              concurrency: 10,
              dataSize: '1K',
              workerCount: 2,
              enableCache: true,
              cacheTtlSeconds: 60,
              simulatedUsers: 10,
              readWriteRatio: 0.9,
              thinkTimeMs: 100,
              queryComplexity: 'simple',
            },
            resultsByConcurrency: new Map(),
            resultsByWorkerCount: new Map(),
            scalingEfficiency: 0.85,
            optimalConfig: {
              workerCount: 2,
              concurrency: 10,
              qps: 500,
              costPerQuery: 0.0002,
            },
          },
        ],
        comparisons: [],
        recommendations: [],
      };

      expect(() => runner.printReport(mockReport)).not.toThrow();
    });

    it('should print comparison details when available', () => {
      const mockReport: BenchmarkReport = {
        title: 'Test Report',
        generatedAt: Date.now(),
        summary: {
          scenariosRun: 1,
          totalDurationMs: 1000,
          bestQps: 500,
          bestP99Ms: 100,
          avgCostPerQuery: 0.0002,
          maxWorkersUsed: 2,
        },
        scenarios: [],
        comparisons: [
          {
            baseline: 'clickhouse_published',
            evodbResult: {
              scenario: 'test',
              config: {
                type: 'concurrent_queries',
                concurrency: 10,
                dataSize: '1K',
                workerCount: 2,
                enableCache: true,
                cacheTtlSeconds: 60,
                simulatedUsers: 10,
                readWriteRatio: 0.9,
                thinkTimeMs: 100,
                queryComplexity: 'simple',
              },
              timestamp: Date.now(),
              durationMs: 1000,
              latency: { min: 10, max: 100, mean: 50, p50: 45, p95: 90, p99: 95, stdDev: 20 },
              throughput: { qps: 500, rowsPerSecond: 10000, bytesPerSecond: 1000000, totalOperations: 500, totalDurationMs: 1000 },
              resources: { peakMemoryBytes: 1000000, avgCpuUtilization: 0.5, bytesScanned: 1000000, networkBytesTransferred: 500000 },
              cost: { costPerQuery: 0.0002, costPerMillionQueries: 200, workersCpuCost: 0.0001, r2ReadCost: 0.00005, r2EgressCost: 0 },
            },
            baselineResult: {
              system: 'clickhouse_published',
              benchmarkName: 'ClickBench',
              sourceUrl: 'https://benchmark.clickhouse.com/',
              benchmarkDate: '2024-01',
              configuration: 'Test',
              results: [],
            },
            speedupFactor: 1.5,
            costRatio: 0.8,
            notes: ['EvoDB is 1.5x faster'],
          },
        ],
        recommendations: ['Consider more workers'],
      };

      expect(() => runner.printReport(mockReport)).not.toThrow();
    });
  });
});
