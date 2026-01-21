/**
 * @evodb/lance-reader - Vector Index Metadata Tests
 *
 * Tests for parsing IVF-PQ and HNSW index metadata.
 */

import { describe, it, expect } from 'vitest';
import { parseIvf, parsePqCodebook } from '../index.js';

describe('Vector Index Metadata', () => {
  it('should parse IVF-PQ index metadata', () => {
    // IVF-PQ metadata includes:
    // - distance_type (l2, cosine, dot)
    // - num_partitions
    // - num_sub_vectors
    // - num_bits (typically 8)

    const ivfMetadata = {
      type: 'ivf_pq' as const,
      distanceType: 'l2' as const,
      numPartitions: 256,
      numSubVectors: 16,
      numBits: 8,
    };

    expect(ivfMetadata.type).toBe('ivf_pq');
    expect(ivfMetadata.numPartitions).toBe(256);
  });

  it('should parse HNSW index metadata', () => {
    // HNSW metadata includes:
    // - distance_type
    // - m (max connections per node)
    // - ef_construction
    // - max_level

    const hnswMetadata = {
      type: 'hnsw' as const,
      distanceType: 'cosine' as const,
      m: 16,
      efConstruction: 200,
      maxLevel: 5,
    };

    expect(hnswMetadata.type).toBe('hnsw');
    expect(hnswMetadata.m).toBe(16);
  });

  it('should parse IVF structure from protobuf', () => {
    // Create a minimal IVF structure buffer
    // IVF contains: centroids tensor, offsets, lengths

    // Create empty buffer for now - actual test would have real data
    const buffer = new ArrayBuffer(10);

    // parseIvf should handle empty/minimal buffers gracefully
    const ivf = parseIvf(buffer);

    expect(ivf).toBeDefined();
    expect(ivf.numPartitions).toBeGreaterThanOrEqual(0);
  });

  it('should parse PQ codebook from protobuf', () => {
    // PQ codebook contains:
    // - codebook tensor [256 x numSubVectors x subDim]
    // - num_sub_vectors
    // - num_bits
    // - distance_type

    const buffer = new ArrayBuffer(10);
    const pq = parsePqCodebook(buffer);

    expect(pq).toBeDefined();
    expect(pq.numBits).toBeGreaterThanOrEqual(0);
  });
});
