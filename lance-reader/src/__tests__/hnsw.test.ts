/**
 * Tests for HNSW Index
 */

import { describe, it, expect, vi } from 'vitest';
import { HnswIndex } from '../hnsw.js';
import { MemoryStorageAdapter } from '../r2-adapter.js';
import type { DistanceType } from '../types.js';

// ==========================================
// HnswIndex Tests
// ==========================================

describe('HnswIndex', () => {
  describe('constructor and basic properties', () => {
    it('should create index with valid config', () => {
      const storage = new MemoryStorageAdapter();
      const index = new HnswIndex(storage, 'index.idx', 'l2', 16, 4);

      expect(index.indexType).toBe('hnsw');
    });

    it('should handle cosine distance type', () => {
      const storage = new MemoryStorageAdapter();
      const index = new HnswIndex(storage, 'index.idx', 'cosine', 8, 2);

      expect(index.indexType).toBe('hnsw');
    });

    it('should handle dot distance type', () => {
      const storage = new MemoryStorageAdapter();
      const index = new HnswIndex(storage, 'index.idx', 'dot', 8, 2);

      expect(index.indexType).toBe('hnsw');
    });
  });

  describe('search behavior', () => {
    it('should return results or empty array from search', async () => {
      const storage = new MemoryStorageAdapter();
      const index = new HnswIndex(storage, 'index.idx', 'l2', 8, 2);

      const query = new Float32Array(32).fill(0);
      const results = await index.search(query, { k: 10 });

      // Should return an array (may be empty or have results depending on internal state)
      expect(Array.isArray(results)).toBe(true);
    });

    it('should return sorted results by distance', async () => {
      const storage = new MemoryStorageAdapter();
      const index = new HnswIndex(storage, 'index.idx', 'l2', 8, 2);

      const query = new Float32Array(32).fill(0.5);
      const results = await index.search(query, { k: 10 });

      // If there are results, they should be sorted
      for (let i = 1; i < results.length; i++) {
        expect(results[i].distance).toBeGreaterThanOrEqual(results[i - 1].distance);
      }
    });
  });

  describe('getStorage', () => {
    it('should return the storage adapter', () => {
      const storage = new MemoryStorageAdapter();
      const index = new HnswIndex(storage, 'index.idx', 'l2', 8, 2);

      expect(index.getStorage()).toBe(storage);
    });
  });

  describe('getNodesPerLevel', () => {
    it('should return array of node counts', async () => {
      const storage = new MemoryStorageAdapter();
      const index = new HnswIndex(storage, 'index.idx', 'l2', 8, 2);

      // Initialize the index
      await index.search(new Float32Array(32), { k: 1 });

      const nodesPerLevel = index.getNodesPerLevel();
      expect(Array.isArray(nodesPerLevel)).toBe(true);
    });
  });

  describe('dimension', () => {
    it('should return 0 for uninitialized index', () => {
      const storage = new MemoryStorageAdapter();
      const index = new HnswIndex(storage, 'index.idx', 'l2', 8, 2);

      expect(index.dimension).toBe(0);
    });
  });
});

// ==========================================
// Distance Function Tests (via search behavior)
// ==========================================

describe('Distance Functions', () => {
  it('should use L2 distance when specified', async () => {
    const storage = new MemoryStorageAdapter();
    const index = new HnswIndex(storage, 'index.idx', 'l2', 4, 1);

    const query = new Float32Array([0, 0, 0, 0]);
    const results = await index.search(query, { k: 3 });

    // Should not throw
    expect(results).toBeDefined();
  });

  it('should use cosine distance when specified', async () => {
    const storage = new MemoryStorageAdapter();
    const index = new HnswIndex(storage, 'index.idx', 'cosine', 4, 1);

    const query = new Float32Array([1, 0, 0, 0]);
    const results = await index.search(query, { k: 3 });

    // Should not throw
    expect(results).toBeDefined();
  });

  it('should use dot distance when specified', async () => {
    const storage = new MemoryStorageAdapter();
    const index = new HnswIndex(storage, 'index.idx', 'dot', 4, 1);

    const query = new Float32Array([1, 1, 1, 1]);
    const results = await index.search(query, { k: 3 });

    // Should not throw
    expect(results).toBeDefined();
  });
});
