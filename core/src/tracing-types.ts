/**
 * Distributed Tracing Types for EvoDB
 *
 * This module provides type definitions for distributed tracing.
 * The full implementation is available in @evodb/observability.
 *
 * DECOUPLING PATTERN:
 * - Core exports only TYPE DEFINITIONS (interfaces, type aliases)
 * - Implementations and constants are in @evodb/observability
 * - This allows core to work without observability being installed
 *
 * For type-only usage (no runtime dependency on observability):
 * ```typescript
 * import type { Span, TracingContext, SpanKind, SpanStatusCodeType } from '@evodb/core';
 *
 * // Use literal values instead of constants:
 * const span: Span = {
 *   kind: 'server',    // instead of SpanKinds.SERVER
 *   status: { code: 1 }, // instead of { code: SpanStatusCode.OK }
 * };
 * ```
 *
 * For full implementation with constants:
 * ```typescript
 * import { createTracingContext, SpanStatusCode, SpanKinds } from '@evodb/observability';
 *
 * const tracer = createTracingContext({ serviceName: 'my-service' });
 * const span = tracer.startSpan('handle-request', { kind: SpanKinds.SERVER });
 * tracer.endSpan(span, { code: SpanStatusCode.OK });
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
export type SpanStatusCodeType = 0 | 1 | 2;

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
// Constants (exported for backward compatibility)
// =============================================================================

/**
 * Span status code constants (follows OTEL conventions)
 *
 * NOTE: For minimal bundle size, prefer using literal values directly:
 * - 0 for UNSET
 * - 1 for OK
 * - 2 for ERROR
 *
 * Or import from @evodb/observability for full implementation.
 *
 * @deprecated Import from @evodb/observability for new code.
 * Core package exports these for backward compatibility only.
 */
export const SpanStatusCode = {
  UNSET: 0 as const,
  OK: 1 as const,
  ERROR: 2 as const,
};

/**
 * Span kind constants
 *
 * NOTE: For minimal bundle size, prefer using literal values directly:
 * - 'internal', 'server', 'client', 'producer', 'consumer'
 *
 * Or import from @evodb/observability for full implementation.
 *
 * @deprecated Import from @evodb/observability for new code.
 * Core package exports these for backward compatibility only.
 */
export const SpanKinds = {
  INTERNAL: 'internal' as const,
  SERVER: 'server' as const,
  CLIENT: 'client' as const,
  PRODUCER: 'producer' as const,
  CONSUMER: 'consumer' as const,
};
