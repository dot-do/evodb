/**
 * Distributed Tracing Framework for EvoDB
 *
 * Provides OpenTelemetry-compatible distributed tracing optimized for:
 * - Cloudflare Workers and Durable Objects
 * - Cross-DO request correlation
 * - W3C Trace Context propagation
 * - OTEL export format
 *
 * @example
 * ```typescript
 * import {
 *   createTracingContext,
 *   SpanKinds,
 *   SpanStatusCode,
 *   formatOTEL,
 * } from '@evodb/observability';
 *
 * const tracer = createTracingContext({ serviceName: 'my-service' });
 *
 * // Start a span
 * const span = tracer.startSpan('handle-request', {
 *   kind: SpanKinds.SERVER,
 *   attributes: { 'http.method': 'GET' },
 * });
 *
 * // Do work...
 *
 * // End span with status
 * tracer.endSpan(span, { code: SpanStatusCode.OK });
 *
 * // Export for OTEL collector
 * const otelSpans = formatOTEL(tracer.getSpans());
 * ```
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Span kind indicates the relationship between spans
 */
export type SpanKind = 'internal' | 'server' | 'client' | 'producer' | 'consumer';

/**
 * Span status code (follows OTEL conventions)
 */
export const SpanStatusCode = {
  UNSET: 0,
  OK: 1,
  ERROR: 2,
} as const;

export type SpanStatusCodeType = (typeof SpanStatusCode)[keyof typeof SpanStatusCode];

/**
 * Span kind constants
 */
export const SpanKinds = {
  INTERNAL: 'internal' as const,
  SERVER: 'server' as const,
  CLIENT: 'client' as const,
  PRODUCER: 'producer' as const,
  CONSUMER: 'consumer' as const,
};

/**
 * Span status with optional message
 */
export interface SpanStatus {
  code: SpanStatusCodeType;
  message?: string;
}

/**
 * Span event (timestamped annotation)
 */
export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: Record<string, unknown>;
}

/**
 * Attribute value types supported by spans
 */
export type AttributeValue = string | number | boolean | null | undefined;

/**
 * Span context for propagation
 */
export interface SpanContext {
  traceId: string;
  spanId: string;
  traceFlags: number;
  traceState?: string;
}

/**
 * Span interface - represents a unit of work
 */
export interface Span {
  /** 32-character hex trace ID */
  readonly traceId: string;
  /** 16-character hex span ID */
  readonly spanId: string;
  /** Parent span ID (undefined for root spans) */
  readonly parentSpanId?: string;
  /** Span name */
  readonly name: string;
  /** Start time in milliseconds */
  startTime: number;
  /** End time in milliseconds (undefined until ended) */
  endTime?: number;
  /** Span kind */
  readonly kind: SpanKind;
  /** Span status */
  status: SpanStatus;
  /** Span attributes */
  readonly attributes: Record<string, unknown>;
  /** Span events */
  readonly events: SpanEvent[];
  /** Whether this span is recording (sampled) */
  readonly isRecording: boolean;

  /** Set a single attribute */
  setAttribute(key: string, value: AttributeValue): void;
  /** Set multiple attributes */
  setAttributes(attributes: Record<string, AttributeValue>): void;
  /** Add an event */
  addEvent(name: string, attributes?: Record<string, unknown>): void;
  /** Record an exception */
  recordException(error: Error): void;
}

/**
 * Options for starting a span
 */
export interface SpanOptions {
  /** Span kind */
  kind?: SpanKind;
  /** Initial attributes */
  attributes?: Record<string, AttributeValue>;
  /** Parent span */
  parent?: Span;
  /** Parent context (for cross-process propagation) */
  parentContext?: SpanContext;
}

/**
 * Options for injecting context into headers
 */
export interface InjectOptions {
  traceState?: string;
}

/**
 * Trace exporter interface
 */
export interface TraceExporter {
  export(spans: Span[]): Promise<void>;
}

/**
 * Tracing configuration
 */
export interface TracingConfig {
  /** Service name for span metadata */
  serviceName?: string;
  /** Custom trace exporter */
  exporter?: TraceExporter;
  /** Sampling function (return true to sample) */
  sampler?: (traceId: string, name: string) => boolean;
  /** Batch size for export */
  batchSize?: number;
}

/**
 * Tracing context interface
 */
export interface TracingContext {
  /** Start a new span */
  startSpan(name: string, options?: SpanOptions): Span;
  /** End a span */
  endSpan(span: Span, status?: SpanStatus): void;
  /** Extract context from span for propagation */
  extractContext(span: Span): SpanContext;
  /** Inject context into headers */
  injectContext(span: Span, headers: Headers, options?: InjectOptions): void;
  /** Flush pending spans to exporter */
  flush(): Promise<void>;
}

/**
 * Test tracing context with additional inspection methods
 */
export interface TestTracingContext extends TracingContext {
  /** Get all recorded spans */
  getSpans(): Span[];
  /** Get spans by name */
  getSpansByName(name: string): Span[];
  /** Get spans by attribute */
  getSpansByAttribute(key: string, value: unknown): Span[];
  /** Clear all recorded spans */
  clear(): void;
}

/**
 * OTEL attribute format
 */
export interface OTELAttribute {
  key: string;
  value: {
    stringValue?: string;
    intValue?: number;
    doubleValue?: number;
    boolValue?: boolean;
  };
}

/**
 * OTEL event format
 */
export interface OTELEvent {
  name: string;
  timeUnixNano: string;
  attributes?: OTELAttribute[];
}

/**
 * OTEL span format
 */
export interface OTELSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: OTELAttribute[];
  events?: OTELEvent[];
  status: {
    code: number;
    message?: string;
  };
}

// =============================================================================
// ID Generation
// =============================================================================

/**
 * Generate a random 32-character hex trace ID
 */
export function generateTraceId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // Ensure non-zero
  if (bytes.every(b => b === 0)) {
    bytes[0] = 1;
  }

  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate a random 16-character hex span ID
 */
export function generateSpanId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);

  // Ensure non-zero
  if (bytes.every(b => b === 0)) {
    bytes[0] = 1;
  }

  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// =============================================================================
// W3C Trace Context
// =============================================================================

/**
 * Parse W3C traceparent header
 *
 * Format: version-traceid-spanid-traceflags
 * Example: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01
 */
export function parseW3CTraceParent(header: string): SpanContext | null {
  if (!header || typeof header !== 'string') {
    return null;
  }

  const parts = header.split('-');
  if (parts.length !== 4) {
    return null;
  }

  const [version, traceId, spanId, flags] = parts;

  // Validate version (must be 00)
  if (version !== '00') {
    return null;
  }

  // Validate trace ID (32 hex chars)
  if (!/^[0-9a-f]{32}$/.test(traceId)) {
    return null;
  }

  // Validate span ID (16 hex chars)
  if (!/^[0-9a-f]{16}$/.test(spanId)) {
    return null;
  }

  // Validate flags (2 hex chars)
  if (!/^[0-9a-f]{2}$/.test(flags)) {
    return null;
  }

  return {
    traceId,
    spanId,
    traceFlags: parseInt(flags, 16),
  };
}

/**
 * Create W3C traceparent header from context
 */
export function createW3CTraceParent(context: SpanContext): string {
  const flags = context.traceFlags.toString(16).padStart(2, '0');
  return `00-${context.traceId}-${context.spanId}-${flags}`;
}

// =============================================================================
// Span Implementation
// =============================================================================

/**
 * Create a mutable span
 */
function createSpan(
  traceId: string,
  spanId: string,
  name: string,
  kind: SpanKind,
  parentSpanId?: string,
  initialAttributes?: Record<string, AttributeValue>,
  isRecording = true
): Span {
  let ended = false;
  const attributes: Record<string, unknown> = { ...initialAttributes };
  const events: SpanEvent[] = [];

  const span: Span = {
    traceId,
    spanId,
    parentSpanId,
    name,
    startTime: Date.now(),
    endTime: undefined,
    kind,
    status: { code: SpanStatusCode.UNSET },
    attributes,
    events,
    isRecording,

    setAttribute(key: string, value: AttributeValue): void {
      if (ended) {
        throw new Error('Cannot modify ended span');
      }
      if (isRecording) {
        attributes[key] = value;
      }
    },

    setAttributes(attrs: Record<string, AttributeValue>): void {
      if (ended) {
        throw new Error('Cannot modify ended span');
      }
      if (isRecording) {
        Object.assign(attributes, attrs);
      }
    },

    addEvent(eventName: string, eventAttributes?: Record<string, unknown>): void {
      if (ended) {
        throw new Error('Cannot modify ended span');
      }
      if (isRecording) {
        events.push({
          name: eventName,
          timestamp: Date.now(),
          attributes: eventAttributes,
        });
      }
    },

    recordException(error: Error): void {
      if (ended) {
        throw new Error('Cannot modify ended span');
      }
      if (isRecording) {
        events.push({
          name: 'exception',
          timestamp: Date.now(),
          attributes: {
            'exception.type': error.name,
            'exception.message': error.message,
            'exception.stacktrace': error.stack,
          },
        });
      }
    },
  };

  // Mark as ended (called internally)
  (span as { _markEnded?: () => void })._markEnded = () => {
    ended = true;
  };

  return span;
}

/**
 * Create a no-op span that does nothing
 */
function createNoopSpan(
  traceId: string,
  spanId: string,
  name: string
): Span {
  const noopSpan: Span = {
    traceId,
    spanId,
    parentSpanId: undefined,
    name,
    startTime: Date.now(),
    endTime: undefined,
    kind: SpanKinds.INTERNAL,
    status: { code: SpanStatusCode.UNSET },
    attributes: {},
    events: [],
    isRecording: false,

    setAttribute(): void {},
    setAttributes(): void {},
    addEvent(): void {},
    recordException(): void {},
  };

  return noopSpan;
}

// =============================================================================
// Tracing Context Implementation
// =============================================================================

/**
 * Create a tracing context
 */
export function createTracingContext(config: TracingConfig = {}): TracingContext {
  const { exporter, sampler } = config;
  // batchSize from config is reserved for future batched export implementation
  const pendingSpans: Span[] = [];
  const endedSpans = new Set<string>();

  const shouldSample = (traceId: string, name: string): boolean => {
    if (sampler) {
      return sampler(traceId, name);
    }
    return true; // Default: sample everything
  };

  const tracer: TracingContext = {
    startSpan(name: string, options: SpanOptions = {}): Span {
      const { kind = SpanKinds.INTERNAL, attributes, parent, parentContext } = options;

      let traceId: string;
      let parentSpanId: string | undefined;

      if (parent) {
        traceId = parent.traceId;
        parentSpanId = parent.spanId;
      } else if (parentContext) {
        traceId = parentContext.traceId;
        parentSpanId = parentContext.spanId;
      } else {
        traceId = generateTraceId();
        parentSpanId = undefined;
      }

      const isRecording = shouldSample(traceId, name);
      const span = createSpan(
        traceId,
        generateSpanId(),
        name,
        kind,
        parentSpanId,
        attributes,
        isRecording
      );

      pendingSpans.push(span);
      return span;
    },

    endSpan(span: Span, status?: SpanStatus): void {
      if (endedSpans.has(span.spanId)) {
        throw new Error('Span already ended');
      }

      span.endTime = Date.now();

      if (status) {
        span.status = status;
      }

      endedSpans.add(span.spanId);

      // Mark span as ended
      const markEnded = (span as { _markEnded?: () => void })._markEnded;
      if (markEnded) {
        markEnded();
      }
    },

    extractContext(span: Span): SpanContext {
      return {
        traceId: span.traceId,
        spanId: span.spanId,
        traceFlags: span.isRecording ? 0x01 : 0x00,
      };
    },

    injectContext(span: Span, headers: Headers, options: InjectOptions = {}): void {
      const context = this.extractContext(span);
      headers.set('traceparent', createW3CTraceParent(context));

      if (options.traceState) {
        headers.set('tracestate', options.traceState);
      }
    },

    async flush(): Promise<void> {
      if (!exporter) {
        return;
      }

      const spansToExport = pendingSpans.filter(s => endedSpans.has(s.spanId));

      if (spansToExport.length === 0) {
        return;
      }

      try {
        await exporter.export(spansToExport);
      } catch {
        // Silently handle export errors
      }
    },
  };

  return tracer;
}

/**
 * Create a no-op tracing context that does nothing
 */
export function createNoopTracingContext(): TracingContext {
  return {
    startSpan(name: string): Span {
      return createNoopSpan(generateTraceId(), generateSpanId(), name);
    },

    endSpan(): void {},

    extractContext(span: Span): SpanContext {
      return {
        traceId: span.traceId,
        spanId: span.spanId,
        traceFlags: 0x00,
      };
    },

    injectContext(): void {},

    async flush(): Promise<void> {},
  };
}

/**
 * Create a test tracing context that captures spans for assertions
 */
export function createTestTracingContext(config: TracingConfig = {}): TestTracingContext {
  const spans: Span[] = [];
  const endedSpans = new Set<string>();
  const { sampler } = config;

  const shouldSample = (traceId: string, name: string): boolean => {
    if (sampler) {
      return sampler(traceId, name);
    }
    return true;
  };

  const tracer: TestTracingContext = {
    startSpan(name: string, options: SpanOptions = {}): Span {
      const { kind = SpanKinds.INTERNAL, attributes, parent, parentContext } = options;

      let traceId: string;
      let parentSpanId: string | undefined;

      if (parent) {
        traceId = parent.traceId;
        parentSpanId = parent.spanId;
      } else if (parentContext) {
        traceId = parentContext.traceId;
        parentSpanId = parentContext.spanId;
      } else {
        traceId = generateTraceId();
        parentSpanId = undefined;
      }

      const isRecording = shouldSample(traceId, name);
      const span = createSpan(
        traceId,
        generateSpanId(),
        name,
        kind,
        parentSpanId,
        attributes,
        isRecording
      );

      spans.push(span);
      return span;
    },

    endSpan(span: Span, status?: SpanStatus): void {
      if (endedSpans.has(span.spanId)) {
        throw new Error('Span already ended');
      }

      span.endTime = Date.now();

      if (status) {
        span.status = status;
      }

      endedSpans.add(span.spanId);

      // Mark span as ended
      const markEnded = (span as { _markEnded?: () => void })._markEnded;
      if (markEnded) {
        markEnded();
      }
    },

    extractContext(span: Span): SpanContext {
      return {
        traceId: span.traceId,
        spanId: span.spanId,
        traceFlags: span.isRecording ? 0x01 : 0x00,
      };
    },

    injectContext(span: Span, headers: Headers, options: InjectOptions = {}): void {
      const context = this.extractContext(span);
      headers.set('traceparent', createW3CTraceParent(context));

      if (options.traceState) {
        headers.set('tracestate', options.traceState);
      }
    },

    async flush(): Promise<void> {},

    getSpans(): Span[] {
      return [...spans];
    },

    getSpansByName(name: string): Span[] {
      return spans.filter(s => s.name === name);
    },

    getSpansByAttribute(key: string, value: unknown): Span[] {
      return spans.filter(s => s.attributes[key] === value);
    },

    clear(): void {
      spans.length = 0;
      endedSpans.clear();
    },
  };

  return tracer;
}

// =============================================================================
// OTEL Export Format
// =============================================================================

/**
 * Convert attribute value to OTEL format
 */
function attributeToOTEL(key: string, value: unknown): OTELAttribute {
  const attr: OTELAttribute = { key, value: {} };

  if (typeof value === 'string') {
    attr.value.stringValue = value;
  } else if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      attr.value.intValue = value;
    } else {
      attr.value.doubleValue = value;
    }
  } else if (typeof value === 'boolean') {
    attr.value.boolValue = value;
  } else if (value !== null && value !== undefined) {
    attr.value.stringValue = String(value);
  }

  return attr;
}

/**
 * Convert span kind to OTEL numeric value
 *
 * OTEL SpanKind values:
 * - INTERNAL = 1
 * - SERVER = 2
 * - CLIENT = 3
 * - PRODUCER = 4
 * - CONSUMER = 5
 */
function spanKindToOTEL(kind: SpanKind): number {
  const kindMap: Record<SpanKind, number> = {
    internal: 1,
    server: 2,
    client: 3,
    producer: 4,
    consumer: 5,
  };
  return kindMap[kind] ?? 1;
}

/**
 * Convert milliseconds to nanoseconds string
 */
function msToNano(ms: number): string {
  return (BigInt(ms) * BigInt(1_000_000)).toString();
}

/**
 * Format spans for OTEL export
 *
 * @param spans - Spans to export
 * @returns Array of OTEL-formatted spans
 */
export function formatOTEL(spans: Span[]): OTELSpan[] {
  return spans.map(span => {
    const otelSpan: OTELSpan = {
      traceId: span.traceId,
      spanId: span.spanId,
      name: span.name,
      kind: spanKindToOTEL(span.kind),
      startTimeUnixNano: msToNano(span.startTime),
      endTimeUnixNano: msToNano(span.endTime ?? span.startTime),
      attributes: Object.entries(span.attributes).map(([k, v]) =>
        attributeToOTEL(k, v)
      ),
      status: {
        code: span.status.code,
        ...(span.status.message && { message: span.status.message }),
      },
    };

    if (span.parentSpanId) {
      otelSpan.parentSpanId = span.parentSpanId;
    }

    if (span.events.length > 0) {
      otelSpan.events = span.events.map(event => ({
        name: event.name,
        timeUnixNano: msToNano(event.timestamp),
        attributes: event.attributes
          ? Object.entries(event.attributes).map(([k, v]) =>
              attributeToOTEL(k, v)
            )
          : undefined,
      }));
    }

    return otelSpan;
  });
}
