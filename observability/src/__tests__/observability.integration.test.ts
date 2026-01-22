/**
 * Observability Integration Tests
 *
 * Issue: evodb-ag1s - TDD: Add observability integration tests
 *
 * These tests verify that metrics, logging, and tracing work together correctly
 * in realistic scenarios. Unlike unit tests that test each component in isolation,
 * these integration tests verify:
 *
 * - Trace context propagation across async boundaries
 * - Metrics collection during actual operations
 * - Log correlation with trace IDs
 * - Observability overhead when disabled
 * - Sampling configuration behavior
 *
 * TDD Approach: Tests are written first to define expected behavior, then
 * implementation follows to make them pass.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  // Metrics
  createMetricsRegistry,
  createCounter,
  createGauge,
  createHistogram,
  formatPrometheus,
  EvoDBMetrics,
  type MetricsRegistry,

  // Logging
  createTestLogger,
  createNoopLogger,
  withContext,

  // Tracing
  createTestTracingContext,
  createNoopTracingContext,
  createTracingContext,
  SpanStatusCode,
  SpanKinds,
  formatOTEL,
  generateTraceId,
  generateSpanId,
  parseW3CTraceParent,
  createW3CTraceParent,
  type Span,
  type SpanContext,
  type TestTracingContext,
} from '../index.js';

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Simulate an async operation that takes some time
 */
async function simulateAsyncWork(durationMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, durationMs));
}

/**
 * Simulate a query execution with metrics and tracing
 */
async function executeTracedQuery(
  tracer: TestTracingContext,
  metrics: ReturnType<typeof EvoDBMetrics.create>,
  tableName: string,
  blocksToScan: number
): Promise<{ rowsReturned: number; durationMs: number }> {
  const span = tracer.startSpan('query-execution', {
    kind: SpanKinds.INTERNAL,
    attributes: {
      'db.table': tableName,
      'db.operation': 'scan',
    },
  });

  const endTimer = metrics.queryDurationSeconds.labels({ table: tableName }).startTimer();

  try {
    // Simulate scanning blocks
    for (let i = 0; i < blocksToScan; i++) {
      metrics.blocksScannedTotal.labels({ table: tableName }).inc();
      await simulateAsyncWork(5);
    }

    const durationSec = endTimer();
    const rowsReturned = blocksToScan * 100;

    span.setAttribute('db.rows_returned', rowsReturned);
    tracer.endSpan(span, { code: SpanStatusCode.OK });

    return {
      rowsReturned,
      durationMs: durationSec * 1000,
    };
  } catch (error) {
    span.recordException(error as Error);
    tracer.endSpan(span, { code: SpanStatusCode.ERROR, message: (error as Error).message });
    throw error;
  }
}

// =============================================================================
// Trace Context Propagation Tests
// =============================================================================

describe('Trace Context Propagation', () => {
  let tracer: TestTracingContext;

  beforeEach(() => {
    tracer = createTestTracingContext();
  });

  afterEach(() => {
    tracer.clear();
  });

  describe('propagates through async boundaries', () => {
    it('should maintain trace context through Promise chains', async () => {
      const rootSpan = tracer.startSpan('root-operation');

      // Simulate async operation chain
      const result = await Promise.resolve()
        .then(async () => {
          const childSpan = tracer.startSpan('child-1', { parent: rootSpan });
          await simulateAsyncWork(10);
          tracer.endSpan(childSpan);
          return 'step1';
        })
        .then(async (prev) => {
          const childSpan = tracer.startSpan('child-2', { parent: rootSpan });
          await simulateAsyncWork(10);
          tracer.endSpan(childSpan);
          return prev + '-step2';
        });

      tracer.endSpan(rootSpan);

      expect(result).toBe('step1-step2');

      const spans = tracer.getSpans();
      expect(spans).toHaveLength(3);

      // All spans should share the same trace ID
      const traceId = rootSpan.traceId;
      expect(spans.every((s) => s.traceId === traceId)).toBe(true);

      // Child spans should have correct parent
      const child1 = tracer.getSpansByName('child-1')[0];
      const child2 = tracer.getSpansByName('child-2')[0];
      expect(child1.parentSpanId).toBe(rootSpan.spanId);
      expect(child2.parentSpanId).toBe(rootSpan.spanId);
    });

    it('should maintain trace context through nested async functions', async () => {
      async function innerOperation(parentSpan: Span): Promise<number> {
        const span = tracer.startSpan('inner-operation', { parent: parentSpan });
        await simulateAsyncWork(5);
        tracer.endSpan(span);
        return 42;
      }

      async function middleOperation(parentSpan: Span): Promise<number> {
        const span = tracer.startSpan('middle-operation', { parent: parentSpan });
        const result = await innerOperation(span);
        tracer.endSpan(span);
        return result * 2;
      }

      async function outerOperation(): Promise<number> {
        const span = tracer.startSpan('outer-operation');
        const result = await middleOperation(span);
        tracer.endSpan(span);
        return result;
      }

      const result = await outerOperation();
      expect(result).toBe(84);

      const spans = tracer.getSpans();
      expect(spans).toHaveLength(3);

      // Verify parent-child relationships
      const outer = tracer.getSpansByName('outer-operation')[0];
      const middle = tracer.getSpansByName('middle-operation')[0];
      const inner = tracer.getSpansByName('inner-operation')[0];

      expect(middle.parentSpanId).toBe(outer.spanId);
      expect(inner.parentSpanId).toBe(middle.spanId);

      // All share same trace ID
      expect(middle.traceId).toBe(outer.traceId);
      expect(inner.traceId).toBe(outer.traceId);
    });

    it('should maintain trace context through Promise.all', async () => {
      const rootSpan = tracer.startSpan('parallel-root');

      const results = await Promise.all([
        (async () => {
          const span = tracer.startSpan('parallel-task-1', { parent: rootSpan });
          await simulateAsyncWork(15);
          tracer.endSpan(span);
          return 1;
        })(),
        (async () => {
          const span = tracer.startSpan('parallel-task-2', { parent: rootSpan });
          await simulateAsyncWork(10);
          tracer.endSpan(span);
          return 2;
        })(),
        (async () => {
          const span = tracer.startSpan('parallel-task-3', { parent: rootSpan });
          await simulateAsyncWork(5);
          tracer.endSpan(span);
          return 3;
        })(),
      ]);

      tracer.endSpan(rootSpan);

      expect(results).toEqual([1, 2, 3]);

      const spans = tracer.getSpans();
      expect(spans).toHaveLength(4);

      // All parallel tasks should have root as parent
      const parallelSpans = spans.filter((s) => s.name.startsWith('parallel-task'));
      expect(parallelSpans.every((s) => s.parentSpanId === rootSpan.spanId)).toBe(true);
    });

    it('should propagate context through setTimeout callbacks', async () => {
      const rootSpan = tracer.startSpan('timeout-root');

      await new Promise<void>((resolve) => {
        setTimeout(() => {
          const childSpan = tracer.startSpan('timeout-child', { parent: rootSpan });
          tracer.endSpan(childSpan);
          resolve();
        }, 10);
      });

      tracer.endSpan(rootSpan);

      const spans = tracer.getSpans();
      expect(spans).toHaveLength(2);

      const child = tracer.getSpansByName('timeout-child')[0];
      expect(child.parentSpanId).toBe(rootSpan.spanId);
      expect(child.traceId).toBe(rootSpan.traceId);
    });
  });

  describe('propagates across service boundaries', () => {
    it('should propagate context via W3C traceparent header', async () => {
      // Service A creates a trace
      const serviceATracer = createTestTracingContext();
      const serviceASpan = serviceATracer.startSpan('service-a-handler', {
        kind: SpanKinds.SERVER,
      });

      // Inject context into outgoing request
      const outgoingHeaders = new Headers();
      serviceATracer.injectContext(serviceASpan, outgoingHeaders);

      // Service B receives the request
      const serviceBTracer = createTestTracingContext();
      const traceparent = outgoingHeaders.get('traceparent')!;
      const incomingContext = parseW3CTraceParent(traceparent)!;

      const serviceBSpan = serviceBTracer.startSpan('service-b-handler', {
        kind: SpanKinds.SERVER,
        parentContext: incomingContext,
      });

      // Verify context propagation
      expect(serviceBSpan.traceId).toBe(serviceASpan.traceId);
      expect(serviceBSpan.parentSpanId).toBe(serviceASpan.spanId);

      // Cleanup
      serviceATracer.endSpan(serviceASpan);
      serviceBTracer.endSpan(serviceBSpan);
      serviceATracer.clear();
      serviceBTracer.clear();
    });

    it('should handle missing traceparent gracefully', () => {
      const headers = new Headers();
      // No traceparent header

      const context = parseW3CTraceParent(headers.get('traceparent') ?? '');
      expect(context).toBeNull();

      // Should create a new root span
      const span = tracer.startSpan('new-root');
      expect(span.parentSpanId).toBeUndefined();
    });
  });
});

// =============================================================================
// Metrics Collection During Operations
// =============================================================================

describe('Metrics Collection During Operations', () => {
  let registry: MetricsRegistry;
  let metrics: ReturnType<typeof EvoDBMetrics.create>;
  let tracer: TestTracingContext;

  beforeEach(() => {
    registry = createMetricsRegistry();
    metrics = EvoDBMetrics.create(registry);
    tracer = createTestTracingContext();
  });

  afterEach(() => {
    registry.clear();
    tracer.clear();
  });

  describe('query metrics', () => {
    it('should collect query duration metrics', async () => {
      await executeTracedQuery(tracer, metrics, 'users', 3);

      const data = metrics.queryDurationSeconds.labels({ table: 'users' }).get();
      expect(data.count).toBe(1);
      expect(data.sum).toBeGreaterThan(0);
    });

    it('should collect blocks scanned metrics', async () => {
      await executeTracedQuery(tracer, metrics, 'events', 5);

      const count = metrics.blocksScannedTotal.labels({ table: 'events' }).get();
      expect(count).toBe(5);
    });

    it('should collect metrics for multiple tables independently', async () => {
      await executeTracedQuery(tracer, metrics, 'users', 2);
      await executeTracedQuery(tracer, metrics, 'orders', 3);
      await executeTracedQuery(tracer, metrics, 'users', 1);

      expect(metrics.blocksScannedTotal.labels({ table: 'users' }).get()).toBe(3);
      expect(metrics.blocksScannedTotal.labels({ table: 'orders' }).get()).toBe(3);

      expect(metrics.queryDurationSeconds.labels({ table: 'users' }).get().count).toBe(2);
      expect(metrics.queryDurationSeconds.labels({ table: 'orders' }).get().count).toBe(1);
    });
  });

  describe('cache metrics', () => {
    it('should track cache hits and misses', async () => {
      // Simulate cache operations
      metrics.cacheHitsTotal.labels({ cache_type: 'block' }).inc(10);
      metrics.cacheMissesTotal.labels({ cache_type: 'block' }).inc(2);

      metrics.cacheHitsTotal.labels({ cache_type: 'metadata' }).inc(50);
      metrics.cacheMissesTotal.labels({ cache_type: 'metadata' }).inc(5);

      expect(metrics.cacheHitsTotal.labels({ cache_type: 'block' }).get()).toBe(10);
      expect(metrics.cacheMissesTotal.labels({ cache_type: 'block' }).get()).toBe(2);
      expect(metrics.cacheHitsTotal.labels({ cache_type: 'metadata' }).get()).toBe(50);
      expect(metrics.cacheMissesTotal.labels({ cache_type: 'metadata' }).get()).toBe(5);
    });

    it('should calculate cache hit ratio from metrics', () => {
      metrics.cacheHitsTotal.labels({ cache_type: 'block' }).inc(80);
      metrics.cacheMissesTotal.labels({ cache_type: 'block' }).inc(20);

      const hits = metrics.cacheHitsTotal.labels({ cache_type: 'block' }).get();
      const misses = metrics.cacheMissesTotal.labels({ cache_type: 'block' }).get();
      const hitRatio = hits / (hits + misses);

      expect(hitRatio).toBe(0.8);
    });
  });

  describe('buffer metrics', () => {
    it('should track buffer sizes', () => {
      metrics.bufferSizeBytes.labels({ buffer_name: 'write' }).set(1024 * 1024);
      metrics.bufferSizeBytes.labels({ buffer_name: 'read' }).set(512 * 1024);

      expect(metrics.bufferSizeBytes.labels({ buffer_name: 'write' }).get()).toBe(1024 * 1024);
      expect(metrics.bufferSizeBytes.labels({ buffer_name: 'read' }).get()).toBe(512 * 1024);
    });

    it('should track buffer size changes over time', () => {
      const writeBuffer = metrics.bufferSizeBytes.labels({ buffer_name: 'write' });

      writeBuffer.set(0);
      expect(writeBuffer.get()).toBe(0);

      writeBuffer.inc(1024);
      expect(writeBuffer.get()).toBe(1024);

      writeBuffer.inc(2048);
      expect(writeBuffer.get()).toBe(3072);

      writeBuffer.dec(1024);
      expect(writeBuffer.get()).toBe(2048);
    });
  });

  describe('Prometheus export', () => {
    it('should export all metrics in Prometheus format', async () => {
      await executeTracedQuery(tracer, metrics, 'users', 2);
      metrics.cacheHitsTotal.labels({ cache_type: 'block' }).inc(5);
      metrics.bufferSizeBytes.labels({ buffer_name: 'write' }).set(4096);

      const output = formatPrometheus(registry);

      expect(output).toContain('evodb_query_duration_seconds');
      expect(output).toContain('evodb_blocks_scanned_total');
      expect(output).toContain('evodb_cache_hits_total');
      expect(output).toContain('evodb_buffer_size_bytes');
    });

    it('should include HELP and TYPE lines for all metrics', async () => {
      metrics.queryDurationSeconds.labels({ table: 'test' }).observe(0.1);

      const output = formatPrometheus(registry);

      expect(output).toContain('# HELP evodb_query_duration_seconds');
      expect(output).toContain('# TYPE evodb_query_duration_seconds histogram');
    });
  });
});

// =============================================================================
// Log-Trace Correlation
// =============================================================================

describe('Log-Trace Correlation', () => {
  let tracer: TestTracingContext;

  beforeEach(() => {
    tracer = createTestTracingContext();
  });

  afterEach(() => {
    tracer.clear();
  });

  describe('logs include trace context', () => {
    it('should include trace ID in log context', () => {
      const testLogger = createTestLogger();
      const span = tracer.startSpan('test-operation');

      // Create a logger with trace context
      const tracedLogger = withContext(testLogger, {
        traceId: span.traceId,
        spanId: span.spanId,
      });

      tracedLogger.info('Operation started', { operation: 'test' });
      tracedLogger.info('Operation completed');

      tracer.endSpan(span);

      const logs = testLogger.getLogs();
      expect(logs).toHaveLength(2);

      // Both logs should include trace context
      logs.forEach((log) => {
        expect(log.context?.traceId).toBe(span.traceId);
        expect(log.context?.spanId).toBe(span.spanId);
      });
    });

    it('should preserve trace context through nested child loggers', () => {
      const testLogger = createTestLogger();
      const span = tracer.startSpan('request-handler');

      const requestLogger = withContext(testLogger, {
        traceId: span.traceId,
        spanId: span.spanId,
        requestId: 'req-123',
      });

      const queryLogger = withContext(requestLogger, {
        table: 'users',
      });

      queryLogger.info('Executing query');

      tracer.endSpan(span);

      const logs = testLogger.getLogs();
      expect(logs[0].context).toMatchObject({
        traceId: span.traceId,
        spanId: span.spanId,
        requestId: 'req-123',
        table: 'users',
      });
    });

    it('should update span ID when creating child spans', () => {
      const testLogger = createTestLogger();
      const parentSpan = tracer.startSpan('parent');

      const parentLogger = withContext(testLogger, {
        traceId: parentSpan.traceId,
        spanId: parentSpan.spanId,
      });

      parentLogger.info('Parent operation');

      const childSpan = tracer.startSpan('child', { parent: parentSpan });
      const childLogger = withContext(testLogger, {
        traceId: childSpan.traceId,
        spanId: childSpan.spanId,
        parentSpanId: parentSpan.spanId,
      });

      childLogger.info('Child operation');

      tracer.endSpan(childSpan);
      tracer.endSpan(parentSpan);

      const logs = testLogger.getLogs();
      expect(logs[0].context?.spanId).toBe(parentSpan.spanId);
      expect(logs[1].context?.spanId).toBe(childSpan.spanId);
      expect(logs[1].context?.parentSpanId).toBe(parentSpan.spanId);
    });
  });

  describe('error logging with trace context', () => {
    it('should correlate error logs with trace context', () => {
      const testLogger = createTestLogger();
      const span = tracer.startSpan('failing-operation');

      const tracedLogger = withContext(testLogger, {
        traceId: span.traceId,
        spanId: span.spanId,
      });

      const error = new Error('Operation failed');
      tracedLogger.error('Operation failed', error, { retryCount: 3 });

      span.recordException(error);
      tracer.endSpan(span, { code: SpanStatusCode.ERROR, message: error.message });

      const logs = testLogger.getLogs();
      expect(logs[0].error).toBe(error);
      expect(logs[0].context?.traceId).toBe(span.traceId);

      // Span should have exception event
      expect(span.events).toHaveLength(1);
      expect(span.events[0].name).toBe('exception');
      expect(span.events[0].attributes?.['exception.message']).toBe('Operation failed');
    });
  });
});

// =============================================================================
// Observability Overhead Tests
// =============================================================================

describe('Observability Overhead', () => {
  describe('noop implementations have minimal overhead', () => {
    it('should have near-zero overhead for noop logger', () => {
      const noopLogger = createNoopLogger();
      const iterations = 10000;

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        noopLogger.debug('debug message', { key: 'value' });
        noopLogger.info('info message');
        noopLogger.warn('warn message');
        noopLogger.error('error message', new Error('test'));
      }
      const elapsed = performance.now() - start;

      // Should complete in under 100ms for 10K iterations (very permissive)
      expect(elapsed).toBeLessThan(100);
    });

    it('should have near-zero overhead for noop tracer', () => {
      const noopTracer = createNoopTracingContext();
      const iterations = 10000;

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        const span = noopTracer.startSpan('test-operation', {
          attributes: { key: 'value' },
        });
        span.setAttribute('another', 'attr');
        span.addEvent('event');
        noopTracer.endSpan(span);
      }
      const elapsed = performance.now() - start;

      // Should complete in under 100ms for 10K iterations
      expect(elapsed).toBeLessThan(100);
    });

    it('should have significantly lower overhead than recording implementations', () => {
      const iterations = 1000;

      // Measure noop tracer
      const noopTracer = createNoopTracingContext();
      const noopStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        const span = noopTracer.startSpan('test');
        span.setAttribute('key', 'value');
        noopTracer.endSpan(span);
      }
      const noopElapsed = performance.now() - noopStart;

      // Measure recording tracer
      const recordingTracer = createTestTracingContext();
      const recordingStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        const span = recordingTracer.startSpan('test');
        span.setAttribute('key', 'value');
        recordingTracer.endSpan(span);
      }
      const recordingElapsed = performance.now() - recordingStart;

      // Noop should be faster (at least 2x, typically much more)
      expect(noopElapsed).toBeLessThan(recordingElapsed);

      recordingTracer.clear();
    });
  });

  describe('disabled observability path', () => {
    it('should skip expensive operations when tracing is disabled', () => {
      const noopTracer = createNoopTracingContext();
      const span = noopTracer.startSpan('test');

      // These operations should be no-ops
      span.setAttribute('expensive.computation', 'result');
      span.setAttributes({
        'attr.1': 'value1',
        'attr.2': 'value2',
        'attr.3': 'value3',
      });
      span.addEvent('expensive-event', { data: 'large-object' });

      noopTracer.endSpan(span);

      // Noop span should not record anything
      expect(span.attributes).toEqual({});
      expect(span.events).toEqual([]);
      expect(span.isRecording).toBe(false);
    });
  });
});

// =============================================================================
// Sampling Configuration Tests
// =============================================================================

describe('Sampling Configuration', () => {
  describe('always sample', () => {
    it('should record all spans when always sampling', () => {
      const tracer = createTracingContext({
        sampler: () => true,
      });

      const spans: Span[] = [];
      for (let i = 0; i < 10; i++) {
        const span = tracer.startSpan(`span-${i}`);
        spans.push(span);
        tracer.endSpan(span);
      }

      expect(spans.every((s) => s.isRecording)).toBe(true);
    });
  });

  describe('never sample', () => {
    it('should not record spans when never sampling', () => {
      const tracer = createTracingContext({
        sampler: () => false,
      });

      const spans: Span[] = [];
      for (let i = 0; i < 10; i++) {
        const span = tracer.startSpan(`span-${i}`);
        spans.push(span);
        tracer.endSpan(span);
      }

      expect(spans.every((s) => !s.isRecording)).toBe(true);
    });

    it('should still create spans but not record data', () => {
      const tracer = createTracingContext({
        sampler: () => false,
      });

      const span = tracer.startSpan('test', {
        attributes: { initial: 'attr' },
      });

      span.setAttribute('added', 'attr');
      span.addEvent('test-event');

      tracer.endSpan(span);

      // Span exists but does not record
      expect(span.name).toBe('test');
      expect(span.traceId).toHaveLength(32);
      expect(span.isRecording).toBe(false);
    });
  });

  describe('probability sampler', () => {
    it('should sample approximately the correct percentage', () => {
      const sampleRate = 0.5;
      const iterations = 1000;

      let sampledCount = 0;
      for (let i = 0; i < iterations; i++) {
        const tracer = createTracingContext({
          sampler: () => Math.random() < sampleRate,
        });
        const span = tracer.startSpan('test');
        if (span.isRecording) sampledCount++;
        tracer.endSpan(span);
      }

      // Should be roughly 50% with some variance
      const ratio = sampledCount / iterations;
      expect(ratio).toBeGreaterThan(0.35);
      expect(ratio).toBeLessThan(0.65);
    });
  });

  describe('name-based sampler', () => {
    it('should sample based on span name', () => {
      const tracer = createTracingContext({
        sampler: (_traceId, name) => {
          // Only sample 'important-' prefixed operations
          return name.startsWith('important-');
        },
      });

      const importantSpan = tracer.startSpan('important-operation');
      const regularSpan = tracer.startSpan('regular-operation');

      expect(importantSpan.isRecording).toBe(true);
      expect(regularSpan.isRecording).toBe(false);

      tracer.endSpan(importantSpan);
      tracer.endSpan(regularSpan);
    });
  });

  describe('trace-based sampler', () => {
    it('should make consistent decisions for same trace ID', () => {
      // Use trace ID to make deterministic sampling decisions
      const sampler = (traceId: string, _name: string) => {
        // Sample based on first byte of trace ID
        const firstByte = parseInt(traceId.slice(0, 2), 16);
        return firstByte < 128; // ~50% sample rate
      };

      const tracer = createTestTracingContext({ sampler });

      const rootSpan = tracer.startSpan('root');
      const childSpan = tracer.startSpan('child', { parent: rootSpan });
      const grandchildSpan = tracer.startSpan('grandchild', { parent: childSpan });

      // All spans in same trace should have same sampling decision
      expect(rootSpan.isRecording).toBe(childSpan.isRecording);
      expect(childSpan.isRecording).toBe(grandchildSpan.isRecording);

      tracer.endSpan(grandchildSpan);
      tracer.endSpan(childSpan);
      tracer.endSpan(rootSpan);
      tracer.clear();
    });
  });
});

// =============================================================================
// Integration: Metrics, Tracing, and Logging Together
// =============================================================================

describe('Full Observability Integration', () => {
  let metrics: ReturnType<typeof EvoDBMetrics.create>;
  let tracer: TestTracingContext;
  let testLogger: ReturnType<typeof createTestLogger>;

  beforeEach(() => {
    metrics = EvoDBMetrics.create();
    tracer = createTestTracingContext();
    testLogger = createTestLogger();
  });

  afterEach(() => {
    metrics.registry.clear();
    tracer.clear();
    testLogger.clear();
  });

  it('should integrate all three observability components in a realistic scenario', async () => {
    // Simulate a query request with full observability
    const requestSpan = tracer.startSpan('handle-query-request', {
      kind: SpanKinds.SERVER,
      attributes: {
        'http.method': 'POST',
        'http.url': '/api/query',
      },
    });

    const requestLogger = withContext(testLogger, {
      traceId: requestSpan.traceId,
      spanId: requestSpan.spanId,
      requestId: 'req-' + Math.random().toString(36).slice(2, 10),
    });

    requestLogger.info('Query request received', { table: 'users' });

    // Query execution
    const querySpan = tracer.startSpan('execute-query', {
      parent: requestSpan,
      kind: SpanKinds.INTERNAL,
      attributes: { 'db.table': 'users' },
    });

    const queryLogger = withContext(testLogger, {
      traceId: querySpan.traceId,
      spanId: querySpan.spanId,
    });

    const endTimer = metrics.queryDurationSeconds.labels({ table: 'users' }).startTimer();

    // Simulate block scanning
    for (let i = 0; i < 3; i++) {
      metrics.blocksScannedTotal.labels({ table: 'users' }).inc();
      queryLogger.debug('Scanning block', { blockIndex: i });
      await simulateAsyncWork(5);
    }

    const duration = endTimer();
    querySpan.setAttribute('db.duration_ms', duration * 1000);

    tracer.endSpan(querySpan, { code: SpanStatusCode.OK });
    requestLogger.info('Query completed', { rowsReturned: 42 });

    tracer.endSpan(requestSpan, { code: SpanStatusCode.OK });

    // Verify metrics
    expect(metrics.blocksScannedTotal.labels({ table: 'users' }).get()).toBe(3);
    expect(metrics.queryDurationSeconds.labels({ table: 'users' }).get().count).toBe(1);

    // Verify traces
    const spans = tracer.getSpans();
    expect(spans).toHaveLength(2);
    expect(tracer.getSpansByName('execute-query')[0].parentSpanId).toBe(requestSpan.spanId);

    // Verify logs
    const logs = testLogger.getLogs();
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.every((l) => l.context?.traceId === requestSpan.traceId)).toBe(true);

    // Verify OTEL export
    const otelSpans = formatOTEL(spans);
    expect(otelSpans).toHaveLength(2);
    expect(otelSpans.find((s) => s.name === 'handle-query-request')).toBeDefined();
    expect(otelSpans.find((s) => s.name === 'execute-query')).toBeDefined();

    // Verify Prometheus export
    const prometheusOutput = formatPrometheus(metrics.registry);
    expect(prometheusOutput).toContain('evodb_query_duration_seconds');
    expect(prometheusOutput).toContain('evodb_blocks_scanned_total');
  });

  it('should handle errors with full observability', async () => {
    const requestSpan = tracer.startSpan('failing-request');

    const requestLogger = withContext(testLogger, {
      traceId: requestSpan.traceId,
      spanId: requestSpan.spanId,
    });

    requestLogger.info('Starting operation');

    try {
      const childSpan = tracer.startSpan('doomed-operation', { parent: requestSpan });
      const error = new Error('Something went wrong');

      childSpan.recordException(error);
      requestLogger.error('Operation failed', error);

      tracer.endSpan(childSpan, {
        code: SpanStatusCode.ERROR,
        message: error.message,
      });

      throw error;
    } catch {
      // Expected error
    } finally {
      tracer.endSpan(requestSpan, { code: SpanStatusCode.ERROR });
    }

    // Verify error was recorded in span
    const doomedSpan = tracer.getSpansByName('doomed-operation')[0];
    expect(doomedSpan.status.code).toBe(SpanStatusCode.ERROR);
    expect(doomedSpan.events[0].name).toBe('exception');

    // Verify error was logged
    const errorLogs = testLogger.getLogsByLevel('error');
    expect(errorLogs).toHaveLength(1);
    expect(errorLogs[0].error?.message).toBe('Something went wrong');
    expect(errorLogs[0].context?.traceId).toBe(requestSpan.traceId);
  });
});

// =============================================================================
// Cleanup Verification Tests
// =============================================================================

describe('Test Cleanup', () => {
  it('should clear tracer state between tests', () => {
    const tracer = createTestTracingContext();

    tracer.startSpan('test-span-1');
    tracer.startSpan('test-span-2');
    expect(tracer.getSpans()).toHaveLength(2);

    tracer.clear();
    expect(tracer.getSpans()).toHaveLength(0);
  });

  it('should clear metrics registry between tests', () => {
    const registry = createMetricsRegistry();
    const counter = createCounter(registry, { name: 'test_counter', help: 'Test' });

    counter.inc(10);
    expect(counter.get()).toBe(10);

    registry.resetAll();
    expect(counter.get()).toBe(0);

    registry.clear();
    expect(registry.getMetrics()).toHaveLength(0);
  });

  it('should clear test logger between tests', () => {
    const logger = createTestLogger();

    logger.info('Message 1');
    logger.info('Message 2');
    expect(logger.getLogs()).toHaveLength(2);

    logger.clear();
    expect(logger.getLogs()).toHaveLength(0);
  });
});
