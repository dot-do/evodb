/**
 * Tests for observability metrics export (Prometheus format)
 *
 * Tests for the full metrics implementation including:
 * - Counter, Gauge, and Histogram metric types
 * - Prometheus text format export
 * - Pre-defined EvoDB metrics collection
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  type MetricsRegistry,
  type Counter,
  type Gauge,
  type Histogram,
  type MetricLabels,
  createMetricsRegistry,
  createCounter,
  createGauge,
  createHistogram,
  formatPrometheus,
  // Pre-defined metrics for EvoDB
  EvoDBMetrics,
} from '../metrics.js';

// =============================================================================
// Counter Tests
// =============================================================================

describe('Counter', () => {
  let registry: MetricsRegistry;

  beforeEach(() => {
    registry = createMetricsRegistry();
  });

  describe('basic operations', () => {
    it('should create a counter with name and help', () => {
      const counter = createCounter(registry, {
        name: 'requests_total',
        help: 'Total number of requests',
      });

      expect(counter.name).toBe('requests_total');
      expect(counter.help).toBe('Total number of requests');
    });

    it('should start at zero', () => {
      const counter = createCounter(registry, {
        name: 'requests_total',
        help: 'Total number of requests',
      });

      expect(counter.get()).toBe(0);
    });

    it('should increment by 1 by default', () => {
      const counter = createCounter(registry, {
        name: 'requests_total',
        help: 'Total number of requests',
      });

      counter.inc();

      expect(counter.get()).toBe(1);
    });

    it('should increment by specified value', () => {
      const counter = createCounter(registry, {
        name: 'requests_total',
        help: 'Total number of requests',
      });

      counter.inc(5);

      expect(counter.get()).toBe(5);
    });

    it('should accumulate increments', () => {
      const counter = createCounter(registry, {
        name: 'requests_total',
        help: 'Total number of requests',
      });

      counter.inc(3);
      counter.inc(2);
      counter.inc();

      expect(counter.get()).toBe(6);
    });

    it('should reject negative increments', () => {
      const counter = createCounter(registry, {
        name: 'requests_total',
        help: 'Total number of requests',
      });

      expect(() => counter.inc(-1)).toThrow('Counter cannot be decremented');
    });
  });

  describe('labels', () => {
    it('should support labeled counters', () => {
      const counter = createCounter(registry, {
        name: 'http_requests_total',
        help: 'Total HTTP requests',
        labelNames: ['method', 'status'],
      });

      counter.labels({ method: 'GET', status: '200' }).inc();
      counter.labels({ method: 'POST', status: '201' }).inc(2);

      expect(counter.labels({ method: 'GET', status: '200' }).get()).toBe(1);
      expect(counter.labels({ method: 'POST', status: '201' }).get()).toBe(2);
    });

    it('should track different label combinations independently', () => {
      const counter = createCounter(registry, {
        name: 'errors_total',
        help: 'Total errors',
        labelNames: ['type'],
      });

      counter.labels({ type: 'timeout' }).inc(3);
      counter.labels({ type: 'validation' }).inc(5);

      expect(counter.labels({ type: 'timeout' }).get()).toBe(3);
      expect(counter.labels({ type: 'validation' }).get()).toBe(5);
    });

    it('should return same instance for same labels', () => {
      const counter = createCounter(registry, {
        name: 'requests_total',
        help: 'Total requests',
        labelNames: ['method'],
      });

      const labeled1 = counter.labels({ method: 'GET' });
      const labeled2 = counter.labels({ method: 'GET' });

      labeled1.inc();
      labeled2.inc();

      expect(labeled1.get()).toBe(2);
      expect(labeled2.get()).toBe(2);
    });
  });

  describe('reset', () => {
    it('should reset counter to zero', () => {
      const counter = createCounter(registry, {
        name: 'requests_total',
        help: 'Total requests',
      });

      counter.inc(10);
      counter.reset();

      expect(counter.get()).toBe(0);
    });

    it('should reset all labeled values', () => {
      const counter = createCounter(registry, {
        name: 'requests_total',
        help: 'Total requests',
        labelNames: ['method'],
      });

      counter.labels({ method: 'GET' }).inc(5);
      counter.labels({ method: 'POST' }).inc(3);
      counter.reset();

      expect(counter.labels({ method: 'GET' }).get()).toBe(0);
      expect(counter.labels({ method: 'POST' }).get()).toBe(0);
    });
  });
});

// =============================================================================
// Gauge Tests
// =============================================================================

describe('Gauge', () => {
  let registry: MetricsRegistry;

  beforeEach(() => {
    registry = createMetricsRegistry();
  });

  describe('basic operations', () => {
    it('should create a gauge with name and help', () => {
      const gauge = createGauge(registry, {
        name: 'temperature',
        help: 'Current temperature',
      });

      expect(gauge.name).toBe('temperature');
      expect(gauge.help).toBe('Current temperature');
    });

    it('should start at zero', () => {
      const gauge = createGauge(registry, {
        name: 'temperature',
        help: 'Current temperature',
      });

      expect(gauge.get()).toBe(0);
    });

    it('should set to specified value', () => {
      const gauge = createGauge(registry, {
        name: 'temperature',
        help: 'Current temperature',
      });

      gauge.set(42);

      expect(gauge.get()).toBe(42);
    });

    it('should increment by 1 by default', () => {
      const gauge = createGauge(registry, {
        name: 'connections',
        help: 'Active connections',
      });

      gauge.inc();

      expect(gauge.get()).toBe(1);
    });

    it('should increment by specified value', () => {
      const gauge = createGauge(registry, {
        name: 'connections',
        help: 'Active connections',
      });

      gauge.inc(5);

      expect(gauge.get()).toBe(5);
    });

    it('should decrement by 1 by default', () => {
      const gauge = createGauge(registry, {
        name: 'connections',
        help: 'Active connections',
      });

      gauge.set(10);
      gauge.dec();

      expect(gauge.get()).toBe(9);
    });

    it('should decrement by specified value', () => {
      const gauge = createGauge(registry, {
        name: 'connections',
        help: 'Active connections',
      });

      gauge.set(10);
      gauge.dec(3);

      expect(gauge.get()).toBe(7);
    });

    it('should allow negative values', () => {
      const gauge = createGauge(registry, {
        name: 'temperature',
        help: 'Current temperature',
      });

      gauge.set(-10);

      expect(gauge.get()).toBe(-10);
    });
  });

  describe('labels', () => {
    it('should support labeled gauges', () => {
      const gauge = createGauge(registry, {
        name: 'buffer_size_bytes',
        help: 'Buffer size in bytes',
        labelNames: ['buffer_name'],
      });

      gauge.labels({ buffer_name: 'write' }).set(1024);
      gauge.labels({ buffer_name: 'read' }).set(2048);

      expect(gauge.labels({ buffer_name: 'write' }).get()).toBe(1024);
      expect(gauge.labels({ buffer_name: 'read' }).get()).toBe(2048);
    });
  });

  describe('setToCurrentTime', () => {
    it('should set gauge to current unix timestamp', () => {
      const gauge = createGauge(registry, {
        name: 'last_updated_timestamp',
        help: 'Last update time',
      });

      const before = Date.now() / 1000;
      gauge.setToCurrentTime();
      const after = Date.now() / 1000;

      const value = gauge.get();
      expect(value).toBeGreaterThanOrEqual(before);
      expect(value).toBeLessThanOrEqual(after);
    });
  });
});

// =============================================================================
// Histogram Tests
// =============================================================================

describe('Histogram', () => {
  let registry: MetricsRegistry;

  beforeEach(() => {
    registry = createMetricsRegistry();
  });

  describe('basic operations', () => {
    it('should create a histogram with name and help', () => {
      const histogram = createHistogram(registry, {
        name: 'request_duration_seconds',
        help: 'Request duration in seconds',
      });

      expect(histogram.name).toBe('request_duration_seconds');
      expect(histogram.help).toBe('Request duration in seconds');
    });

    it('should use default buckets', () => {
      const histogram = createHistogram(registry, {
        name: 'request_duration_seconds',
        help: 'Request duration in seconds',
      });

      // Default buckets: .005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5, 10
      expect(histogram.buckets).toEqual([
        0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
      ]);
    });

    it('should accept custom buckets', () => {
      const histogram = createHistogram(registry, {
        name: 'request_duration_seconds',
        help: 'Request duration in seconds',
        buckets: [0.1, 0.5, 1, 2, 5],
      });

      expect(histogram.buckets).toEqual([0.1, 0.5, 1, 2, 5]);
    });

    it('should observe values', () => {
      const histogram = createHistogram(registry, {
        name: 'request_duration_seconds',
        help: 'Request duration in seconds',
        buckets: [0.1, 0.5, 1],
      });

      histogram.observe(0.3);
      histogram.observe(0.7);
      histogram.observe(0.05);

      const data = histogram.get();
      expect(data.count).toBe(3);
      expect(data.sum).toBeCloseTo(1.05, 10);
    });

    it('should populate buckets correctly', () => {
      const histogram = createHistogram(registry, {
        name: 'request_duration_seconds',
        help: 'Request duration in seconds',
        buckets: [0.1, 0.5, 1],
      });

      histogram.observe(0.05); // <= 0.1
      histogram.observe(0.3); // <= 0.5
      histogram.observe(0.7); // <= 1
      histogram.observe(2.0); // > 1 (goes to +Inf)

      const data = histogram.get();
      expect(data.buckets[0.1]).toBe(1); // 0.05
      expect(data.buckets[0.5]).toBe(2); // 0.05, 0.3
      expect(data.buckets[1]).toBe(3); // 0.05, 0.3, 0.7
      expect(data.count).toBe(4);
    });
  });

  describe('labels', () => {
    it('should support labeled histograms', () => {
      const histogram = createHistogram(registry, {
        name: 'request_duration_seconds',
        help: 'Request duration',
        labelNames: ['method'],
        buckets: [0.1, 0.5, 1],
      });

      histogram.labels({ method: 'GET' }).observe(0.3);
      histogram.labels({ method: 'POST' }).observe(0.7);

      const getData = histogram.labels({ method: 'GET' }).get();
      const postData = histogram.labels({ method: 'POST' }).get();

      expect(getData.count).toBe(1);
      expect(getData.sum).toBeCloseTo(0.3, 10);
      expect(postData.count).toBe(1);
      expect(postData.sum).toBeCloseTo(0.7, 10);
    });
  });

  describe('timer', () => {
    it('should provide timer for measuring duration', async () => {
      const histogram = createHistogram(registry, {
        name: 'operation_duration_seconds',
        help: 'Operation duration',
        buckets: [0.01, 0.1, 1],
      });

      const end = histogram.startTimer();

      // Simulate some work
      await new Promise((resolve) => setTimeout(resolve, 50));

      const duration = end();

      expect(duration).toBeGreaterThan(0.04);
      expect(duration).toBeLessThan(0.2);

      const data = histogram.get();
      expect(data.count).toBe(1);
      expect(data.sum).toBeGreaterThan(0.04);
    });

    it('should support timer with labels', async () => {
      const histogram = createHistogram(registry, {
        name: 'operation_duration_seconds',
        help: 'Operation duration',
        labelNames: ['operation'],
        buckets: [0.01, 0.1, 1],
      });

      const end = histogram.labels({ operation: 'query' }).startTimer();

      await new Promise((resolve) => setTimeout(resolve, 20));

      end();

      const data = histogram.labels({ operation: 'query' }).get();
      expect(data.count).toBe(1);
    });
  });

  describe('reset', () => {
    it('should reset histogram data', () => {
      const histogram = createHistogram(registry, {
        name: 'request_duration_seconds',
        help: 'Request duration',
        buckets: [0.1, 0.5, 1],
      });

      histogram.observe(0.3);
      histogram.observe(0.7);
      histogram.reset();

      const data = histogram.get();
      expect(data.count).toBe(0);
      expect(data.sum).toBe(0);
    });
  });
});

// =============================================================================
// MetricsRegistry Tests
// =============================================================================

describe('MetricsRegistry', () => {
  describe('registration', () => {
    it('should create an empty registry', () => {
      const registry = createMetricsRegistry();

      expect(registry.getMetrics()).toHaveLength(0);
    });

    it('should register counters', () => {
      const registry = createMetricsRegistry();

      createCounter(registry, {
        name: 'requests_total',
        help: 'Total requests',
      });

      const metrics = registry.getMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0].name).toBe('requests_total');
      expect(metrics[0].type).toBe('counter');
    });

    it('should register gauges', () => {
      const registry = createMetricsRegistry();

      createGauge(registry, {
        name: 'temperature',
        help: 'Current temperature',
      });

      const metrics = registry.getMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0].name).toBe('temperature');
      expect(metrics[0].type).toBe('gauge');
    });

    it('should register histograms', () => {
      const registry = createMetricsRegistry();

      createHistogram(registry, {
        name: 'duration_seconds',
        help: 'Duration in seconds',
      });

      const metrics = registry.getMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0].name).toBe('duration_seconds');
      expect(metrics[0].type).toBe('histogram');
    });

    it('should prevent duplicate metric names', () => {
      const registry = createMetricsRegistry();

      createCounter(registry, {
        name: 'requests_total',
        help: 'Total requests',
      });

      expect(() =>
        createCounter(registry, {
          name: 'requests_total',
          help: 'Duplicate counter',
        })
      ).toThrow('Metric requests_total already registered');
    });

    it('should get metric by name', () => {
      const registry = createMetricsRegistry();

      const counter = createCounter(registry, {
        name: 'requests_total',
        help: 'Total requests',
      });

      const retrieved = registry.getMetric('requests_total');
      expect(retrieved).toBe(counter);
    });

    it('should return undefined for unknown metric', () => {
      const registry = createMetricsRegistry();

      const retrieved = registry.getMetric('unknown_metric');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('clear', () => {
    it('should clear all registered metrics', () => {
      const registry = createMetricsRegistry();

      createCounter(registry, { name: 'counter1', help: 'Counter 1' });
      createGauge(registry, { name: 'gauge1', help: 'Gauge 1' });

      registry.clear();

      expect(registry.getMetrics()).toHaveLength(0);
    });
  });

  describe('resetAll', () => {
    it('should reset all metric values', () => {
      const registry = createMetricsRegistry();

      const counter = createCounter(registry, {
        name: 'requests_total',
        help: 'Total requests',
      });
      const gauge = createGauge(registry, {
        name: 'connections',
        help: 'Active connections',
      });

      counter.inc(10);
      gauge.set(5);

      registry.resetAll();

      expect(counter.get()).toBe(0);
      expect(gauge.get()).toBe(0);
    });
  });
});

// =============================================================================
// Prometheus Format Export Tests
// =============================================================================

describe('Prometheus Format Export', () => {
  describe('formatPrometheus', () => {
    it('should format counter without labels', () => {
      const registry = createMetricsRegistry();

      const counter = createCounter(registry, {
        name: 'requests_total',
        help: 'Total number of requests',
      });
      counter.inc(42);

      const output = formatPrometheus(registry);

      expect(output).toContain('# HELP requests_total Total number of requests');
      expect(output).toContain('# TYPE requests_total counter');
      expect(output).toContain('requests_total 42');
    });

    it('should format counter with labels', () => {
      const registry = createMetricsRegistry();

      const counter = createCounter(registry, {
        name: 'http_requests_total',
        help: 'Total HTTP requests',
        labelNames: ['method', 'status'],
      });
      counter.labels({ method: 'GET', status: '200' }).inc(100);
      counter.labels({ method: 'POST', status: '201' }).inc(25);

      const output = formatPrometheus(registry);

      expect(output).toContain('# HELP http_requests_total Total HTTP requests');
      expect(output).toContain('# TYPE http_requests_total counter');
      expect(output).toContain('http_requests_total{method="GET",status="200"} 100');
      expect(output).toContain('http_requests_total{method="POST",status="201"} 25');
    });

    it('should format gauge', () => {
      const registry = createMetricsRegistry();

      const gauge = createGauge(registry, {
        name: 'buffer_size_bytes',
        help: 'Current buffer size in bytes',
      });
      gauge.set(1024);

      const output = formatPrometheus(registry);

      expect(output).toContain('# HELP buffer_size_bytes Current buffer size in bytes');
      expect(output).toContain('# TYPE buffer_size_bytes gauge');
      expect(output).toContain('buffer_size_bytes 1024');
    });

    it('should format histogram', () => {
      const registry = createMetricsRegistry();

      const histogram = createHistogram(registry, {
        name: 'request_duration_seconds',
        help: 'Request duration in seconds',
        buckets: [0.1, 0.5, 1],
      });
      histogram.observe(0.05);
      histogram.observe(0.3);
      histogram.observe(0.7);

      const output = formatPrometheus(registry);

      expect(output).toContain('# HELP request_duration_seconds Request duration in seconds');
      expect(output).toContain('# TYPE request_duration_seconds histogram');
      expect(output).toContain('request_duration_seconds_bucket{le="0.1"} 1');
      expect(output).toContain('request_duration_seconds_bucket{le="0.5"} 2');
      expect(output).toContain('request_duration_seconds_bucket{le="1"} 3');
      expect(output).toContain('request_duration_seconds_bucket{le="+Inf"} 3');
      expect(output).toContain('request_duration_seconds_sum');
      expect(output).toContain('request_duration_seconds_count 3');
    });

    it('should format histogram with labels', () => {
      const registry = createMetricsRegistry();

      const histogram = createHistogram(registry, {
        name: 'request_duration_seconds',
        help: 'Request duration in seconds',
        labelNames: ['method'],
        buckets: [0.1, 0.5, 1],
      });
      histogram.labels({ method: 'GET' }).observe(0.3);

      const output = formatPrometheus(registry);

      // Labels are sorted alphabetically, so 'le' comes before 'method'
      expect(output).toContain('request_duration_seconds_bucket{le="0.1",method="GET"} 0');
      expect(output).toContain('request_duration_seconds_bucket{le="0.5",method="GET"} 1');
      expect(output).toContain('request_duration_seconds_sum{method="GET"}');
      expect(output).toContain('request_duration_seconds_count{method="GET"} 1');
    });

    it('should escape special characters in labels', () => {
      const registry = createMetricsRegistry();

      const counter = createCounter(registry, {
        name: 'requests_total',
        help: 'Total requests',
        labelNames: ['path'],
      });
      counter.labels({ path: '/api/users?id=1&name="test"' }).inc();

      const output = formatPrometheus(registry);

      // Prometheus requires escaping backslash, newline, and double-quote in label values
      expect(output).toContain('path="/api/users?id=1&name=\\"test\\""');
    });

    it('should handle empty registry', () => {
      const registry = createMetricsRegistry();

      const output = formatPrometheus(registry);

      expect(output).toBe('');
    });

    it('should format multiple metrics', () => {
      const registry = createMetricsRegistry();

      const counter = createCounter(registry, {
        name: 'requests_total',
        help: 'Total requests',
      });
      const gauge = createGauge(registry, {
        name: 'connections',
        help: 'Active connections',
      });

      counter.inc(10);
      gauge.set(5);

      const output = formatPrometheus(registry);

      expect(output).toContain('requests_total 10');
      expect(output).toContain('connections 5');
    });

    it('should return valid content type', () => {
      const registry = createMetricsRegistry();

      expect(registry.contentType).toBe('text/plain; version=0.0.4; charset=utf-8');
    });
  });
});

// =============================================================================
// EvoDB Pre-defined Metrics Tests
// =============================================================================

describe('EvoDBMetrics', () => {
  it('should create all required metrics', () => {
    const metrics = EvoDBMetrics.create();

    expect(metrics.queryDurationSeconds).toBeDefined();
    expect(metrics.blocksScannedTotal).toBeDefined();
    expect(metrics.cacheHitsTotal).toBeDefined();
    expect(metrics.cacheMissesTotal).toBeDefined();
    expect(metrics.bufferSizeBytes).toBeDefined();
    expect(metrics.cdcEntriesProcessedTotal).toBeDefined();
  });

  describe('queryDurationSeconds', () => {
    it('should be a histogram with appropriate buckets', () => {
      const metrics = EvoDBMetrics.create();

      expect(metrics.queryDurationSeconds.name).toBe('evodb_query_duration_seconds');
      expect(metrics.queryDurationSeconds.help).toBe('Duration of query execution in seconds');
      // Query-specific buckets for sub-second to multi-second queries
      expect(metrics.queryDurationSeconds.buckets).toContain(0.001);
      expect(metrics.queryDurationSeconds.buckets).toContain(0.01);
      expect(metrics.queryDurationSeconds.buckets).toContain(0.1);
      expect(metrics.queryDurationSeconds.buckets).toContain(1);
    });

    it('should support table label', () => {
      const metrics = EvoDBMetrics.create();

      metrics.queryDurationSeconds.labels({ table: 'users' }).observe(0.05);

      const data = metrics.queryDurationSeconds.labels({ table: 'users' }).get();
      expect(data.count).toBe(1);
    });
  });

  describe('blocksScannedTotal', () => {
    it('should be a counter', () => {
      const metrics = EvoDBMetrics.create();

      expect(metrics.blocksScannedTotal.name).toBe('evodb_blocks_scanned_total');
      expect(metrics.blocksScannedTotal.help).toBe('Total number of blocks scanned');
    });

    it('should support table label', () => {
      const metrics = EvoDBMetrics.create();

      metrics.blocksScannedTotal.labels({ table: 'events' }).inc(10);

      expect(metrics.blocksScannedTotal.labels({ table: 'events' }).get()).toBe(10);
    });
  });

  describe('cacheHitsTotal and cacheMissesTotal', () => {
    it('should be counters with cache_type label', () => {
      const metrics = EvoDBMetrics.create();

      expect(metrics.cacheHitsTotal.name).toBe('evodb_cache_hits_total');
      expect(metrics.cacheMissesTotal.name).toBe('evodb_cache_misses_total');

      metrics.cacheHitsTotal.labels({ cache_type: 'block' }).inc(100);
      metrics.cacheMissesTotal.labels({ cache_type: 'block' }).inc(5);

      expect(metrics.cacheHitsTotal.labels({ cache_type: 'block' }).get()).toBe(100);
      expect(metrics.cacheMissesTotal.labels({ cache_type: 'block' }).get()).toBe(5);
    });
  });

  describe('bufferSizeBytes', () => {
    it('should be a gauge', () => {
      const metrics = EvoDBMetrics.create();

      expect(metrics.bufferSizeBytes.name).toBe('evodb_buffer_size_bytes');
      expect(metrics.bufferSizeBytes.help).toBe('Current buffer size in bytes');
    });

    it('should support buffer_name label', () => {
      const metrics = EvoDBMetrics.create();

      metrics.bufferSizeBytes.labels({ buffer_name: 'write' }).set(1024);
      metrics.bufferSizeBytes.labels({ buffer_name: 'read' }).set(2048);

      expect(metrics.bufferSizeBytes.labels({ buffer_name: 'write' }).get()).toBe(1024);
      expect(metrics.bufferSizeBytes.labels({ buffer_name: 'read' }).get()).toBe(2048);
    });
  });

  describe('cdcEntriesProcessedTotal', () => {
    it('should be a counter', () => {
      const metrics = EvoDBMetrics.create();

      expect(metrics.cdcEntriesProcessedTotal.name).toBe('evodb_cdc_entries_processed_total');
      expect(metrics.cdcEntriesProcessedTotal.help).toBe(
        'Total number of CDC entries processed'
      );
    });

    it('should support operation label', () => {
      const metrics = EvoDBMetrics.create();

      metrics.cdcEntriesProcessedTotal.labels({ operation: 'insert' }).inc(1000);
      metrics.cdcEntriesProcessedTotal.labels({ operation: 'update' }).inc(500);

      expect(metrics.cdcEntriesProcessedTotal.labels({ operation: 'insert' }).get()).toBe(1000);
      expect(metrics.cdcEntriesProcessedTotal.labels({ operation: 'update' }).get()).toBe(500);
    });
  });

  describe('registry access', () => {
    it('should provide access to the registry', () => {
      const metrics = EvoDBMetrics.create();

      const output = formatPrometheus(metrics.registry);

      expect(output).toContain('evodb_query_duration_seconds');
      expect(output).toContain('evodb_blocks_scanned_total');
      expect(output).toContain('evodb_cache_hits_total');
      expect(output).toContain('evodb_cache_misses_total');
      expect(output).toContain('evodb_buffer_size_bytes');
      expect(output).toContain('evodb_cdc_entries_processed_total');
    });
  });

  describe('custom registry', () => {
    it('should accept a custom registry', () => {
      const customRegistry = createMetricsRegistry();
      const metrics = EvoDBMetrics.create(customRegistry);

      expect(metrics.registry).toBe(customRegistry);
      expect(customRegistry.getMetrics().length).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// /metrics Endpoint Helper Tests
// =============================================================================

describe('Metrics Endpoint Helper', () => {
  it('should generate Response for /metrics endpoint', () => {
    const metrics = EvoDBMetrics.create();

    metrics.queryDurationSeconds.labels({ table: 'users' }).observe(0.05);
    metrics.blocksScannedTotal.labels({ table: 'users' }).inc(10);

    const body = formatPrometheus(metrics.registry);
    const contentType = metrics.registry.contentType;

    // Simulate creating a Response (in actual Workers environment)
    expect(typeof body).toBe('string');
    expect(contentType).toBe('text/plain; version=0.0.4; charset=utf-8');
    expect(body).toContain('evodb_query_duration_seconds');
    expect(body).toContain('evodb_blocks_scanned_total');
  });
});

// =============================================================================
// Type Safety Tests
// =============================================================================

describe('Type Safety', () => {
  it('should enforce Counter interface', () => {
    const registry = createMetricsRegistry();

    const counter: Counter = createCounter(registry, {
      name: 'test_counter',
      help: 'Test counter',
    });

    // Type checking - these should compile
    counter.inc();
    counter.inc(5);
    const _value: number = counter.get();
    const _name: string = counter.name;
    const _help: string = counter.help;
    counter.reset();

    // Value is 1 + 5 = 6 (captured before reset)
    expect(_value).toBe(6);
  });

  it('should enforce Gauge interface', () => {
    const registry = createMetricsRegistry();

    const gauge: Gauge = createGauge(registry, {
      name: 'test_gauge',
      help: 'Test gauge',
    });

    // Type checking - these should compile
    gauge.set(10);
    gauge.inc();
    gauge.inc(5);
    gauge.dec();
    gauge.dec(2);
    gauge.setToCurrentTime();
    const _value: number = gauge.get();
    const _name: string = gauge.name;
    const _help: string = gauge.help;

    expect(_name).toBe('test_gauge');
  });

  it('should enforce Histogram interface', () => {
    const registry = createMetricsRegistry();

    const histogram: Histogram = createHistogram(registry, {
      name: 'test_histogram',
      help: 'Test histogram',
      buckets: [0.1, 0.5, 1],
    });

    // Type checking - these should compile
    histogram.observe(0.3);
    const end = histogram.startTimer();
    const _duration: number = end();
    histogram.reset();
    const _data = histogram.get();
    const _name: string = histogram.name;
    const _help: string = histogram.help;
    const _buckets: number[] = histogram.buckets;

    expect(_buckets).toEqual([0.1, 0.5, 1]);
  });

  it('should enforce MetricLabels type', () => {
    const registry = createMetricsRegistry();

    const counter = createCounter(registry, {
      name: 'test_counter',
      help: 'Test counter',
      labelNames: ['method', 'status'],
    });

    // Type checking - these should compile
    const labels: MetricLabels = { method: 'GET', status: '200' };
    counter.labels(labels).inc();

    expect(counter.labels(labels).get()).toBe(1);
  });
});
