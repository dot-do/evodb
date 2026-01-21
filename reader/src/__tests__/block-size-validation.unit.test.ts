/**
 * Tests for block size validation - DoS protection against oversized blocks
 *
 * These tests verify that the reader properly rejects blocks that exceed
 * configured size limits to prevent memory exhaustion attacks.
 *
 * TDD Approach: These tests are written first and should FAIL until
 * the validation logic is implemented.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  validateBlockSize,
  BlockSizeValidationError,
  BlockSizeValidationErrorCode,
  DEFAULT_MAX_BLOCK_SIZE,
  type BlockSizeValidationOptions,
} from '../validation.js';
import { createQueryEngine, QueryEngine } from '../index.js';
import type { R2Bucket, R2Object } from '../types.js';

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Create a mock R2Object with a specific size
 */
function createMockR2ObjectWithSize(key: string, size: number, content?: ArrayBuffer): R2Object {
  const buffer = content ?? new ArrayBuffer(size);
  return {
    key,
    size,
    etag: `"${key.replace(/[^a-z0-9]/gi, '')}"`,
    httpEtag: `"${key.replace(/[^a-z0-9]/gi, '')}"`,
    uploaded: new Date(),
    customMetadata: {},
    arrayBuffer: vi.fn().mockResolvedValue(buffer),
    text: vi.fn().mockResolvedValue(''),
    json: vi.fn().mockResolvedValue({}),
  };
}

/**
 * Create a large ArrayBuffer with JSON-like content
 */
function createLargeJsonBuffer(sizeInBytes: number): ArrayBuffer {
  // Create a simple repeating JSON structure
  const encoder = new TextEncoder();
  const chunk = '{"id":[1,2,3],"name":["a","b","c"]}';
  const chunkBytes = encoder.encode(chunk);

  const buffer = new ArrayBuffer(sizeInBytes);
  const view = new Uint8Array(buffer);

  // Fill with repeating chunk pattern
  for (let i = 0; i < sizeInBytes; i++) {
    view[i] = chunkBytes[i % chunkBytes.length];
  }

  return buffer;
}

/**
 * Sample manifest for tests
 */
const SAMPLE_MANIFEST = {
  version: 1,
  tables: {
    events: {
      name: 'events',
      schema: [
        { name: 'id', type: 'int64', nullable: false },
        { name: 'user_id', type: 'string', nullable: false },
      ],
      blockPaths: ['data/events/block_001.json'],
      rowCount: 100,
      lastUpdated: Date.now(),
    },
  },
};

/**
 * Sample valid block data
 */
const SAMPLE_BLOCK = {
  id: [1, 2, 3],
  user_id: ['u1', 'u2', 'u3'],
};

/**
 * Create mock R2Object for given data
 */
function createMockR2Object(key: string, data: unknown): R2Object {
  const buffer = new TextEncoder().encode(JSON.stringify(data)).buffer;
  return {
    key,
    size: buffer.byteLength,
    etag: `"${key.replace(/[^a-z0-9]/gi, '')}"`,
    httpEtag: `"${key.replace(/[^a-z0-9]/gi, '')}"`,
    uploaded: new Date(),
    customMetadata: {},
    arrayBuffer: vi.fn().mockResolvedValue(buffer),
    text: vi.fn().mockResolvedValue(JSON.stringify(data)),
    json: vi.fn().mockResolvedValue(data),
  };
}

// ============================================================================
// Unit Tests for validateBlockSize function
// ============================================================================

describe('validateBlockSize', () => {
  describe('Default Limits', () => {
    it('should export DEFAULT_MAX_BLOCK_SIZE constant', () => {
      expect(DEFAULT_MAX_BLOCK_SIZE).toBeDefined();
      expect(typeof DEFAULT_MAX_BLOCK_SIZE).toBe('number');
      expect(DEFAULT_MAX_BLOCK_SIZE).toBeGreaterThan(0);
    });

    it('should have sensible default limit (e.g., 128MB or 256MB)', () => {
      // Default should be between 64MB and 512MB - reasonable for block data
      const MB = 1024 * 1024;
      expect(DEFAULT_MAX_BLOCK_SIZE).toBeGreaterThanOrEqual(64 * MB);
      expect(DEFAULT_MAX_BLOCK_SIZE).toBeLessThanOrEqual(512 * MB);
    });
  });

  describe('Size Validation', () => {
    it('should accept blocks under the default limit', () => {
      const smallSize = 1024; // 1KB
      expect(() => validateBlockSize(smallSize, 'test/block.json')).not.toThrow();
    });

    it('should accept blocks exactly at the default limit', () => {
      expect(() => validateBlockSize(DEFAULT_MAX_BLOCK_SIZE, 'test/block.json')).not.toThrow();
    });

    it('should reject blocks exceeding the default limit', () => {
      const oversizedBlock = DEFAULT_MAX_BLOCK_SIZE + 1;
      expect(() => validateBlockSize(oversizedBlock, 'test/block.json')).toThrow(BlockSizeValidationError);
    });

    it('should accept blocks under a custom limit', () => {
      const customLimit = 1024 * 1024; // 1MB
      const blockSize = 512 * 1024; // 512KB
      expect(() => validateBlockSize(blockSize, 'test/block.json', { maxBlockSize: customLimit })).not.toThrow();
    });

    it('should reject blocks exceeding a custom limit', () => {
      const customLimit = 1024 * 1024; // 1MB
      const blockSize = 2 * 1024 * 1024; // 2MB
      expect(() => validateBlockSize(blockSize, 'test/block.json', { maxBlockSize: customLimit })).toThrow(BlockSizeValidationError);
    });

    it('should reject zero-size blocks when configured', () => {
      expect(() => validateBlockSize(0, 'test/block.json', { rejectEmpty: true })).toThrow(BlockSizeValidationError);
    });

    it('should accept zero-size blocks by default', () => {
      expect(() => validateBlockSize(0, 'test/block.json')).not.toThrow();
    });

    it('should reject negative sizes', () => {
      expect(() => validateBlockSize(-1, 'test/block.json')).toThrow(BlockSizeValidationError);
    });
  });

  describe('Error Details', () => {
    it('should throw BlockSizeValidationError with BLOCK_TOO_LARGE code', () => {
      const oversizedBlock = DEFAULT_MAX_BLOCK_SIZE + 1;
      try {
        validateBlockSize(oversizedBlock, 'data/events/block_001.json');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(BlockSizeValidationError);
        const validationError = error as BlockSizeValidationError;
        expect(validationError.code).toBe(BlockSizeValidationErrorCode.BLOCK_TOO_LARGE);
      }
    });

    it('should include block path in error', () => {
      const oversizedBlock = DEFAULT_MAX_BLOCK_SIZE + 1;
      try {
        validateBlockSize(oversizedBlock, 'data/events/large_block.json');
        expect.fail('Should have thrown');
      } catch (error) {
        const validationError = error as BlockSizeValidationError;
        expect(validationError.blockPath).toBe('data/events/large_block.json');
      }
    });

    it('should include actual size in error details', () => {
      const oversizedBlock = DEFAULT_MAX_BLOCK_SIZE + 12345;
      try {
        validateBlockSize(oversizedBlock, 'test/block.json');
        expect.fail('Should have thrown');
      } catch (error) {
        const validationError = error as BlockSizeValidationError;
        expect(validationError.details?.actualSize).toBe(oversizedBlock);
      }
    });

    it('should include max size in error details', () => {
      const customLimit = 1024 * 1024;
      const oversizedBlock = customLimit + 1;
      try {
        validateBlockSize(oversizedBlock, 'test/block.json', { maxBlockSize: customLimit });
        expect.fail('Should have thrown');
      } catch (error) {
        const validationError = error as BlockSizeValidationError;
        expect(validationError.details?.maxSize).toBe(customLimit);
      }
    });

    it('should provide human-readable error message', () => {
      const MB = 1024 * 1024;
      const oversizedBlock = 150 * MB;
      const customLimit = 100 * MB;
      try {
        validateBlockSize(oversizedBlock, 'test/block.json', { maxBlockSize: customLimit });
        expect.fail('Should have thrown');
      } catch (error) {
        const validationError = error as BlockSizeValidationError;
        // Message should include human-readable sizes (MB)
        expect(validationError.message).toMatch(/150.*MB|100.*MB|block.*size|exceeds/i);
      }
    });

    it('should throw NEGATIVE_SIZE error for negative sizes', () => {
      try {
        validateBlockSize(-100, 'test/block.json');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(BlockSizeValidationError);
        const validationError = error as BlockSizeValidationError;
        expect(validationError.code).toBe(BlockSizeValidationErrorCode.NEGATIVE_SIZE);
      }
    });

    it('should throw EMPTY_BLOCK error when rejectEmpty is true', () => {
      try {
        validateBlockSize(0, 'test/block.json', { rejectEmpty: true });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(BlockSizeValidationError);
        const validationError = error as BlockSizeValidationError;
        expect(validationError.code).toBe(BlockSizeValidationErrorCode.EMPTY_BLOCK);
      }
    });
  });
});

// ============================================================================
// Integration Tests with parseAndValidateBlockData
// ============================================================================

describe('parseAndValidateBlockData with size limits', () => {
  it('should accept small buffers', async () => {
    const { parseAndValidateBlockData } = await import('../validation.js');
    const smallData = { id: [1, 2, 3], name: ['a', 'b', 'c'] };
    const buffer = new TextEncoder().encode(JSON.stringify(smallData)).buffer;

    expect(() => parseAndValidateBlockData(buffer, 'test/block.json')).not.toThrow();
  });

  it('should reject oversized buffers with maxBlockSize option', async () => {
    const { parseAndValidateBlockData, BlockSizeValidationError } = await import('../validation.js');

    // Create a 2MB buffer
    const largeBuffer = new ArrayBuffer(2 * 1024 * 1024);
    const view = new Uint8Array(largeBuffer);
    // Fill with valid JSON-ish content (will fail JSON parse but size check comes first)
    const jsonStart = new TextEncoder().encode('{"id":[');
    view.set(jsonStart, 0);

    expect(() => parseAndValidateBlockData(
      largeBuffer,
      'test/block.json',
      { maxBlockSize: 1024 * 1024 } // 1MB limit
    )).toThrow(BlockSizeValidationError);
  });

  it('should check size before attempting JSON parse (performance)', async () => {
    const { parseAndValidateBlockData, BlockSizeValidationError, BlockSizeValidationErrorCode } = await import('../validation.js');

    // Create a large buffer that would be expensive to parse
    const largeBuffer = createLargeJsonBuffer(10 * 1024 * 1024); // 10MB

    const startTime = Date.now();
    try {
      parseAndValidateBlockData(largeBuffer, 'test/block.json', { maxBlockSize: 1024 * 1024 });
      expect.fail('Should have thrown');
    } catch (error) {
      const elapsed = Date.now() - startTime;
      // Size check should be fast - fail before expensive JSON parse
      expect(elapsed).toBeLessThan(100); // Should be nearly instant
      expect(error).toBeInstanceOf(BlockSizeValidationError);
      const validationError = error as BlockSizeValidationError;
      expect(validationError.code).toBe(BlockSizeValidationErrorCode.BLOCK_TOO_LARGE);
    }
  });
});

// ============================================================================
// Integration Tests with QueryEngine
// ============================================================================

describe('QueryEngine with block size limits', () => {
  /**
   * Create a mock bucket where specific blocks return oversized content
   */
  function createMockBucketWithOversizedBlock(oversizedBlockSize: number): R2Bucket {
    return {
      get: vi.fn(async (key: string) => {
        if (key === 'manifest.json') {
          return createMockR2Object(key, SAMPLE_MANIFEST);
        }
        if (key === 'data/events/block_001.json') {
          // Return an oversized block
          return createMockR2ObjectWithSize(
            key,
            oversizedBlockSize,
            createLargeJsonBuffer(oversizedBlockSize)
          );
        }
        return null;
      }),
      head: vi.fn(async () => null),
      list: vi.fn(async () => ({ objects: [], truncated: false })),
    };
  }

  /**
   * Create a mock bucket with normal-sized blocks
   */
  function createMockBucketWithNormalBlock(): R2Bucket {
    return {
      get: vi.fn(async (key: string) => {
        if (key === 'manifest.json') {
          return createMockR2Object(key, SAMPLE_MANIFEST);
        }
        if (key === 'data/events/block_001.json') {
          return createMockR2Object(key, SAMPLE_BLOCK);
        }
        return null;
      }),
      head: vi.fn(async () => null),
      list: vi.fn(async () => ({ objects: [], truncated: false })),
    };
  }

  describe('ReaderConfig.maxBlockSize option', () => {
    it('should accept maxBlockSize in ReaderConfig', () => {
      const bucket = createMockBucketWithNormalBlock();

      // Should not throw during construction
      const engine = createQueryEngine({
        bucket,
        maxBlockSize: 10 * 1024 * 1024, // 10MB
      });

      expect(engine).toBeDefined();
      expect(engine).toBeInstanceOf(QueryEngine);
    });

    it('should use default maxBlockSize when not specified', async () => {
      const bucket = createMockBucketWithNormalBlock();
      const engine = createQueryEngine({ bucket });

      // Query should succeed with normal-sized blocks
      const result = await engine.query({ table: 'events' });
      expect(result.rows.length).toBe(3);
    });
  });

  describe('Block size enforcement during query', () => {
    it('should reject oversized blocks during query execution', async () => {
      const oversizedSize = 200 * 1024 * 1024; // 200MB
      const bucket = createMockBucketWithOversizedBlock(oversizedSize);

      const engine = createQueryEngine({
        bucket,
        maxBlockSize: 100 * 1024 * 1024, // 100MB limit
      });

      await expect(
        engine.query({ table: 'events' })
      ).rejects.toThrow(/block.*size|exceeds|too large/i);
    });

    it('should reject oversized blocks during scanBlock', async () => {
      const oversizedSize = 50 * 1024 * 1024; // 50MB
      const bucket = createMockBucketWithOversizedBlock(oversizedSize);

      const engine = createQueryEngine({
        bucket,
        maxBlockSize: 10 * 1024 * 1024, // 10MB limit
      });

      await expect(
        engine.scanBlock({
          blockPath: 'data/events/block_001.json',
          columns: ['id'],
        })
      ).rejects.toThrow(/block.*size|exceeds|too large/i);
    });

    it('should include block path in error when rejecting oversized block', async () => {
      const oversizedSize = 200 * 1024 * 1024;
      const bucket = createMockBucketWithOversizedBlock(oversizedSize);

      const engine = createQueryEngine({
        bucket,
        maxBlockSize: 100 * 1024 * 1024,
      });

      try {
        await engine.query({ table: 'events' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toMatch(/block_001\.json|data\/events/i);
      }
    });

    it('should allow blocks under the limit', async () => {
      const bucket = createMockBucketWithNormalBlock();

      const engine = createQueryEngine({
        bucket,
        maxBlockSize: 10 * 1024 * 1024, // 10MB limit
      });

      // Should succeed with normal-sized blocks
      const result = await engine.query({ table: 'events' });
      expect(result.rows.length).toBe(3);
    });

    it('should respect custom maxBlockSize lower than default', async () => {
      // Create a block that's under default limit but over custom limit
      const blockSize = 5 * 1024 * 1024; // 5MB - under default, over custom
      const bucket = createMockBucketWithOversizedBlock(blockSize);

      const engine = createQueryEngine({
        bucket,
        maxBlockSize: 1 * 1024 * 1024, // 1MB custom limit
      });

      await expect(
        engine.query({ table: 'events' })
      ).rejects.toThrow(/block.*size|exceeds|too large/i);
    });
  });

  describe('Error type and details', () => {
    it('should throw BlockSizeValidationError from query', async () => {
      const { BlockSizeValidationError } = await import('../validation.js');

      const oversizedSize = 200 * 1024 * 1024;
      const bucket = createMockBucketWithOversizedBlock(oversizedSize);

      const engine = createQueryEngine({
        bucket,
        maxBlockSize: 100 * 1024 * 1024,
      });

      try {
        await engine.query({ table: 'events' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(BlockSizeValidationError);
      }
    });

    it('should include size details in error from query', async () => {
      const { BlockSizeValidationError } = await import('../validation.js');

      const oversizedSize = 200 * 1024 * 1024;
      const maxSize = 100 * 1024 * 1024;
      const bucket = createMockBucketWithOversizedBlock(oversizedSize);

      const engine = createQueryEngine({
        bucket,
        maxBlockSize: maxSize,
      });

      try {
        await engine.query({ table: 'events' });
        expect.fail('Should have thrown');
      } catch (error) {
        const validationError = error as InstanceType<typeof BlockSizeValidationError>;
        expect(validationError.details?.actualSize).toBe(oversizedSize);
        expect(validationError.details?.maxSize).toBe(maxSize);
      }
    });
  });
});

// ============================================================================
// Type Guard Tests
// ============================================================================

describe('BlockSizeValidationError type guard', () => {
  it('should export isBlockSizeValidationError type guard', async () => {
    const { isBlockSizeValidationError } = await import('../validation.js');
    expect(typeof isBlockSizeValidationError).toBe('function');
  });

  it('should return true for BlockSizeValidationError instances', async () => {
    const { isBlockSizeValidationError, BlockSizeValidationError, BlockSizeValidationErrorCode } = await import('../validation.js');

    const error = new BlockSizeValidationError(
      'Test error',
      'test/block.json',
      BlockSizeValidationErrorCode.BLOCK_TOO_LARGE,
      { actualSize: 100, maxSize: 50 }
    );

    expect(isBlockSizeValidationError(error)).toBe(true);
  });

  it('should return false for regular Error instances', async () => {
    const { isBlockSizeValidationError } = await import('../validation.js');

    const error = new Error('Regular error');
    expect(isBlockSizeValidationError(error)).toBe(false);
  });

  it('should return false for null and undefined', async () => {
    const { isBlockSizeValidationError } = await import('../validation.js');

    expect(isBlockSizeValidationError(null)).toBe(false);
    expect(isBlockSizeValidationError(undefined)).toBe(false);
  });
});
