/**
 * Tests for Distributed Tracing Framework with OpenTelemetry support
 *
 * TDD RED Phase: These tests define the expected behavior of the tracing framework.
 *
 * Features:
 * - Span creation and lifecycle management
 * - Context propagation across async boundaries
 * - Cross-DO request correlation via trace IDs
 * - OTEL export format support
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  type Span,
  type SpanContext,
  type SpanStatus,
  type SpanKind,
  type TracingConfig,
  type TraceExporter,
  type OTELSpan,
  TracingContext,
  createTracingContext,
  createNoopTracingContext,
  createTestTracingContext,
  generateTraceId,
  generateSpanId,
  SpanStatusCode,
  SpanKinds,
  formatOTEL,
  parseW3CTraceParent,
  createW3CTraceParent,
} from '../tracing.js';

// =============================================================================
// Trace ID and Span ID Generation Tests
// =============================================================================

describe('ID Generation', () => {
  describe('generateTraceId', () => {
    it('should generate a 32-character hex string', () => {
      const traceId = generateTraceId();

      expect(traceId).toHaveLength(32);
      expect(traceId).toMatch(/^[0-9a-f]{32}$/);
    });

    it('should generate unique trace IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateTraceId());
      }

      expect(ids.size).toBe(100);
    });

    it('should not generate all zeros', () => {
      const traceId = generateTraceId();
      expect(traceId).not.toBe('00000000000000000000000000000000');
    });
  });

  describe('generateSpanId', () => {
    it('should generate a 16-character hex string', () => {
      const spanId = generateSpanId();

      expect(spanId).toHaveLength(16);
      expect(spanId).toMatch(/^[0-9a-f]{16}$/);
    });

    it('should generate unique span IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateSpanId());
      }

      expect(ids.size).toBe(100);
    });

    it('should not generate all zeros', () => {
      const spanId = generateSpanId();
      expect(spanId).not.toBe('0000000000000000');
    });
  });
});

// =============================================================================
// Span Creation Tests
// =============================================================================

describe('Span Creation', () => {
  let tracer: TracingContext;

  beforeEach(() => {
    tracer = createTestTracingContext();
  });

  it('should create a span with a name', () => {
    const span = tracer.startSpan('test-operation');

    expect(span.name).toBe('test-operation');
    expect(span.traceId).toHaveLength(32);
    expect(span.spanId).toHaveLength(16);
  });

  it('should create a span with start time', () => {
    const before = Date.now();
    const span = tracer.startSpan('test-operation');
    const after = Date.now();

    expect(span.startTime).toBeGreaterThanOrEqual(before);
    expect(span.startTime).toBeLessThanOrEqual(after);
  });

  it('should create a span with default status unset', () => {
    const span = tracer.startSpan('test-operation');

    expect(span.status.code).toBe(SpanStatusCode.UNSET);
  });

  it('should create a span with default kind internal', () => {
    const span = tracer.startSpan('test-operation');

    expect(span.kind).toBe(SpanKinds.INTERNAL);
  });

  it('should allow specifying span kind', () => {
    const span = tracer.startSpan('http-request', {
      kind: SpanKinds.CLIENT,
    });

    expect(span.kind).toBe(SpanKinds.CLIENT);
  });

  it('should allow setting attributes at creation', () => {
    const span = tracer.startSpan('db-query', {
      attributes: {
        'db.system': 'sqlite',
        'db.operation': 'SELECT',
        'rows.count': 42,
      },
    });

    expect(span.attributes).toEqual({
      'db.system': 'sqlite',
      'db.operation': 'SELECT',
      'rows.count': 42,
    });
  });

  it('should create a root span with no parent', () => {
    const span = tracer.startSpan('root-operation');

    expect(span.parentSpanId).toBeUndefined();
  });
});

// =============================================================================
// Span Lifecycle Tests
// =============================================================================

describe('Span Lifecycle', () => {
  let tracer: ReturnType<typeof createTestTracingContext>;

  beforeEach(() => {
    tracer = createTestTracingContext();
  });

  it('should end a span with end time', () => {
    const span = tracer.startSpan('test-operation');
    const before = Date.now();
    tracer.endSpan(span);
    const after = Date.now();

    expect(span.endTime).toBeDefined();
    expect(span.endTime!).toBeGreaterThanOrEqual(before);
    expect(span.endTime!).toBeLessThanOrEqual(after);
  });

  it('should calculate span duration', () => {
    const span = tracer.startSpan('test-operation');

    // Simulate some work
    const startTime = span.startTime;
    span.startTime = startTime - 100; // Pretend we started 100ms ago

    tracer.endSpan(span);

    const duration = span.endTime! - span.startTime;
    expect(duration).toBeGreaterThanOrEqual(100);
  });

  it('should not allow ending a span twice', () => {
    const span = tracer.startSpan('test-operation');
    tracer.endSpan(span);

    expect(() => tracer.endSpan(span)).toThrow('Span already ended');
  });

  it('should set status on end', () => {
    const span = tracer.startSpan('test-operation');
    tracer.endSpan(span, { code: SpanStatusCode.OK });

    expect(span.status.code).toBe(SpanStatusCode.OK);
  });

  it('should set error status with message', () => {
    const span = tracer.startSpan('test-operation');
    tracer.endSpan(span, {
      code: SpanStatusCode.ERROR,
      message: 'Connection timeout',
    });

    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.status.message).toBe('Connection timeout');
  });

  it('should record completed spans', () => {
    const span1 = tracer.startSpan('operation-1');
    const span2 = tracer.startSpan('operation-2');

    tracer.endSpan(span1);
    tracer.endSpan(span2);

    const spans = tracer.getSpans();
    expect(spans).toHaveLength(2);
    expect(spans.map(s => s.name)).toContain('operation-1');
    expect(spans.map(s => s.name)).toContain('operation-2');
  });
});

// =============================================================================
// Span Attributes and Events Tests
// =============================================================================

describe('Span Attributes and Events', () => {
  let tracer: TracingContext;

  beforeEach(() => {
    tracer = createTestTracingContext();
  });

  it('should allow adding attributes after creation', () => {
    const span = tracer.startSpan('test-operation');

    span.setAttribute('http.method', 'GET');
    span.setAttribute('http.url', '/api/users');
    span.setAttribute('http.status_code', 200);

    expect(span.attributes['http.method']).toBe('GET');
    expect(span.attributes['http.url']).toBe('/api/users');
    expect(span.attributes['http.status_code']).toBe(200);
  });

  it('should allow setting multiple attributes at once', () => {
    const span = tracer.startSpan('test-operation');

    span.setAttributes({
      'http.method': 'POST',
      'http.url': '/api/create',
      'request.size': 1024,
    });

    expect(span.attributes).toMatchObject({
      'http.method': 'POST',
      'http.url': '/api/create',
      'request.size': 1024,
    });
  });

  it('should record events with timestamps', () => {
    const span = tracer.startSpan('test-operation');

    const before = Date.now();
    span.addEvent('cache-miss');
    const after = Date.now();

    expect(span.events).toHaveLength(1);
    expect(span.events[0].name).toBe('cache-miss');
    expect(span.events[0].timestamp).toBeGreaterThanOrEqual(before);
    expect(span.events[0].timestamp).toBeLessThanOrEqual(after);
  });

  it('should record events with attributes', () => {
    const span = tracer.startSpan('test-operation');

    span.addEvent('query-executed', {
      'db.statement': 'SELECT * FROM users',
      'db.rows_affected': 10,
    });

    expect(span.events[0].attributes).toEqual({
      'db.statement': 'SELECT * FROM users',
      'db.rows_affected': 10,
    });
  });

  it('should record exception events', () => {
    const span = tracer.startSpan('test-operation');
    const error = new Error('Something went wrong');

    span.recordException(error);

    expect(span.events).toHaveLength(1);
    expect(span.events[0].name).toBe('exception');
    expect(span.events[0].attributes?.['exception.type']).toBe('Error');
    expect(span.events[0].attributes?.['exception.message']).toBe('Something went wrong');
  });

  it('should not allow modifying ended span', () => {
    const span = tracer.startSpan('test-operation');
    tracer.endSpan(span);

    expect(() => span.setAttribute('key', 'value')).toThrow('Cannot modify ended span');
    expect(() => span.addEvent('event')).toThrow('Cannot modify ended span');
    expect(() => span.recordException(new Error('test'))).toThrow('Cannot modify ended span');
  });
});

// =============================================================================
// Context Propagation Tests
// =============================================================================

describe('Context Propagation', () => {
  let tracer: ReturnType<typeof createTestTracingContext>;

  beforeEach(() => {
    tracer = createTestTracingContext();
  });

  it('should create child spans with same trace ID', () => {
    const parentSpan = tracer.startSpan('parent-operation');
    const childSpan = tracer.startSpan('child-operation', {
      parent: parentSpan,
    });

    expect(childSpan.traceId).toBe(parentSpan.traceId);
    expect(childSpan.parentSpanId).toBe(parentSpan.spanId);
  });

  it('should create nested child spans', () => {
    const root = tracer.startSpan('root');
    const child1 = tracer.startSpan('child-1', { parent: root });
    const child2 = tracer.startSpan('child-2', { parent: child1 });

    expect(child2.traceId).toBe(root.traceId);
    expect(child2.parentSpanId).toBe(child1.spanId);
    expect(child1.parentSpanId).toBe(root.spanId);
  });

  it('should extract context for cross-DO propagation', () => {
    const span = tracer.startSpan('outgoing-request');
    const context = tracer.extractContext(span);

    expect(context.traceId).toBe(span.traceId);
    expect(context.spanId).toBe(span.spanId);
    expect(context.traceFlags).toBeDefined();
  });

  it('should inject context into outgoing requests', () => {
    const span = tracer.startSpan('outgoing-request');
    const headers = new Headers();

    tracer.injectContext(span, headers);

    expect(headers.get('traceparent')).toBeDefined();
    expect(headers.get('traceparent')).toContain(span.traceId);
    expect(headers.get('traceparent')).toContain(span.spanId);
  });

  it('should create span from incoming context', () => {
    // Simulate incoming request with trace context
    const incomingTraceId = generateTraceId();
    const incomingSpanId = generateSpanId();

    const context: SpanContext = {
      traceId: incomingTraceId,
      spanId: incomingSpanId,
      traceFlags: 0x01, // sampled
    };

    const span = tracer.startSpan('handle-request', {
      parentContext: context,
    });

    expect(span.traceId).toBe(incomingTraceId);
    expect(span.parentSpanId).toBe(incomingSpanId);
  });

  it('should parse W3C traceparent header', () => {
    const traceparent = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
    const context = parseW3CTraceParent(traceparent);

    expect(context).not.toBeNull();
    expect(context!.traceId).toBe('0af7651916cd43dd8448eb211c80319c');
    expect(context!.spanId).toBe('b7ad6b7169203331');
    expect(context!.traceFlags).toBe(0x01);
  });

  it('should create W3C traceparent header', () => {
    const context: SpanContext = {
      traceId: '0af7651916cd43dd8448eb211c80319c',
      spanId: 'b7ad6b7169203331',
      traceFlags: 0x01,
    };

    const traceparent = createW3CTraceParent(context);

    expect(traceparent).toBe('00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01');
  });

  it('should handle invalid traceparent gracefully', () => {
    const invalidHeaders = [
      'invalid',
      '00-invalid-trace-id-01',
      '00-0af7651916cd43dd8448eb211c80319c-01', // missing span id
      '', // empty
    ];

    for (const header of invalidHeaders) {
      expect(parseW3CTraceParent(header)).toBeNull();
    }
  });
});

// =============================================================================
// Cross-DO Correlation Tests
// =============================================================================

describe('Cross-DO Request Correlation', () => {
  it('should maintain trace ID across DO boundaries', () => {
    const tracer1 = createTestTracingContext();
    const tracer2 = createTestTracingContext();

    // DO 1: Start a trace and make outgoing request
    const do1Span = tracer1.startSpan('do1-handler', {
      kind: SpanKinds.SERVER,
    });

    // Extract context for cross-DO call
    const headers = new Headers();
    tracer1.injectContext(do1Span, headers);

    // DO 2: Receive the request
    const traceparent = headers.get('traceparent')!;
    const incomingContext = parseW3CTraceParent(traceparent)!;

    const do2Span = tracer2.startSpan('do2-handler', {
      kind: SpanKinds.SERVER,
      parentContext: incomingContext,
    });

    // Verify trace correlation
    expect(do2Span.traceId).toBe(do1Span.traceId);
    expect(do2Span.parentSpanId).toBe(do1Span.spanId);
  });

  it('should support tracestate header for vendor-specific data', () => {
    const tracer = createTestTracingContext();
    const span = tracer.startSpan('test');

    const headers = new Headers();
    tracer.injectContext(span, headers, {
      traceState: 'evodb=do-id-123,vendorX=value',
    });

    expect(headers.get('tracestate')).toBe('evodb=do-id-123,vendorX=value');
  });
});

// =============================================================================
// OTEL Export Format Tests
// =============================================================================

describe('OTEL Export Format', () => {
  let tracer: ReturnType<typeof createTestTracingContext>;

  beforeEach(() => {
    tracer = createTestTracingContext();
  });

  it('should export span in OTEL format', () => {
    const span = tracer.startSpan('test-operation', {
      kind: SpanKinds.CLIENT,
      attributes: {
        'http.method': 'GET',
        'http.url': '/api/users',
      },
    });

    span.addEvent('cache-hit');
    tracer.endSpan(span, { code: SpanStatusCode.OK });

    const otelSpans = formatOTEL(tracer.getSpans());

    expect(otelSpans).toHaveLength(1);
    const otelSpan = otelSpans[0];

    expect(otelSpan.traceId).toBe(span.traceId);
    expect(otelSpan.spanId).toBe(span.spanId);
    expect(otelSpan.name).toBe('test-operation');
    expect(otelSpan.kind).toBe(3); // OTEL SpanKind.CLIENT = 3
    expect(otelSpan.startTimeUnixNano).toBeDefined();
    expect(otelSpan.endTimeUnixNano).toBeDefined();
    expect(otelSpan.status).toEqual({ code: 1 }); // OTEL STATUS_CODE_OK = 1
  });

  it('should export attributes in OTEL format', () => {
    const span = tracer.startSpan('test', {
      attributes: {
        'string.attr': 'value',
        'int.attr': 42,
        'float.attr': 3.14,
        'bool.attr': true,
      },
    });
    tracer.endSpan(span);

    const otelSpans = formatOTEL(tracer.getSpans());
    const attrs = otelSpans[0].attributes;

    expect(attrs).toContainEqual({
      key: 'string.attr',
      value: { stringValue: 'value' },
    });
    expect(attrs).toContainEqual({
      key: 'int.attr',
      value: { intValue: 42 },
    });
    expect(attrs).toContainEqual({
      key: 'float.attr',
      value: { doubleValue: 3.14 },
    });
    expect(attrs).toContainEqual({
      key: 'bool.attr',
      value: { boolValue: true },
    });
  });

  it('should export events in OTEL format', () => {
    const span = tracer.startSpan('test');
    span.addEvent('test-event', { 'event.attr': 'value' });
    tracer.endSpan(span);

    const otelSpans = formatOTEL(tracer.getSpans());
    const events = otelSpans[0].events;

    expect(events).toHaveLength(1);
    expect(events![0].name).toBe('test-event');
    expect(events![0].timeUnixNano).toBeDefined();
    expect(events![0].attributes).toContainEqual({
      key: 'event.attr',
      value: { stringValue: 'value' },
    });
  });

  it('should export error status in OTEL format', () => {
    const span = tracer.startSpan('test');
    tracer.endSpan(span, {
      code: SpanStatusCode.ERROR,
      message: 'Connection failed',
    });

    const otelSpans = formatOTEL(tracer.getSpans());

    expect(otelSpans[0].status).toEqual({
      code: 2, // OTEL STATUS_CODE_ERROR = 2
      message: 'Connection failed',
    });
  });

  it('should export parent span ID when present', () => {
    const parent = tracer.startSpan('parent');
    const child = tracer.startSpan('child', { parent });

    tracer.endSpan(child);
    tracer.endSpan(parent);

    const otelSpans = formatOTEL(tracer.getSpans());
    const childOtel = otelSpans.find(s => s.name === 'child')!;

    expect(childOtel.parentSpanId).toBe(parent.spanId);
  });

  it('should generate valid JSON for OTEL collector', () => {
    const span = tracer.startSpan('test', {
      attributes: { 'service.name': 'evodb' },
    });
    tracer.endSpan(span);

    const otelSpans = formatOTEL(tracer.getSpans());
    const json = JSON.stringify(otelSpans);

    expect(() => JSON.parse(json)).not.toThrow();
  });
});

// =============================================================================
// Trace Exporter Tests
// =============================================================================

describe('Trace Exporter', () => {
  it('should export spans to custom exporter', async () => {
    const exportedSpans: Span[] = [];
    const exporter: TraceExporter = {
      export: async (spans) => {
        exportedSpans.push(...spans);
      },
    };

    const tracer = createTracingContext({ exporter });

    const span = tracer.startSpan('test');
    tracer.endSpan(span);

    await tracer.flush();

    expect(exportedSpans).toHaveLength(1);
    expect(exportedSpans[0].name).toBe('test');
  });

  it('should batch export spans', async () => {
    let exportCallCount = 0;
    const exporter: TraceExporter = {
      export: async () => {
        exportCallCount++;
      },
    };

    const tracer = createTracingContext({
      exporter,
      batchSize: 3,
    });

    // Create and end spans
    const span1 = tracer.startSpan('span-1');
    const span2 = tracer.startSpan('span-2');
    tracer.endSpan(span1);
    tracer.endSpan(span2);

    // Flush should export all ended spans
    await tracer.flush();
    expect(exportCallCount).toBe(1); // Flush forces export
  });

  it('should handle exporter errors gracefully', async () => {
    const errorExporter: TraceExporter = {
      export: async () => {
        throw new Error('Export failed');
      },
    };

    const tracer = createTracingContext({ exporter: errorExporter });

    const span = tracer.startSpan('test');
    tracer.endSpan(span);

    // Should not throw
    await expect(tracer.flush()).resolves.not.toThrow();
  });
});

// =============================================================================
// Sampling Tests
// =============================================================================

describe('Sampling', () => {
  it('should respect sampling decision', () => {
    const tracer = createTracingContext({
      sampler: () => false, // Never sample
    });

    const span = tracer.startSpan('test');

    // Non-sampled spans should still be created but marked as not sampled
    expect(span.isRecording).toBe(false);
  });

  it('should propagate sampling decision to child spans', () => {
    const tracer = createTracingContext({
      sampler: () => true, // Always sample
    });

    const parent = tracer.startSpan('parent');
    const child = tracer.startSpan('child', { parent });

    expect(child.isRecording).toBe(true);
  });

  it('should use probability sampler', () => {
    let sampledCount = 0;
    const iterations = 1000;

    for (let i = 0; i < iterations; i++) {
      const tracer = createTracingContext({
        sampler: () => Math.random() < 0.5,
      });
      const span = tracer.startSpan('test');
      if (span.isRecording) sampledCount++;
    }

    // Should be roughly 50% with some variance
    expect(sampledCount).toBeGreaterThan(350);
    expect(sampledCount).toBeLessThan(650);
  });
});

// =============================================================================
// No-op Tracer Tests
// =============================================================================

describe('No-op Tracer', () => {
  it('should create no-op spans that do nothing', () => {
    const tracer = createNoopTracingContext();
    const span = tracer.startSpan('test');

    // Should not throw
    span.setAttribute('key', 'value');
    span.addEvent('event');
    span.recordException(new Error('test'));
    tracer.endSpan(span);

    expect(span.attributes).toEqual({});
    expect(span.events).toEqual([]);
  });

  it('should not record any spans', () => {
    const tracer = createNoopTracingContext();
    const span = tracer.startSpan('test');
    tracer.endSpan(span);

    // No-op tracer should not have getSpans method that returns anything
    // or it should return empty
    expect((tracer as ReturnType<typeof createTestTracingContext>).getSpans?.() ?? []).toHaveLength(0);
  });
});

// =============================================================================
// Test Tracer Tests
// =============================================================================

describe('Test Tracer', () => {
  it('should capture all spans for testing', () => {
    const tracer = createTestTracingContext();

    tracer.startSpan('span-1');
    tracer.startSpan('span-2');
    tracer.startSpan('span-3');

    const spans = tracer.getSpans();
    expect(spans).toHaveLength(3);
  });

  it('should allow clearing captured spans', () => {
    const tracer = createTestTracingContext();

    tracer.startSpan('span-1');
    expect(tracer.getSpans()).toHaveLength(1);

    tracer.clear();
    expect(tracer.getSpans()).toHaveLength(0);
  });

  it('should find spans by name', () => {
    const tracer = createTestTracingContext();

    tracer.startSpan('http-handler');
    tracer.startSpan('db-query');
    tracer.startSpan('http-handler');

    const httpSpans = tracer.getSpansByName('http-handler');
    expect(httpSpans).toHaveLength(2);
  });

  it('should find spans by attribute', () => {
    const tracer = createTestTracingContext();

    const span1 = tracer.startSpan('span-1');
    span1.setAttribute('service.name', 'web');

    const span2 = tracer.startSpan('span-2');
    span2.setAttribute('service.name', 'db');

    const span3 = tracer.startSpan('span-3');
    span3.setAttribute('service.name', 'web');

    const webSpans = tracer.getSpansByAttribute('service.name', 'web');
    expect(webSpans).toHaveLength(2);
  });
});

// =============================================================================
// SpanKind Constants Tests
// =============================================================================

describe('SpanKind Constants', () => {
  it('should export all span kinds', () => {
    expect(SpanKinds.INTERNAL).toBe('internal');
    expect(SpanKinds.SERVER).toBe('server');
    expect(SpanKinds.CLIENT).toBe('client');
    expect(SpanKinds.PRODUCER).toBe('producer');
    expect(SpanKinds.CONSUMER).toBe('consumer');
  });
});

// =============================================================================
// SpanStatusCode Constants Tests
// =============================================================================

describe('SpanStatusCode Constants', () => {
  it('should export all status codes', () => {
    expect(SpanStatusCode.UNSET).toBe(0);
    expect(SpanStatusCode.OK).toBe(1);
    expect(SpanStatusCode.ERROR).toBe(2);
  });
});

// =============================================================================
// Type Safety Tests
// =============================================================================

describe('Type Safety', () => {
  it('should enforce Span interface', () => {
    const tracer = createTestTracingContext();
    const span: Span = tracer.startSpan('test');

    // Type checking - these should compile
    const _traceId: string = span.traceId;
    const _spanId: string = span.spanId;
    const _name: string = span.name;
    const _startTime: number = span.startTime;
    const _kind: SpanKind = span.kind;
    const _status: SpanStatus = span.status;
    const _attributes: Record<string, unknown> = span.attributes;
    const _events: Array<{ name: string; timestamp: number; attributes?: Record<string, unknown> }> = span.events;

    expect(_traceId).toBeDefined();
    expect(_spanId).toBeDefined();
  });

  it('should enforce SpanContext interface', () => {
    const context: SpanContext = {
      traceId: generateTraceId(),
      spanId: generateSpanId(),
      traceFlags: 0x01,
    };

    expect(context.traceId).toHaveLength(32);
    expect(context.spanId).toHaveLength(16);
  });

  it('should enforce TracingConfig interface', () => {
    const config: TracingConfig = {
      serviceName: 'test-service',
      sampler: () => true,
      batchSize: 10,
    };

    expect(config.serviceName).toBe('test-service');
  });
});
