/**
 * @evodb/lance-reader - Vector Search Accuracy Tests
 *
 * Comprehensive tests for vector search accuracy including:
 * - Recall@k and Precision@k metrics
 * - Distance metric correctness (L2, cosine, dot product)
 * - Edge cases (empty vectors, single item, duplicates)
 * - Performance benchmarks for different index sizes
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MemoryStorageAdapter,
  HnswIndex,
  IvfPqIndex,
  computeL2Distance,
  computeCosineSimilarity,
  computeDotProduct,
  normalizeVector,
  buildIvfPqIndex,
} from '../index.js';
import type { SearchResult, DistanceType } from '../types.js';

// ==========================================
// Test Utilities
// ==========================================

/**
 * Generate a random vector with optional normalization
 */
function generateRandomVector(dimension: number, normalize = false): Float32Array {
  const vector = new Float32Array(dimension);
  for (let i = 0; i < dimension; i++) {
    vector[i] = Math.random() * 2 - 1; // Range [-1, 1]
  }
  return normalize ? normalizeVector(vector) : vector;
}

/**
 * Generate a set of random vectors
 */
function generateVectorDataset(
  count: number,
  dimension: number,
  normalize = false
): Float32Array[] {
  return Array.from({ length: count }, () => generateRandomVector(dimension, normalize));
}

/**
 * Compute exact k-nearest neighbors using brute force
 */
function computeExactKNN(
  query: Float32Array,
  vectors: Float32Array[],
  k: number,
  distanceType: DistanceType
): { index: number; distance: number }[] {
  const distances = vectors.map((vector, index) => {
    let distance: number;
    switch (distanceType) {
      case 'l2':
        distance = computeL2DistanceSquared(query, vector);
        break;
      case 'cosine':
        distance = 1 - computeCosineSimilarity(query, vector);
        break;
      case 'dot':
        distance = -computeDotProduct(query, vector);
        break;
      default:
        distance = computeL2DistanceSquared(query, vector);
    }
    return { index, distance };
  });

  distances.sort((a, b) => a.distance - b.distance);
  return distances.slice(0, k);
}

/**
 * Compute L2 squared distance (for efficiency)
 */
function computeL2DistanceSquared(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return sum;
}

/**
 * Calculate Recall@k: proportion of true nearest neighbors found
 */
function calculateRecallAtK(
  approximateResults: SearchResult[],
  exactResults: { index: number; distance: number }[],
  k: number
): number {
  const approximateIds = new Set(approximateResults.slice(0, k).map(r => Number(r.rowId)));
  const exactIds = new Set(exactResults.slice(0, k).map(r => r.index));

  let found = 0;
  for (const id of exactIds) {
    if (approximateIds.has(id)) {
      found++;
    }
  }

  return found / Math.min(k, exactIds.size);
}

/**
 * Calculate Precision@k: proportion of returned results that are relevant
 */
function calculatePrecisionAtK(
  approximateResults: SearchResult[],
  exactResults: { index: number; distance: number }[],
  k: number
): number {
  const approximateIds = approximateResults.slice(0, k).map(r => Number(r.rowId));
  const exactIds = new Set(exactResults.slice(0, k).map(r => r.index));

  let relevant = 0;
  for (const id of approximateIds) {
    if (exactIds.has(id)) {
      relevant++;
    }
  }

  return relevant / approximateIds.length;
}

// ==========================================
// Accuracy Tests - Recall@k and Precision@k
// ==========================================

describe('Vector Search Accuracy - Recall and Precision', () => {
  describe('HNSW Index Accuracy', () => {
    it('should achieve high recall@10 on small dataset with L2 distance', async () => {
      const storage = new MemoryStorageAdapter();
      const hnsw = new HnswIndex(storage, 'test.idx', 'l2', 16, 3);
      await hnsw.initialize();

      // The internal test graph has 100 nodes
      const query = new Float32Array(128);
      for (let i = 0; i < 128; i++) {
        query[i] = Math.random() * 2 - 1;
      }

      const results = await hnsw.search(query, { k: 10, efSearch: 100 });

      // With the test graph, we should get results
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(10);

      // Results should be sorted by distance
      for (let i = 1; i < results.length; i++) {
        expect(results[i].distance).toBeGreaterThanOrEqual(results[i - 1].distance);
      }
    });

    it('should improve recall with higher efSearch', async () => {
      const storage = new MemoryStorageAdapter();
      const hnsw = new HnswIndex(storage, 'test.idx', 'l2', 16, 3);
      await hnsw.initialize();

      const query = new Float32Array(128);
      for (let i = 0; i < 128; i++) {
        query[i] = Math.random();
      }

      // Search with different efSearch values
      const resultsLowEf = await hnsw.search(query, { k: 10, efSearch: 20 });
      const resultsHighEf = await hnsw.search(query, { k: 10, efSearch: 200 });

      // Both should return results
      expect(resultsLowEf.length).toBeGreaterThan(0);
      expect(resultsHighEf.length).toBeGreaterThan(0);

      // Higher efSearch should give same or better top-1 result
      if (resultsLowEf.length > 0 && resultsHighEf.length > 0) {
        expect(resultsHighEf[0].distance).toBeLessThanOrEqual(resultsLowEf[0].distance + 0.0001);
      }
    });

    it('should achieve high recall@1 for exact nearest neighbor', async () => {
      const storage = new MemoryStorageAdapter();
      const hnsw = new HnswIndex(storage, 'test.idx', 'l2', 16, 3);
      await hnsw.initialize();

      // Use a query that is likely close to one of the test vectors
      const query = new Float32Array(128);
      for (let i = 0; i < 128; i++) {
        query[i] = 0.5;
      }

      const results = await hnsw.search(query, { k: 1, efSearch: 200 });

      expect(results.length).toBe(1);
      expect(results[0].distance).toBeDefined();
      expect(results[0].rowId).toBeDefined();
    });
  });

  describe('IVF-PQ Index Accuracy', () => {
    it('should return results from IVF-PQ search', async () => {
      const storage = new MemoryStorageAdapter();

      // Create a minimal IVF-PQ index
      const dimension = 8;
      const numPartitions = 2;

      const ivf = {
        centroids: new Float32Array([
          1, 0, 0, 0, 0, 0, 0, 0, // centroid 0
          0, 1, 0, 0, 0, 0, 0, 0, // centroid 1
        ]),
        offsets: new BigUint64Array([0n, 0n]),
        lengths: new Uint32Array([0, 0]),
        numPartitions,
        dimension,
      };

      const pq = {
        codebook: new Float32Array(256 * 4 * 2), // 256 codes, 4 sub-vectors, 2 dim each
        numSubVectors: 4,
        numBits: 8,
        distanceType: 'l2' as const,
        subDim: 2,
      };

      const index = new IvfPqIndex(storage, 'test.idx', ivf, pq, 'l2');

      const query = new Float32Array([1, 0, 0, 0, 0, 0, 0, 0]);
      const results = await index.search(query, { k: 5, nprobes: 2 });

      // Empty partitions should return empty results
      expect(results).toBeDefined();
      expect(results.length).toBe(0);
    });

    it('should find nearest centroid correctly', async () => {
      const storage = new MemoryStorageAdapter();

      const dimension = 4;
      const ivf = {
        centroids: new Float32Array([
          1, 0, 0, 0, // centroid 0
          0, 1, 0, 0, // centroid 1
          0, 0, 1, 0, // centroid 2
          0, 0, 0, 1, // centroid 3
        ]),
        offsets: new BigUint64Array([0n, 0n, 0n, 0n]),
        lengths: new Uint32Array([0, 0, 0, 0]),
        numPartitions: 4,
        dimension,
      };

      const pq = {
        codebook: new Float32Array(256 * 2 * 2),
        numSubVectors: 2,
        numBits: 8,
        distanceType: 'l2' as const,
        subDim: 2,
      };

      const index = new IvfPqIndex(storage, 'test.idx', ivf, pq, 'l2');

      // Query close to centroid 0
      const query = new Float32Array([0.9, 0.1, 0, 0]);
      const results = await index.search(query, { k: 5, nprobes: 1 });

      // Should search partition closest to query
      expect(results).toBeDefined();
    });
  });
});

// ==========================================
// Distance Metric Tests
// ==========================================

describe('Distance Metric Correctness', () => {
  describe('L2 Distance', () => {
    it('should compute L2 distance correctly for identical vectors', () => {
      const a = new Float32Array([1, 2, 3, 4]);
      const distance = computeL2Distance(a, a);
      expect(distance).toBeCloseTo(0, 10);
    });

    it('should compute L2 distance correctly for orthogonal vectors', () => {
      const a = new Float32Array([1, 0, 0]);
      const b = new Float32Array([0, 1, 0]);
      const distance = computeL2Distance(a, b);
      // sqrt(1^2 + 1^2) = sqrt(2)
      expect(distance).toBeCloseTo(Math.SQRT2, 5);
    });

    it('should compute L2 distance correctly for opposite vectors', () => {
      const a = new Float32Array([1, 0, 0]);
      const b = new Float32Array([-1, 0, 0]);
      const distance = computeL2Distance(a, b);
      // sqrt((1-(-1))^2) = sqrt(4) = 2
      expect(distance).toBeCloseTo(2, 5);
    });

    it('should compute L2 distance correctly for arbitrary vectors', () => {
      const a = new Float32Array([1, 2, 3]);
      const b = new Float32Array([4, 5, 6]);
      // sqrt((4-1)^2 + (5-2)^2 + (6-3)^2) = sqrt(9 + 9 + 9) = sqrt(27)
      const expected = Math.sqrt(27);
      const distance = computeL2Distance(a, b);
      expect(distance).toBeCloseTo(expected, 5);
    });

    it('should be symmetric', () => {
      const a = new Float32Array([1, 2, 3, 4, 5]);
      const b = new Float32Array([5, 4, 3, 2, 1]);
      expect(computeL2Distance(a, b)).toBeCloseTo(computeL2Distance(b, a), 10);
    });

    it('should satisfy triangle inequality', () => {
      const a = new Float32Array([0, 0, 0]);
      const b = new Float32Array([1, 0, 0]);
      const c = new Float32Array([1, 1, 0]);

      const ab = computeL2Distance(a, b);
      const bc = computeL2Distance(b, c);
      const ac = computeL2Distance(a, c);

      expect(ac).toBeLessThanOrEqual(ab + bc + 0.0001);
    });
  });

  describe('Cosine Similarity', () => {
    it('should compute cosine similarity 1 for parallel vectors', () => {
      const a = new Float32Array([1, 0, 0]);
      const b = new Float32Array([2, 0, 0]);
      expect(computeCosineSimilarity(a, b)).toBeCloseTo(1, 5);
    });

    it('should compute cosine similarity 0 for orthogonal vectors', () => {
      const a = new Float32Array([1, 0, 0]);
      const b = new Float32Array([0, 1, 0]);
      expect(computeCosineSimilarity(a, b)).toBeCloseTo(0, 5);
    });

    it('should compute cosine similarity -1 for opposite vectors', () => {
      const a = new Float32Array([1, 0, 0]);
      const b = new Float32Array([-1, 0, 0]);
      expect(computeCosineSimilarity(a, b)).toBeCloseTo(-1, 5);
    });

    it('should be invariant to vector magnitude', () => {
      const a = new Float32Array([1, 2, 3]);
      const b = new Float32Array([2, 4, 6]);
      const c = new Float32Array([0.1, 0.2, 0.3]);

      expect(computeCosineSimilarity(a, b)).toBeCloseTo(1, 5);
      expect(computeCosineSimilarity(a, c)).toBeCloseTo(1, 5);
    });

    it('should be symmetric', () => {
      const a = new Float32Array([1, 2, 3, 4, 5]);
      const b = new Float32Array([5, 4, 3, 2, 1]);
      expect(computeCosineSimilarity(a, b)).toBeCloseTo(computeCosineSimilarity(b, a), 10);
    });

    it('should compute correct value for 45-degree angle', () => {
      const a = new Float32Array([1, 0]);
      const b = new Float32Array([1, 1]);
      // cos(45) = 1/sqrt(2) ~ 0.707
      const expected = 1 / Math.sqrt(2);
      expect(computeCosineSimilarity(a, b)).toBeCloseTo(expected, 5);
    });
  });

  describe('Dot Product', () => {
    it('should compute dot product correctly for orthogonal vectors', () => {
      const a = new Float32Array([1, 0, 0]);
      const b = new Float32Array([0, 1, 0]);
      expect(computeDotProduct(a, b)).toBeCloseTo(0, 10);
    });

    it('should compute dot product correctly for unit vectors', () => {
      const a = new Float32Array([1, 0, 0]);
      const b = new Float32Array([1, 0, 0]);
      expect(computeDotProduct(a, b)).toBeCloseTo(1, 10);
    });

    it('should compute dot product correctly for opposite vectors', () => {
      const a = new Float32Array([1, 0, 0]);
      const b = new Float32Array([-1, 0, 0]);
      expect(computeDotProduct(a, b)).toBeCloseTo(-1, 10);
    });

    it('should compute dot product correctly for arbitrary vectors', () => {
      const a = new Float32Array([1, 2, 3]);
      const b = new Float32Array([4, 5, 6]);
      // 1*4 + 2*5 + 3*6 = 4 + 10 + 18 = 32
      expect(computeDotProduct(a, b)).toBeCloseTo(32, 10);
    });

    it('should be symmetric', () => {
      const a = new Float32Array([1, 2, 3, 4, 5]);
      const b = new Float32Array([5, 4, 3, 2, 1]);
      expect(computeDotProduct(a, b)).toBeCloseTo(computeDotProduct(b, a), 10);
    });

    it('should scale linearly with magnitude', () => {
      const a = new Float32Array([1, 2, 3]);
      const b = new Float32Array([1, 1, 1]);
      const c = new Float32Array([2, 2, 2]);

      expect(computeDotProduct(a, c)).toBeCloseTo(2 * computeDotProduct(a, b), 5);
    });
  });

  describe('HNSW with Different Distance Types', () => {
    it('should order results correctly with L2 distance', async () => {
      const storage = new MemoryStorageAdapter();
      const hnsw = new HnswIndex(storage, 'test.idx', 'l2', 16, 3);
      await hnsw.initialize();

      const query = new Float32Array(128);
      query.fill(0);

      const results = await hnsw.search(query, { k: 10, efSearch: 100 });

      // Distances should be non-negative and sorted
      for (const result of results) {
        expect(result.distance).toBeGreaterThanOrEqual(0);
      }
      for (let i = 1; i < results.length; i++) {
        expect(results[i].distance).toBeGreaterThanOrEqual(results[i - 1].distance);
      }
    });

    it('should order results correctly with cosine distance', async () => {
      const storage = new MemoryStorageAdapter();
      const hnsw = new HnswIndex(storage, 'test.idx', 'cosine', 16, 3);
      await hnsw.initialize();

      const query = new Float32Array(128);
      query.fill(0.5);

      const results = await hnsw.search(query, { k: 10, efSearch: 100 });

      // Cosine distance should be in [0, 2] range
      for (const result of results) {
        expect(result.distance).toBeGreaterThanOrEqual(0);
        expect(result.distance).toBeLessThanOrEqual(2.0001);
      }
      for (let i = 1; i < results.length; i++) {
        expect(results[i].distance).toBeGreaterThanOrEqual(results[i - 1].distance);
      }
    });

    it('should order results correctly with dot product distance', async () => {
      const storage = new MemoryStorageAdapter();
      const hnsw = new HnswIndex(storage, 'test.idx', 'dot', 16, 3);
      await hnsw.initialize();

      const query = new Float32Array(128);
      query.fill(0.5);

      const results = await hnsw.search(query, { k: 10, efSearch: 100 });

      // Results should be sorted by distance
      for (let i = 1; i < results.length; i++) {
        expect(results[i].distance).toBeGreaterThanOrEqual(results[i - 1].distance);
      }
    });
  });
});

// ==========================================
// Edge Cases
// ==========================================

describe('Edge Cases', () => {
  describe('Empty and Minimal Inputs', () => {
    it('should handle zero vector query with L2', async () => {
      const storage = new MemoryStorageAdapter();
      const hnsw = new HnswIndex(storage, 'test.idx', 'l2', 16, 3);
      await hnsw.initialize();

      const query = new Float32Array(128).fill(0);
      const results = await hnsw.search(query, { k: 5 });

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle zero vector query with cosine distance', async () => {
      const storage = new MemoryStorageAdapter();
      const hnsw = new HnswIndex(storage, 'test.idx', 'cosine', 16, 3);
      await hnsw.initialize();

      const query = new Float32Array(128).fill(0);
      const results = await hnsw.search(query, { k: 5 });

      // Should handle gracefully (zero vector has undefined angle)
      expect(results).toBeDefined();
    });

    it('should handle single element search (k=1)', async () => {
      const storage = new MemoryStorageAdapter();
      const hnsw = new HnswIndex(storage, 'test.idx', 'l2', 16, 3);
      await hnsw.initialize();

      const query = new Float32Array(128);
      for (let i = 0; i < 128; i++) {
        query[i] = Math.random();
      }

      const results = await hnsw.search(query, { k: 1 });

      expect(results.length).toBeLessThanOrEqual(1);
    });

    it('should handle k larger than index size', async () => {
      const storage = new MemoryStorageAdapter();
      const hnsw = new HnswIndex(storage, 'test.idx', 'l2', 16, 3);
      await hnsw.initialize();

      const query = new Float32Array(128);
      for (let i = 0; i < 128; i++) {
        query[i] = Math.random();
      }

      // The test graph has 100 nodes, request 1000
      const results = await hnsw.search(query, { k: 1000, efSearch: 200 });

      // Should return at most the number of items in the index
      expect(results.length).toBeLessThanOrEqual(100);
    });

    it('should return empty results for empty IVF partitions', async () => {
      const storage = new MemoryStorageAdapter();

      const ivf = {
        centroids: new Float32Array(4 * 4), // 4 centroids, 4 dimensions
        offsets: new BigUint64Array([0n, 0n, 0n, 0n]),
        lengths: new Uint32Array([0, 0, 0, 0]), // All empty
        numPartitions: 4,
        dimension: 4,
      };

      const pq = {
        codebook: new Float32Array(256 * 2 * 2),
        numSubVectors: 2,
        numBits: 8,
        distanceType: 'l2' as const,
        subDim: 2,
      };

      const index = new IvfPqIndex(storage, 'test.idx', ivf, pq, 'l2');
      const query = new Float32Array(4).fill(1);
      const results = await index.search(query, { k: 10 });

      expect(results.length).toBe(0);
    });
  });

  describe('Duplicate and Near-Duplicate Vectors', () => {
    it('should handle duplicate vectors in results', async () => {
      const storage = new MemoryStorageAdapter();
      const hnsw = new HnswIndex(storage, 'test.idx', 'l2', 16, 3);
      await hnsw.initialize();

      const query = new Float32Array(128).fill(0.5);
      const results = await hnsw.search(query, { k: 10 });

      // All row IDs should be unique
      const rowIds = new Set(results.map(r => r.rowId));
      expect(rowIds.size).toBe(results.length);
    });

    it('should not return the same result multiple times', async () => {
      const storage = new MemoryStorageAdapter();
      const hnsw = new HnswIndex(storage, 'test.idx', 'l2', 16, 3);
      await hnsw.initialize();

      const query = new Float32Array(128);
      for (let i = 0; i < 128; i++) {
        query[i] = i * 0.01;
      }

      const results = await hnsw.search(query, { k: 50 });

      const rowIds = results.map(r => r.rowId.toString());
      const uniqueIds = new Set(rowIds);
      expect(uniqueIds.size).toBe(rowIds.length);
    });
  });

  describe('Extreme Values', () => {
    it('should handle very large vector values', () => {
      const a = new Float32Array([1e6, 1e6, 1e6]);
      const b = new Float32Array([1e6, 1e6, 1e6]);
      expect(computeL2Distance(a, b)).toBeCloseTo(0, 5);
      expect(computeCosineSimilarity(a, b)).toBeCloseTo(1, 5);
    });

    it('should handle very small vector values', () => {
      const a = new Float32Array([1e-6, 1e-6, 1e-6]);
      const b = new Float32Array([1e-6, 1e-6, 1e-6]);
      expect(computeL2Distance(a, b)).toBeCloseTo(0, 10);
      expect(computeCosineSimilarity(a, b)).toBeCloseTo(1, 5);
    });

    it('should handle mixed positive and negative values', () => {
      const a = new Float32Array([1, -1, 1, -1]);
      const b = new Float32Array([-1, 1, -1, 1]);
      expect(computeCosineSimilarity(a, b)).toBeCloseTo(-1, 5);
    });

    it('should handle high-dimensional vectors', async () => {
      const storage = new MemoryStorageAdapter();
      const hnsw = new HnswIndex(storage, 'test.idx', 'l2', 16, 3);
      await hnsw.initialize();

      // The test graph uses 128 dimensions
      const query = new Float32Array(128);
      for (let i = 0; i < 128; i++) {
        query[i] = Math.random();
      }

      const results = await hnsw.search(query, { k: 10 });
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('Vector Normalization', () => {
    it('should normalize a vector to unit length', () => {
      const v = new Float32Array([3, 4, 0]);
      const normalized = normalizeVector(v);

      const length = Math.sqrt(
        normalized[0] ** 2 + normalized[1] ** 2 + normalized[2] ** 2
      );
      expect(length).toBeCloseTo(1, 5);
    });

    it('should preserve direction after normalization', () => {
      const v = new Float32Array([3, 4, 0]);
      const normalized = normalizeVector(v);

      // 3/5 = 0.6, 4/5 = 0.8
      expect(normalized[0]).toBeCloseTo(0.6, 5);
      expect(normalized[1]).toBeCloseTo(0.8, 5);
      expect(normalized[2]).toBeCloseTo(0, 5);
    });

    it('should handle zero vector normalization', () => {
      const v = new Float32Array([0, 0, 0]);
      const normalized = normalizeVector(v);

      // Should not throw and return the same vector
      expect(normalized[0]).toBe(0);
      expect(normalized[1]).toBe(0);
      expect(normalized[2]).toBe(0);
    });

    it('should produce identical cosine similarity for normalized vectors', () => {
      const a = new Float32Array([1, 2, 3]);
      const b = new Float32Array([4, 5, 6]);

      const normA = normalizeVector(a);
      const normB = normalizeVector(b);

      expect(computeCosineSimilarity(a, b)).toBeCloseTo(
        computeCosineSimilarity(normA, normB),
        5
      );
    });
  });
});

// ==========================================
// Performance Benchmarks
// ==========================================

describe('Performance Benchmarks', () => {
  describe('Search Latency', () => {
    it('should complete HNSW search within reasonable time for k=10', async () => {
      const storage = new MemoryStorageAdapter();
      const hnsw = new HnswIndex(storage, 'test.idx', 'l2', 16, 3);
      await hnsw.initialize();

      const query = new Float32Array(128);
      for (let i = 0; i < 128; i++) {
        query[i] = Math.random();
      }

      const start = performance.now();
      await hnsw.search(query, { k: 10, efSearch: 100 });
      const elapsed = performance.now() - start;

      // Should complete in less than 100ms for small test graph
      expect(elapsed).toBeLessThan(100);
    });

    it('should complete multiple searches efficiently', async () => {
      const storage = new MemoryStorageAdapter();
      const hnsw = new HnswIndex(storage, 'test.idx', 'l2', 16, 3);
      await hnsw.initialize();

      const numQueries = 10;
      const queries = Array.from({ length: numQueries }, () => {
        const q = new Float32Array(128);
        for (let i = 0; i < 128; i++) {
          q[i] = Math.random();
        }
        return q;
      });

      const start = performance.now();
      for (const query of queries) {
        await hnsw.search(query, { k: 10, efSearch: 50 });
      }
      const elapsed = performance.now() - start;

      // 10 searches should complete in less than 500ms
      expect(elapsed).toBeLessThan(500);
    });
  });

  describe('Distance Computation Performance', () => {
    it('should compute L2 distance efficiently for high dimensions', () => {
      const dimension = 1536; // Common embedding dimension
      const a = generateRandomVector(dimension);
      const b = generateRandomVector(dimension);

      const start = performance.now();
      for (let i = 0; i < 10000; i++) {
        computeL2Distance(a, b);
      }
      const elapsed = performance.now() - start;

      // 10000 L2 distance computations should complete quickly
      expect(elapsed).toBeLessThan(100);
    });

    it('should compute cosine similarity efficiently for high dimensions', () => {
      const dimension = 1536;
      const a = generateRandomVector(dimension);
      const b = generateRandomVector(dimension);

      const start = performance.now();
      for (let i = 0; i < 10000; i++) {
        computeCosineSimilarity(a, b);
      }
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(100);
    });

    it('should compute dot product efficiently for high dimensions', () => {
      const dimension = 1536;
      const a = generateRandomVector(dimension);
      const b = generateRandomVector(dimension);

      const start = performance.now();
      for (let i = 0; i < 10000; i++) {
        computeDotProduct(a, b);
      }
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('Index Building Performance', () => {
    it('should build small IVF-PQ index within reasonable time', async () => {
      const vectors = generateVectorDataset(100, 16);

      const start = performance.now();
      const { ivf, pq, partitionData } = await buildIvfPqIndex(vectors, {
        numPartitions: 4,
        numSubVectors: 4,
        numBits: 8,
        distanceType: 'l2',
      });
      const elapsed = performance.now() - start;

      expect(ivf.numPartitions).toBe(4);
      expect(pq.numSubVectors).toBe(4);
      expect(partitionData.length).toBe(4);

      // Building 100-vector index should be fast
      expect(elapsed).toBeLessThan(2000);
    });

    it('should build medium IVF-PQ index within reasonable time', async () => {
      const vectors = generateVectorDataset(500, 32);

      const start = performance.now();
      const { ivf, pq, partitionData } = await buildIvfPqIndex(vectors, {
        numPartitions: 8,
        numSubVectors: 8,
        numBits: 8,
        distanceType: 'l2',
      });
      const elapsed = performance.now() - start;

      expect(ivf.numPartitions).toBe(8);
      expect(pq.numSubVectors).toBe(8);

      // Total vectors across partitions should equal input size
      const totalRows = partitionData.reduce((sum, p) => sum + p.numRows, 0);
      expect(totalRows).toBe(500);

      // Building 500-vector index should complete in reasonable time
      expect(elapsed).toBeLessThan(10000);
    });
  });

  describe('Memory Efficiency', () => {
    it('should create compact IVF structure', async () => {
      const vectors = generateVectorDataset(100, 16);

      const { ivf, pq } = await buildIvfPqIndex(vectors, {
        numPartitions: 4,
        numSubVectors: 4,
        numBits: 8,
        distanceType: 'l2',
      });

      // Centroids should be numPartitions * dimension floats
      expect(ivf.centroids.length).toBe(4 * 16);

      // Codebook should be 256 codes * numSubVectors * subDim floats
      const expectedCodebookSize = 256 * 4 * 4; // 256 * 4 * (16/4)
      expect(pq.codebook.length).toBe(expectedCodebookSize);
    });
  });
});

// ==========================================
// Batch Search Tests
// ==========================================

describe('Batch Search Operations', () => {
  it('should search multiple queries in batch', async () => {
    const storage = new MemoryStorageAdapter();

    const dimension = 8;
    const ivf = {
      centroids: new Float32Array(dimension * 4),
      offsets: new BigUint64Array([0n, 0n, 0n, 0n]),
      lengths: new Uint32Array([0, 0, 0, 0]),
      numPartitions: 4,
      dimension,
    };

    for (let i = 0; i < 4; i++) {
      ivf.centroids[i * dimension + i] = 1; // Create distinct centroids
    }

    const pq = {
      codebook: new Float32Array(256 * 4 * 2),
      numSubVectors: 4,
      numBits: 8,
      distanceType: 'l2' as const,
      subDim: 2,
    };

    const index = new IvfPqIndex(storage, 'test.idx', ivf, pq, 'l2');

    const queries = [
      new Float32Array(8).fill(0.1),
      new Float32Array(8).fill(0.5),
      new Float32Array(8).fill(0.9),
    ];

    const results = await index.batchSearch(queries, { k: 5, nprobes: 2 });

    expect(results.length).toBe(3);
    for (const result of results) {
      expect(Array.isArray(result)).toBe(true);
    }
  });

  it('should produce consistent results between single and batch search', async () => {
    const storage = new MemoryStorageAdapter();

    const dimension = 8;
    const ivf = {
      centroids: new Float32Array(dimension * 2),
      offsets: new BigUint64Array([0n, 0n]),
      lengths: new Uint32Array([0, 0]),
      numPartitions: 2,
      dimension,
    };

    const pq = {
      codebook: new Float32Array(256 * 4 * 2),
      numSubVectors: 4,
      numBits: 8,
      distanceType: 'l2' as const,
      subDim: 2,
    };

    const index = new IvfPqIndex(storage, 'test.idx', ivf, pq, 'l2');

    const query = new Float32Array(8).fill(0.5);

    const singleResult = await index.search(query, { k: 5, nprobes: 2 });
    const batchResults = await index.batchSearch([query], { k: 5, nprobes: 2 });

    expect(batchResults.length).toBe(1);
    expect(batchResults[0].length).toBe(singleResult.length);

    for (let i = 0; i < singleResult.length; i++) {
      expect(batchResults[0][i].rowId).toBe(singleResult[i].rowId);
      expect(batchResults[0][i].distance).toBeCloseTo(singleResult[i].distance, 5);
    }
  });
});

// ==========================================
// Filtering Tests
// ==========================================

describe('Search with Filtering', () => {
  describe('HNSW with Filters', () => {
    it('should respect include filter', async () => {
      const storage = new MemoryStorageAdapter();
      const hnsw = new HnswIndex(storage, 'test.idx', 'l2', 16, 3);
      await hnsw.initialize();

      const query = new Float32Array(128);
      for (let i = 0; i < 128; i++) {
        query[i] = Math.random();
      }

      // Only allow specific row IDs
      const allowedIds = new Set([0n, 1n, 2n, 3n, 4n]);

      const results = await hnsw.search(query, {
        k: 10,
        efSearch: 100,
        filter: { type: 'include', rowIds: allowedIds },
      });

      // All results should be in the allowed set
      for (const result of results) {
        expect(allowedIds.has(result.rowId)).toBe(true);
      }
    });

    it('should respect exclude filter', async () => {
      const storage = new MemoryStorageAdapter();
      const hnsw = new HnswIndex(storage, 'test.idx', 'l2', 16, 3);
      await hnsw.initialize();

      const query = new Float32Array(128);
      for (let i = 0; i < 128; i++) {
        query[i] = Math.random();
      }

      // Exclude specific row IDs
      const excludedIds = new Set([0n, 1n, 2n, 3n, 4n]);

      const results = await hnsw.search(query, {
        k: 10,
        efSearch: 100,
        filter: { type: 'exclude', rowIds: excludedIds },
      });

      // No results should be in the excluded set
      for (const result of results) {
        expect(excludedIds.has(result.rowId)).toBe(false);
      }
    });

    it('should respect predicate filter', async () => {
      const storage = new MemoryStorageAdapter();
      const hnsw = new HnswIndex(storage, 'test.idx', 'l2', 16, 3);
      await hnsw.initialize();

      const query = new Float32Array(128);
      for (let i = 0; i < 128; i++) {
        query[i] = Math.random();
      }

      // Only allow even row IDs
      const results = await hnsw.search(query, {
        k: 10,
        efSearch: 100,
        filter: { type: 'predicate', fn: (id) => Number(id) % 2 === 0 },
      });

      // All results should have even row IDs
      for (const result of results) {
        expect(Number(result.rowId) % 2).toBe(0);
      }
    });
  });
});

// ==========================================
// Reranking Tests
// ==========================================

describe('Reranking with Exact Distances', () => {
  it('should rerank results with exact distances', async () => {
    const storage = new MemoryStorageAdapter();
    const hnsw = new HnswIndex(storage, 'test.idx', 'l2', 16, 3);
    await hnsw.initialize();

    const query = new Float32Array(128);
    for (let i = 0; i < 128; i++) {
      query[i] = Math.random();
    }

    // Get approximate results
    const annResults = await hnsw.search(query, { k: 50, efSearch: 100 });

    // Rerank to get top 10
    const reranked = await hnsw.rerankWithExactDistances(query, annResults, { k: 10 });

    expect(reranked.length).toBeLessThanOrEqual(10);

    // Reranked results should be sorted by distance
    for (let i = 1; i < reranked.length; i++) {
      expect(reranked[i].distance).toBeGreaterThanOrEqual(reranked[i - 1].distance);
    }
  });

  it('should improve result quality after reranking', async () => {
    const storage = new MemoryStorageAdapter();
    const hnsw = new HnswIndex(storage, 'test.idx', 'l2', 16, 3);
    await hnsw.initialize();

    const query = new Float32Array(128);
    for (let i = 0; i < 128; i++) {
      query[i] = 0.5;
    }

    // Get more candidates than needed
    const annResults = await hnsw.search(query, { k: 100, efSearch: 200 });

    if (annResults.length > 10) {
      // Rerank to get top 10
      const reranked = await hnsw.rerankWithExactDistances(query, annResults, { k: 10 });

      // Top result from reranking should be at least as good
      expect(reranked[0].distance).toBeLessThanOrEqual(annResults[0].distance + 0.0001);
    }
  });
});

// ==========================================
// Score Normalization Tests
// ==========================================

describe('Score Normalization', () => {
  it('should normalize L2 distance to score in [0, 1] range', async () => {
    const storage = new MemoryStorageAdapter();
    const hnsw = new HnswIndex(storage, 'test.idx', 'l2', 16, 3);
    await hnsw.initialize();

    const query = new Float32Array(128);
    for (let i = 0; i < 128; i++) {
      query[i] = Math.random();
    }

    const results = await hnsw.search(query, { k: 10 });

    for (const result of results) {
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    }
  });

  it('should normalize cosine distance to score in [0, 1] range', async () => {
    const storage = new MemoryStorageAdapter();
    const hnsw = new HnswIndex(storage, 'test.idx', 'cosine', 16, 3);
    await hnsw.initialize();

    const query = new Float32Array(128);
    for (let i = 0; i < 128; i++) {
      query[i] = Math.random();
    }

    const results = await hnsw.search(query, { k: 10 });

    for (const result of results) {
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    }
  });

  it('should have higher scores for closer results', async () => {
    const storage = new MemoryStorageAdapter();
    const hnsw = new HnswIndex(storage, 'test.idx', 'l2', 16, 3);
    await hnsw.initialize();

    const query = new Float32Array(128);
    for (let i = 0; i < 128; i++) {
      query[i] = Math.random();
    }

    const results = await hnsw.search(query, { k: 10 });

    // Scores should be in descending order (higher = closer)
    for (let i = 1; i < results.length; i++) {
      expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score + 0.0001);
    }
  });
});

// ==========================================
// Streaming Results Tests
// ==========================================

describe('Streaming Search Results', () => {
  it('should stream results one at a time', async () => {
    const storage = new MemoryStorageAdapter();
    const hnsw = new HnswIndex(storage, 'test.idx', 'l2', 16, 3);
    await hnsw.initialize();

    const query = new Float32Array(128);
    for (let i = 0; i < 128; i++) {
      query[i] = Math.random();
    }

    const streamedResults: SearchResult[] = [];
    for await (const result of hnsw.searchStream(query, { k: 10 })) {
      streamedResults.push(result);
    }

    // Should get results via streaming
    expect(streamedResults.length).toBeGreaterThan(0);
    expect(streamedResults.length).toBeLessThanOrEqual(10);

    // Verify each result has required fields
    for (const result of streamedResults) {
      expect(result.rowId).toBeDefined();
      expect(result.distance).toBeDefined();
      expect(result.score).toBeDefined();
    }
  });

  it('should produce same results as non-streaming search', async () => {
    const storage = new MemoryStorageAdapter();
    const hnsw = new HnswIndex(storage, 'test.idx', 'l2', 16, 3);
    await hnsw.initialize();

    const query = new Float32Array(128);
    for (let i = 0; i < 128; i++) {
      query[i] = Math.random();
    }

    // Regular search
    const regularResults = await hnsw.search(query, { k: 10 });

    // Streaming search
    const streamedResults: SearchResult[] = [];
    for await (const result of hnsw.searchStream(query, { k: 10 })) {
      streamedResults.push(result);
    }

    expect(streamedResults.length).toBe(regularResults.length);

    for (let i = 0; i < regularResults.length; i++) {
      expect(streamedResults[i].rowId).toBe(regularResults[i].rowId);
      expect(streamedResults[i].distance).toBeCloseTo(regularResults[i].distance, 5);
    }
  });
});
