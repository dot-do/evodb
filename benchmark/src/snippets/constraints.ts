/**
 * Cloudflare Snippets Constraints
 *
 * Defines and validates the FREE tier constraints for Cloudflare Snippets.
 * These constraints MUST NOT be exceeded for production viability.
 *
 * @module @evodb/benchmark/snippets/constraints
 */

// =============================================================================
// Constraint Definitions
// =============================================================================

/**
 * Cloudflare Snippets FREE tier constraints
 */
export const SNIPPETS_CONSTRAINTS = {
  /** Maximum CPU time in milliseconds */
  maxCpuMs: 5,
  /** Maximum memory in megabytes */
  maxMemoryMb: 32,
  /** Maximum memory in bytes (32MB) */
  maxMemoryBytes: 32 * 1024 * 1024,
  /** Maximum number of subrequests */
  maxSubrequests: 5,
} as const;

/**
 * Type for Snippets constraints
 */
export type SnippetsConstraints = typeof SNIPPETS_CONSTRAINTS;

/**
 * Metrics collected during benchmark execution
 */
export interface BenchmarkMetrics {
  /** CPU time in milliseconds */
  cpuMs: number;
  /** Memory usage in megabytes (optional) */
  memoryMb?: number;
  /** Memory usage in bytes (optional) */
  memoryBytes?: number;
  /** Number of subrequests made (optional) */
  subrequests?: number;
}

/**
 * Detailed constraint violation report
 */
export interface ConstraintViolation {
  /** Name of the violated constraint */
  constraint: 'cpu' | 'memory' | 'subrequests';
  /** Actual value observed */
  actual: number;
  /** Maximum allowed value */
  limit: number;
  /** Unit of measurement */
  unit: 'ms' | 'MB' | 'bytes' | 'requests';
  /** How much the limit was exceeded (percentage) */
  exceededBy: number;
}

/**
 * Result of constraint validation
 */
export interface ConstraintValidationResult {
  /** Whether all constraints were satisfied */
  withinConstraints: boolean;
  /** List of violated constraints (empty if all passed) */
  violations: ConstraintViolation[];
  /** Detailed metrics */
  metrics: BenchmarkMetrics;
  /** Margin to limit for each constraint (negative if exceeded) */
  margins: {
    cpuMarginMs: number;
    memoryMarginMb?: number;
    subrequestMargin?: number;
  };
}

// =============================================================================
// Constraint Validators
// =============================================================================

/**
 * Asserts that metrics are within Snippets constraints.
 * Throws an error with detailed violation information if exceeded.
 *
 * @param metrics - The metrics to validate
 * @throws Error if any constraint is violated
 */
export function assertWithinConstraints(metrics: BenchmarkMetrics): void {
  const result = validateConstraints(metrics);

  if (!result.withinConstraints) {
    const messages = result.violations.map(
      (v) => `${v.constraint}: ${v.actual.toFixed(3)}${v.unit} exceeds limit of ${v.limit}${v.unit} (${v.exceededBy.toFixed(1)}% over)`
    );
    throw new Error(
      `Snippets constraint violation(s):\n  - ${messages.join('\n  - ')}`
    );
  }
}

/**
 * Validates metrics against Snippets constraints without throwing.
 *
 * @param metrics - The metrics to validate
 * @returns Detailed validation result
 */
export function validateConstraints(metrics: BenchmarkMetrics): ConstraintValidationResult {
  const violations: ConstraintViolation[] = [];

  // CPU constraint check
  if (metrics.cpuMs > SNIPPETS_CONSTRAINTS.maxCpuMs) {
    violations.push({
      constraint: 'cpu',
      actual: metrics.cpuMs,
      limit: SNIPPETS_CONSTRAINTS.maxCpuMs,
      unit: 'ms',
      exceededBy: ((metrics.cpuMs - SNIPPETS_CONSTRAINTS.maxCpuMs) / SNIPPETS_CONSTRAINTS.maxCpuMs) * 100,
    });
  }

  // Memory constraint check (if provided)
  const memoryMb = metrics.memoryMb ?? (metrics.memoryBytes !== undefined ? metrics.memoryBytes / (1024 * 1024) : undefined);
  if (memoryMb !== undefined && memoryMb > SNIPPETS_CONSTRAINTS.maxMemoryMb) {
    violations.push({
      constraint: 'memory',
      actual: memoryMb,
      limit: SNIPPETS_CONSTRAINTS.maxMemoryMb,
      unit: 'MB',
      exceededBy: ((memoryMb - SNIPPETS_CONSTRAINTS.maxMemoryMb) / SNIPPETS_CONSTRAINTS.maxMemoryMb) * 100,
    });
  }

  // Subrequests constraint check (if provided)
  if (metrics.subrequests !== undefined && metrics.subrequests > SNIPPETS_CONSTRAINTS.maxSubrequests) {
    violations.push({
      constraint: 'subrequests',
      actual: metrics.subrequests,
      limit: SNIPPETS_CONSTRAINTS.maxSubrequests,
      unit: 'requests',
      exceededBy: ((metrics.subrequests - SNIPPETS_CONSTRAINTS.maxSubrequests) / SNIPPETS_CONSTRAINTS.maxSubrequests) * 100,
    });
  }

  return {
    withinConstraints: violations.length === 0,
    violations,
    metrics,
    margins: {
      cpuMarginMs: SNIPPETS_CONSTRAINTS.maxCpuMs - metrics.cpuMs,
      memoryMarginMb: memoryMb !== undefined ? SNIPPETS_CONSTRAINTS.maxMemoryMb - memoryMb : undefined,
      subrequestMargin: metrics.subrequests !== undefined ? SNIPPETS_CONSTRAINTS.maxSubrequests - metrics.subrequests : undefined,
    },
  };
}

/**
 * Checks if metrics are within constraints (simple boolean check)
 *
 * @param metrics - The metrics to check
 * @returns true if all metrics are within constraints
 */
export function isWithinConstraints(metrics: BenchmarkMetrics): boolean {
  return validateConstraints(metrics).withinConstraints;
}

// =============================================================================
// Budget Planning Helpers
// =============================================================================

/**
 * CPU time budgets for different operations within the 5ms limit.
 * Sum should leave margin for overhead.
 */
export const CPU_BUDGET = {
  /** Header/metadata parsing */
  metadataParse: 0.5,
  /** Zone map evaluation for partition pruning */
  zoneMapPrune: 1.0,
  /** Bloom filter lookup */
  bloomLookup: 0.1,
  /** Columnar data decode */
  columnarDecode: 2.0,
  /** IVF centroid search */
  ivfCentroidSearch: 1.0,
  /** PQ distance computation */
  pqDistance: 0.5,
  /** Result sorting/ranking */
  resultSort: 0.3,
  /** Overhead margin */
  margin: 0.6,
} as const;

/**
 * Validates that a budget allocation fits within the 5ms limit
 */
export function validateCpuBudget(allocation: Partial<typeof CPU_BUDGET>): boolean {
  const total = Object.values(allocation).reduce((sum, v) => sum + (v ?? 0), 0);
  return total <= SNIPPETS_CONSTRAINTS.maxCpuMs;
}

/**
 * Memory budgets for different components within the 32MB limit.
 */
export const MEMORY_BUDGET = {
  /** Centroid index for IVF (256 centroids * 384 dims * 4 bytes = ~400KB) */
  centroidIndex: 0.5,
  /** PQ codebook (256 codes * 48 subvectors * 8 subdim * 4 bytes = ~400KB) */
  pqCodebook: 0.5,
  /** Zone maps (~10KB per partition, 100 partitions = 1MB) */
  zoneMaps: 1.0,
  /** Bloom filters (~1KB per filter, 1000 filters = 1MB) */
  bloomFilters: 1.0,
  /** Columnar decode buffer (depends on data size) */
  decodeBuffer: 10.0,
  /** Working memory for computations */
  workingMemory: 5.0,
  /** Overhead margin */
  margin: 14.0,
} as const;

/**
 * Validates that a memory allocation fits within the 32MB limit
 */
export function validateMemoryBudget(allocation: Partial<typeof MEMORY_BUDGET>): boolean {
  const total = Object.values(allocation).reduce((sum, v) => sum + (v ?? 0), 0);
  return total <= SNIPPETS_CONSTRAINTS.maxMemoryMb;
}

// =============================================================================
// Timing Utilities
// =============================================================================

/**
 * High-resolution timer for CPU time measurement.
 * Uses performance.now() which provides sub-millisecond precision.
 */
export function microtime(): number {
  return performance.now() * 1000; // Convert to microseconds
}

/**
 * Measures CPU time of a synchronous function
 *
 * @param fn - Function to measure
 * @returns Object with result and timing
 */
export function measureSync<T>(fn: () => T): { result: T; cpuMs: number; cpuUs: number } {
  const start = performance.now();
  const result = fn();
  const end = performance.now();
  const cpuMs = end - start;

  return {
    result,
    cpuMs,
    cpuUs: cpuMs * 1000,
  };
}

/**
 * Measures CPU time of an async function
 *
 * @param fn - Async function to measure
 * @returns Object with result and timing
 */
export async function measureAsync<T>(fn: () => Promise<T>): Promise<{ result: T; cpuMs: number; cpuUs: number }> {
  const start = performance.now();
  const result = await fn();
  const end = performance.now();
  const cpuMs = end - start;

  return {
    result,
    cpuMs,
    cpuUs: cpuMs * 1000,
  };
}

/**
 * Runs a benchmark function multiple times and returns statistics
 *
 * @param fn - Function to benchmark
 * @param iterations - Number of iterations
 * @param warmupIterations - Number of warmup iterations (not measured)
 * @returns Timing statistics
 */
export function runBenchmark<T>(
  fn: () => T,
  iterations: number = 20,
  warmupIterations: number = 3
): {
  avgMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p99Ms: number;
  samples: number[];
} {
  const times: number[] = [];

  // Warmup
  for (let i = 0; i < warmupIterations; i++) {
    fn();
  }

  // Benchmark
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    const end = performance.now();
    times.push(end - start);
  }

  times.sort((a, b) => a - b);

  return {
    avgMs: times.reduce((a, b) => a + b, 0) / times.length,
    minMs: times[0],
    maxMs: times[times.length - 1],
    p50Ms: times[Math.floor(times.length * 0.5)],
    p99Ms: times[Math.floor(times.length * 0.99)],
    samples: times,
  };
}

/**
 * Async version of runBenchmark
 */
export async function runBenchmarkAsync<T>(
  fn: () => Promise<T>,
  iterations: number = 20,
  warmupIterations: number = 3
): Promise<{
  avgMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p99Ms: number;
  samples: number[];
}> {
  const times: number[] = [];

  // Warmup
  for (let i = 0; i < warmupIterations; i++) {
    await fn();
  }

  // Benchmark
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    const end = performance.now();
    times.push(end - start);
  }

  times.sort((a, b) => a - b);

  return {
    avgMs: times.reduce((a, b) => a + b, 0) / times.length,
    minMs: times[0],
    maxMs: times[times.length - 1],
    p50Ms: times[Math.floor(times.length * 0.5)],
    p99Ms: times[Math.floor(times.length * 0.99)],
    samples: times,
  };
}

// =============================================================================
// Formatting Utilities
// =============================================================================

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

/**
 * Format milliseconds to human-readable string
 */
export function formatMs(ms: number): string {
  if (ms < 0.001) return `${(ms * 1_000_000).toFixed(0)}ns`;
  if (ms < 1) return `${(ms * 1000).toFixed(1)}us`;
  return `${ms.toFixed(3)}ms`;
}

/**
 * Format a constraint validation result for logging
 */
export function formatValidationResult(result: ConstraintValidationResult): string {
  const lines: string[] = [];

  lines.push(`Constraint Check: ${result.withinConstraints ? 'PASSED' : 'FAILED'}`);
  lines.push(`  CPU: ${formatMs(result.metrics.cpuMs)} (margin: ${formatMs(result.margins.cpuMarginMs)})`);

  if (result.metrics.memoryMb !== undefined) {
    lines.push(`  Memory: ${result.metrics.memoryMb.toFixed(2)}MB (margin: ${result.margins.memoryMarginMb?.toFixed(2)}MB)`);
  }

  if (result.metrics.subrequests !== undefined) {
    lines.push(`  Subrequests: ${result.metrics.subrequests} (margin: ${result.margins.subrequestMargin})`);
  }

  if (result.violations.length > 0) {
    lines.push('  Violations:');
    for (const v of result.violations) {
      lines.push(`    - ${v.constraint}: ${v.actual.toFixed(3)}${v.unit} > ${v.limit}${v.unit} (+${v.exceededBy.toFixed(1)}%)`);
    }
  }

  return lines.join('\n');
}
