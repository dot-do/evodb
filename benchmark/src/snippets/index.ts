/**
 * Snippets Benchmark Suite
 *
 * Validates performance within Cloudflare Snippets FREE tier constraints:
 * - 5 subrequests maximum
 * - 5ms CPU time maximum
 * - 32MB memory maximum
 *
 * Each benchmark tests a specific operation critical to query execution
 * and verifies it stays within the strict Snippets limits.
 *
 * @module @evodb/benchmark/snippets
 */

// =============================================================================
// Constraint Definitions & Validators
// =============================================================================

export {
  // Constants
  SNIPPETS_CONSTRAINTS,
  CPU_BUDGET,
  MEMORY_BUDGET,

  // Types
  type BenchmarkMetrics,
  type ConstraintViolation,
  type ConstraintValidationResult,
  type SnippetsConstraints,

  // Validators
  assertWithinConstraints,
  validateConstraints,
  isWithinConstraints,
  validateCpuBudget,
  validateMemoryBudget,

  // Timing utilities
  microtime,
  measureSync,
  measureAsync,
  runBenchmark,
  runBenchmarkAsync,

  // Formatting
  formatBytes,
  formatMs,
  formatValidationResult,
} from './constraints.js';

// =============================================================================
// Columnar Decode Benchmark
// =============================================================================

export {
  // Types
  type ColumnarType,
  type ColumnDefinition,
  type ColumnarData,
  type DecodedResult,
  type TypedColumnData,
  type ColumnarDecodeBenchmarkResult,

  // Data generation
  generateColumnarData,

  // Decode functions
  decodeColumnar,
  decodeColumnarProjected,

  // Benchmarks
  benchmarkColumnarDecode,
  benchmarkColumnarDecodeProjected,
  findMaxDecodeSizeMb,

  // Formatting
  formatColumnarDecodeResult,
} from './columnar-decode.js';

// =============================================================================
// Zone Map Pruning Benchmark
// =============================================================================

export {
  // Types
  type ColumnStats,
  type ZoneMap,
  type FilterPredicate,
  type ZoneMapPruneResult,
  type ZoneMapPruneBenchmarkResult,

  // Data generation
  generateZoneMaps,
  generatePredicates,

  // Evaluation
  evaluateZoneMaps,

  // Benchmarks
  benchmarkZoneMapPrune,
  findMaxPartitionCount,

  // Formatting
  formatZoneMapPruneResult,
} from './zone-map-prune.js';

// =============================================================================
// Bloom Filter Lookup Benchmark
// =============================================================================

export {
  // Types
  type BloomFilterConfig,
  type BloomFilter,
  type BloomLookupBenchmarkResult,

  // Filter operations
  calculateOptimalParams,
  createBloomFilter,
  bloomAdd,
  bloomContains,
  bloomContainsBatch,

  // Data generation
  generateBloomTestData,
  generateStringBloomTestData,

  // Serialization
  serializeBloomFilter,
  deserializeBloomFilter,

  // Benchmarks
  benchmarkBloomLookup,
  benchmarkSingleBloomLookup,
  findMaxFilterSize,

  // Formatting
  formatBloomLookupResult,
} from './bloom-lookup.js';

// =============================================================================
// IVF-PQ Centroid Search Benchmark
// =============================================================================

export {
  // Types
  type DistanceMetric,
  type CentroidIndex,
  type CentroidSearchResult,
  type IvfCentroidBenchmarkResult,

  // Index creation
  createCentroidIndex,
  generateQueryVector,

  // Search
  searchCentroids,
  searchCentroidsOptimized,

  // Memory analysis
  analyzeCentroidMemory,

  // Benchmarks
  benchmarkIvfCentroidSearch,
  benchmarkCentroidScaling,
  benchmarkNprobesScaling,
  benchmarkDimensionScaling,

  // Formatting
  formatIvfCentroidResult,
  formatMemoryAnalysis,
} from './ivf-centroid.js';

// =============================================================================
// Chain Execution Benchmark
// =============================================================================

export {
  // Types
  type SnippetStep,
  type SnippetChain,
  type StepExecutionResult,
  type ChainExecutionResult,
  type ChainExecuteBenchmarkResult,

  // Step factories
  createZoneMapStep,
  createBloomFilterStep,
  createColumnarDecodeStep,
  createAggregationStep,
  createVectorSearchStep,

  // Chain factories
  createAnalyticsChain,
  createVectorSearchChain,
  createHybridChain,

  // Execution
  executeChain,

  // Analysis
  analyzeChainBudget,

  // Benchmarks
  benchmarkChainExecute,
  benchmarkAnalyticsChainScaling,

  // Formatting
  formatChainExecuteResult,
  formatBudgetAnalysis,
} from './chain-execute.js';

// =============================================================================
// Convenience: Run All Benchmarks
// =============================================================================

import { benchmarkColumnarDecode } from './columnar-decode.js';
import { benchmarkZoneMapPrune } from './zone-map-prune.js';
import { benchmarkBloomLookup } from './bloom-lookup.js';
import { benchmarkIvfCentroidSearch } from './ivf-centroid.js';
import { benchmarkChainExecute, createAnalyticsChain } from './chain-execute.js';
import { SNIPPETS_CONSTRAINTS } from './constraints.js';

/**
 * Complete benchmark suite result
 */
export interface SnippetsBenchmarkSuiteResult {
  /** Timestamp of benchmark run */
  timestamp: number;
  /** Constraints used */
  constraints: typeof SNIPPETS_CONSTRAINTS;
  /** Individual benchmark results */
  results: {
    columnarDecode: Awaited<ReturnType<typeof benchmarkColumnarDecode>>;
    zoneMapPrune: Awaited<ReturnType<typeof benchmarkZoneMapPrune>>;
    bloomLookup: Awaited<ReturnType<typeof benchmarkBloomLookup>>;
    ivfCentroid: Awaited<ReturnType<typeof benchmarkIvfCentroidSearch>>;
    chainExecute: Awaited<ReturnType<typeof benchmarkChainExecute>>;
  };
  /** Summary statistics */
  summary: {
    totalBenchmarks: number;
    passedConstraints: number;
    failedConstraints: number;
    allPassed: boolean;
  };
}

/**
 * Run complete snippets benchmark suite
 *
 * @param verbose - Print results to console
 * @returns Complete suite results
 */
export async function runSnippetsBenchmarkSuite(
  verbose: boolean = true
): Promise<SnippetsBenchmarkSuiteResult> {
  if (verbose) {
    console.log('='.repeat(60));
    console.log('SNIPPETS CONSTRAINT VALIDATION BENCHMARK SUITE');
    console.log('='.repeat(60));
    console.log(`\nConstraints:`);
    console.log(`  - Max CPU: ${SNIPPETS_CONSTRAINTS.maxCpuMs}ms`);
    console.log(`  - Max Memory: ${SNIPPETS_CONSTRAINTS.maxMemoryMb}MB`);
    console.log(`  - Max Subrequests: ${SNIPPETS_CONSTRAINTS.maxSubrequests}`);
    console.log('');
  }

  // Run individual benchmarks
  if (verbose) console.log('Running columnar decode benchmark...');
  const columnarDecode = await benchmarkColumnarDecode(1.0, 10);

  if (verbose) console.log('Running zone map prune benchmark...');
  const zoneMapPrune = await benchmarkZoneMapPrune(100, 3, 0.1, 10);

  if (verbose) console.log('Running bloom lookup benchmark...');
  const bloomLookup = await benchmarkBloomLookup(10000, 1000, 0.01, 10);

  if (verbose) console.log('Running IVF centroid search benchmark...');
  const ivfCentroid = await benchmarkIvfCentroidSearch(256, 384, 3, 'l2', 10);

  if (verbose) console.log('Running chain execute benchmark...');
  const analyticsChain = createAnalyticsChain(100, 10000);
  const chainExecute = await benchmarkChainExecute(analyticsChain, 5);

  // Calculate summary
  const results = {
    columnarDecode,
    zoneMapPrune,
    bloomLookup,
    ivfCentroid,
    chainExecute,
  };

  const constraintResults = [
    columnarDecode.withinConstraints,
    zoneMapPrune.withinConstraints,
    bloomLookup.withinConstraints,
    ivfCentroid.withinConstraints,
    chainExecute.allWithinConstraints,
  ];

  const passedConstraints = constraintResults.filter(Boolean).length;
  const failedConstraints = constraintResults.length - passedConstraints;

  const suiteResult: SnippetsBenchmarkSuiteResult = {
    timestamp: Date.now(),
    constraints: SNIPPETS_CONSTRAINTS,
    results,
    summary: {
      totalBenchmarks: constraintResults.length,
      passedConstraints,
      failedConstraints,
      allPassed: failedConstraints === 0,
    },
  };

  if (verbose) {
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`\nTotal benchmarks: ${suiteResult.summary.totalBenchmarks}`);
    console.log(`Passed: ${suiteResult.summary.passedConstraints}`);
    console.log(`Failed: ${suiteResult.summary.failedConstraints}`);
    console.log(`\nResult: ${suiteResult.summary.allPassed ? 'ALL PASSED' : 'SOME FAILED'}`);

    console.log('\nDetailed Results:');
    console.log(`  Columnar Decode (1MB): ${columnarDecode.cpuMs.toFixed(3)}ms - ${columnarDecode.withinConstraints ? 'PASS' : 'FAIL'}`);
    console.log(`  Zone Map Prune (100 partitions): ${zoneMapPrune.cpuMs.toFixed(3)}ms - ${zoneMapPrune.withinConstraints ? 'PASS' : 'FAIL'}`);
    console.log(`  Bloom Lookup (1000 lookups): ${bloomLookup.cpuMs.toFixed(3)}ms - ${bloomLookup.withinConstraints ? 'PASS' : 'FAIL'}`);
    console.log(`  IVF Centroid (256 centroids): ${ivfCentroid.cpuMs.toFixed(3)}ms - ${ivfCentroid.withinConstraints ? 'PASS' : 'FAIL'}`);
    console.log(`  Chain Execute (4 steps): ${chainExecute.totalCpuMs.toFixed(3)}ms - ${chainExecute.allWithinConstraints ? 'PASS' : 'FAIL'}`);
  }

  return suiteResult;
}
