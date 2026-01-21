/**
 * @evodb/core/tracing - Distributed tracing types
 *
 * This submodule exports tracing types and constants only.
 * The full implementation is available in @evodb/observability.
 *
 * @module tracing
 *
 * @example
 * ```typescript
 * import type { Span, TracingContext } from '@evodb/core/tracing';
 * import { SpanStatusCode, SpanKinds } from '@evodb/core/tracing';
 * import { createTracingContext } from '@evodb/observability';
 *
 * const tracer: TracingContext = createTracingContext({ serviceName: 'my-service' });
 * const span: Span = tracer.startSpan('operation', {
 *   kind: SpanKinds.SERVER,
 * });
 * ```
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
  type SpanStatusCodeType,
  // OTEL types
  type OTELSpan,
  type OTELAttribute,
  type OTELEvent,
  // Constants
  SpanStatusCode,
  SpanKinds,
} from '../tracing-types.js';
