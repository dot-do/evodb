/**
 * Bloom Filter Lookup Benchmark
 *
 * Tests bloom filter lookup performance within Snippets constraints.
 * Bloom filters enable fast "definitely not present" checks for
 * row-level predicate pushdown, particularly useful for point lookups
 * and semi-joins.
 *
 * Target: Lookup in bloom filter within 0.1ms (budget allocation)
 *
 * @module @evodb/benchmark/snippets/bloom-lookup
 */

import {
  SNIPPETS_CONSTRAINTS,
  CPU_BUDGET,
  assertWithinConstraints,
  validateConstraints,
  runBenchmark,
  formatBytes,
  formatMs,
  type BenchmarkMetrics,
  type ConstraintValidationResult,
} from './constraints.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Bloom filter configuration
 */
export interface BloomFilterConfig {
  /** Expected number of elements */
  expectedElements: number;
  /** Desired false positive rate (0-1) */
  falsePositiveRate: number;
}

/**
 * Bloom filter implementation optimized for Snippets
 */
export interface BloomFilter {
  /** Number of bits in the filter */
  numBits: number;
  /** Number of hash functions */
  numHashes: number;
  /** Bit array storage */
  bits: Uint32Array;
  /** Number of elements added */
  elementCount: number;
  /** Size in bytes */
  sizeBytes: number;
}

/**
 * Benchmark result for bloom filter lookup
 */
export interface BloomLookupBenchmarkResult {
  /** Benchmark name */
  name: string;
  /** Number of elements in filter */
  elementCount: number;
  /** Number of lookups performed */
  lookupCount: number;
  /** Filter size in bytes */
  filterSizeBytes: number;
  /** CPU time in milliseconds */
  cpuMs: number;
  /** Lookups per millisecond */
  lookupsPerMs: number;
  /** Time per lookup in microseconds */
  usPerLookup: number;
  /** Observed false positive rate */
  observedFpr: number;
  /** Whether within Snippets constraints */
  withinConstraints: boolean;
  /** Whether within CPU budget allocation */
  withinBudget: boolean;
  /** Detailed constraint validation */
  validation: ConstraintValidationResult;
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
// Bloom Filter Implementation
// =============================================================================

/**
 * Calculate optimal bloom filter parameters
 *
 * @param n - Expected number of elements
 * @param p - Desired false positive rate
 * @returns Optimal number of bits and hash functions
 */
export function calculateOptimalParams(n: number, p: number): { numBits: number; numHashes: number } {
  // Optimal number of bits: m = -n * ln(p) / (ln(2)^2)
  const m = Math.ceil(-n * Math.log(p) / (Math.log(2) ** 2));

  // Optimal number of hash functions: k = (m/n) * ln(2)
  const k = Math.round((m / n) * Math.log(2));

  return {
    numBits: m,
    numHashes: Math.max(1, Math.min(k, 16)), // Cap at 16 hash functions
  };
}

/**
 * Create a new bloom filter
 *
 * @param config - Filter configuration
 * @returns Empty bloom filter
 */
export function createBloomFilter(config: BloomFilterConfig): BloomFilter {
  const { numBits, numHashes } = calculateOptimalParams(
    config.expectedElements,
    config.falsePositiveRate
  );

  // Allocate bit array (using Uint32Array for efficiency)
  const numWords = Math.ceil(numBits / 32);
  const bits = new Uint32Array(numWords);

  return {
    numBits,
    numHashes,
    bits,
    elementCount: 0,
    sizeBytes: numWords * 4,
  };
}

/**
 * Hash function using MurmurHash3-like algorithm
 * Generates multiple hash values from two base hashes
 *
 * @param value - Value to hash
 * @param seed - Hash seed
 * @returns 32-bit hash value
 */
function hash(value: string | number | bigint, seed: number): number {
  let h = seed;

  // Convert to string for consistent hashing
  const str = String(value);

  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 0x5bd1e995);
    h ^= h >>> 15;
  }

  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;

  return h >>> 0; // Ensure unsigned
}

/**
 * Generate multiple hash indices for a value
 * Uses double hashing: h(i) = h1 + i * h2
 *
 * @param value - Value to hash
 * @param numHashes - Number of hash indices to generate
 * @param numBits - Size of bit array
 * @returns Array of bit indices
 */
function getHashIndices(
  value: string | number | bigint,
  numHashes: number,
  numBits: number
): number[] {
  const h1 = hash(value, 0x9747b28c);
  const h2 = hash(value, 0xc6a4a793);

  const indices: number[] = [];

  for (let i = 0; i < numHashes; i++) {
    // Double hashing: h(i) = (h1 + i * h2) mod m
    const index = ((h1 + i * h2) >>> 0) % numBits;
    indices.push(index);
  }

  return indices;
}

/**
 * Add an element to the bloom filter
 *
 * @param filter - Bloom filter
 * @param value - Value to add
 */
export function bloomAdd(filter: BloomFilter, value: string | number | bigint): void {
  const indices = getHashIndices(value, filter.numHashes, filter.numBits);

  for (const index of indices) {
    const wordIndex = index >>> 5; // index / 32
    const bitIndex = index & 31;   // index % 32
    filter.bits[wordIndex] |= (1 << bitIndex);
  }

  filter.elementCount++;
}

/**
 * Check if an element might be in the bloom filter
 *
 * @param filter - Bloom filter
 * @param value - Value to check
 * @returns true if element might be present, false if definitely not
 */
export function bloomContains(filter: BloomFilter, value: string | number | bigint): boolean {
  const indices = getHashIndices(value, filter.numHashes, filter.numBits);

  for (const index of indices) {
    const wordIndex = index >>> 5;
    const bitIndex = index & 31;
    if ((filter.bits[wordIndex] & (1 << bitIndex)) === 0) {
      return false; // Definitely not present
    }
  }

  return true; // Might be present
}

/**
 * Batch lookup multiple values in bloom filter
 *
 * @param filter - Bloom filter
 * @param values - Values to check
 * @returns Array of booleans indicating possible presence
 */
export function bloomContainsBatch(
  filter: BloomFilter,
  values: (string | number | bigint)[]
): boolean[] {
  return values.map((v) => bloomContains(filter, v));
}

// =============================================================================
// Data Generation
// =============================================================================

/**
 * Generate test data for bloom filter benchmarking
 *
 * @param elementCount - Number of elements to add to filter
 * @param fpr - Target false positive rate
 * @returns Filter and lookup data
 */
export function generateBloomTestData(
  elementCount: number,
  fpr: number = 0.01
): {
  filter: BloomFilter;
  presentValues: number[];
  absentValues: number[];
} {
  // Create filter
  const filter = createBloomFilter({
    expectedElements: elementCount,
    falsePositiveRate: fpr,
  });

  // Generate and add elements
  const presentValues: number[] = [];
  for (let i = 0; i < elementCount; i++) {
    const value = i * 2; // Even numbers
    bloomAdd(filter, value);
    presentValues.push(value);
  }

  // Generate absent values (odd numbers won't be in filter)
  const absentValues: number[] = [];
  for (let i = 0; i < elementCount; i++) {
    absentValues.push(i * 2 + 1); // Odd numbers
  }

  return { filter, presentValues, absentValues };
}

/**
 * Generate string test data (for realistic column values)
 */
export function generateStringBloomTestData(
  elementCount: number,
  fpr: number = 0.01
): {
  filter: BloomFilter;
  presentValues: string[];
  absentValues: string[];
} {
  const filter = createBloomFilter({
    expectedElements: elementCount,
    falsePositiveRate: fpr,
  });

  const presentValues: string[] = [];
  for (let i = 0; i < elementCount; i++) {
    const value = `user_${i.toString().padStart(8, '0')}`;
    bloomAdd(filter, value);
    presentValues.push(value);
  }

  const absentValues: string[] = [];
  for (let i = elementCount; i < elementCount * 2; i++) {
    absentValues.push(`user_${i.toString().padStart(8, '0')}`);
  }

  return { filter, presentValues, absentValues };
}

// =============================================================================
// Benchmark Functions
// =============================================================================

/**
 * Benchmark bloom filter lookup for a given configuration
 *
 * @param elementCount - Number of elements in filter
 * @param lookupCount - Number of lookups to perform
 * @param fpr - Target false positive rate
 * @param iterations - Number of benchmark iterations
 * @returns Detailed benchmark result
 */
export async function benchmarkBloomLookup(
  elementCount: number,
  lookupCount: number = 1000,
  fpr: number = 0.01,
  iterations: number = 20
): Promise<BloomLookupBenchmarkResult> {
  // Generate test data
  const { filter, presentValues, absentValues } = generateBloomTestData(elementCount, fpr);

  // Mix of present and absent lookups
  const lookupValues: number[] = [];
  for (let i = 0; i < lookupCount; i++) {
    if (i % 2 === 0 && i / 2 < presentValues.length) {
      lookupValues.push(presentValues[i / 2]);
    } else {
      lookupValues.push(absentValues[Math.floor(i / 2) % absentValues.length]);
    }
  }

  // Run benchmark
  const timing = runBenchmark(
    () => {
      for (const value of lookupValues) {
        bloomContains(filter, value);
      }
    },
    iterations,
    3
  );

  const cpuMs = timing.p99Ms;

  const metrics: BenchmarkMetrics = {
    cpuMs,
    memoryMb: filter.sizeBytes / (1024 * 1024),
  };

  const validation = validateConstraints(metrics);

  // Check if within budget allocation
  const withinBudget = cpuMs <= CPU_BUDGET.bloomLookup;

  // Measure actual false positive rate
  let falsePositives = 0;
  for (const value of absentValues.slice(0, 1000)) {
    if (bloomContains(filter, value)) {
      falsePositives++;
    }
  }
  const observedFpr = falsePositives / 1000;

  return {
    name: 'bloom-lookup',
    elementCount,
    lookupCount,
    filterSizeBytes: filter.sizeBytes,
    cpuMs,
    lookupsPerMs: lookupCount / timing.avgMs,
    usPerLookup: (timing.avgMs * 1000) / lookupCount,
    observedFpr,
    withinConstraints: validation.withinConstraints,
    withinBudget,
    validation,
    timing,
  };
}

/**
 * Benchmark single bloom filter lookup (for tight constraint validation)
 *
 * @param elementCount - Number of elements in filter
 * @param iterations - Number of benchmark iterations
 * @returns Detailed benchmark result for single lookup
 */
export async function benchmarkSingleBloomLookup(
  elementCount: number,
  iterations: number = 100
): Promise<BloomLookupBenchmarkResult> {
  const { filter, presentValues } = generateBloomTestData(elementCount, 0.01);
  const lookupValue = presentValues[Math.floor(presentValues.length / 2)];

  // Run benchmark for single lookup
  const timing = runBenchmark(
    () => bloomContains(filter, lookupValue),
    iterations,
    10
  );

  const cpuMs = timing.p99Ms;

  const metrics: BenchmarkMetrics = {
    cpuMs,
    memoryMb: filter.sizeBytes / (1024 * 1024),
  };

  const validation = validateConstraints(metrics);

  return {
    name: 'bloom-single-lookup',
    elementCount,
    lookupCount: 1,
    filterSizeBytes: filter.sizeBytes,
    cpuMs,
    lookupsPerMs: 1 / timing.avgMs,
    usPerLookup: timing.avgMs * 1000,
    observedFpr: 0, // N/A for single lookup
    withinConstraints: validation.withinConstraints,
    withinBudget: cpuMs <= CPU_BUDGET.bloomLookup,
    validation,
    timing,
  };
}

/**
 * Find maximum filter size that keeps lookup under budget
 *
 * @param targetMs - Target lookup time (default: 0.1ms)
 * @returns Maximum element count and results
 */
export async function findMaxFilterSize(
  targetMs: number = CPU_BUDGET.bloomLookup
): Promise<{
  maxElementCount: number;
  results: BloomLookupBenchmarkResult[];
}> {
  const results: BloomLookupBenchmarkResult[] = [];
  const testSizes = [100, 1000, 10000, 50000, 100000, 500000, 1000000];

  let maxElementCount = 0;

  for (const size of testSizes) {
    const result = await benchmarkSingleBloomLookup(size, 50);
    results.push(result);

    if (result.cpuMs <= targetMs) {
      maxElementCount = size;
    } else {
      break;
    }
  }

  return { maxElementCount, results };
}

// =============================================================================
// Serialization (for edge caching)
// =============================================================================

/**
 * Serialize bloom filter to ArrayBuffer for edge caching
 *
 * @param filter - Bloom filter to serialize
 * @returns Serialized bytes
 */
export function serializeBloomFilter(filter: BloomFilter): ArrayBuffer {
  // Header: numBits (4) + numHashes (4) + elementCount (4) = 12 bytes
  const headerSize = 12;
  const buffer = new ArrayBuffer(headerSize + filter.bits.byteLength);
  const view = new DataView(buffer);

  view.setUint32(0, filter.numBits, true);
  view.setUint32(4, filter.numHashes, true);
  view.setUint32(8, filter.elementCount, true);

  new Uint32Array(buffer, headerSize).set(filter.bits);

  return buffer;
}

/**
 * Deserialize bloom filter from ArrayBuffer
 *
 * @param buffer - Serialized bloom filter bytes
 * @returns Bloom filter
 */
export function deserializeBloomFilter(buffer: ArrayBuffer): BloomFilter {
  const view = new DataView(buffer);

  const numBits = view.getUint32(0, true);
  const numHashes = view.getUint32(4, true);
  const elementCount = view.getUint32(8, true);

  const bits = new Uint32Array(buffer, 12);

  return {
    numBits,
    numHashes,
    bits,
    elementCount,
    sizeBytes: bits.byteLength,
  };
}

// =============================================================================
// Reporting
// =============================================================================

/**
 * Format benchmark result for console output
 */
export function formatBloomLookupResult(result: BloomLookupBenchmarkResult): string {
  const lines: string[] = [];

  lines.push(`\n=== Bloom Filter Lookup Benchmark ===`);
  lines.push(`Elements: ${result.elementCount.toLocaleString()}`);
  lines.push(`Filter size: ${formatBytes(result.filterSizeBytes)}`);
  lines.push(`Lookups: ${result.lookupCount.toLocaleString()}`);
  lines.push(`---`);
  lines.push(`CPU Time (p99): ${formatMs(result.cpuMs)}`);
  lines.push(`Lookups/ms: ${Math.floor(result.lookupsPerMs).toLocaleString()}`);
  lines.push(`Time/lookup: ${result.usPerLookup.toFixed(3)}us`);
  lines.push(`Observed FPR: ${(result.observedFpr * 100).toFixed(2)}%`);
  lines.push(`---`);
  lines.push(`Timing: avg=${formatMs(result.timing.avgMs)}, min=${formatMs(result.timing.minMs)}, max=${formatMs(result.timing.maxMs)}`);
  lines.push(`---`);
  lines.push(`Within 5ms constraint: ${result.withinConstraints ? 'YES' : 'NO'}`);
  lines.push(`Within ${CPU_BUDGET.bloomLookup}ms budget: ${result.withinBudget ? 'YES' : 'NO'}`);

  return lines.join('\n');
}
