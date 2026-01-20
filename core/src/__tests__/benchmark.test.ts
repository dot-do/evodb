/**
 * @evodb/core - Performance Benchmarks
 *
 * Measures performance of key operations:
 * 1. Shredding 10K documents
 * 2. Encoding/decoding performance
 * 3. Query performance (path extraction)
 * 4. Memory usage
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  shred,
  unshred,
  encode,
  decode,
  extractPath,
  extractPaths,
  buildPathIndex,
  writeBlock,
  readBlock,
  Type,
} from '../index.js';

// Generate test data
function generateDocs(count: number): unknown[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    name: `User ${i % 1000}`, // Low cardinality for dict encoding
    email: `user${i}@example.com`,
    age: 20 + (i % 60),
    active: i % 2 === 0,
    score: Math.random() * 100,
    timestamp: Date.now() + i * 1000, // Sequential for delta encoding
    nested: {
      level1: {
        level2: {
          value: i * 2,
        },
      },
    },
    tags: [`tag${i % 10}`, `category${i % 5}`],
  }));
}

function formatTime(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(2)}us`;
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

describe('Performance Benchmarks', () => {
  describe('Shredding Performance', () => {
    it('should shred 10K documents in under 500ms', () => {
      const docs = generateDocs(10000);

      const start = performance.now();
      const columns = shred(docs);
      const elapsed = performance.now() - start;

      console.log(`Shred 10K docs: ${formatTime(elapsed)}`);
      console.log(`  Columns: ${columns.length}`);
      console.log(`  Rows: ${columns[0]?.values.length ?? 0}`);

      expect(elapsed).toBeLessThan(500);
      expect(columns.length).toBeGreaterThan(0);
    });

    it('should shred 100K documents in under 3s', () => {
      const docs = generateDocs(100000);

      const start = performance.now();
      const columns = shred(docs);
      const elapsed = performance.now() - start;

      console.log(`Shred 100K docs: ${formatTime(elapsed)}`);
      console.log(`  Throughput: ${Math.round(100000 / (elapsed / 1000))} docs/s`);

      expect(elapsed).toBeLessThan(3000);
    });

    it('should measure unshred performance', () => {
      const docs = generateDocs(10000);
      const columns = shred(docs);

      const start = performance.now();
      const reconstructed = unshred(columns);
      const elapsed = performance.now() - start;

      console.log(`Unshred 10K docs: ${formatTime(elapsed)}`);

      expect(elapsed).toBeLessThan(500);
      expect(reconstructed.length).toBe(10000);
    });
  });

  describe('Encoding Performance', () => {
    let columns: ReturnType<typeof shred>;

    beforeAll(() => {
      columns = shred(generateDocs(10000));
    });

    it('should encode 10K rows in under 200ms', () => {
      const start = performance.now();
      const encoded = encode(columns);
      const elapsed = performance.now() - start;

      const totalSize = encoded.reduce((sum, col) => sum + col.data.length + col.nullBitmap.length, 0);

      console.log(`Encode 10K rows: ${formatTime(elapsed)}`);
      console.log(`  Columns encoded: ${encoded.length}`);
      console.log(`  Total size: ${formatBytes(totalSize)}`);

      // Check encoding types used
      const encodingCounts = { Plain: 0, RLE: 0, Dict: 0, Delta: 0 };
      for (const col of encoded) {
        const enc = ['Plain', 'RLE', 'Dict', 'Delta'][col.encoding] as keyof typeof encodingCounts;
        encodingCounts[enc]++;
      }
      console.log(`  Encodings: ${JSON.stringify(encodingCounts)}`);

      expect(elapsed).toBeLessThan(200);
    });

    it('should decode 10K rows in under 200ms', () => {
      const encoded = encode(columns);

      const start = performance.now();
      const decoded = encoded.map(col => decode(col, 10000));
      const elapsed = performance.now() - start;

      console.log(`Decode 10K rows: ${formatTime(elapsed)}`);

      expect(elapsed).toBeLessThan(200);
      expect(decoded.length).toBe(columns.length);
    });

    it('should measure compression ratio', () => {
      // Calculate original JSON size
      const docs = generateDocs(10000);
      const jsonSize = JSON.stringify(docs).length;

      // Calculate columnar encoded size
      const columns = shred(docs);
      const encoded = encode(columns);
      const columnarSize = encoded.reduce((sum, col) => sum + col.data.length + col.nullBitmap.length, 0);

      const ratio = jsonSize / columnarSize;

      console.log(`Compression Ratio:`);
      console.log(`  JSON size: ${formatBytes(jsonSize)}`);
      console.log(`  Columnar size: ${formatBytes(columnarSize)}`);
      console.log(`  Ratio: ${ratio.toFixed(2)}x`);

      // Columnar should be smaller than JSON
      expect(columnarSize).toBeLessThan(jsonSize);
    });
  });

  describe('Query Performance', () => {
    let columns: ReturnType<typeof shred>;

    beforeAll(() => {
      columns = shred(generateDocs(10000));
    });

    it('should extract single path in under 10ms', () => {
      const start = performance.now();
      const values = extractPath(columns, 'name');
      const elapsed = performance.now() - start;

      console.log(`Extract single path (10K rows): ${formatTime(elapsed)}`);

      expect(elapsed).toBeLessThan(10);
      expect(values.length).toBe(10000);
    });

    it('should extract multiple paths in under 20ms', () => {
      const paths = ['id', 'name', 'email', 'age', 'active', 'score'];

      const start = performance.now();
      const result = extractPaths(columns, paths);
      const elapsed = performance.now() - start;

      console.log(`Extract ${paths.length} paths (10K rows): ${formatTime(elapsed)}`);

      expect(elapsed).toBeLessThan(20);
      expect(Object.keys(result).length).toBe(paths.length);
    });

    it('should build path index for O(1) lookup', () => {
      const start = performance.now();
      const index = buildPathIndex(columns);
      const buildTime = performance.now() - start;

      // Measure lookup time
      const lookupStart = performance.now();
      for (let i = 0; i < 10000; i++) {
        index.get('name');
        index.get('nested.level1.level2.value');
        index.get('tags[0]');
      }
      const lookupTime = performance.now() - lookupStart;

      console.log(`Path Index Performance:`);
      console.log(`  Build time: ${formatTime(buildTime)}`);
      console.log(`  30K lookups: ${formatTime(lookupTime)}`);
      console.log(`  Avg lookup: ${formatTime(lookupTime / 30000)}`);

      expect(buildTime).toBeLessThan(10);
      expect(lookupTime).toBeLessThan(50);
    });
  });

  describe('Block Format Performance', () => {
    it('should write and read blocks efficiently', () => {
      const docs = generateDocs(10000);
      const columns = shred(docs);
      const encoded = encode(columns);

      // Write
      const writeStart = performance.now();
      const block = writeBlock(encoded, { rowCount: 10000 });
      const writeTime = performance.now() - writeStart;

      // Read
      const readStart = performance.now();
      const { header, columns: readCols } = readBlock(block);
      const readTime = performance.now() - readStart;

      console.log(`Block I/O (10K rows):`);
      console.log(`  Write: ${formatTime(writeTime)}`);
      console.log(`  Read: ${formatTime(readTime)}`);
      console.log(`  Block size: ${formatBytes(block.length)}`);
      console.log(`  Rows: ${header.rowCount}`);

      expect(writeTime).toBeLessThan(100);
      expect(readTime).toBeLessThan(100);
      expect(header.rowCount).toBe(10000);
    });
  });

  describe('Memory Usage', () => {
    it('should track approximate memory for 10K documents', () => {
      // Get baseline memory (if available)
      const getMemory = () => {
        if (typeof process !== 'undefined' && process.memoryUsage) {
          return process.memoryUsage().heapUsed;
        }
        return 0;
      };

      const baselineMemory = getMemory();
      const docs = generateDocs(10000);
      const afterDocs = getMemory();

      const columns = shred(docs);
      const afterShred = getMemory();

      const encoded = encode(columns);
      const afterEncode = getMemory();

      const totalEncoded = encoded.reduce((sum, col) => sum + col.data.length + col.nullBitmap.length, 0);

      console.log(`Memory Usage (approximate):`);
      console.log(`  Source docs: ${formatBytes(afterDocs - baselineMemory)}`);
      console.log(`  After shred: ${formatBytes(afterShred - baselineMemory)}`);
      console.log(`  Encoded data: ${formatBytes(totalEncoded)}`);

      // Encoded size should be reasonable
      expect(totalEncoded).toBeLessThan(5 * 1024 * 1024); // < 5MB for 10K docs
    });
  });

  describe('Encoding-Specific Benchmarks', () => {
    it('should measure dictionary encoding efficiency', () => {
      // Create data with low cardinality
      const docs = Array.from({ length: 10000 }, (_, i) => ({
        status: ['active', 'pending', 'completed', 'cancelled'][i % 4],
        priority: ['low', 'medium', 'high'][i % 3],
      }));

      const columns = shred(docs);
      const encoded = encode(columns);

      const statusCol = encoded.find(c => c.path === 'status')!;
      const priorityCol = encoded.find(c => c.path === 'priority')!;

      // Both should use dictionary encoding
      expect(statusCol.encoding).toBe(2); // Dict
      expect(priorityCol.encoding).toBe(2); // Dict

      console.log(`Dictionary Encoding:`);
      console.log(`  status column: ${formatBytes(statusCol.data.length)}`);
      console.log(`  priority column: ${formatBytes(priorityCol.data.length)}`);
    });

    it('should measure delta encoding efficiency for sequential data', () => {
      // Create sorted sequential data
      const docs = Array.from({ length: 10000 }, (_, i) => ({
        timestamp: 1700000000000 + i * 1000, // 1 second increments
        sequence: i,
      }));

      const columns = shred(docs);
      const encoded = encode(columns);

      const tsCol = encoded.find(c => c.path === 'timestamp')!;
      const seqCol = encoded.find(c => c.path === 'sequence')!;

      console.log(`Delta Encoding:`);
      console.log(`  timestamp: encoding=${['Plain', 'RLE', 'Dict', 'Delta'][tsCol.encoding]}, size=${formatBytes(tsCol.data.length)}`);
      console.log(`  sequence: encoding=${['Plain', 'RLE', 'Dict', 'Delta'][seqCol.encoding]}, size=${formatBytes(seqCol.data.length)}`);

      // Sequential integers should use delta encoding
      expect(seqCol.encoding).toBe(3); // Delta
    });

    it('should measure RLE encoding efficiency for repeated values', () => {
      // Create data with many repeated values
      const docs = Array.from({ length: 10000 }, (_, i) => ({
        // Repeat same value for 100 rows at a time
        region: `region_${Math.floor(i / 100)}`,
        batch: Math.floor(i / 500),
      }));

      const columns = shred(docs);
      const encoded = encode(columns);

      const batchCol = encoded.find(c => c.path === 'batch')!;

      console.log(`RLE Encoding:`);
      console.log(`  batch column: encoding=${['Plain', 'RLE', 'Dict', 'Delta'][batchCol.encoding]}, size=${formatBytes(batchCol.data.length)}`);
    });
  });
});
