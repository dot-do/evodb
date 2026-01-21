/**
 * Tests for metrics-types.ts
 *
 * Verifies that the type definitions are correctly exported from core.
 * The actual implementation tests are in @evodb/observability.
 */

import { describe, it, expect } from 'vitest';
import type {
  MetricLabels,
  MetricType,
  Metric,
  Counter,
  LabeledCounter,
  Gauge,
  LabeledGauge,
  HistogramData,
  TimerEnd,
  Histogram,
  LabeledHistogram,
  CounterConfig,
  GaugeConfig,
  HistogramConfig,
  MetricsRegistry,
  EvoDBMetricsCollection,
} from '../metrics-types.js';

describe('metrics-types exports', () => {
  it('should export MetricLabels type', () => {
    // Type-only test - if this compiles, the type is exported correctly
    const labels: MetricLabels = { method: 'GET', status: '200' };
    expect(labels.method).toBe('GET');
  });

  it('should export MetricType type', () => {
    const counterType: MetricType = 'counter';
    const gaugeType: MetricType = 'gauge';
    const histogramType: MetricType = 'histogram';

    expect(counterType).toBe('counter');
    expect(gaugeType).toBe('gauge');
    expect(histogramType).toBe('histogram');
  });

  it('should export CounterConfig type', () => {
    const config: CounterConfig = {
      name: 'requests_total',
      help: 'Total requests',
      labelNames: ['method'],
    };

    expect(config.name).toBe('requests_total');
  });

  it('should export GaugeConfig type', () => {
    const config: GaugeConfig = {
      name: 'connections',
      help: 'Active connections',
    };

    expect(config.name).toBe('connections');
  });

  it('should export HistogramConfig type', () => {
    const config: HistogramConfig = {
      name: 'duration_seconds',
      help: 'Duration in seconds',
      buckets: [0.1, 0.5, 1],
    };

    expect(config.name).toBe('duration_seconds');
    expect(config.buckets).toEqual([0.1, 0.5, 1]);
  });

  it('should export HistogramData type', () => {
    const data: HistogramData = {
      count: 10,
      sum: 5.5,
      buckets: { 0.1: 3, 0.5: 7, 1: 10 },
    };

    expect(data.count).toBe(10);
    expect(data.sum).toBe(5.5);
    expect(data.buckets[0.1]).toBe(3);
  });

  it('should export TimerEnd type', () => {
    // TimerEnd is a function that returns a number
    const mockTimerEnd: TimerEnd = () => 0.123;
    const duration = mockTimerEnd();

    expect(typeof duration).toBe('number');
    expect(duration).toBe(0.123);
  });

  describe('interface type checks (compile-time only)', () => {
    // These tests verify that the interfaces are correctly shaped
    // They don't test runtime behavior since that's in @evodb/observability

    it('should define Metric interface correctly', () => {
      // Mock implementation for type checking
      const metric: Metric = {
        name: 'test_metric',
        help: 'Test metric',
        type: 'counter',
        reset: () => {},
      };

      expect(metric.name).toBe('test_metric');
      expect(metric.help).toBe('Test metric');
      expect(metric.type).toBe('counter');
      expect(typeof metric.reset).toBe('function');
    });

    it('should define Counter interface correctly', () => {
      const counter: Counter = {
        name: 'test_counter',
        help: 'Test counter',
        type: 'counter',
        inc: () => {},
        get: () => 0,
        labels: () => ({ inc: () => {}, get: () => 0 }),
        reset: () => {},
      };

      expect(counter.type).toBe('counter');
      expect(typeof counter.inc).toBe('function');
      expect(typeof counter.get).toBe('function');
      expect(typeof counter.labels).toBe('function');
    });

    it('should define LabeledCounter interface correctly', () => {
      const labeled: LabeledCounter = {
        inc: () => {},
        get: () => 0,
      };

      expect(typeof labeled.inc).toBe('function');
      expect(typeof labeled.get).toBe('function');
    });

    it('should define Gauge interface correctly', () => {
      const gauge: Gauge = {
        name: 'test_gauge',
        help: 'Test gauge',
        type: 'gauge',
        set: () => {},
        inc: () => {},
        dec: () => {},
        setToCurrentTime: () => {},
        get: () => 0,
        labels: () => ({
          set: () => {},
          inc: () => {},
          dec: () => {},
          setToCurrentTime: () => {},
          get: () => 0,
        }),
        reset: () => {},
      };

      expect(gauge.type).toBe('gauge');
      expect(typeof gauge.set).toBe('function');
      expect(typeof gauge.inc).toBe('function');
      expect(typeof gauge.dec).toBe('function');
      expect(typeof gauge.setToCurrentTime).toBe('function');
    });

    it('should define LabeledGauge interface correctly', () => {
      const labeled: LabeledGauge = {
        set: () => {},
        inc: () => {},
        dec: () => {},
        setToCurrentTime: () => {},
        get: () => 0,
      };

      expect(typeof labeled.set).toBe('function');
      expect(typeof labeled.get).toBe('function');
    });

    it('should define Histogram interface correctly', () => {
      const histogram: Histogram = {
        name: 'test_histogram',
        help: 'Test histogram',
        type: 'histogram',
        buckets: [0.1, 0.5, 1],
        observe: () => {},
        startTimer: () => () => 0,
        get: () => ({ count: 0, sum: 0, buckets: {} }),
        labels: () => ({
          observe: () => {},
          startTimer: () => () => 0,
          get: () => ({ count: 0, sum: 0, buckets: {} }),
        }),
        reset: () => {},
      };

      expect(histogram.type).toBe('histogram');
      expect(histogram.buckets).toEqual([0.1, 0.5, 1]);
      expect(typeof histogram.observe).toBe('function');
      expect(typeof histogram.startTimer).toBe('function');
    });

    it('should define LabeledHistogram interface correctly', () => {
      const labeled: LabeledHistogram = {
        observe: () => {},
        startTimer: () => () => 0,
        get: () => ({ count: 0, sum: 0, buckets: {} }),
      };

      expect(typeof labeled.observe).toBe('function');
      expect(typeof labeled.startTimer).toBe('function');
      expect(typeof labeled.get).toBe('function');
    });

    it('should define MetricsRegistry interface correctly', () => {
      const registry: MetricsRegistry = {
        getMetrics: () => [],
        getMetric: () => undefined,
        clear: () => {},
        resetAll: () => {},
        contentType: 'text/plain; version=0.0.4; charset=utf-8',
        _register: () => {},
      };

      expect(typeof registry.getMetrics).toBe('function');
      expect(typeof registry.getMetric).toBe('function');
      expect(typeof registry.clear).toBe('function');
      expect(typeof registry.resetAll).toBe('function');
      expect(registry.contentType).toBe('text/plain; version=0.0.4; charset=utf-8');
    });

    it('should define EvoDBMetricsCollection interface correctly', () => {
      // Create mock implementations for type checking
      const mockHistogram: Histogram = {
        name: 'evodb_query_duration_seconds',
        help: 'Duration of query execution in seconds',
        type: 'histogram',
        buckets: [0.001, 0.01, 0.1, 1],
        observe: () => {},
        startTimer: () => () => 0,
        get: () => ({ count: 0, sum: 0, buckets: {} }),
        labels: () => ({
          observe: () => {},
          startTimer: () => () => 0,
          get: () => ({ count: 0, sum: 0, buckets: {} }),
        }),
        reset: () => {},
      };

      const mockCounter: Counter = {
        name: 'test_counter',
        help: 'Test counter',
        type: 'counter',
        inc: () => {},
        get: () => 0,
        labels: () => ({ inc: () => {}, get: () => 0 }),
        reset: () => {},
      };

      const mockGauge: Gauge = {
        name: 'test_gauge',
        help: 'Test gauge',
        type: 'gauge',
        set: () => {},
        inc: () => {},
        dec: () => {},
        setToCurrentTime: () => {},
        get: () => 0,
        labels: () => ({
          set: () => {},
          inc: () => {},
          dec: () => {},
          setToCurrentTime: () => {},
          get: () => 0,
        }),
        reset: () => {},
      };

      const mockRegistry: MetricsRegistry = {
        getMetrics: () => [],
        getMetric: () => undefined,
        clear: () => {},
        resetAll: () => {},
        contentType: 'text/plain; version=0.0.4; charset=utf-8',
        _register: () => {},
      };

      const collection: EvoDBMetricsCollection = {
        registry: mockRegistry,
        queryDurationSeconds: mockHistogram,
        blocksScannedTotal: mockCounter,
        cacheHitsTotal: mockCounter,
        cacheMissesTotal: mockCounter,
        bufferSizeBytes: mockGauge,
        cdcEntriesProcessedTotal: mockCounter,
      };

      expect(collection.registry).toBe(mockRegistry);
      expect(collection.queryDurationSeconds).toBe(mockHistogram);
      expect(collection.blocksScannedTotal).toBe(mockCounter);
    });
  });
});

describe('types are exported from core index', () => {
  it('should re-export all types from index', async () => {
    // Import from the main index to verify re-exports
    const coreExports = await import('../index.js');

    // The types are exported as type-only, so we can't check them at runtime
    // But we can verify the module loads without errors
    expect(coreExports).toBeDefined();
  });
});
