import { describe, it, expect } from 'vitest';
import {
  PARTITION_MODES,
  DEFAULT_WRITER_OPTIONS,
  resolveWriterOptions,
  type PartitionMode,
  type R2Bucket,
} from './types.js';

// Mock R2 bucket for testing
const mockR2Bucket = {} as R2Bucket;

describe('PARTITION_MODES', () => {
  it('should have do-sqlite mode', () => {
    const mode = PARTITION_MODES['do-sqlite'];
    expect(mode).toBeDefined();
    expect(mode.targetBlockSize).toBe(2 * 1024 * 1024); // 2MB
    expect(mode.maxBlockSize).toBe(4 * 1024 * 1024); // 4MB
    expect(mode.targetCompactSize).toBe(16 * 1024 * 1024); // 16MB
    expect(mode.maxCompactSize).toBe(32 * 1024 * 1024); // 32MB
  });

  it('should have edge-cache mode', () => {
    const mode = PARTITION_MODES['edge-cache'];
    expect(mode).toBeDefined();
    expect(mode.targetBlockSize).toBe(128 * 1024 * 1024); // 128MB
    expect(mode.maxBlockSize).toBe(256 * 1024 * 1024); // 256MB
    expect(mode.targetCompactSize).toBe(500 * 1024 * 1024); // 500MB
    expect(mode.maxCompactSize).toBe(512 * 1024 * 1024); // 512MB
  });

  it('should have enterprise mode', () => {
    const mode = PARTITION_MODES['enterprise'];
    expect(mode).toBeDefined();
    expect(mode.targetBlockSize).toBe(1024 * 1024 * 1024); // 1GB
    expect(mode.maxBlockSize).toBe(2 * 1024 * 1024 * 1024); // 2GB
    expect(mode.targetCompactSize).toBe(5 * 1024 * 1024 * 1024); // 5GB
    expect(mode.maxCompactSize).toBe(5 * 1024 * 1024 * 1024); // 5GB
  });

  it('should have descriptions', () => {
    for (const mode of Object.values(PARTITION_MODES)) {
      expect(mode.description).toBeDefined();
      expect(mode.description.length).toBeGreaterThan(0);
    }
  });
});

describe('DEFAULT_WRITER_OPTIONS', () => {
  it('should have sensible defaults', () => {
    expect(DEFAULT_WRITER_OPTIONS.schemaId).toBe(0);
    expect(DEFAULT_WRITER_OPTIONS.partitionMode).toBe('do-sqlite');
    expect(DEFAULT_WRITER_OPTIONS.bufferSize).toBe(10000);
    expect(DEFAULT_WRITER_OPTIONS.bufferTimeout).toBe(5000);
    expect(DEFAULT_WRITER_OPTIONS.minCompactBlocks).toBe(4);
    expect(DEFAULT_WRITER_OPTIONS.maxRetries).toBe(3);
    expect(DEFAULT_WRITER_OPTIONS.retryBackoffMs).toBe(100);
  });
});

describe('resolveWriterOptions', () => {
  it('should apply do-sqlite defaults', () => {
    const resolved = resolveWriterOptions({
      r2Bucket: mockR2Bucket,
      tableLocation: 'test/table',
      partitionMode: 'do-sqlite',
    });

    expect(resolved.partitionMode).toBe('do-sqlite');
    expect(resolved.targetBlockSize).toBe(2 * 1024 * 1024);
    expect(resolved.maxBlockSize).toBe(4 * 1024 * 1024);
    expect(resolved.targetCompactSize).toBe(16 * 1024 * 1024);
  });

  it('should apply edge-cache defaults', () => {
    const resolved = resolveWriterOptions({
      r2Bucket: mockR2Bucket,
      tableLocation: 'test/table',
      partitionMode: 'edge-cache',
    });

    expect(resolved.partitionMode).toBe('edge-cache');
    expect(resolved.targetBlockSize).toBe(128 * 1024 * 1024);
    expect(resolved.maxBlockSize).toBe(256 * 1024 * 1024);
    expect(resolved.targetCompactSize).toBe(500 * 1024 * 1024);
  });

  it('should apply enterprise defaults', () => {
    const resolved = resolveWriterOptions({
      r2Bucket: mockR2Bucket,
      tableLocation: 'test/table',
      partitionMode: 'enterprise',
    });

    expect(resolved.partitionMode).toBe('enterprise');
    expect(resolved.targetBlockSize).toBe(1024 * 1024 * 1024);
    expect(resolved.maxBlockSize).toBe(2 * 1024 * 1024 * 1024);
    expect(resolved.targetCompactSize).toBe(5 * 1024 * 1024 * 1024);
  });

  it('should use do-sqlite as default partition mode', () => {
    const resolved = resolveWriterOptions({
      r2Bucket: mockR2Bucket,
      tableLocation: 'test/table',
    });

    expect(resolved.partitionMode).toBe('do-sqlite');
  });

  it('should allow overriding size thresholds', () => {
    const resolved = resolveWriterOptions({
      r2Bucket: mockR2Bucket,
      tableLocation: 'test/table',
      partitionMode: 'do-sqlite',
      targetBlockSize: 1024 * 1024, // Custom 1MB
      maxBlockSize: 2 * 1024 * 1024, // Custom 2MB
      targetCompactSize: 10 * 1024 * 1024, // Custom 10MB
    });

    expect(resolved.targetBlockSize).toBe(1024 * 1024);
    expect(resolved.maxBlockSize).toBe(2 * 1024 * 1024);
    expect(resolved.targetCompactSize).toBe(10 * 1024 * 1024);
  });

  it('should apply default values for missing options', () => {
    const resolved = resolveWriterOptions({
      r2Bucket: mockR2Bucket,
      tableLocation: 'test/table',
    });

    expect(resolved.schemaId).toBe(DEFAULT_WRITER_OPTIONS.schemaId);
    expect(resolved.bufferSize).toBe(DEFAULT_WRITER_OPTIONS.bufferSize);
    expect(resolved.bufferTimeout).toBe(DEFAULT_WRITER_OPTIONS.bufferTimeout);
    expect(resolved.minCompactBlocks).toBe(DEFAULT_WRITER_OPTIONS.minCompactBlocks);
    expect(resolved.maxRetries).toBe(DEFAULT_WRITER_OPTIONS.maxRetries);
    expect(resolved.retryBackoffMs).toBe(DEFAULT_WRITER_OPTIONS.retryBackoffMs);
  });

  it('should preserve provided options', () => {
    const resolved = resolveWriterOptions({
      r2Bucket: mockR2Bucket,
      tableLocation: 'test/table',
      schemaId: 5,
      bufferSize: 5000,
      bufferTimeout: 3000,
      minCompactBlocks: 8,
      maxRetries: 5,
      retryBackoffMs: 200,
    });

    expect(resolved.r2Bucket).toBe(mockR2Bucket);
    expect(resolved.tableLocation).toBe('test/table');
    expect(resolved.schemaId).toBe(5);
    expect(resolved.bufferSize).toBe(5000);
    expect(resolved.bufferTimeout).toBe(3000);
    expect(resolved.minCompactBlocks).toBe(8);
    expect(resolved.maxRetries).toBe(5);
    expect(resolved.retryBackoffMs).toBe(200);
  });
});

describe('Partition Mode Type Safety', () => {
  it('should only allow valid partition modes', () => {
    const validModes: PartitionMode[] = ['do-sqlite', 'edge-cache', 'enterprise'];

    for (const mode of validModes) {
      const config = PARTITION_MODES[mode];
      expect(config).toBeDefined();
    }
  });
});
