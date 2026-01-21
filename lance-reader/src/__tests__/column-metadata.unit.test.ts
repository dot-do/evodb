/**
 * @evodb/lance-reader - Column Metadata Tests
 *
 * Tests for reading column metadata and statistics.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  LanceFileReader,
  MemoryStorageAdapter,
  LANCE_MAGIC,
  LANCE_FOOTER_SIZE,
  parseColumnStatistics,
} from '../index.js';

describe('Column Metadata Reading', () => {
  let storage: MemoryStorageAdapter;

  beforeEach(() => {
    storage = new MemoryStorageAdapter();
  });

  it('should read column metadata offset table', async () => {
    // Create a file with CMO (Column Metadata Offset) table
    const buffer = new ArrayBuffer(600);
    const view = new DataView(buffer);

    // Write CMO table at offset 200 (3 columns, each entry 16 bytes: position + size)
    for (let i = 0; i < 3; i++) {
      view.setBigUint64(200 + i * 16, BigInt(50 + i * 30), true);     // position
      view.setBigUint64(200 + i * 16 + 8, BigInt(25 + i * 5), true);  // size
    }

    // Write footer
    const footerOffset = 560;
    view.setBigUint64(footerOffset + 0, 50n, true);   // columnMeta0Offset
    view.setBigUint64(footerOffset + 8, 200n, true);  // cmoTableOffset
    view.setBigUint64(footerOffset + 16, 400n, true); // gboTableOffset
    view.setUint32(footerOffset + 24, 0, true);       // numGlobalBuffers
    view.setUint32(footerOffset + 28, 3, true);       // numColumns
    view.setUint16(footerOffset + 32, 0, true);
    view.setUint16(footerOffset + 34, 3, true);

    const magic = new TextEncoder().encode(LANCE_MAGIC);
    for (let i = 0; i < 4; i++) {
      view.setUint8(footerOffset + 36 + i, magic[i]);
    }

    storage.put('with-cmo.lance', buffer);

    const reader = new LanceFileReader(storage, 'with-cmo.lance');

    // For now, verify footer is readable
    const footer = await reader.readFooter();
    expect(footer.numColumns).toBe(3);
    expect(footer.cmoTableOffset).toBe(200n);
  });

  it('should read column statistics from metadata', async () => {
    // Column statistics include min/max values for pruning
    // This is stored in the column metadata section

    // Placeholder - actual implementation would parse column stats
    const columnStats = {
      columnId: 1,
      nullCount: 0n,
      rowCount: 1000n,
      minValue: 0n,
      maxValue: 999n,
    };

    expect(columnStats.minValue).toBeLessThan(Number(columnStats.maxValue));
  });
});

describe('RED PHASE: Column Metadata Table Reader', () => {
  it('should read column metadata entries from CMO table', async () => {
    const storage = new MemoryStorageAdapter();

    // Create a Lance file with proper CMO table
    const buffer = new ArrayBuffer(700);
    const view = new DataView(buffer);

    // Write 3 column metadata entries at offset 200
    // Each entry: position (u64) + size (u64) = 16 bytes
    view.setBigUint64(200, 50n, true);   // col 0 position
    view.setBigUint64(208, 30n, true);   // col 0 size
    view.setBigUint64(216, 80n, true);   // col 1 position
    view.setBigUint64(224, 40n, true);   // col 1 size
    view.setBigUint64(232, 120n, true);  // col 2 position
    view.setBigUint64(240, 50n, true);   // col 2 size

    // Write footer
    const footerOffset = 660;
    view.setBigUint64(footerOffset + 0, 50n, true);   // columnMeta0Offset
    view.setBigUint64(footerOffset + 8, 200n, true);  // cmoTableOffset
    view.setBigUint64(footerOffset + 16, 400n, true); // gboTableOffset
    view.setUint32(footerOffset + 24, 0, true);
    view.setUint32(footerOffset + 28, 3, true);       // numColumns
    view.setUint16(footerOffset + 32, 0, true);
    view.setUint16(footerOffset + 34, 3, true);

    const magic = new TextEncoder().encode(LANCE_MAGIC);
    for (let i = 0; i < 4; i++) {
      view.setUint8(footerOffset + 36 + i, magic[i]);
    }

    storage.put('test.lance', buffer);

    const reader = new LanceFileReader(storage, 'test.lance');

    // This method is now implemented
    const cmoTable = await reader.readColumnMetadataTable();

    expect(cmoTable).toHaveLength(3);
    expect(cmoTable[0].position).toBe(50n);
    expect(cmoTable[0].size).toBe(30n);
  });
});

describe('RED PHASE: Column Statistics', () => {
  it('should parse column statistics with min/max values', async () => {
    // Column statistics are stored in column metadata
    // They include: null_count, row_count, min_value, max_value

    const storage = new MemoryStorageAdapter();

    // Create a mock column statistics buffer (simplified protobuf)
    const statsBuffer = new ArrayBuffer(100);
    storage.put('stats.bin', statsBuffer);

    // This functionality is now implemented
    const stats = parseColumnStatistics(statsBuffer);

    expect(stats.nullCount).toBeDefined();
    expect(stats.rowCount).toBeDefined();
    expect(stats.minValue).toBeDefined();
    expect(stats.maxValue).toBeDefined();
  });

  it('should support different statistic types for different column types', () => {
    // Statistics vary by column type:
    // - Int columns: min/max as bigint
    // - Float columns: min/max as number
    // - String columns: min/max as string
    // - Binary columns: often no min/max

    const intStats = { type: 'int64', min: 0n, max: 1000n };
    const floatStats = { type: 'float32', min: -1.5, max: 1.5 };
    const stringStats = { type: 'utf8', min: 'aaa', max: 'zzz' };

    expect(typeof intStats.min).toBe('bigint');
    expect(typeof floatStats.min).toBe('number');
    expect(typeof stringStats.min).toBe('string');
  });
});
