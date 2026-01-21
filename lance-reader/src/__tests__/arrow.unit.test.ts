/**
 * Tests for Arrow IPC Reader
 */

import { describe, it, expect } from 'vitest';
import {
  ArrowIpcReader,
  ArrowType,
  readPartitionData,
  readSchemaMetadata,
  getLanceIvfBufferIndex,
  parseLanceIndexMetadata,
} from '../arrow.js';

// ==========================================
// Arrow Magic Bytes
// ==========================================

const ARROW_MAGIC = new Uint8Array([0x41, 0x52, 0x52, 0x4f, 0x57, 0x31]); // "ARROW1"

/**
 * Create minimal Arrow IPC file with schema
 */
function createMinimalArrowFile(options: {
  metadata?: Map<string, string>;
  fields?: Array<{ name: string; type: number }>;
} = {}): ArrayBuffer {
  // This creates a very minimal Arrow IPC file structure
  // Real Arrow files are more complex, but this tests basic parsing

  const size = 200;
  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // Write start magic "ARROW1"
  bytes.set(ARROW_MAGIC, 0);

  // Padding to 8 bytes
  bytes[6] = 0;
  bytes[7] = 0;

  // Write footer at end
  // Footer size at position -10
  view.setInt32(size - 10, 20, true);

  // End magic "ARROW1"
  bytes.set(ARROW_MAGIC, size - 6);

  return buffer;
}

// ==========================================
// ArrowIpcReader Tests
// ==========================================

describe('ArrowIpcReader', () => {
  describe('verifyMagic', () => {
    it('should return true for valid Arrow file', () => {
      const buffer = createMinimalArrowFile();
      const reader = new ArrowIpcReader(buffer);

      expect(reader.verifyMagic()).toBe(true);
    });

    it('should return false for invalid start magic', () => {
      const buffer = createMinimalArrowFile();
      const bytes = new Uint8Array(buffer);
      bytes[0] = 0x00; // Corrupt first byte

      const reader = new ArrowIpcReader(buffer);
      expect(reader.verifyMagic()).toBe(false);
    });

    it('should return false for invalid end magic', () => {
      const buffer = createMinimalArrowFile();
      const bytes = new Uint8Array(buffer);
      bytes[buffer.byteLength - 1] = 0x00; // Corrupt last byte

      const reader = new ArrowIpcReader(buffer);
      expect(reader.verifyMagic()).toBe(false);
    });

    it('should return false for buffer too small', () => {
      const buffer = new ArrayBuffer(10); // Too small
      const reader = new ArrowIpcReader(buffer);

      expect(reader.verifyMagic()).toBe(false);
    });
  });

  describe('getBuffer', () => {
    it('should return slice of underlying buffer', () => {
      const data = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      const reader = new ArrowIpcReader(data.buffer);

      const slice = reader.getBuffer(2, 4);
      expect(new Uint8Array(slice)).toEqual(new Uint8Array([2, 3, 4, 5]));
    });
  });
});

// ==========================================
// ArrowType Enum Tests
// ==========================================

describe('ArrowType', () => {
  it('should have correct enum values', () => {
    expect(ArrowType.NONE).toBe(0);
    expect(ArrowType.Int).toBe(2);
    expect(ArrowType.FloatingPoint).toBe(3);
    expect(ArrowType.Binary).toBe(4);
    expect(ArrowType.Utf8).toBe(5);
    expect(ArrowType.List).toBe(12);
    expect(ArrowType.FixedSizeList).toBe(16);
    expect(ArrowType.LargeUtf8).toBe(20);
    expect(ArrowType.LargeBinary).toBe(21);
  });
});

// ==========================================
// readPartitionData Tests
// ==========================================

describe('readPartitionData', () => {
  it('should throw error for invalid Arrow file', () => {
    const invalidBuffer = new ArrayBuffer(100);

    expect(() => {
      readPartitionData(invalidBuffer, 8);
    }).toThrow(/Invalid Arrow IPC file/);
  });
});

// ==========================================
// readSchemaMetadata Tests
// ==========================================

describe('readSchemaMetadata', () => {
  it('should throw error for invalid Arrow file', () => {
    const invalidBuffer = new ArrayBuffer(100);

    expect(() => {
      readSchemaMetadata(invalidBuffer);
    }).toThrow(/Invalid Arrow IPC file/);
  });
});

// ==========================================
// getLanceIvfBufferIndex Tests
// ==========================================

describe('getLanceIvfBufferIndex', () => {
  it('should return null when lance:ivf not present', () => {
    const metadata = new Map<string, string>();
    expect(getLanceIvfBufferIndex(metadata)).toBeNull();
  });

  it('should return 0-based index from 1-based value', () => {
    const metadata = new Map<string, string>();
    metadata.set('lance:ivf', '1');
    expect(getLanceIvfBufferIndex(metadata)).toBe(0);
  });

  it('should handle larger indices', () => {
    const metadata = new Map<string, string>();
    metadata.set('lance:ivf', '5');
    expect(getLanceIvfBufferIndex(metadata)).toBe(4);
  });
});

// ==========================================
// parseLanceIndexMetadata Tests
// ==========================================

describe('parseLanceIndexMetadata', () => {
  it('should return null when lance:index not present', () => {
    const metadata = new Map<string, string>();
    expect(parseLanceIndexMetadata(metadata)).toBeNull();
  });

  it('should parse valid JSON metadata', () => {
    const metadata = new Map<string, string>();
    metadata.set('lance:index', '{"type":"ivf_pq","distance_type":"l2"}');

    const result = parseLanceIndexMetadata(metadata);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('ivf_pq');
    expect(result!.distanceType).toBe('l2');
  });

  it('should use defaults for missing fields', () => {
    const metadata = new Map<string, string>();
    metadata.set('lance:index', '{}');

    const result = parseLanceIndexMetadata(metadata);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('unknown');
    expect(result!.distanceType).toBe('l2');
  });

  it('should return null for invalid JSON', () => {
    const metadata = new Map<string, string>();
    metadata.set('lance:index', 'not valid json');

    const result = parseLanceIndexMetadata(metadata);
    expect(result).toBeNull();
  });

  it('should handle different distance types', () => {
    const testCases = [
      { input: '{"distance_type":"cosine"}', expected: 'cosine' },
      { input: '{"distance_type":"dot"}', expected: 'dot' },
      { input: '{"distance_type":"l2"}', expected: 'l2' },
    ];

    for (const tc of testCases) {
      const metadata = new Map<string, string>();
      metadata.set('lance:index', tc.input);

      const result = parseLanceIndexMetadata(metadata);
      expect(result?.distanceType).toBe(tc.expected);
    }
  });
});
