/**
 * Chained Snippet Execution Benchmark
 *
 * Tests the overhead of chaining multiple snippet invocations together.
 * Chaining allows complex queries to be split across multiple snippet
 * calls while staying within individual constraints.
 *
 * Key constraints per snippet:
 * - 5 subrequests maximum
 * - 5ms CPU time maximum
 * - 32MB memory maximum
 *
 * Chaining considerations:
 * - Each chain hop adds network latency (~1-5ms)
 * - State must be serialized between hops
 * - Subrequest budget resets per snippet
 *
 * @module @evodb/benchmark/snippets/chain-execute
 */

import {
  SNIPPETS_CONSTRAINTS,
  assertWithinConstraints,
  validateConstraints,
  runBenchmark,
  runBenchmarkAsync,
  formatBytes,
  formatMs,
  type BenchmarkMetrics,
  type ConstraintValidationResult,
} from './constraints.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Snippet step in a chain
 */
export interface SnippetStep {
  /** Step identifier */
  id: string;
  /** Step name */
  name: string;
  /** Estimated CPU time for this step */
  estimatedCpuMs: number;
  /** Estimated memory usage */
  estimatedMemoryMb: number;
  /** Number of subrequests this step makes */
  subrequests: number;
  /** Function to execute this step */
  execute: (input: unknown) => Promise<unknown>;
}

/**
 * Chain definition
 */
export interface SnippetChain {
  /** Chain identifier */
  id: string;
  /** Chain name */
  name: string;
  /** Steps in execution order */
  steps: SnippetStep[];
  /** Total estimated CPU time */
  totalEstimatedCpuMs: number;
  /** Maximum parallel width */
  maxParallelism: number;
}

/**
 * Step execution result
 */
export interface StepExecutionResult {
  /** Step ID */
  stepId: string;
  /** CPU time for this step */
  cpuMs: number;
  /** Whether step stayed within constraints */
  withinConstraints: boolean;
  /** Output size in bytes */
  outputSizeBytes: number;
  /** Serialization overhead in ms */
  serializationMs: number;
}

/**
 * Chain execution result
 */
export interface ChainExecutionResult {
  /** Chain ID */
  chainId: string;
  /** Total CPU time (sum of steps) */
  totalCpuMs: number;
  /** Total wall time (including simulated network) */
  totalWallMs: number;
  /** Per-step results */
  stepResults: StepExecutionResult[];
  /** Total bytes transferred between steps */
  totalBytesTransferred: number;
  /** Total serialization overhead */
  totalSerializationMs: number;
  /** Whether all steps stayed within constraints */
  allWithinConstraints: boolean;
}

/**
 * Benchmark result for chain execution
 */
export interface ChainExecuteBenchmarkResult {
  /** Benchmark name */
  name: string;
  /** Number of steps in chain */
  stepCount: number;
  /** Total CPU time */
  totalCpuMs: number;
  /** Total wall time */
  totalWallMs: number;
  /** Average CPU per step */
  avgCpuPerStepMs: number;
  /** Serialization overhead percentage */
  serializationOverheadPercent: number;
  /** All steps within constraints */
  allWithinConstraints: boolean;
  /** Detailed execution result */
  execution: ChainExecutionResult;
  /** Timing breakdown */
  timing: {
    avgMs: number;
    minMs: number;
    maxMs: number;
    p50Ms: number;
    p99Ms: number;
  };
}

// =============================================================================
// Simulated Step Functions
// =============================================================================

/**
 * Simulate a zone map pruning step
 */
export function createZoneMapStep(partitionCount: number): SnippetStep {
  return {
    id: 'zone-map-prune',
    name: 'Zone Map Pruning',
    estimatedCpuMs: 0.5,
    estimatedMemoryMb: 1,
    subrequests: 1, // Fetch zone maps
    execute: async (input: unknown) => {
      // Simulate zone map evaluation
      const start = performance.now();

      const partitions = new Array(partitionCount).fill(null).map((_, i) => ({
        id: i,
        min: i * 1000,
        max: (i + 1) * 1000,
      }));

      // Filter partitions
      const threshold = 500_000; // Example filter
      const matching = partitions.filter((p) => p.max > threshold);

      // Simulate work
      let sum = 0;
      for (const p of matching) {
        sum += p.max - p.min;
      }

      const cpuMs = performance.now() - start;

      return {
        matchingPartitions: matching.map((p) => p.id),
        cpuMs,
        pruneRatio: 1 - matching.length / partitions.length,
      };
    },
  };
}

/**
 * Simulate a bloom filter step
 */
export function createBloomFilterStep(filterCount: number): SnippetStep {
  return {
    id: 'bloom-filter',
    name: 'Bloom Filter Lookup',
    estimatedCpuMs: 0.1,
    estimatedMemoryMb: 0.5,
    subrequests: 1, // Fetch bloom filters
    execute: async (input: unknown) => {
      const start = performance.now();

      // Simulate bloom filter lookups
      const results: boolean[] = [];
      for (let i = 0; i < filterCount; i++) {
        // Simulate hash computation
        let hash = i;
        for (let j = 0; j < 10; j++) {
          hash = Math.imul(hash ^ 0x5bd1e995, 0xc6a4a793);
        }
        results.push((hash & 1) === 1);
      }

      const cpuMs = performance.now() - start;

      return {
        possibleMatches: results.filter(Boolean).length,
        cpuMs,
      };
    },
  };
}

/**
 * Simulate a columnar decode step
 */
export function createColumnarDecodeStep(rowCount: number, columnCount: number): SnippetStep {
  return {
    id: 'columnar-decode',
    name: 'Columnar Decode',
    estimatedCpuMs: 2.0,
    estimatedMemoryMb: 5,
    subrequests: 3, // Fetch column chunks
    execute: async (input: unknown) => {
      const start = performance.now();

      // Simulate columnar decode
      const columns: Float64Array[] = [];
      for (let c = 0; c < columnCount; c++) {
        const col = new Float64Array(rowCount);
        for (let r = 0; r < rowCount; r++) {
          col[r] = Math.random();
        }
        columns.push(col);
      }

      const cpuMs = performance.now() - start;

      return {
        rowCount,
        columnCount,
        cpuMs,
        bytesDecoded: rowCount * columnCount * 8,
      };
    },
  };
}

/**
 * Simulate an aggregation step
 */
export function createAggregationStep(rowCount: number): SnippetStep {
  return {
    id: 'aggregation',
    name: 'Aggregation',
    estimatedCpuMs: 1.0,
    estimatedMemoryMb: 2,
    subrequests: 0, // In-memory only
    execute: async (input: unknown) => {
      const start = performance.now();

      // Simulate aggregation
      const data = new Float64Array(rowCount);
      for (let i = 0; i < rowCount; i++) {
        data[i] = Math.random() * 1000;
      }

      let sum = 0;
      let min = Infinity;
      let max = -Infinity;

      for (let i = 0; i < rowCount; i++) {
        sum += data[i];
        if (data[i] < min) min = data[i];
        if (data[i] > max) max = data[i];
      }

      const cpuMs = performance.now() - start;

      return {
        sum,
        min,
        max,
        avg: sum / rowCount,
        cpuMs,
      };
    },
  };
}

/**
 * Simulate a vector search step
 */
export function createVectorSearchStep(numVectors: number, dimension: number): SnippetStep {
  return {
    id: 'vector-search',
    name: 'Vector Search',
    estimatedCpuMs: 2.0,
    estimatedMemoryMb: (numVectors * dimension * 4) / (1024 * 1024),
    subrequests: 2, // Fetch centroids + partition
    execute: async (input: unknown) => {
      const start = performance.now();

      // Simulate vector search
      const query = new Float32Array(dimension);
      for (let i = 0; i < dimension; i++) {
        query[i] = Math.random();
      }

      // Simulate distance computations
      const distances: number[] = [];
      for (let i = 0; i < numVectors; i++) {
        let dist = 0;
        for (let j = 0; j < dimension; j++) {
          const diff = query[j] - Math.random();
          dist += diff * diff;
        }
        distances.push(dist);
      }

      // Find top-k
      const topK = 10;
      distances.sort((a, b) => a - b);
      const results = distances.slice(0, topK);

      const cpuMs = performance.now() - start;

      return {
        topK: results,
        cpuMs,
      };
    },
  };
}

// =============================================================================
// Chain Execution
// =============================================================================

/**
 * Execute a snippet chain
 *
 * @param chain - Chain to execute
 * @param initialInput - Initial input data
 * @param simulateNetworkMs - Simulated network latency per hop (default: 2ms)
 * @returns Chain execution result
 */
export async function executeChain(
  chain: SnippetChain,
  initialInput: unknown,
  simulateNetworkMs: number = 2
): Promise<ChainExecutionResult> {
  const stepResults: StepExecutionResult[] = [];
  let currentInput = initialInput;
  let totalCpuMs = 0;
  let totalWallMs = 0;
  let totalBytesTransferred = 0;
  let totalSerializationMs = 0;
  let allWithinConstraints = true;

  for (const step of chain.steps) {
    // Execute step
    const stepStart = performance.now();
    const output = await step.execute(currentInput);
    const stepCpuMs = performance.now() - stepStart;

    // Serialize output (simulating transfer between snippets)
    const serStart = performance.now();
    const serialized = JSON.stringify(output);
    const serMs = performance.now() - serStart;

    // Validate step constraints
    const metrics: BenchmarkMetrics = {
      cpuMs: stepCpuMs,
      subrequests: step.subrequests,
    };
    const validation = validateConstraints(metrics);
    const withinConstraints = validation.withinConstraints;

    if (!withinConstraints) {
      allWithinConstraints = false;
    }

    const outputSizeBytes = serialized.length * 2; // UTF-16

    stepResults.push({
      stepId: step.id,
      cpuMs: stepCpuMs,
      withinConstraints,
      outputSizeBytes,
      serializationMs: serMs,
    });

    totalCpuMs += stepCpuMs;
    totalWallMs += stepCpuMs + simulateNetworkMs + serMs;
    totalBytesTransferred += outputSizeBytes;
    totalSerializationMs += serMs;

    // Deserialize for next step
    currentInput = JSON.parse(serialized);
  }

  return {
    chainId: chain.id,
    totalCpuMs,
    totalWallMs,
    stepResults,
    totalBytesTransferred,
    totalSerializationMs,
    allWithinConstraints,
  };
}

// =============================================================================
// Pre-built Chains
// =============================================================================

/**
 * Create a typical analytics query chain
 * Pattern: Zone Map -> Bloom Filter -> Decode -> Aggregate
 */
export function createAnalyticsChain(partitionCount: number, rowCount: number): SnippetChain {
  return {
    id: 'analytics-chain',
    name: 'Analytics Query Chain',
    steps: [
      createZoneMapStep(partitionCount),
      createBloomFilterStep(100),
      createColumnarDecodeStep(rowCount, 6),
      createAggregationStep(rowCount),
    ],
    totalEstimatedCpuMs: 3.6,
    maxParallelism: 1,
  };
}

/**
 * Create a vector search chain
 * Pattern: Zone Map -> Centroid Search -> Partition Search
 */
export function createVectorSearchChain(numCentroids: number, numVectors: number): SnippetChain {
  return {
    id: 'vector-search-chain',
    name: 'Vector Search Chain',
    steps: [
      createZoneMapStep(numCentroids),
      createVectorSearchStep(numVectors, 384),
    ],
    totalEstimatedCpuMs: 2.5,
    maxParallelism: 1,
  };
}

/**
 * Create a hybrid query chain (analytics + vector)
 */
export function createHybridChain(partitionCount: number, rowCount: number): SnippetChain {
  return {
    id: 'hybrid-chain',
    name: 'Hybrid Query Chain',
    steps: [
      createZoneMapStep(partitionCount),
      createBloomFilterStep(50),
      createColumnarDecodeStep(rowCount / 10, 4),
      createVectorSearchStep(1000, 384),
      createAggregationStep(rowCount / 100),
    ],
    totalEstimatedCpuMs: 4.5,
    maxParallelism: 1,
  };
}

// =============================================================================
// Benchmark Functions
// =============================================================================

/**
 * Benchmark chain execution
 *
 * @param chain - Chain to benchmark
 * @param iterations - Number of iterations
 * @returns Benchmark result
 */
export async function benchmarkChainExecute(
  chain: SnippetChain,
  iterations: number = 10
): Promise<ChainExecuteBenchmarkResult> {
  // Run benchmark
  const timing = await runBenchmarkAsync(
    async () => executeChain(chain, {}, 0), // No simulated network for CPU measurement
    iterations,
    2
  );

  // Get detailed execution result
  const execution = await executeChain(chain, {}, 2);

  return {
    name: `chain-execute-${chain.id}`,
    stepCount: chain.steps.length,
    totalCpuMs: execution.totalCpuMs,
    totalWallMs: execution.totalWallMs,
    avgCpuPerStepMs: execution.totalCpuMs / chain.steps.length,
    serializationOverheadPercent:
      (execution.totalSerializationMs / execution.totalCpuMs) * 100,
    allWithinConstraints: execution.allWithinConstraints,
    execution,
    timing,
  };
}

/**
 * Benchmark the analytics chain at different scales
 */
export async function benchmarkAnalyticsChainScaling(): Promise<ChainExecuteBenchmarkResult[]> {
  const results: ChainExecuteBenchmarkResult[] = [];
  const scales = [
    { partitions: 10, rows: 1000 },
    { partitions: 100, rows: 10000 },
    { partitions: 500, rows: 50000 },
    { partitions: 1000, rows: 100000 },
  ];

  for (const scale of scales) {
    const chain = createAnalyticsChain(scale.partitions, scale.rows);
    const result = await benchmarkChainExecute(chain, 5);
    results.push(result);

    // Early exit if exceeding constraints
    if (!result.allWithinConstraints) {
      break;
    }
  }

  return results;
}

/**
 * Analyze chain budget allocation
 */
export function analyzeChainBudget(chain: SnippetChain): {
  totalEstimatedCpuMs: number;
  totalSubrequests: number;
  budgetUtilization: number;
  subrequestUtilization: number;
  perStepAnalysis: Array<{
    stepId: string;
    cpuBudgetPercent: number;
    subrequestBudgetPercent: number;
  }>;
} {
  let totalSubrequests = 0;
  const perStepAnalysis = [];

  for (const step of chain.steps) {
    totalSubrequests += step.subrequests;
    perStepAnalysis.push({
      stepId: step.id,
      cpuBudgetPercent: (step.estimatedCpuMs / SNIPPETS_CONSTRAINTS.maxCpuMs) * 100,
      subrequestBudgetPercent: (step.subrequests / SNIPPETS_CONSTRAINTS.maxSubrequests) * 100,
    });
  }

  return {
    totalEstimatedCpuMs: chain.totalEstimatedCpuMs,
    totalSubrequests,
    budgetUtilization: (chain.totalEstimatedCpuMs / (chain.steps.length * SNIPPETS_CONSTRAINTS.maxCpuMs)) * 100,
    subrequestUtilization: (totalSubrequests / (chain.steps.length * SNIPPETS_CONSTRAINTS.maxSubrequests)) * 100,
    perStepAnalysis,
  };
}

// =============================================================================
// Reporting
// =============================================================================

/**
 * Format chain execution result for console output
 */
export function formatChainExecuteResult(result: ChainExecuteBenchmarkResult): string {
  const lines: string[] = [];

  lines.push(`\n=== Chain Execution Benchmark ===`);
  lines.push(`Chain: ${result.execution.chainId}`);
  lines.push(`Steps: ${result.stepCount}`);
  lines.push(`---`);
  lines.push(`Total CPU Time: ${formatMs(result.totalCpuMs)}`);
  lines.push(`Total Wall Time: ${formatMs(result.totalWallMs)}`);
  lines.push(`Avg CPU/Step: ${formatMs(result.avgCpuPerStepMs)}`);
  lines.push(`Serialization Overhead: ${result.serializationOverheadPercent.toFixed(1)}%`);
  lines.push(`Bytes Transferred: ${formatBytes(result.execution.totalBytesTransferred)}`);
  lines.push(`---`);
  lines.push(`Per-Step Breakdown:`);

  for (const step of result.execution.stepResults) {
    const status = step.withinConstraints ? 'OK' : 'EXCEEDED';
    lines.push(`  ${step.stepId}: ${formatMs(step.cpuMs)} (${status})`);
  }

  lines.push(`---`);
  lines.push(`All Within Constraints: ${result.allWithinConstraints ? 'YES' : 'NO'}`);
  lines.push(`Timing: avg=${formatMs(result.timing.avgMs)}, p99=${formatMs(result.timing.p99Ms)}`);

  return lines.join('\n');
}

/**
 * Format budget analysis for console output
 */
export function formatBudgetAnalysis(
  analysis: ReturnType<typeof analyzeChainBudget>,
  chainName: string
): string {
  const lines: string[] = [];

  lines.push(`\n=== Chain Budget Analysis: ${chainName} ===`);
  lines.push(`Total Estimated CPU: ${formatMs(analysis.totalEstimatedCpuMs)}`);
  lines.push(`Total Subrequests: ${analysis.totalSubrequests}`);
  lines.push(`CPU Budget Utilization: ${analysis.budgetUtilization.toFixed(1)}%`);
  lines.push(`Subrequest Utilization: ${analysis.subrequestUtilization.toFixed(1)}%`);
  lines.push(`---`);
  lines.push(`Per-Step Analysis:`);

  for (const step of analysis.perStepAnalysis) {
    lines.push(
      `  ${step.stepId}: CPU ${step.cpuBudgetPercent.toFixed(0)}%, Subreqs ${step.subrequestBudgetPercent.toFixed(0)}%`
    );
  }

  return lines.join('\n');
}
