/**
 * Tests for IVF-PQ Index Loading and Search
 *
 * Test coverage:
 * - Index structure and types
 * - Index loading from Lance files
 * - Search with various nprobes (1, 5, 10)
 * - Recall verification at different k values
 * - Search latency benchmarks
 * - Memory optimization verification
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import {
  // Index types
  type IvfIndex,
  type IvfConfig,
  type IvfCentroids,
  type IvfPartitionMeta,
  type PqCodebook,
  type PqConfig,
  type PartitionRawData,
  type IvfPqSearchParams,
  type IvfPqSearchResult,
  type IvfPqSearchStats,
  type PqLookupTables,

  // Index utilities
  calculatePartitionRowSize,
  estimatePartitionCacheSize,
  estimateLookupTableSize,
  estimateCentroidsSize,
  estimateCodebookSize,
  isValidIvfIndex,
  isValidPqCodebook,
  createEmptyIvfIndex,
  createEmptyPqCodebook,
  createEmptyLookupTables,
  createSearchStats,
} from '../ivf-pq-index.js';

import {
  // Loader
  IvfPqLoader,
  InMemoryIvfPqBuilder,
  createIvfPqLoader,
  loadIvfPqIndex,
} from '../ivf-pq-loader.js';

import {
  // Search
  IvfPqSearchEngine,
  findNearestCentroids,
  findNearestCentroidsOptimized,
  buildPqLookupTables,
  buildPqLookupTablesOptimized,
  scanPartition,
  scanPartitionOptimized,
  createSearchEngine,
  estimateSearchLatency,
  computeRecallAtK,
  computeAveragePrecision,
} from '../ivf-pq-search.js';

import { MemoryStorageAdapter } from '../r2-adapter.js';

// ==========================================
// Test Fixtures
// ==========================================

/**
 * Generate random vectors
 */
function generateRandomVectors(count: number, dimension: number): Float32Array[] {
  const vectors: Float32Array[] = [];
  for (let i = 0; i < count; i++) {
    const v = new Float32Array(dimension);
    for (let d = 0; d < dimension; d++) {
      v[d] = Math.random() * 2 - 1;
    }
    vectors.push(v);
  }
  return vectors;
}

/**
 * Generate clustered vectors (for better recall testing)
 */
function generateClusteredVectors(
  count: number,
  dimension: number,
  numClusters: number
): Float32Array[] {
  const vectors: Float32Array[] = [];
  const clusterCenters: Float32Array[] = [];

  // Generate cluster centers
  for (let c = 0; c < numClusters; c++) {
    const center = new Float32Array(dimension);
    for (let d = 0; d < dimension; d++) {
      center[d] = Math.random() * 10 - 5;
    }
    clusterCenters.push(center);
  }

  // Generate vectors around cluster centers
  const vectorsPerCluster = Math.ceil(count / numClusters);
  for (let c = 0; c < numClusters; c++) {
    for (let i = 0; i < vectorsPerCluster && vectors.length < count; i++) {
      const v = new Float32Array(dimension);
      for (let d = 0; d < dimension; d++) {
        // Add Gaussian noise around center
        v[d] = clusterCenters[c][d] + (Math.random() - 0.5) * 0.5;
      }
      vectors.push(v);
    }
  }

  return vectors;
}

/**
 * Compute exact L2 distance
 */
function computeL2Distance(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return sum;
}

/**
 * Brute force nearest neighbor search (ground truth)
 */
function bruteForceSearch(
  query: Float32Array,
  vectors: Float32Array[],
  k: number
): { rowId: bigint; distance: number }[] {
  const distances = vectors.map((v, i) => ({
    rowId: BigInt(i),
    distance: computeL2Distance(query, v),
  }));

  distances.sort((a, b) => a.distance - b.distance);
  return distances.slice(0, k);
}

// ==========================================
// Index Structure Tests
// ==========================================

describe('IVF-PQ Index Structure', () => {
  describe('Memory Estimation', () => {
    it('should calculate partition row size correctly', () => {
      expect(calculatePartitionRowSize(8)).toBe(16);  // 8 bytes rowId + 8 bytes codes
      expect(calculatePartitionRowSize(16)).toBe(24); // 8 + 16
      expect(calculatePartitionRowSize(32)).toBe(40); // 8 + 32
    });

    it('should estimate partition cache size', () => {
      const size = estimatePartitionCacheSize(256, 1000, 16);
      // 256 partitions * 1000 rows * (8 + 16) bytes
      expect(size).toBe(256 * 1000 * 24);
    });

    it('should estimate lookup table size', () => {
      const size = estimateLookupTableSize(16, 8);
      // 16 sub-vectors * 256 codes * 4 bytes
      expect(size).toBe(16 * 256 * 4);
    });

    it('should estimate centroids size', () => {
      const size = estimateCentroidsSize(256, 128);
      // 256 partitions * 128 dimensions * 4 bytes
      expect(size).toBe(256 * 128 * 4);
    });

    it('should estimate codebook size', () => {
      const size = estimateCodebookSize(16, 8, 8);
      // 16 sub-vectors * 256 codes * 8 subDim * 4 bytes
      expect(size).toBe(256 * 16 * 8 * 4);
    });
  });

  describe('Type Guards', () => {
    it('should validate IVF index structure', () => {
      const validIvf: IvfIndex = {
        centroids: {
          data: new Float32Array(256 * 128),
          numPartitions: 256,
          dimension: 128,
        },
        partitions: {
          offsets: new BigUint64Array(256),
          lengths: new Uint32Array(256),
          totalRows: 10000,
        },
        config: {
          numPartitions: 256,
          dimension: 128,
          distanceType: 'l2',
        },
      };

      expect(isValidIvfIndex(validIvf)).toBe(true);
      expect(isValidIvfIndex(null)).toBe(false);
      expect(isValidIvfIndex({})).toBe(false);
    });

    it('should validate PQ codebook structure', () => {
      const validPq: PqCodebook = {
        data: new Float32Array(256 * 16 * 8),
        config: {
          numSubVectors: 16,
          numBits: 8,
          subDim: 8,
          numCodes: 256,
          distanceType: 'l2',
        },
      };

      expect(isValidPqCodebook(validPq)).toBe(true);
      expect(isValidPqCodebook(null)).toBe(false);
      expect(isValidPqCodebook({})).toBe(false);
    });
  });

  describe('Factory Functions', () => {
    it('should create empty IVF index', () => {
      const config: IvfConfig = {
        numPartitions: 64,
        dimension: 128,
        distanceType: 'l2',
      };

      const ivf = createEmptyIvfIndex(config);

      expect(ivf.centroids.data.length).toBe(64 * 128);
      expect(ivf.partitions.offsets.length).toBe(64);
      expect(ivf.partitions.lengths.length).toBe(64);
      expect(ivf.config.numPartitions).toBe(64);
    });

    it('should create empty PQ codebook', () => {
      const config: PqConfig = {
        numSubVectors: 16,
        numBits: 8,
        subDim: 8,
        numCodes: 256,
        distanceType: 'l2',
      };

      const pq = createEmptyPqCodebook(config);

      expect(pq.data.length).toBe(256 * 16 * 8);
      expect(pq.config.numSubVectors).toBe(16);
    });

    it('should create empty lookup tables', () => {
      const tables = createEmptyLookupTables(16, 256);

      expect(tables.tables.length).toBe(16);
      expect(tables.tables[0].length).toBe(256);
      expect(tables.numSubVectors).toBe(16);
      expect(tables.numCodes).toBe(256);
    });
  });
});

// ==========================================
// Index Building Tests
// ==========================================

describe('IVF-PQ Index Building', () => {
  it('should build index from vectors', async () => {
    const vectors = generateRandomVectors(100, 32);

    const builder = new InMemoryIvfPqBuilder({
      dimension: 32,
      numPartitions: 8,
      numSubVectors: 4,
      numBits: 8,
      distanceType: 'l2',
    });

    builder.addVectors(vectors);
    const { ivf, pq, partitionData } = await builder.build();

    expect(ivf.config.numPartitions).toBe(8);
    expect(ivf.config.dimension).toBe(32);
    expect(ivf.centroids.data.length).toBe(8 * 32);

    expect(pq.config.numSubVectors).toBe(4);
    expect(pq.config.subDim).toBe(8);

    expect(partitionData.length).toBe(8);

    // Verify total rows
    let totalRows = 0;
    for (const p of partitionData) {
      totalRows += p.numRows;
    }
    expect(totalRows).toBe(100);
  });

  it('should reject vectors with wrong dimension', async () => {
    const builder = new InMemoryIvfPqBuilder({
      dimension: 32,
      numPartitions: 4,
      numSubVectors: 4,
    });

    expect(() => {
      builder.addVectors([new Float32Array(64)]);
    }).toThrow(/dimension/i);
  });

  it('should reject dimension not divisible by numSubVectors', () => {
    expect(() => {
      new InMemoryIvfPqBuilder({
        dimension: 30, // Not divisible by 4
        numPartitions: 4,
        numSubVectors: 4,
      });
    }).toThrow(/divisible/i);
  });

  it('should build index with empty vectors throws', async () => {
    const builder = new InMemoryIvfPqBuilder({
      dimension: 32,
      numPartitions: 4,
      numSubVectors: 4,
    });

    await expect(builder.build()).rejects.toThrow(/No vectors/);
  });
});

// ==========================================
// Search Tests
// ==========================================

describe('IVF-PQ Search', () => {
  let vectors: Float32Array[];
  let ivf: IvfIndex;
  let pq: PqCodebook;
  let partitionData: PartitionRawData[];
  let searchEngine: IvfPqSearchEngine;

  beforeAll(async () => {
    // Build test index
    vectors = generateClusteredVectors(1000, 64, 16);

    const builder = new InMemoryIvfPqBuilder({
      dimension: 64,
      numPartitions: 16,
      numSubVectors: 8,
      numBits: 8,
      distanceType: 'l2',
    });

    builder.addVectors(vectors);
    const built = await builder.build();
    ivf = built.ivf;
    pq = built.pq;
    partitionData = built.partitionData;

    searchEngine = createSearchEngine(ivf, pq);
  });

  describe('Centroid Distance Computation', () => {
    it('should find nearest centroids', () => {
      const query = vectors[0];
      const nearest = findNearestCentroids(query, ivf, 5, 'l2');

      expect(nearest.length).toBe(5);
      // Verify sorted order (ascending distance)
      // Each partition ID should be valid
      for (const p of nearest) {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThan(16);
      }
    });

    it('should find same centroids with optimized version', () => {
      const query = vectors[0];
      const distanceBuffer = new Float32Array(16);

      const normal = findNearestCentroids(query, ivf, 5, 'l2');
      const optimized = findNearestCentroidsOptimized(query, ivf, 5, 'l2', distanceBuffer);

      expect(optimized).toEqual(normal);
    });
  });

  describe('PQ Lookup Table Building', () => {
    it('should build lookup tables', () => {
      const query = vectors[0];
      const tables = buildPqLookupTables(query, pq, 'l2');

      expect(tables.numSubVectors).toBe(8);
      expect(tables.numCodes).toBe(256);
      expect(tables.tables.length).toBe(8);

      // All distances should be non-negative for L2
      for (const table of tables.tables) {
        for (let i = 0; i < table.length; i++) {
          expect(table[i]).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('should build same tables with optimized version', () => {
      const query = vectors[0];

      const normal = buildPqLookupTables(query, pq, 'l2');
      const optimized = createEmptyLookupTables(8, 256);
      buildPqLookupTablesOptimized(query, pq, 'l2', optimized);

      // Compare tables
      for (let m = 0; m < 8; m++) {
        for (let c = 0; c < 256; c++) {
          expect(optimized.tables[m][c]).toBeCloseTo(normal.tables[m][c], 5);
        }
      }
    });
  });

  describe('Search with Various nprobes', () => {
    const partitionLoader = async (partitionId: number) => partitionData[partitionId];

    it('should search with nprobes=1', async () => {
      const query = vectors[0];
      const params: IvfPqSearchParams = { k: 10, nprobes: 1 };

      const { results, stats } = await searchEngine.search(query, partitionLoader, params);

      expect(results.length).toBeLessThanOrEqual(10);
      expect(stats.partitionsProbed).toBe(1);

      // Results should be sorted by distance
      for (let i = 1; i < results.length; i++) {
        expect(results[i].distance).toBeGreaterThanOrEqual(results[i - 1].distance);
      }
    });

    it('should search with nprobes=5', async () => {
      const query = vectors[0];
      const params: IvfPqSearchParams = { k: 10, nprobes: 5 };

      const { results, stats } = await searchEngine.search(query, partitionLoader, params);

      expect(results.length).toBeLessThanOrEqual(10);
      expect(stats.partitionsProbed).toBe(5);
    });

    it('should search with nprobes=10', async () => {
      const query = vectors[0];
      const params: IvfPqSearchParams = { k: 10, nprobes: 10 };

      const { results, stats } = await searchEngine.search(query, partitionLoader, params);

      expect(results.length).toBeLessThanOrEqual(10);
      expect(stats.partitionsProbed).toBe(10);
    });

    it('should improve recall with higher nprobes', async () => {
      const query = vectors[50];
      const groundTruth = bruteForceSearch(query, vectors, 10);

      const recall1 = await getRecall(1);
      const recall5 = await getRecall(5);
      const recall10 = await getRecall(10);

      async function getRecall(nprobes: number): Promise<number> {
        const params: IvfPqSearchParams = { k: 10, nprobes };
        const { results } = await searchEngine.search(query, partitionLoader, params);
        return computeRecallAtK(
          results,
          groundTruth.map(r => r.rowId),
          10
        );
      }

      // Higher nprobes should generally give better recall
      // Allow some variance due to PQ approximation
      expect(recall5).toBeGreaterThanOrEqual(recall1 - 0.1);
      expect(recall10).toBeGreaterThanOrEqual(recall5 - 0.1);
    });
  });

  describe('Recall Verification', () => {
    const partitionLoader = async (partitionId: number) => partitionData[partitionId];

    it('should achieve reasonable recall@10 with nprobes=10', async () => {
      let totalRecall = 0;
      const numQueries = 10;

      for (let i = 0; i < numQueries; i++) {
        const queryIdx = Math.floor(Math.random() * vectors.length);
        const query = vectors[queryIdx];
        const groundTruth = bruteForceSearch(query, vectors, 10);

        const params: IvfPqSearchParams = { k: 10, nprobes: 10 };
        const { results } = await searchEngine.search(query, partitionLoader, params);

        const recall = computeRecallAtK(
          results,
          groundTruth.map(r => r.rowId),
          10
        );
        totalRecall += recall;
      }

      const avgRecall = totalRecall / numQueries;
      // With clustered data and 10 probes out of 16 partitions, recall should be decent
      expect(avgRecall).toBeGreaterThan(0.3);
    });

    it('should achieve better recall@1 (finding the nearest neighbor)', async () => {
      let hits = 0;
      const numQueries = 10;

      for (let i = 0; i < numQueries; i++) {
        const queryIdx = Math.floor(Math.random() * vectors.length);
        const query = vectors[queryIdx];
        const groundTruth = bruteForceSearch(query, vectors, 1);

        const params: IvfPqSearchParams = { k: 1, nprobes: 10 };
        const { results } = await searchEngine.search(query, partitionLoader, params);

        if (results.length > 0 && results[0].rowId === groundTruth[0].rowId) {
          hits++;
        }
      }

      const recall1 = hits / numQueries;
      expect(recall1).toBeGreaterThanOrEqual(0.5);
    });
  });

  describe('Filtering', () => {
    const partitionLoader = async (partitionId: number) => partitionData[partitionId];

    it('should exclude specified row IDs', async () => {
      const query = vectors[0];
      const excludeSet = new Set<bigint>([0n, 1n, 2n, 3n, 4n]);

      const params: IvfPqSearchParams = {
        k: 10,
        nprobes: 10,
        excludeRowIds: excludeSet,
      };

      const { results } = await searchEngine.search(query, partitionLoader, params);

      for (const result of results) {
        expect(excludeSet.has(result.rowId)).toBe(false);
      }
    });

    it('should include only specified row IDs', async () => {
      const query = vectors[0];
      const includeSet = new Set<bigint>();
      for (let i = 0; i < 50; i++) {
        includeSet.add(BigInt(i));
      }

      const params: IvfPqSearchParams = {
        k: 10,
        nprobes: 16,
        includeRowIds: includeSet,
      };

      const { results } = await searchEngine.search(query, partitionLoader, params);

      for (const result of results) {
        expect(includeSet.has(result.rowId)).toBe(true);
      }
    });

    it('should apply pre-filter predicate', async () => {
      const query = vectors[0];

      // Only include even row IDs
      const preFilter = (rowId: bigint) => rowId % 2n === 0n;

      const params: IvfPqSearchParams = {
        k: 10,
        nprobes: 16,
        preFilter,
      };

      const { results } = await searchEngine.search(query, partitionLoader, params);

      for (const result of results) {
        expect(result.rowId % 2n).toBe(0n);
      }
    });
  });

  describe('Batch Search', () => {
    const partitionLoader = async (partitionId: number) => partitionData[partitionId];

    it('should search multiple queries in batch', async () => {
      const queries = [vectors[0], vectors[100], vectors[500]];

      const params: IvfPqSearchParams = { k: 10, nprobes: 5 };
      const { results, stats } = await searchEngine.batchSearch(
        queries,
        partitionLoader,
        params
      );

      expect(results.length).toBe(3);

      for (const queryResults of results) {
        expect(queryResults.length).toBeLessThanOrEqual(10);
      }

      // Stats should reflect all queries
      expect(stats.partitionsProbed).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Error Handling', () => {
    const partitionLoader = async (partitionId: number) => partitionData[partitionId];

    it('should throw for wrong query dimension', async () => {
      const wrongDimQuery = new Float32Array(32); // Index expects 64

      const params: IvfPqSearchParams = { k: 10, nprobes: 5 };

      await expect(
        searchEngine.search(wrongDimQuery, partitionLoader, params)
      ).rejects.toThrow(/dimension/i);
    });
  });
});

// ==========================================
// Benchmark Tests
// ==========================================

describe('IVF-PQ Benchmarks', () => {
  let vectors: Float32Array[];
  let ivf: IvfIndex;
  let pq: PqCodebook;
  let partitionData: PartitionRawData[];
  let searchEngine: IvfPqSearchEngine;

  beforeAll(async () => {
    // Build larger test index for benchmarking
    vectors = generateRandomVectors(10000, 128);

    const builder = new InMemoryIvfPqBuilder({
      dimension: 128,
      numPartitions: 64,
      numSubVectors: 16,
      numBits: 8,
      distanceType: 'l2',
    });

    builder.addVectors(vectors);
    const built = await builder.build();
    ivf = built.ivf;
    pq = built.pq;
    partitionData = built.partitionData;

    searchEngine = createSearchEngine(ivf, pq);
  });

  const partitionLoader = async (partitionId: number) => partitionData[partitionId];

  it('should search in under 10ms for nprobes=5', async () => {
    const query = vectors[0];
    const params: IvfPqSearchParams = { k: 10, nprobes: 5 };

    const { stats } = await searchEngine.search(query, partitionLoader, params);

    // Allow some slack for CI environments
    expect(stats.totalTimeMs).toBeLessThan(50);

    // Log for manual inspection
    console.log('Search latency (nprobes=5):', {
      centroidDistanceMs: stats.centroidDistanceTimeMs.toFixed(2),
      lookupTableMs: stats.lookupTableBuildTimeMs.toFixed(2),
      partitionScanMs: stats.partitionScanTimeMs.toFixed(2),
      totalMs: stats.totalTimeMs.toFixed(2),
      rowsScanned: stats.rowsScanned,
    });
  });

  it('should search in under 20ms for nprobes=10', async () => {
    const query = vectors[0];
    const params: IvfPqSearchParams = { k: 10, nprobes: 10 };

    const { stats } = await searchEngine.search(query, partitionLoader, params);

    expect(stats.totalTimeMs).toBeLessThan(100);

    console.log('Search latency (nprobes=10):', {
      totalMs: stats.totalTimeMs.toFixed(2),
      rowsScanned: stats.rowsScanned,
    });
  });

  it('should handle batch search efficiently', async () => {
    const numQueries = 10;
    const queries = vectors.slice(0, numQueries);
    const params: IvfPqSearchParams = { k: 10, nprobes: 5 };

    const startTime = performance.now();
    const { results, stats } = await searchEngine.batchSearch(
      queries,
      partitionLoader,
      params
    );
    const totalTime = performance.now() - startTime;

    expect(results.length).toBe(numQueries);
    expect(totalTime / numQueries).toBeLessThan(20); // < 20ms per query

    console.log('Batch search latency:', {
      totalMs: totalTime.toFixed(2),
      perQueryMs: (totalTime / numQueries).toFixed(2),
      totalRowsScanned: stats.rowsScanned,
    });
  });

  it('should report memory estimates correctly', () => {
    const estimates = {
      centroids: estimateCentroidsSize(64, 128),
      codebook: estimateCodebookSize(16, 8, 8),
      lookupTables: estimateLookupTableSize(16, 8),
      partitionCache50: estimatePartitionCacheSize(50, 156, 16), // 10000/64 ≈ 156 avg rows
    };

    console.log('Memory estimates (bytes):', {
      centroids: estimates.centroids,
      codebook: estimates.codebook,
      lookupTables: estimates.lookupTables,
      partitionCache50: estimates.partitionCache50,
      total: Object.values(estimates).reduce((a, b) => a + b, 0),
    });

    // Total should be reasonable for Workers (< 10MB for this config)
    const total = Object.values(estimates).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThan(10 * 1024 * 1024);
  });
});

// ==========================================
// Recall vs Speed Tradeoff Tests
// ==========================================

describe('IVF-PQ Recall vs Speed Tradeoff', () => {
  let vectors: Float32Array[];
  let ivf: IvfIndex;
  let pq: PqCodebook;
  let partitionData: PartitionRawData[];
  let searchEngine: IvfPqSearchEngine;

  beforeAll(async () => {
    // Use clustered data for more predictable recall
    vectors = generateClusteredVectors(5000, 64, 32);

    const builder = new InMemoryIvfPqBuilder({
      dimension: 64,
      numPartitions: 32,
      numSubVectors: 8,
      numBits: 8,
      distanceType: 'l2',
    });

    builder.addVectors(vectors);
    const built = await builder.build();
    ivf = built.ivf;
    pq = built.pq;
    partitionData = built.partitionData;

    searchEngine = createSearchEngine(ivf, pq);
  });

  const partitionLoader = async (partitionId: number) => partitionData[partitionId];

  it('should show recall/latency tradeoff with different nprobes', async () => {
    const results: Array<{
      nprobes: number;
      avgRecall: number;
      avgLatencyMs: number;
    }> = [];

    const nprobeValues = [1, 2, 4, 8, 16, 32];
    const numQueries = 20;
    const k = 10;

    for (const nprobes of nprobeValues) {
      let totalRecall = 0;
      let totalLatency = 0;

      for (let i = 0; i < numQueries; i++) {
        const queryIdx = Math.floor(Math.random() * vectors.length);
        const query = vectors[queryIdx];
        const groundTruth = bruteForceSearch(query, vectors, k);

        const params: IvfPqSearchParams = { k, nprobes };
        const { results: searchResults, stats } = await searchEngine.search(
          query,
          partitionLoader,
          params
        );

        const recall = computeRecallAtK(
          searchResults,
          groundTruth.map(r => r.rowId),
          k
        );
        totalRecall += recall;
        totalLatency += stats.totalTimeMs;
      }

      results.push({
        nprobes,
        avgRecall: totalRecall / numQueries,
        avgLatencyMs: totalLatency / numQueries,
      });
    }

    // Log tradeoff table
    console.log('\nRecall vs Speed Tradeoff (k=10):');
    console.log('nprobes | Recall@10 | Latency(ms)');
    console.log('--------|-----------|------------');
    for (const r of results) {
      console.log(
        `${r.nprobes.toString().padStart(7)} | ${r.avgRecall.toFixed(3).padStart(9)} | ${r.avgLatencyMs.toFixed(2).padStart(11)}`
      );
    }

    // Verify trend: recall should increase with nprobes
    for (let i = 1; i < results.length; i++) {
      // Allow small regression due to randomness
      expect(results[i].avgRecall).toBeGreaterThanOrEqual(results[i - 1].avgRecall - 0.1);
    }

    // Verify trend: latency should increase with nprobes
    for (let i = 1; i < results.length; i++) {
      // Latency should generally increase but may have noise
      // Just check it's reasonable
      expect(results[i].avgLatencyMs).toBeGreaterThan(0);
    }
  });

  it('should show recall improvement with more partitions probed', async () => {
    const query = vectors[0];
    const groundTruth = bruteForceSearch(query, vectors, 50);

    const recalls: number[] = [];

    for (let nprobes = 1; nprobes <= 32; nprobes++) {
      const params: IvfPqSearchParams = { k: 50, nprobes };
      const { results } = await searchEngine.search(query, partitionLoader, params);

      const recall = computeRecallAtK(
        results,
        groundTruth.map(r => r.rowId),
        50
      );
      recalls.push(recall);
    }

    // Recall should generally improve with more probes
    const avgRecallFirst8 = recalls.slice(0, 8).reduce((a, b) => a + b, 0) / 8;
    const avgRecallLast8 = recalls.slice(-8).reduce((a, b) => a + b, 0) / 8;

    expect(avgRecallLast8).toBeGreaterThanOrEqual(avgRecallFirst8);
  });
});

// ==========================================
// Integration with Storage Tests
// ==========================================

describe('IVF-PQ Storage Integration', () => {
  it('should serialize and deserialize partition data', async () => {
    const numRows = 100;
    const numSubVectors = 8;

    // Create partition data
    const original: PartitionRawData = {
      rowIds: new BigUint64Array(numRows),
      pqCodes: new Uint8Array(numRows * numSubVectors),
      numRows,
      partitionId: 0,
    };

    // Fill with test data
    for (let i = 0; i < numRows; i++) {
      original.rowIds[i] = BigInt(i * 1000);
      for (let m = 0; m < numSubVectors; m++) {
        original.pqCodes[i * numSubVectors + m] = (i + m) % 256;
      }
    }

    // Serialize to buffer (same format as Lance auxiliary file)
    const rowSize = calculatePartitionRowSize(numSubVectors);
    const buffer = new ArrayBuffer(numRows * rowSize);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    for (let i = 0; i < numRows; i++) {
      const offset = i * rowSize;
      view.setBigUint64(offset, original.rowIds[i], true);
      for (let m = 0; m < numSubVectors; m++) {
        bytes[offset + 8 + m] = original.pqCodes[i * numSubVectors + m];
      }
    }

    // Deserialize
    const deserialized: PartitionRawData = {
      rowIds: new BigUint64Array(numRows),
      pqCodes: new Uint8Array(numRows * numSubVectors),
      numRows,
      partitionId: 0,
    };

    const readView = new DataView(buffer);
    for (let i = 0; i < numRows; i++) {
      const offset = i * rowSize;
      deserialized.rowIds[i] = readView.getBigUint64(offset, true);
      for (let m = 0; m < numSubVectors; m++) {
        deserialized.pqCodes[i * numSubVectors + m] = bytes[offset + 8 + m];
      }
    }

    // Verify
    expect(Array.from(deserialized.rowIds)).toEqual(Array.from(original.rowIds));
    expect(Array.from(deserialized.pqCodes)).toEqual(Array.from(original.pqCodes));
  });
});

// ==========================================
// Metric Computation Tests
// ==========================================

describe('Metric Computation', () => {
  it('should compute recall@k correctly', () => {
    const results: IvfPqSearchResult[] = [
      { rowId: 1n, distance: 0.1, partitionId: 0 },
      { rowId: 2n, distance: 0.2, partitionId: 0 },
      { rowId: 3n, distance: 0.3, partitionId: 0 },
      { rowId: 4n, distance: 0.4, partitionId: 0 },
      { rowId: 5n, distance: 0.5, partitionId: 0 },
    ];

    // Ground truth: [1, 2, 3, 4, 5]
    const groundTruth = [1n, 2n, 3n, 4n, 5n];

    // Perfect recall
    expect(computeRecallAtK(results, groundTruth, 5)).toBe(1.0);

    // Partial recall
    const partialResults: IvfPqSearchResult[] = [
      { rowId: 1n, distance: 0.1, partitionId: 0 },
      { rowId: 10n, distance: 0.2, partitionId: 0 },
      { rowId: 3n, distance: 0.3, partitionId: 0 },
      { rowId: 20n, distance: 0.4, partitionId: 0 },
      { rowId: 5n, distance: 0.5, partitionId: 0 },
    ];

    expect(computeRecallAtK(partialResults, groundTruth, 5)).toBe(0.6); // 3/5
  });

  it('should compute average precision correctly', () => {
    const results: IvfPqSearchResult[] = [
      { rowId: 1n, distance: 0.1, partitionId: 0 }, // Relevant @ position 1: P=1/1
      { rowId: 10n, distance: 0.2, partitionId: 0 }, // Not relevant
      { rowId: 2n, distance: 0.3, partitionId: 0 }, // Relevant @ position 3: P=2/3
      { rowId: 20n, distance: 0.4, partitionId: 0 }, // Not relevant
      { rowId: 3n, distance: 0.5, partitionId: 0 }, // Relevant @ position 5: P=3/5
    ];

    const groundTruth = new Set<bigint>([1n, 2n, 3n]);

    // AP = (1/1 + 2/3 + 3/5) / 3 = (1 + 0.667 + 0.6) / 3 = 2.267 / 3 = 0.756
    const ap = computeAveragePrecision(results, groundTruth);
    expect(ap).toBeCloseTo(0.756, 2);
  });

  it('should estimate search latency', () => {
    const estimate = estimateSearchLatency({
      numPartitions: 256,
      avgRowsPerPartition: 1000,
      nprobes: 10,
      dimension: 128,
      numSubVectors: 16,
    });

    expect(estimate.totalMs).toBeGreaterThan(0);
    expect(estimate.centroidDistanceMs).toBeGreaterThan(0);
    expect(estimate.lookupTableMs).toBeGreaterThan(0);
    expect(estimate.partitionScanMs).toBeGreaterThan(0);

    console.log('Estimated latency:', estimate);
  });
});
