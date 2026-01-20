/**
 * @evodb/core/tracing - Distributed tracing with OpenTelemetry support
 *
 * This submodule exports distributed tracing utilities including:
 * - TracingContext for span management
 * - W3C Trace Context propagation
 * - OTEL export format
 * - Test utilities for tracing assertions
 *
 * @module tracing
 */

export {
  // Types
  type Span,
  type SpanContext,
  type SpanStatus,
  type SpanKind,
  type SpanEvent,
  type SpanOptions,
  type AttributeValue,
  type TracingConfig,
  type TracingContext,
  type TestTracingContext,
  type TraceExporter,
  type InjectOptions,
  // OTEL types
  type OTELSpan,
  type OTELAttribute,
  type OTELEvent,
  // Constants
  SpanStatusCode,
  SpanKinds,
  // ID generation
  generateTraceId,
  generateSpanId,
  // Factory functions
  createTracingContext,
  createNoopTracingContext,
  createTestTracingContext,
  // W3C Trace Context
  parseW3CTraceParent,
  createW3CTraceParent,
  // OTEL export
  formatOTEL,
} from '../tracing.js';
