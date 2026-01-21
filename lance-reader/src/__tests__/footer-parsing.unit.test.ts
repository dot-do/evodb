/**
 * @evodb/lance-reader - Footer Parsing Tests
 *
 * Tests for parsing Lance file footers and related structures.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  LanceFileReader,
  MemoryStorageAdapter,
  LANCE_MAGIC,
  LANCE_FOOTER_SIZE,
} from '../index.js';

/**
 * Create a mock Lance file with valid footer
 */
function createMockLanceFile(options: {
  numColumns?: number;
  numGlobalBuffers?: number;
  majorVersion?: number;
  minorVersion?: number;
  bodySize?: number;
}): ArrayBuffer {
  const {
    numColumns = 3,
    numGlobalBuffers = 2,
    majorVersion = 0,
    minorVersion = 3,
    bodySize = 1000,
  } = options;

  // Create a buffer with body + footer
  const totalSize = bodySize + LANCE_FOOTER_SIZE;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  // Write footer at the end
  const footerOffset = bodySize;

  // Lance footer structure (40 bytes, little-endian):
  // - columnMeta0Offset: u64 (8 bytes)
  // - cmoTableOffset: u64 (8 bytes)
  // - gboTableOffset: u64 (8 bytes)
  // - numGlobalBuffers: u32 (4 bytes)
  // - numColumns: u32 (4 bytes)
  // - majorVersion: u16 (2 bytes)
  // - minorVersion: u16 (2 bytes)
  // - magic: 4 bytes "LANC"

  view.setBigUint64(footerOffset + 0, BigInt(100), true);     // columnMeta0Offset
  view.setBigUint64(footerOffset + 8, BigInt(200), true);     // cmoTableOffset
  view.setBigUint64(footerOffset + 16, BigInt(300), true);    // gboTableOffset
  view.setUint32(footerOffset + 24, numGlobalBuffers, true);  // numGlobalBuffers
  view.setUint32(footerOffset + 28, numColumns, true);        // numColumns
  view.setUint16(footerOffset + 32, majorVersion, true);      // majorVersion
  view.setUint16(footerOffset + 34, minorVersion, true);      // minorVersion

  // Write magic bytes "LANC"
  const magic = new TextEncoder().encode(LANCE_MAGIC);
  for (let i = 0; i < 4; i++) {
    view.setUint8(footerOffset + 36 + i, magic[i]);
  }

  return buffer;
}

describe('LanceFileReader Footer Parsing', () => {
  let storage: MemoryStorageAdapter;

  beforeEach(() => {
    storage = new MemoryStorageAdapter();
  });

  it('should parse footer from valid Lance file', async () => {
    const lanceFile = createMockLanceFile({
      numColumns: 5,
      numGlobalBuffers: 3,
      majorVersion: 0,
      minorVersion: 3,
    });
    storage.put('test.lance', lanceFile);

    const reader = new LanceFileReader(storage, 'test.lance');
    const footer = await reader.readFooter();

    expect(footer.numColumns).toBe(5);
    expect(footer.numGlobalBuffers).toBe(3);
    expect(footer.majorVersion).toBe(0);
    expect(footer.minorVersion).toBe(3);
    expect(footer.columnMeta0Offset).toBe(100n);
    expect(footer.cmoTableOffset).toBe(200n);
    expect(footer.gboTableOffset).toBe(300n);
  });

  it('should throw error for invalid magic bytes', async () => {
    const buffer = new ArrayBuffer(100);
    const view = new DataView(buffer);
    // Write invalid magic bytes
    const invalidMagic = new TextEncoder().encode('FAKE');
    for (let i = 0; i < 4; i++) {
      view.setUint8(96 + i, invalidMagic[i]); // 100 - 4 = 96
    }
    storage.put('invalid.lance', buffer);

    const reader = new LanceFileReader(storage, 'invalid.lance');
    await expect(reader.readFooter()).rejects.toThrow(/Invalid Lance file/);
  });

  it('should handle Lance v0.1 footer format', async () => {
    const lanceFile = createMockLanceFile({
      majorVersion: 0,
      minorVersion: 1,
    });
    storage.put('v0.1.lance', lanceFile);

    const reader = new LanceFileReader(storage, 'v0.1.lance');
    const footer = await reader.readFooter();

    expect(footer.majorVersion).toBe(0);
    expect(footer.minorVersion).toBe(1);
  });

  it('should cache footer after first read', async () => {
    const lanceFile = createMockLanceFile({});
    storage.put('cached.lance', lanceFile);

    const reader = new LanceFileReader(storage, 'cached.lance');

    // First read
    const footer1 = await reader.readFooter();
    // Second read should return same instance
    const footer2 = await reader.readFooter();

    expect(footer1).toBe(footer2);
  });

  it('should read global buffer offset table', async () => {
    // Create a file with GBO table
    const bodySize = 500;
    const buffer = new ArrayBuffer(bodySize + LANCE_FOOTER_SIZE);
    const view = new DataView(buffer);

    // Write GBO table at offset 300 (2 entries, each 16 bytes)
    // Entry 0: position=100, size=50
    view.setBigUint64(300, 100n, true);
    view.setBigUint64(308, 50n, true);
    // Entry 1: position=200, size=75
    view.setBigUint64(316, 200n, true);
    view.setBigUint64(324, 75n, true);

    // Write footer
    const footerOffset = bodySize;
    view.setBigUint64(footerOffset + 0, 100n, true);   // columnMeta0Offset
    view.setBigUint64(footerOffset + 8, 200n, true);   // cmoTableOffset
    view.setBigUint64(footerOffset + 16, 300n, true);  // gboTableOffset
    view.setUint32(footerOffset + 24, 2, true);        // numGlobalBuffers
    view.setUint32(footerOffset + 28, 3, true);        // numColumns
    view.setUint16(footerOffset + 32, 0, true);        // majorVersion
    view.setUint16(footerOffset + 34, 3, true);        // minorVersion

    // Magic
    const magic = new TextEncoder().encode(LANCE_MAGIC);
    for (let i = 0; i < 4; i++) {
      view.setUint8(footerOffset + 36 + i, magic[i]);
    }

    storage.put('with-gbo.lance', buffer);

    const reader = new LanceFileReader(storage, 'with-gbo.lance');
    const gboTable = await reader.readGboTable();

    expect(gboTable).toHaveLength(2);
    expect(gboTable[0].position).toBe(100n);
    expect(gboTable[0].size).toBe(50n);
    expect(gboTable[1].position).toBe(200n);
    expect(gboTable[1].size).toBe(75n);
  });

  it('should read global buffer by index', async () => {
    // Create file with actual buffer data
    const buffer = new ArrayBuffer(600);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    // Write buffer content at position 100
    const bufferContent = new Uint8Array([1, 2, 3, 4, 5]);
    bytes.set(bufferContent, 100);

    // Write GBO table at offset 300
    view.setBigUint64(300, 100n, true);  // position
    view.setBigUint64(308, 5n, true);    // size

    // Write footer at offset 560
    const footerOffset = 560;
    view.setBigUint64(footerOffset + 0, 50n, true);
    view.setBigUint64(footerOffset + 8, 200n, true);
    view.setBigUint64(footerOffset + 16, 300n, true);
    view.setUint32(footerOffset + 24, 1, true);
    view.setUint32(footerOffset + 28, 1, true);
    view.setUint16(footerOffset + 32, 0, true);
    view.setUint16(footerOffset + 34, 3, true);

    const magic = new TextEncoder().encode(LANCE_MAGIC);
    for (let i = 0; i < 4; i++) {
      view.setUint8(footerOffset + 36 + i, magic[i]);
    }

    storage.put('with-buffer.lance', buffer);

    const reader = new LanceFileReader(storage, 'with-buffer.lance');
    const globalBuffer = await reader.readGlobalBuffer(0);

    expect(new Uint8Array(globalBuffer)).toEqual(bufferContent);
  });
});
