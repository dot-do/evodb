/**
 * Tests for corrupted block error handling
 *
 * TDD: Tests for handling corrupted block data
 * These tests verify that the system gracefully handles corruption scenarios
 * that may occur when R2 returns corrupted data.
 */

import { describe, it, expect } from 'vitest';
import { readBlock, writeBlock, getBlockStats, MAGIC, VERSION, HEADER_SIZE, FOOTER_SIZE, Type, Encoding, type EncodedColumn } from '../index.js';
import { CorruptedBlockError, StorageError, EvoDBError } from '../errors.js';

/**
 * Helper to create a valid encoded column for testing
 */
function createTestColumn(path: string, values: number[]): EncodedColumn {
  const data = new Uint8Array(values.length * 4);
  const view = new DataView(data.buffer);
  values.forEach((v, i) => view.setInt32(i * 4, v, true));

  return {
    path,
    type: Type.Int32,
    encoding: Encoding.Plain,
    data,
    nullBitmap: new Uint8Array(Math.ceil(values.length / 8)),
    stats: {
      min: Math.min(...values),
      max: Math.max(...values),
      nullCount: 0,
      distinctEst: new Set(values).size,
    },
  };
}

describe('CorruptedBlockError', () => {
  it('should extend StorageError', () => {
    const error = new CorruptedBlockError('Test corruption');
    expect(error).toBeInstanceOf(StorageError);
  });

  it('should have name set to CorruptedBlockError', () => {
    const error = new CorruptedBlockError('Test corruption');
    expect(error.name).toBe('CorruptedBlockError');
  });

  it('should have default code CORRUPTED_BLOCK', () => {
    const error = new CorruptedBlockError('Block data is corrupted');
    expect(error.code).toBe('CORRUPTED_BLOCK');
  });

  it('should allow custom error codes', () => {
    const error = new CorruptedBlockError('Bad checksum', 'CHECKSUM_MISMATCH');
    expect(error.code).toBe('CHECKSUM_MISMATCH');
  });

  it('should include corruption details in message', () => {
    const error = new CorruptedBlockError('Invalid magic number: expected 0x434A4C42, got 0x00000000');
    expect(error.message).toContain('magic number');
    expect(error.message).toContain('0x434A4C42');
  });

  it('should have optional details property for corruption metadata', () => {
    const error = new CorruptedBlockError('Checksum mismatch', 'CHECKSUM_MISMATCH', {
      expected: 0x12345678,
      actual: 0x87654321,
      offset: 30,
    });
    expect(error.details).toEqual({
      expected: 0x12345678,
      actual: 0x87654321,
      offset: 30,
    });
  });
});

describe('readBlock corruption handling', () => {
  describe('magic number validation', () => {
    it('should throw CorruptedBlockError for corrupted magic number at start', () => {
      // Create a block with zeroed magic number
      const corruptedBlock = new Uint8Array(HEADER_SIZE + FOOTER_SIZE);
      // Set all bytes to zero (corrupted magic)

      expect(() => readBlock(corruptedBlock)).toThrow(CorruptedBlockError);
    });

    it('should throw CorruptedBlockError with descriptive message for wrong magic', () => {
      const corruptedBlock = new Uint8Array(HEADER_SIZE + FOOTER_SIZE);
      const view = new DataView(corruptedBlock.buffer);
      view.setUint32(0, 0xDEADBEEF, true); // Wrong magic

      try {
        readBlock(corruptedBlock);
        expect.fail('Should have thrown CorruptedBlockError');
      } catch (error) {
        expect(error).toBeInstanceOf(CorruptedBlockError);
        expect((error as CorruptedBlockError).message).toContain('magic');
        expect((error as CorruptedBlockError).code).toBe('INVALID_MAGIC');
      }
    });

    it('should include expected and actual magic values in error details', () => {
      const corruptedBlock = new Uint8Array(HEADER_SIZE + FOOTER_SIZE);
      const view = new DataView(corruptedBlock.buffer);
      const wrongMagic = 0xBADC0DE;
      view.setUint32(0, wrongMagic, true);

      try {
        readBlock(corruptedBlock);
        expect.fail('Should have thrown CorruptedBlockError');
      } catch (error) {
        expect(error).toBeInstanceOf(CorruptedBlockError);
        const details = (error as CorruptedBlockError).details;
        expect(details?.expected).toBe(MAGIC);
        expect(details?.actual).toBe(wrongMagic);
      }
    });
  });

  describe('truncated data validation', () => {
    it('should throw CorruptedBlockError for data shorter than header size', () => {
      const truncatedBlock = new Uint8Array(10); // Way too short

      expect(() => readBlock(truncatedBlock)).toThrow(CorruptedBlockError);
    });

    it('should throw CorruptedBlockError with TRUNCATED_DATA code', () => {
      const truncatedBlock = new Uint8Array(HEADER_SIZE - 1);
      const view = new DataView(truncatedBlock.buffer);
      view.setUint32(0, MAGIC, true); // Valid magic but truncated

      try {
        readBlock(truncatedBlock);
        expect.fail('Should have thrown CorruptedBlockError');
      } catch (error) {
        expect(error).toBeInstanceOf(CorruptedBlockError);
        expect((error as CorruptedBlockError).code).toBe('TRUNCATED_DATA');
      }
    });

    it('should include expected and actual sizes in error details', () => {
      const truncatedBlock = new Uint8Array(30);
      const view = new DataView(truncatedBlock.buffer);
      view.setUint32(0, MAGIC, true);

      try {
        readBlock(truncatedBlock);
        expect.fail('Should have thrown CorruptedBlockError');
      } catch (error) {
        expect(error).toBeInstanceOf(CorruptedBlockError);
        const details = (error as CorruptedBlockError).details;
        expect(details?.actualSize).toBe(30);
        expect(details?.minExpectedSize).toBeGreaterThan(30);
      }
    });

    it('should throw CorruptedBlockError when column data extends beyond buffer', () => {
      // Create a valid header but with column count that would require more data
      const col = createTestColumn('test', [1, 2, 3]);
      const validBlock = writeBlock([col], { rowCount: 3 });

      // Truncate the block
      const truncatedBlock = validBlock.slice(0, validBlock.length - 20);

      expect(() => readBlock(truncatedBlock)).toThrow(CorruptedBlockError);
    });
  });

  describe('checksum validation', () => {
    it('should throw CorruptedBlockError for invalid checksum', () => {
      const col = createTestColumn('test', [1, 2, 3, 4, 5]);
      const validBlock = writeBlock([col], { rowCount: 5 });

      // Corrupt the data portion (after header, before footer)
      const corruptedBlock = new Uint8Array(validBlock);
      corruptedBlock[HEADER_SIZE + 10] ^= 0xFF; // Flip bits in data

      expect(() => readBlock(corruptedBlock)).toThrow(CorruptedBlockError);
    });

    it('should throw CorruptedBlockError with CHECKSUM_MISMATCH code', () => {
      const col = createTestColumn('value', [10, 20, 30]);
      const validBlock = writeBlock([col], { rowCount: 3 });

      // Corrupt a byte in the column data section
      const corruptedBlock = new Uint8Array(validBlock);
      const dataOffset = HEADER_SIZE + 20; // Somewhere in schema/data
      if (dataOffset < corruptedBlock.length) {
        corruptedBlock[dataOffset] ^= 0xFF;
      }

      try {
        readBlock(corruptedBlock);
        expect.fail('Should have thrown CorruptedBlockError');
      } catch (error) {
        expect(error).toBeInstanceOf(CorruptedBlockError);
        expect((error as CorruptedBlockError).code).toBe('CHECKSUM_MISMATCH');
      }
    });

    it('should include expected and actual checksums in error details', () => {
      const col = createTestColumn('id', [100, 200, 300, 400]);
      const validBlock = writeBlock([col], { rowCount: 4 });

      // Get the original checksum
      const originalView = new DataView(validBlock.buffer, validBlock.byteOffset, validBlock.byteLength);
      const originalChecksum = originalView.getUint32(30, true); // Checksum offset in header

      // Corrupt the block
      const corruptedBlock = new Uint8Array(validBlock);
      corruptedBlock[HEADER_SIZE + 5] ^= 0xAA;

      try {
        readBlock(corruptedBlock);
        expect.fail('Should have thrown CorruptedBlockError');
      } catch (error) {
        expect(error).toBeInstanceOf(CorruptedBlockError);
        const details = (error as CorruptedBlockError).details;
        expect(details?.expected).toBe(originalChecksum);
        expect(details?.actual).toBeDefined();
        expect(details?.actual).not.toBe(originalChecksum);
      }
    });
  });

  describe('version validation', () => {
    it('should throw CorruptedBlockError for unsupported version', () => {
      const col = createTestColumn('test', [1]);
      const validBlock = writeBlock([col], { rowCount: 1 });

      // Set unsupported version
      const corruptedBlock = new Uint8Array(validBlock);
      const view = new DataView(corruptedBlock.buffer);
      view.setUint16(4, 999, true); // Invalid version at offset 4

      expect(() => readBlock(corruptedBlock)).toThrow(CorruptedBlockError);
    });

    it('should throw CorruptedBlockError with UNSUPPORTED_VERSION code', () => {
      const col = createTestColumn('test', [1]);
      const validBlock = writeBlock([col], { rowCount: 1 });

      const corruptedBlock = new Uint8Array(validBlock);
      const view = new DataView(corruptedBlock.buffer);
      view.setUint16(4, 255, true);

      try {
        readBlock(corruptedBlock);
        expect.fail('Should have thrown CorruptedBlockError');
      } catch (error) {
        expect(error).toBeInstanceOf(CorruptedBlockError);
        expect((error as CorruptedBlockError).code).toBe('UNSUPPORTED_VERSION');
        expect((error as CorruptedBlockError).details?.version).toBe(255);
        expect((error as CorruptedBlockError).details?.supportedVersions).toContain(VERSION);
      }
    });
  });

  describe('structural integrity', () => {
    it('should throw CorruptedBlockError for invalid column count', () => {
      const col = createTestColumn('test', [1, 2]);
      const validBlock = writeBlock([col], { rowCount: 2 });

      // Set impossibly large column count
      const corruptedBlock = new Uint8Array(validBlock);
      const view = new DataView(corruptedBlock.buffer);
      view.setUint16(14, 10000, true); // Column count at offset 14

      expect(() => readBlock(corruptedBlock)).toThrow(CorruptedBlockError);
    });

    it('should throw CorruptedBlockError for invalid row count', () => {
      const col = createTestColumn('test', [1, 2, 3]);
      const validBlock = writeBlock([col], { rowCount: 3 });

      // Set impossibly large row count relative to block size
      const corruptedBlock = new Uint8Array(validBlock);
      const view = new DataView(corruptedBlock.buffer);
      view.setUint32(10, 0xFFFFFFFF, true); // Row count at offset 10

      expect(() => readBlock(corruptedBlock)).toThrow(CorruptedBlockError);
    });

    it('should throw CorruptedBlockError for negative sizes in column data', () => {
      const col = createTestColumn('test', [1, 2, 3]);
      const validBlock = writeBlock([col], { rowCount: 3 });

      // Corrupt column data sizes
      const corruptedBlock = new Uint8Array(validBlock);
      const view = new DataView(corruptedBlock.buffer);
      // Find and corrupt the bitmap size field (first 4 bytes after schema)
      const schemaEnd = HEADER_SIZE + 10; // Approximate
      if (schemaEnd + 4 < corruptedBlock.length) {
        view.setUint32(schemaEnd, 0x80000000, true); // Very large value
      }

      expect(() => readBlock(corruptedBlock)).toThrow(CorruptedBlockError);
    });
  });
});

describe('getBlockStats corruption handling', () => {
  it('should throw CorruptedBlockError for corrupted magic number', () => {
    const corruptedBlock = new Uint8Array(HEADER_SIZE);
    const view = new DataView(corruptedBlock.buffer);
    view.setUint32(0, 0x12345678, true); // Wrong magic

    expect(() => getBlockStats(corruptedBlock)).toThrow(CorruptedBlockError);
  });

  it('should throw CorruptedBlockError for truncated data', () => {
    const truncatedBlock = new Uint8Array(5);

    expect(() => getBlockStats(truncatedBlock)).toThrow(CorruptedBlockError);
  });
});

describe('corruption recovery scenarios', () => {
  it('should allow catching CorruptedBlockError specifically', () => {
    const corruptedBlock = new Uint8Array(10);

    let caughtError: Error | null = null;

    try {
      readBlock(corruptedBlock);
    } catch (error) {
      caughtError = error as Error;
    }

    expect(caughtError).toBeInstanceOf(CorruptedBlockError);
    expect(caughtError).toBeInstanceOf(StorageError);
    expect(caughtError).toBeInstanceOf(EvoDBError);
    expect(caughtError).toBeInstanceOf(Error);
  });

  it('should provide enough information for logging and debugging', () => {
    const col = createTestColumn('test', [1, 2, 3]);
    const validBlock = writeBlock([col], { rowCount: 3 });

    // Corrupt the block
    const corruptedBlock = new Uint8Array(validBlock);
    corruptedBlock[HEADER_SIZE + 5] ^= 0xFF;

    try {
      readBlock(corruptedBlock);
      expect.fail('Should have thrown');
    } catch (error) {
      const corrupted = error as CorruptedBlockError;

      // Should have useful info for debugging
      expect(corrupted.name).toBeDefined();
      expect(corrupted.message).toBeDefined();
      expect(corrupted.code).toBeDefined();
      expect(corrupted.stack).toBeDefined();
      expect(corrupted.details).toBeDefined();
    }
  });
});
