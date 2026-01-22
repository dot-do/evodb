/**
 * @evodb/core/tracing - Distributed tracing types
 *
 * This submodule exports tracing types. The full implementation
 * with factory functions is available in @evodb/observability.
 *
 * DECOUPLING: This module exports types only (constants are deprecated).
 * For implementations and constants, import from @evodb/observability.
 *
 * @module tracing
 *
 * @example Type-only usage (recommended for minimal bundle):
 * ```typescript
 * import type { Span, TracingContext, SpanKind } from '@evodb/core/tracing';
 *
 * // Use literal values instead of constants
 * function createSpan(tracer: TracingContext): Span {
 *   return tracer.startSpan('operation', {
 *     kind: 'server', // literal instead of SpanKinds.SERVER
 *   });
 * }
 * ```
 *
 * @example Full implementation (with constants):
 * ```typescript
 * import {
 *   createTracingContext,
 *   SpanStatusCode,
 *   SpanKinds
 * } from '@evodb/observability';
 *
 * const tracer = createTracingContext({ serviceName: 'my-service' });
 * const span = tracer.startSpan('operation', { kind: SpanKinds.SERVER });
 * tracer.endSpan(span, { code: SpanStatusCode.OK });
 * ```
 */

export {
  // Types (recommended for type-only imports)
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
  // Constants (deprecated - use @evodb/observability instead)
  SpanStatusCode,
  SpanKinds,
} from '../tracing-types.js';
