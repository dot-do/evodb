/**
 * Observability Metrics Types for EvoDB
 *
 * This module contains only the type definitions for the metrics framework.
 * The full implementation with Prometheus export is available in @evodb/observability.
 *
 * DECOUPLING PATTERN:
 * - Core exports only TYPE DEFINITIONS (interfaces, type aliases)
 * - Implementations are in @evodb/observability
 * - This allows core to work without observability being installed
 * - Packages that don't need metrics avoid bundling the full implementation
 *
 * For type-only usage (no runtime dependency on observability):
 * ```typescript
 * import type { MetricsRegistry, Counter, Gauge, Histogram } from '@evodb/core';
 *
 * // Accept metrics interfaces but don't create them
 * function processRequest(metrics?: MetricsRegistry): void {
 *   // Metrics are optional - works without @evodb/observability
 * }
 * ```
 *
 * For full implementation with Prometheus export:
 * ```typescript
 * import { createMetricsRegistry, createCounter, formatPrometheus } from '@evodb/observability';
 *
 * const registry = createMetricsRegistry();
 * const counter = createCounter(registry, { name: 'requests_total', help: 'Total requests' });
 *
 * // Export for /metrics endpoint
 * const body = formatPrometheus(registry);
 * ```
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Labels for a metric (key-value pairs)
 */
export type MetricLabels = Record<string, string>;

/**
 * Metric type identifier
 */
export type MetricType = 'counter' | 'gauge' | 'histogram';

/**
 * Base metric interface
 */
export interface Metric {
  /** Metric name (must match [a-zA-Z_:][a-zA-Z0-9_:]*) */
  readonly name: string;
  /** Human-readable description */
  readonly help: string;
  /** Metric type */
  readonly type: MetricType;
  /** Reset metric to initial state */
  reset(): void;
}

/**
 * Counter metric - a monotonically increasing value
 */
export interface Counter extends Metric {
  readonly type: 'counter';
  /** Increment counter by 1 or specified value */
  inc(value?: number): void;
  /** Get current value */
  get(): number;
  /** Get labeled counter instance */
  labels(labels: MetricLabels): LabeledCounter;
}

/**
 * Labeled counter instance
 */
export interface LabeledCounter {
  /** Increment counter by 1 or specified value */
  inc(value?: number): void;
  /** Get current value */
  get(): number;
}

/**
 * Gauge metric - a value that can go up or down
 */
export interface Gauge extends Metric {
  readonly type: 'gauge';
  /** Set gauge to specified value */
  set(value: number): void;
  /** Increment gauge by 1 or specified value */
  inc(value?: number): void;
  /** Decrement gauge by 1 or specified value */
  dec(value?: number): void;
  /** Set gauge to current Unix timestamp in seconds */
  setToCurrentTime(): void;
  /** Get current value */
  get(): number;
  /** Get labeled gauge instance */
  labels(labels: MetricLabels): LabeledGauge;
}

/**
 * Labeled gauge instance
 */
export interface LabeledGauge {
  /** Set gauge to specified value */
  set(value: number): void;
  /** Increment gauge by 1 or specified value */
  inc(value?: number): void;
  /** Decrement gauge by 1 or specified value */
  dec(value?: number): void;
  /** Set gauge to current Unix timestamp in seconds */
  setToCurrentTime(): void;
  /** Get current value */
  get(): number;
}

/**
 * Histogram data for a single label set
 */
export interface HistogramData {
  /** Total number of observations */
  count: number;
  /** Sum of all observed values */
  sum: number;
  /** Cumulative bucket counts (bucket upper bound -> count) */
  buckets: Record<number, number>;
}

/**
 * Timer end function - returns observed duration in seconds
 */
export type TimerEnd = () => number;

/**
 * Histogram metric - distribution of values
 */
export interface Histogram extends Metric {
  readonly type: 'histogram';
  /** Bucket boundaries */
  readonly buckets: readonly number[];
  /** Observe a value */
  observe(value: number): void;
  /** Start a timer and return a function to stop it */
  startTimer(): TimerEnd;
  /** Get histogram data */
  get(): HistogramData;
  /** Get labeled histogram instance */
  labels(labels: MetricLabels): LabeledHistogram;
}

/**
 * Labeled histogram instance
 */
export interface LabeledHistogram {
  /** Observe a value */
  observe(value: number): void;
  /** Start a timer and return a function to stop it */
  startTimer(): TimerEnd;
  /** Get histogram data */
  get(): HistogramData;
}

/**
 * Configuration for creating a counter
 */
export interface CounterConfig {
  /** Metric name */
  name: string;
  /** Human-readable description */
  help: string;
  /** Label names for this metric */
  labelNames?: string[];
}

/**
 * Configuration for creating a gauge
 */
export interface GaugeConfig {
  /** Metric name */
  name: string;
  /** Human-readable description */
  help: string;
  /** Label names for this metric */
  labelNames?: string[];
}

/**
 * Configuration for creating a histogram
 */
export interface HistogramConfig {
  /** Metric name */
  name: string;
  /** Human-readable description */
  help: string;
  /** Label names for this metric */
  labelNames?: string[];
  /** Bucket boundaries (default: [.005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5, 10]) */
  buckets?: number[];
}

/**
 * Metrics registry - container for all metrics
 */
export interface MetricsRegistry {
  /** Get all registered metrics */
  getMetrics(): Metric[];
  /** Get a specific metric by name */
  getMetric(name: string): Metric | undefined;
  /** Clear all registered metrics */
  clear(): void;
  /** Reset all metric values */
  resetAll(): void;
  /** Content-Type header for Prometheus format */
  readonly contentType: string;
  /** Internal: register a metric */
  _register(metric: Metric): void;
}

/**
 * EvoDB metrics interface
 */
export interface EvoDBMetricsCollection {
  /** Registry containing all metrics */
  registry: MetricsRegistry;

  /** Query duration histogram (seconds) */
  queryDurationSeconds: Histogram;

  /** Total blocks scanned counter */
  blocksScannedTotal: Counter;

  /** Cache hits counter */
  cacheHitsTotal: Counter;

  /** Cache misses counter */
  cacheMissesTotal: Counter;

  /** Buffer size gauge (bytes) */
  bufferSizeBytes: Gauge;

  /** CDC entries processed counter */
  cdcEntriesProcessedTotal: Counter;
}
