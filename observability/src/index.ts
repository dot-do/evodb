/**
 * @evodb/observability
 *
 * Prometheus metrics, logging, and observability framework for EvoDB.
 *
 * This package provides the full observability implementation including:
 * - Counter, Gauge, and Histogram metric types
 * - Prometheus text format export
 * - Pre-defined EvoDB metrics collection
 * - Structured logging framework
 *
 * For applications that don't need metrics/logging, the core package exports
 * only the type definitions to avoid bundling this implementation.
 *
 * @example
 * ```typescript
 * import {
 *   createMetricsRegistry,
 *   createCounter,
 *   createGauge,
 *   createHistogram,
 *   formatPrometheus,
 *   EvoDBMetrics,
 *   createLogger,
 *   createConsoleLogger,
 *   createTestLogger,
 * } from '@evodb/observability';
 *
 * // Create custom metrics
 * const registry = createMetricsRegistry();
 * const requestCounter = createCounter(registry, {
 *   name: 'requests_total',
 *   help: 'Total requests',
 *   labelNames: ['method'],
 * });
 *
 * requestCounter.labels({ method: 'GET' }).inc();
 *
 * // Or use pre-defined EvoDB metrics
 * const metrics = EvoDBMetrics.create();
 * metrics.queryDurationSeconds.labels({ table: 'users' }).observe(0.05);
 *
 * // Export for /metrics endpoint
 * const body = formatPrometheus(metrics.registry);
 * return new Response(body, {
 *   headers: { 'Content-Type': metrics.registry.contentType },
 * });
 *
 * // Create a console logger
 * const logger = createConsoleLogger({ format: 'json' });
 * logger.info('Query executed', { table: 'users', rowsReturned: 42 });
 * ```
 */

// Re-export everything from metrics module
export {
  // Types (re-exported from core)
  type MetricLabels,
  type MetricType,
  type Metric,
  type Counter,
  type LabeledCounter,
  type Gauge,
  type LabeledGauge,
  type HistogramData,
  type TimerEnd,
  type Histogram,
  type LabeledHistogram,
  type CounterConfig,
  type GaugeConfig,
  type HistogramConfig,
  type MetricsRegistry,
  type EvoDBMetricsCollection,

  // Constants
  DEFAULT_BUCKETS,
  PROMETHEUS_CONTENT_TYPE,

  // Factory functions
  createMetricsRegistry,
  createCounter,
  createGauge,
  createHistogram,

  // Prometheus export
  formatPrometheus,

  // Pre-defined metrics
  EvoDBMetrics,
} from './metrics.js';

// Re-export logging types from core
export type {
  Logger,
  LogLevel,
  LogEntry,
  LoggerConfig,
  ConsoleLoggerConfig,
  TestLogger,
  LogContext,
  LogContextValue,
} from '@evodb/core';

// Re-export logging implementation
export {
  // Type guards
  isLogContext,
  isLogContextValue,
  // Factory functions
  createLogger,
  createConsoleLogger,
  createNoopLogger,
  createTestLogger,
  // Context helpers
  withContext,
  // Constants and utilities
  LogLevels,
} from './logging.js';

// Re-export tracing types from core
export type {
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
  OTELSpan,
  OTELAttribute,
  OTELEvent,
} from '@evodb/core';

// Re-export tracing implementation
export {
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
} from './tracing.js';
