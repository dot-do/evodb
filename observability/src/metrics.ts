/**
 * Observability Metrics Framework for EvoDB
 *
 * Provides a lightweight metrics collection and Prometheus export interface optimized for:
 * - Cloudflare Workers (minimal overhead)
 * - Edge environments (stateless operation)
 * - Prometheus scraping (standard text format)
 *
 * Metric Types:
 * - Counter: Monotonically increasing value (e.g., requests, errors)
 * - Gauge: Value that can go up or down (e.g., connections, buffer size)
 * - Histogram: Distribution of values with configurable buckets (e.g., latency)
 *
 * @example
 * ```typescript
 * import { createMetricsRegistry, createCounter, formatPrometheus } from '@evodb/observability';
 *
 * const registry = createMetricsRegistry();
 * const requestCounter = createCounter(registry, {
 *   name: 'requests_total',
 *   help: 'Total requests',
 *   labelNames: ['method'],
 * });
 *
 * requestCounter.labels({ method: 'GET' }).inc();
 *
 * // Export for /metrics endpoint
 * const body = formatPrometheus(registry);
 * ```
 */

// Re-export types from core for convenience
export type {
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
} from '@evodb/core/metrics-types';

// Import types for internal use
import type {
  MetricLabels,
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
} from '@evodb/core/metrics-types';

// =============================================================================
// Default Values
// =============================================================================

/**
 * Default histogram buckets (same as Prometheus client default)
 */
export const DEFAULT_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
] as const;

/**
 * Prometheus content type header
 */
export const PROMETHEUS_CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8';

// =============================================================================
// Metrics Registry
// =============================================================================

/**
 * Create a new metrics registry
 *
 * @returns A MetricsRegistry instance
 *
 * @example
 * ```typescript
 * const registry = createMetricsRegistry();
 * const counter = createCounter(registry, { name: 'requests', help: 'Total requests' });
 * ```
 */
export function createMetricsRegistry(): MetricsRegistry {
  const metrics = new Map<string, Metric>();

  return {
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
      return PROMETHEUS_CONTENT_TYPE;
    },

    _register(metric: Metric): void {
      if (metrics.has(metric.name)) {
        throw new Error(`Metric ${metric.name} already registered`);
      }
      metrics.set(metric.name, metric);
    },
  };
}

// =============================================================================
// Counter Implementation
// =============================================================================

/**
 * Create a labeled key from labels object
 */
function labelsToKey(labels: MetricLabels): string {
  const entries = Object.entries(labels).sort((a, b) => a[0].localeCompare(b[0]));
  return entries.map(([k, v]) => `${k}=${v}`).join(',');
}

// =============================================================================
// Prometheus Format Export
// =============================================================================

/**
 * Escape label value for Prometheus format
 * Prometheus requires escaping: backslash, newline, double-quote
 */
function escapeLabelValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/"/g, '\\"');
}

/**
 * Format labels for Prometheus output
 */
function formatLabelsForPrometheus(labels: MetricLabels, extraLabels?: MetricLabels): string {
  const allLabels = { ...labels, ...extraLabels };
  const entries = Object.entries(allLabels);
  if (entries.length === 0) return '';

  const parts = entries
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k}="${escapeLabelValue(v)}"`);

  return `{${parts.join(',')}}`;
}

/**
 * Parse label key back to labels object
 * Note: Uses first '=' as separator, so values can contain '='
 */
function keyToLabels(key: string): MetricLabels {
  if (!key) return {};
  const labels: MetricLabels = {};
  for (const part of key.split(',')) {
    const eqIndex = part.indexOf('=');
    if (eqIndex > 0) {
      const k = part.slice(0, eqIndex);
      const v = part.slice(eqIndex + 1);
      labels[k] = v;
    }
  }
  return labels;
}

/**
 * Format a metric registry as Prometheus text format
 *
 * @param registry - The metrics registry
 * @returns Prometheus text format string
 *
 * @example
 * ```typescript
 * const body = formatPrometheus(registry);
 * return new Response(body, {
 *   headers: { 'Content-Type': registry.contentType },
 * });
 * ```
 */
export function formatPrometheus(registry: MetricsRegistry): string {
  const metrics = registry.getMetrics();
  if (metrics.length === 0) return '';

  const lines: string[] = [];

  for (const metric of metrics) {
    // HELP and TYPE lines
    lines.push(`# HELP ${metric.name} ${metric.help}`);
    lines.push(`# TYPE ${metric.name} ${metric.type}`);

    if (metric.type === 'counter') {
      const counter = metric as Counter & {
        // Access internal values for formatting
        _getValues?: () => Map<string, number>;
      };

      // Try to get all values including labeled ones
      // We need to iterate through all registered label combinations
      const allValues = getAllMetricValues(counter);

      for (const [key, value] of allValues) {
        const labels = keyToLabels(key);
        const labelStr = formatLabelsForPrometheus(labels);
        lines.push(`${metric.name}${labelStr} ${value}`);
      }
    } else if (metric.type === 'gauge') {
      const gauge = metric as Gauge;
      const allValues = getAllMetricValues(gauge);

      for (const [key, value] of allValues) {
        const labels = keyToLabels(key);
        const labelStr = formatLabelsForPrometheus(labels);
        lines.push(`${metric.name}${labelStr} ${value}`);
      }
    } else if (metric.type === 'histogram') {
      const histogram = metric as Histogram;
      const allData = getAllHistogramData(histogram);

      for (const [key, data] of allData) {
        const labels = keyToLabels(key);

        // Output bucket lines
        let cumulative = 0;
        for (const bucket of histogram.buckets) {
          cumulative = data.buckets[bucket] ?? cumulative;
          const labelStr = formatLabelsForPrometheus(labels, { le: String(bucket) });
          lines.push(`${metric.name}_bucket${labelStr} ${cumulative}`);
        }

        // +Inf bucket
        const infLabelStr = formatLabelsForPrometheus(labels, { le: '+Inf' });
        lines.push(`${metric.name}_bucket${infLabelStr} ${data.count}`);

        // Sum and count
        const baseLabelStr = formatLabelsForPrometheus(labels);
        lines.push(`${metric.name}_sum${baseLabelStr} ${data.sum}`);
        lines.push(`${metric.name}_count${baseLabelStr} ${data.count}`);
      }
    }

    lines.push(''); // Empty line between metrics
  }

  return lines.join('\n').trim();
}

/**
 * Get all values from a counter or gauge (including labeled values)
 * This uses the internal structure to access all label combinations
 */
function getAllMetricValues(metric: Counter | Gauge): Map<string, number> {
  // Access internal values through a workaround
  // We store a reference to the values map during creation
  const values = new Map<string, number>();

  // For metrics with labels, we need to access internal state
  // This is a workaround since we don't expose internal maps directly
  try {
    const internalMetric = metric as unknown as InternalMetric;
    if (internalMetric._values) {
      return internalMetric._values;
    }
  } catch {
    // Fallback
  }

  // Fallback: try to get unlabeled value
  try {
    values.set('', metric.get());
  } catch {
    // Metric has labels, can't get unlabeled value
  }

  return values;
}

/**
 * Get all histogram data (including labeled data)
 */
function getAllHistogramData(histogram: Histogram): Map<string, HistogramData> {
  const result = new Map<string, HistogramData>();

  try {
    const internalHistogram = histogram as unknown as InternalHistogram;
    if (internalHistogram._data) {
      const internalData = internalHistogram._data;
      const buckets = histogram.buckets;

      for (const [key, d] of internalData) {
        const bucketData: Record<number, number> = {};
        let cumulative = 0;
        for (let i = 0; i < buckets.length; i++) {
          cumulative += d.buckets[i];
          bucketData[buckets[i]] = cumulative;
        }
        result.set(key, {
          count: d.count,
          sum: d.sum,
          buckets: bucketData,
        });
      }
      return result;
    }
  } catch {
    // Fallback
  }

  // Fallback: try to get unlabeled data
  try {
    result.set('', histogram.get());
  } catch {
    // Histogram has labels, can't get unlabeled data
  }

  return result;
}

// Internal types for accessing private data (used only in formatPrometheus)
interface InternalMetric {
  _values: Map<string, number>;
}

interface HistogramInternalData {
  count: number;
  sum: number;
  buckets: number[];
}

interface InternalHistogram {
  _data: Map<string, HistogramInternalData>;
}

// =============================================================================
// Enhanced implementations with internal access for Prometheus export
// =============================================================================

/**
 * Create a counter metric
 *
 * @param registry - The metrics registry to register with
 * @param config - Counter configuration
 * @returns Counter instance
 */
export function createCounter(
  registry: MetricsRegistry,
  config: CounterConfig
): Counter {
  const { name, help, labelNames = [] } = config;
  const values = new Map<string, number>();
  const labeledInstances = new Map<string, LabeledCounter>();

  // Initialize unlabeled value
  if (labelNames.length === 0) {
    values.set('', 0);
  }

  const createLabeledCounter = (labels: MetricLabels): LabeledCounter => {
    const key = labelsToKey(labels);

    const existing = labeledInstances.get(key);
    if (existing) {
      return existing;
    }

    if (!values.has(key)) {
      values.set(key, 0);
    }

    const labeled: LabeledCounter = {
      inc(value = 1): void {
        if (value < 0) {
          throw new Error('Counter cannot be decremented');
        }
        values.set(key, (values.get(key) ?? 0) + value);
      },
      get(): number {
        return values.get(key) ?? 0;
      },
    };

    labeledInstances.set(key, labeled);
    return labeled;
  };

  const counter = {
    name,
    help,
    type: 'counter' as const,
    _values: values, // Expose for Prometheus export

    inc(value = 1): void {
      if (value < 0) {
        throw new Error('Counter cannot be decremented');
      }
      if (labelNames.length > 0) {
        throw new Error('Counter with labels requires using .labels() method');
      }
      values.set('', (values.get('') ?? 0) + value);
    },

    get(): number {
      if (labelNames.length > 0) {
        throw new Error('Counter with labels requires using .labels() method');
      }
      return values.get('') ?? 0;
    },

    labels(labels: MetricLabels): LabeledCounter {
      return createLabeledCounter(labels);
    },

    reset(): void {
      for (const key of values.keys()) {
        values.set(key, 0);
      }
    },
  };

  registry._register(counter);
  return counter;
}

/**
 * Create a gauge metric
 *
 * @param registry - The metrics registry to register with
 * @param config - Gauge configuration
 * @returns Gauge instance
 */
export function createGauge(registry: MetricsRegistry, config: GaugeConfig): Gauge {
  const { name, help, labelNames = [] } = config;
  const values = new Map<string, number>();
  const labeledInstances = new Map<string, LabeledGauge>();

  // Initialize unlabeled value
  if (labelNames.length === 0) {
    values.set('', 0);
  }

  const createLabeledGauge = (labels: MetricLabels): LabeledGauge => {
    const key = labelsToKey(labels);

    const existing = labeledInstances.get(key);
    if (existing) {
      return existing;
    }

    if (!values.has(key)) {
      values.set(key, 0);
    }

    const labeled: LabeledGauge = {
      set(value: number): void {
        values.set(key, value);
      },
      inc(value = 1): void {
        values.set(key, (values.get(key) ?? 0) + value);
      },
      dec(value = 1): void {
        values.set(key, (values.get(key) ?? 0) - value);
      },
      setToCurrentTime(): void {
        values.set(key, Date.now() / 1000);
      },
      get(): number {
        return values.get(key) ?? 0;
      },
    };

    labeledInstances.set(key, labeled);
    return labeled;
  };

  const gauge = {
    name,
    help,
    type: 'gauge' as const,
    _values: values, // Expose for Prometheus export

    set(value: number): void {
      if (labelNames.length > 0) {
        throw new Error('Gauge with labels requires using .labels() method');
      }
      values.set('', value);
    },

    inc(value = 1): void {
      if (labelNames.length > 0) {
        throw new Error('Gauge with labels requires using .labels() method');
      }
      values.set('', (values.get('') ?? 0) + value);
    },

    dec(value = 1): void {
      if (labelNames.length > 0) {
        throw new Error('Gauge with labels requires using .labels() method');
      }
      values.set('', (values.get('') ?? 0) - value);
    },

    setToCurrentTime(): void {
      if (labelNames.length > 0) {
        throw new Error('Gauge with labels requires using .labels() method');
      }
      values.set('', Date.now() / 1000);
    },

    get(): number {
      if (labelNames.length > 0) {
        throw new Error('Gauge with labels requires using .labels() method');
      }
      return values.get('') ?? 0;
    },

    labels(labels: MetricLabels): LabeledGauge {
      return createLabeledGauge(labels);
    },

    reset(): void {
      for (const key of values.keys()) {
        values.set(key, 0);
      }
    },
  };

  registry._register(gauge);
  return gauge;
}

/**
 * Create a histogram metric
 *
 * @param registry - The metrics registry to register with
 * @param config - Histogram configuration
 * @returns Histogram instance
 */
export function createHistogram(
  registry: MetricsRegistry,
  config: HistogramConfig
): Histogram {
  const { name, help, labelNames = [], buckets: configBuckets } = config;
  const buckets = configBuckets
    ? [...configBuckets].sort((a, b) => a - b)
    : [...DEFAULT_BUCKETS];

  const data = new Map<string, HistogramInternalData>();
  const labeledInstances = new Map<string, LabeledHistogram>();

  const createEmptyData = (): HistogramInternalData => ({
    count: 0,
    sum: 0,
    buckets: buckets.map(() => 0),
  });

  // Initialize unlabeled value
  if (labelNames.length === 0) {
    data.set('', createEmptyData());
  }

  const observeValue = (key: string, value: number): void => {
    let d = data.get(key);
    if (!d) {
      d = createEmptyData();
      data.set(key, d);
    }

    d.count++;
    d.sum += value;

    // Update buckets (non-cumulative, we compute cumulative at export time)
    for (let i = 0; i < buckets.length; i++) {
      if (value <= buckets[i]) {
        d.buckets[i]++;
        break; // Only increment the first matching bucket for internal storage
      }
    }
  };

  const getData = (key: string): HistogramData => {
    const d = data.get(key) ?? createEmptyData();
    const bucketData: Record<number, number> = {};

    // Build cumulative bucket data
    let cumulative = 0;
    for (let i = 0; i < buckets.length; i++) {
      cumulative += d.buckets[i];
      bucketData[buckets[i]] = cumulative;
    }

    return {
      count: d.count,
      sum: d.sum,
      buckets: bucketData,
    };
  };

  const startTimerForKey = (key: string): TimerEnd => {
    const start = performance.now();
    return (): number => {
      const duration = (performance.now() - start) / 1000;
      observeValue(key, duration);
      return duration;
    };
  };

  const createLabeledHistogram = (labels: MetricLabels): LabeledHistogram => {
    const key = labelsToKey(labels);

    const existing = labeledInstances.get(key);
    if (existing) {
      return existing;
    }

    if (!data.has(key)) {
      data.set(key, createEmptyData());
    }

    const labeled: LabeledHistogram = {
      observe(value: number): void {
        observeValue(key, value);
      },
      startTimer(): TimerEnd {
        return startTimerForKey(key);
      },
      get(): HistogramData {
        return getData(key);
      },
    };

    labeledInstances.set(key, labeled);
    return labeled;
  };

  const histogram = {
    name,
    help,
    type: 'histogram' as const,
    buckets,
    _data: data, // Expose for Prometheus export

    observe(value: number): void {
      if (labelNames.length > 0) {
        throw new Error('Histogram with labels requires using .labels() method');
      }
      observeValue('', value);
    },

    startTimer(): TimerEnd {
      if (labelNames.length > 0) {
        throw new Error('Histogram with labels requires using .labels() method');
      }
      return startTimerForKey('');
    },

    get(): HistogramData {
      if (labelNames.length > 0) {
        throw new Error('Histogram with labels requires using .labels() method');
      }
      return getData('');
    },

    labels(labels: MetricLabels): LabeledHistogram {
      return createLabeledHistogram(labels);
    },

    reset(): void {
      for (const key of data.keys()) {
        data.set(key, createEmptyData());
      }
    },
  };

  registry._register(histogram);
  return histogram;
}

// =============================================================================
// EvoDB Pre-defined Metrics
// =============================================================================

/**
 * Query-specific histogram buckets (ms to seconds)
 */
const QUERY_DURATION_BUCKETS = [
  0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
];

/**
 * Factory for creating pre-defined EvoDB metrics
 *
 * @example
 * ```typescript
 * const metrics = EvoDBMetrics.create();
 *
 * // Track query duration
 * const end = metrics.queryDurationSeconds.labels({ table: 'users' }).startTimer();
 * await executeQuery();
 * end();
 *
 * // Track cache performance
 * metrics.cacheHitsTotal.labels({ cache_type: 'block' }).inc();
 *
 * // Export for Prometheus
 * const body = formatPrometheus(metrics.registry);
 * ```
 */
export const EvoDBMetrics = {
  /**
   * Create a new EvoDB metrics collection
   *
   * @param registry - Optional custom registry (creates new one if not provided)
   * @returns EvoDB metrics collection
   */
  create(registry?: MetricsRegistry): EvoDBMetricsCollection {
    const reg = registry ?? createMetricsRegistry();

    const queryDurationSeconds = createHistogram(reg, {
      name: 'evodb_query_duration_seconds',
      help: 'Duration of query execution in seconds',
      labelNames: ['table'],
      buckets: QUERY_DURATION_BUCKETS,
    });

    const blocksScannedTotal = createCounter(reg, {
      name: 'evodb_blocks_scanned_total',
      help: 'Total number of blocks scanned',
      labelNames: ['table'],
    });

    const cacheHitsTotal = createCounter(reg, {
      name: 'evodb_cache_hits_total',
      help: 'Total number of cache hits',
      labelNames: ['cache_type'],
    });

    const cacheMissesTotal = createCounter(reg, {
      name: 'evodb_cache_misses_total',
      help: 'Total number of cache misses',
      labelNames: ['cache_type'],
    });

    const bufferSizeBytes = createGauge(reg, {
      name: 'evodb_buffer_size_bytes',
      help: 'Current buffer size in bytes',
      labelNames: ['buffer_name'],
    });

    const cdcEntriesProcessedTotal = createCounter(reg, {
      name: 'evodb_cdc_entries_processed_total',
      help: 'Total number of CDC entries processed',
      labelNames: ['operation'],
    });

    return {
      registry: reg,
      queryDurationSeconds,
      blocksScannedTotal,
      cacheHitsTotal,
      cacheMissesTotal,
      bufferSizeBytes,
      cdcEntriesProcessedTotal,
    };
  },
};
