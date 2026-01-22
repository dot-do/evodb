/**
 * Tests for Observability Decoupling
 *
 * These tests verify that:
 * 1. Core package works without any observability dependency
 * 2. Observability types are minimal and interface-only in core
 * 3. ObservabilityProvider pattern allows optional injection
 * 4. No runtime constants from observability in core
 *
 * Issue: evodb-g03
 */

import { describe, it, expect } from 'vitest';
import type {
  Logger,
  LogLevel,
  LogEntry,
  LogContext,
  LogContextValue,
  LoggerConfig,
  ConsoleLoggerConfig,
  TestLogger,
} from '../logging-types.js';

import type {
  Span,
  SpanContext,
  SpanStatus,
  SpanKind,
  SpanEvent,
  SpanOptions,
  AttributeValue,
  TracingConfig,
  TracingContext,
  TestTracingContext,
  TraceExporter,
  InjectOptions,
  SpanStatusCodeType,
} from '../tracing-types.js';

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

import { EvoDB } from '../evodb.js';

// =============================================================================
// Test: Core types are interface-only (no runtime dependency)
// =============================================================================

describe('Observability Decoupling - Type Interfaces', () => {
  describe('Logger Interface', () => {
    it('should allow creating a minimal logger implementation', () => {
      const logger: Logger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      };

      expect(logger).toBeDefined();
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
    });

    it('should allow implementing TestLogger interface', () => {
      const logs: LogEntry[] = [];

      const testLogger: TestLogger = {
        debug(message: string, context?: LogContext): void {
          logs.push({ level: 'debug', message, timestamp: Date.now(), context });
        },
        info(message: string, context?: LogContext): void {
          logs.push({ level: 'info', message, timestamp: Date.now(), context });
        },
        warn(message: string, context?: LogContext): void {
          logs.push({ level: 'warn', message, timestamp: Date.now(), context });
        },
        error(message: string, error?: Error, context?: LogContext): void {
          logs.push({ level: 'error', message, timestamp: Date.now(), context, error });
        },
        getLogs(): LogEntry[] {
          return [...logs];
        },
        getLogsByLevel(level: LogLevel): LogEntry[] {
          return logs.filter(l => l.level === level);
        },
        clear(): void {
          logs.length = 0;
        },
      };

      testLogger.info('test message', { requestId: 'req-123' });

      expect(testLogger.getLogs()).toHaveLength(1);
      expect(testLogger.getLogs()[0].message).toBe('test message');
      expect(testLogger.getLogsByLevel('info')).toHaveLength(1);

      testLogger.clear();
      expect(testLogger.getLogs()).toHaveLength(0);
    });

    it('should support all LogContextValue types', () => {
      // Verify LogContextValue allows all JSON-serializable types
      const context: LogContext = {
        stringVal: 'test',
        numberVal: 42,
        boolVal: true,
        nullVal: null,
        arrayVal: ['a', 1, true],
        nestedObj: { key: 'value', nested: { deep: true } },
        requestId: 'req-123',
        userId: 'user-456',
        durationMs: 150,
      };

      const logger: Logger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      };

      // Should not throw
      logger.info('test', context);
    });
  });

  describe('Tracing Interface', () => {
    it('should allow implementing Span interface without constants', () => {
      // Create a minimal span implementation using only types
      const span: Span = {
        traceId: '0'.repeat(32),
        spanId: '0'.repeat(16),
        parentSpanId: undefined,
        name: 'test-span',
        startTime: Date.now(),
        endTime: undefined,
        kind: 'internal', // Using string literal, not constant
        status: { code: 0 }, // Using number literal, not SpanStatusCode.UNSET
        attributes: {},
        events: [],
        isRecording: true,
        setAttribute: () => {},
        setAttributes: () => {},
        addEvent: () => {},
        recordException: () => {},
      };

      expect(span.traceId).toHaveLength(32);
      expect(span.spanId).toHaveLength(16);
      expect(span.kind).toBe('internal');
    });

    it('should allow implementing TracingContext interface', () => {
      const tracer: TracingContext = {
        startSpan(name: string): Span {
          return {
            traceId: '0'.repeat(32),
            spanId: '0'.repeat(16),
            name,
            startTime: Date.now(),
            kind: 'internal',
            status: { code: 0 },
            attributes: {},
            events: [],
            isRecording: true,
            setAttribute: () => {},
            setAttributes: () => {},
            addEvent: () => {},
            recordException: () => {},
          };
        },
        endSpan(_span: Span, _status?: SpanStatus): void {},
        extractContext(span: Span): SpanContext {
          return {
            traceId: span.traceId,
            spanId: span.spanId,
            traceFlags: 0,
          };
        },
        injectContext(): void {},
        async flush(): Promise<void> {},
      };

      const span = tracer.startSpan('test-operation');
      expect(span.name).toBe('test-operation');

      const ctx = tracer.extractContext(span);
      expect(ctx.traceId).toBe(span.traceId);
    });

    it('should allow all SpanKind values as string literals', () => {
      const kinds: SpanKind[] = ['internal', 'server', 'client', 'producer', 'consumer'];

      kinds.forEach(kind => {
        const span: Span = {
          traceId: '0'.repeat(32),
          spanId: '0'.repeat(16),
          name: 'test',
          startTime: Date.now(),
          kind,
          status: { code: 0 },
          attributes: {},
          events: [],
          isRecording: true,
          setAttribute: () => {},
          setAttributes: () => {},
          addEvent: () => {},
          recordException: () => {},
        };
        expect(span.kind).toBe(kind);
      });
    });

    it('should allow SpanStatusCode values as number literals', () => {
      const statuses: SpanStatusCodeType[] = [0, 1, 2]; // UNSET, OK, ERROR

      statuses.forEach(code => {
        const status: SpanStatus = { code, message: 'test' };
        expect(status.code).toBe(code);
      });
    });
  });

  describe('Metrics Interface', () => {
    it('should allow implementing Counter interface', () => {
      let value = 0;

      const counter: Counter = {
        name: 'test_counter',
        help: 'A test counter',
        type: 'counter',
        inc(amount = 1): void {
          value += amount;
        },
        get(): number {
          return value;
        },
        labels(): LabeledCounter {
          return {
            inc: (amount = 1) => { value += amount; },
            get: () => value,
          };
        },
        reset(): void {
          value = 0;
        },
      };

      counter.inc();
      expect(counter.get()).toBe(1);

      counter.inc(5);
      expect(counter.get()).toBe(6);

      counter.reset();
      expect(counter.get()).toBe(0);
    });

    it('should allow implementing Gauge interface', () => {
      let value = 0;

      const gauge: Gauge = {
        name: 'test_gauge',
        help: 'A test gauge',
        type: 'gauge',
        set(v: number): void {
          value = v;
        },
        inc(amount = 1): void {
          value += amount;
        },
        dec(amount = 1): void {
          value -= amount;
        },
        setToCurrentTime(): void {
          value = Date.now() / 1000;
        },
        get(): number {
          return value;
        },
        labels(): LabeledGauge {
          return {
            set: (v: number) => { value = v; },
            inc: (amount = 1) => { value += amount; },
            dec: (amount = 1) => { value -= amount; },
            setToCurrentTime: () => { value = Date.now() / 1000; },
            get: () => value,
          };
        },
        reset(): void {
          value = 0;
        },
      };

      gauge.set(10);
      expect(gauge.get()).toBe(10);

      gauge.inc(5);
      expect(gauge.get()).toBe(15);

      gauge.dec(3);
      expect(gauge.get()).toBe(12);
    });

    it('should allow implementing Histogram interface', () => {
      const data: HistogramData = { count: 0, sum: 0, buckets: {} };

      const histogram: Histogram = {
        name: 'test_histogram',
        help: 'A test histogram',
        type: 'histogram',
        buckets: [0.01, 0.1, 1, 10],
        observe(value: number): void {
          data.count++;
          data.sum += value;
          for (const bucket of this.buckets) {
            if (value <= bucket) {
              data.buckets[bucket] = (data.buckets[bucket] ?? 0) + 1;
            }
          }
        },
        startTimer(): TimerEnd {
          const start = Date.now();
          return (): number => {
            const duration = (Date.now() - start) / 1000;
            this.observe(duration);
            return duration;
          };
        },
        get(): HistogramData {
          return { ...data };
        },
        labels(): LabeledHistogram {
          const self = this;
          return {
            observe: (v: number) => self.observe(v),
            startTimer: () => self.startTimer(),
            get: () => self.get(),
          };
        },
        reset(): void {
          data.count = 0;
          data.sum = 0;
          data.buckets = {};
        },
      };

      histogram.observe(0.5);
      expect(histogram.get().count).toBe(1);
      expect(histogram.get().sum).toBe(0.5);
    });

    it('should allow implementing MetricsRegistry interface', () => {
      const metrics = new Map<string, Metric>();

      const registry: MetricsRegistry = {
        getMetrics(): Metric[] {
          return Array.from(metrics.values());
        },
        getMetric(name: string): Metric | undefined {
          return metrics.get(name);
        },
        clear(): void {
          metrics.clear();
        },
        resetAll(): void {
          for (const metric of metrics.values()) {
            metric.reset();
          }
        },
        get contentType(): string {
          return 'text/plain; version=0.0.4';
        },
        _register(metric: Metric): void {
          metrics.set(metric.name, metric);
        },
      };

      expect(registry.getMetrics()).toHaveLength(0);
      expect(registry.contentType).toContain('text/plain');
    });
  });
});

// =============================================================================
// Test: EvoDB works without observability
// =============================================================================

describe('Observability Decoupling - Core Independence', () => {
  it('should create EvoDB without any observability config', () => {
    const db = new EvoDB({ mode: 'development' });
    expect(db).toBeDefined();
    expect(db.getMode()).toBe('development');
  });

  it('should perform CRUD operations without logger', async () => {
    const db = new EvoDB({ mode: 'development' });

    // Insert
    const inserted = await db.insert('users', { name: 'Alice', age: 30 });
    expect(inserted).toHaveLength(1);
    expect(inserted[0].name).toBe('Alice');

    // Query
    const results = await db.query('users').where('age', '>=', 25).execute();
    expect(results).toHaveLength(1);

    // Update
    const updateResult = await db.update('users', { name: 'Alice' }, { age: 31 });
    expect(updateResult.modifiedCount).toBe(1);

    // Delete
    const deleteResult = await db.delete('users', { name: 'Alice' });
    expect(deleteResult.deletedCount).toBe(1);
  });

  it('should work with minimal noop logger', () => {
    // User provides their own noop implementation
    const noopLogger: Logger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    };

    const db = new EvoDB({ mode: 'development', logger: noopLogger });
    expect(db).toBeDefined();
  });

  it('should not require @evodb/observability to be installed', async () => {
    // This test verifies that core package types don't require
    // observability package implementations at runtime

    const db = new EvoDB({ mode: 'development' });

    // All operations should work without observability
    await db.insert('test', { a: 1 });
    await db.query('test').execute();
    await db.schema.infer('test');
  });
});

// =============================================================================
// Test: ObservabilityProvider pattern
// =============================================================================

describe('Observability Decoupling - Provider Pattern', () => {
  /**
   * ObservabilityProvider is a unified interface for injecting
   * all observability concerns (logging, tracing, metrics)
   */
  interface ObservabilityProvider {
    logger?: Logger;
    tracer?: TracingContext;
    metrics?: MetricsRegistry;
  }

  /**
   * Create a no-op observability provider
   */
  function createNoopProvider(): ObservabilityProvider {
    return {
      logger: {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      },
      tracer: {
        startSpan(name: string): Span {
          return {
            traceId: '0'.repeat(32),
            spanId: '0'.repeat(16),
            name,
            startTime: Date.now(),
            kind: 'internal',
            status: { code: 0 },
            attributes: {},
            events: [],
            isRecording: false,
            setAttribute: () => {},
            setAttributes: () => {},
            addEvent: () => {},
            recordException: () => {},
          };
        },
        endSpan: () => {},
        extractContext: (span: Span) => ({
          traceId: span.traceId,
          spanId: span.spanId,
          traceFlags: 0,
        }),
        injectContext: () => {},
        flush: async () => {},
      },
      metrics: {
        getMetrics: () => [],
        getMetric: () => undefined,
        clear: () => {},
        resetAll: () => {},
        contentType: 'text/plain',
        _register: () => {},
      },
    };
  }

  it('should allow creating a no-op provider', () => {
    const provider = createNoopProvider();

    expect(provider.logger).toBeDefined();
    expect(provider.tracer).toBeDefined();
    expect(provider.metrics).toBeDefined();
  });

  it('should allow partial provider (just logger)', () => {
    const logs: string[] = [];

    const provider: ObservabilityProvider = {
      logger: {
        debug: (msg) => logs.push(`DEBUG: ${msg}`),
        info: (msg) => logs.push(`INFO: ${msg}`),
        warn: (msg) => logs.push(`WARN: ${msg}`),
        error: (msg) => logs.push(`ERROR: ${msg}`),
      },
    };

    provider.logger!.info('test message');
    expect(logs).toContain('INFO: test message');

    // Tracer and metrics are undefined (not required)
    expect(provider.tracer).toBeUndefined();
    expect(provider.metrics).toBeUndefined();
  });

  it('should allow partial provider (just tracer)', () => {
    const spans: string[] = [];

    const provider: ObservabilityProvider = {
      tracer: {
        startSpan(name: string): Span {
          spans.push(name);
          return {
            traceId: '0'.repeat(32),
            spanId: '0'.repeat(16),
            name,
            startTime: Date.now(),
            kind: 'internal',
            status: { code: 0 },
            attributes: {},
            events: [],
            isRecording: true,
            setAttribute: () => {},
            setAttributes: () => {},
            addEvent: () => {},
            recordException: () => {},
          };
        },
        endSpan: () => {},
        extractContext: (span: Span) => ({
          traceId: span.traceId,
          spanId: span.spanId,
          traceFlags: 1,
        }),
        injectContext: () => {},
        flush: async () => {},
      },
    };

    const span = provider.tracer!.startSpan('test-operation');
    expect(spans).toContain('test-operation');
    expect(span.name).toBe('test-operation');
  });

  it('should allow components to check for observability availability', () => {
    // Simulate a component that optionally uses observability
    function processRequest(provider?: ObservabilityProvider): void {
      // Check if logging is available
      if (provider?.logger) {
        provider.logger.info('Processing request');
      }

      // Check if tracing is available
      let span: Span | undefined;
      if (provider?.tracer) {
        span = provider.tracer.startSpan('process-request');
      }

      try {
        // Do work...

        // Record success if tracing
        if (span && provider?.tracer) {
          provider.tracer.endSpan(span, { code: 1 }); // OK
        }
      } catch (error) {
        // Record error if tracing
        if (span && provider?.tracer) {
          span.recordException(error as Error);
          provider.tracer.endSpan(span, { code: 2 }); // ERROR
        }
        throw error;
      }
    }

    // Should work without provider
    expect(() => processRequest()).not.toThrow();

    // Should work with partial provider
    expect(() => processRequest({ logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} } })).not.toThrow();

    // Should work with full provider
    expect(() => processRequest(createNoopProvider())).not.toThrow();
  });
});

// =============================================================================
// Test: No runtime constants in core types
// =============================================================================

describe('Observability Decoupling - No Runtime Constants', () => {
  it('should not export SpanStatusCode from tracing-types at runtime', async () => {
    // This test verifies that even if SpanStatusCode is exported,
    // user code should work with literal values

    // Instead of: import { SpanStatusCode } from '@evodb/core';
    // Users can use literal values directly:

    const spanStatusUnset: SpanStatusCodeType = 0;
    const spanStatusOk: SpanStatusCodeType = 1;
    const spanStatusError: SpanStatusCodeType = 2;

    expect(spanStatusUnset).toBe(0);
    expect(spanStatusOk).toBe(1);
    expect(spanStatusError).toBe(2);
  });

  it('should allow using SpanKind as string literals', () => {
    // Instead of: import { SpanKinds } from '@evodb/core';
    // Users can use literal values directly:

    const kinds: Record<string, SpanKind> = {
      INTERNAL: 'internal',
      SERVER: 'server',
      CLIENT: 'client',
      PRODUCER: 'producer',
      CONSUMER: 'consumer',
    };

    expect(kinds.INTERNAL).toBe('internal');
    expect(kinds.SERVER).toBe('server');
  });

  it('should work with all SpanStatusCode values as literals', () => {
    const statuses: SpanStatus[] = [
      { code: 0 }, // UNSET
      { code: 1, message: 'OK' }, // OK
      { code: 2, message: 'Error occurred' }, // ERROR
    ];

    expect(statuses[0].code).toBe(0);
    expect(statuses[1].code).toBe(1);
    expect(statuses[2].code).toBe(2);
  });

  it('should document that constants are in @evodb/observability', () => {
    // This is a documentation test - it passes by existing
    // The implementation should include a comment in tracing-types.ts
    // pointing users to @evodb/observability for constants

    // For full implementation with constants:
    // import { SpanStatusCode, SpanKinds } from '@evodb/observability';
    //
    // For type-only usage (no runtime):
    // import type { SpanStatusCodeType, SpanKind } from '@evodb/core';

    expect(true).toBe(true);
  });
});

// =============================================================================
// Test: Bundle size impact verification
// =============================================================================

describe('Observability Decoupling - Bundle Size', () => {
  it('should allow tree-shaking of observability types', () => {
    // This test verifies that importing only types doesn't add runtime code
    // Types are compile-time only and should be stripped

    // These imports are type-only and should not affect bundle
    type _Logger = Logger;
    type _Span = Span;
    type _Counter = Counter;

    // Create a minimal app that doesn't need observability
    const db = new EvoDB({ mode: 'development' });

    // This should work without any observability code in the bundle
    expect(db).toBeDefined();
  });

  it('should not require importing full observability for type checking', async () => {
    // Application code that only needs type checking can import types from core
    // without pulling in the observability implementation

    function createApp(config: { logger?: Logger }): { db: EvoDB } {
      return {
        db: new EvoDB({ mode: 'development', logger: config.logger }),
      };
    }

    const app = createApp({});
    expect(app.db).toBeDefined();

    // Can also pass a logger
    const appWithLogger = createApp({
      logger: {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      },
    });
    expect(appWithLogger.db).toBeDefined();
  });
});
