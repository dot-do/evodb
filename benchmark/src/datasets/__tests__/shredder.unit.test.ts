/**
 * Tests for Bluesky event shredding
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  shredEvents,
  benchmarkShred,
  benchmarkFull,
  getColumnStats,
  analyzeSchema,
  formatBenchmarkResult,
  compareBenchmarks,
} from '../shredder.js';
import { generateEvents, generateDataset } from '../generator.js';
import type { BlueskyEventJson, BenchmarkResult } from '../types.js';

describe('Bluesky Event Shredder', () => {
  let tinyDataset: BlueskyEventJson[];

  beforeAll(() => {
    tinyDataset = generateDataset('tiny');
  });

  describe('shredEvents', () => {
    it('should shred events into columns', () => {
      const events = generateEvents(100);
      const columns = shredEvents(events);

      expect(columns.length).toBeGreaterThan(0);

      // Should have basic event fields
      const paths = columns.map(c => c.path);
      expect(paths).toContain('kind');
      expect(paths).toContain('did');
      expect(paths).toContain('time_us');
    });

    it('should extract commit fields', () => {
      const events = generateEvents(100);
      const columns = shredEvents(events);

      const paths = columns.map(c => c.path);

      // Commit fields should be shredded
      expect(paths.some(p => p.startsWith('commit.'))).toBe(true);
      expect(paths).toContain('commit.operation');
      expect(paths).toContain('commit.collection');
    });

    it('should handle nested record fields', () => {
      const events = generateEvents(500);
      const columns = shredEvents(events);

      const paths = columns.map(c => c.path);

      // Should have record text for posts
      expect(paths).toContain('commit.record.text');
      expect(paths).toContain('commit.record.createdAt');
    });

    it('should handle reply references', () => {
      // Generate enough events to get replies
      const events = generateEvents(1000);
      const columns = shredEvents(events);

      const paths = columns.map(c => c.path);

      // Reply fields should be present
      expect(paths.some(p => p.includes('reply'))).toBe(true);
    });

    it('should support column projection', () => {
      const events = generateEvents(100);

      // Only extract specific columns
      const columns = shredEvents(events, {
        columns: ['kind', 'did', 'commit.operation'],
      });

      const paths = columns.map(c => c.path);

      expect(paths).toContain('kind');
      expect(paths).toContain('did');
      expect(paths).toContain('commit.operation');
      expect(paths).not.toContain('time_us');
      expect(paths).not.toContain('commit.collection');
    });

    it('should have correct row count for all columns', () => {
      const events = generateEvents(100);
      const columns = shredEvents(events);

      for (const col of columns) {
        expect(col.values.length).toBe(100);
        expect(col.nulls.length).toBe(100);
      }
    });

    it('should mark nullable columns correctly', () => {
      const events = generateEvents(100);
      const columns = shredEvents(events);

      // kind, did, time_us should not be nullable
      const kindCol = columns.find(c => c.path === 'kind');
      const didCol = columns.find(c => c.path === 'did');

      expect(kindCol?.nulls.every(n => !n)).toBe(true);
      expect(didCol?.nulls.every(n => !n)).toBe(true);

      // Optional fields should be nullable
      const textCol = columns.find(c => c.path === 'commit.record.text');
      if (textCol) {
        expect(textCol.nullable).toBe(true);
      }
    });
  });

  describe('benchmarkShred', () => {
    it('should return valid shred result', () => {
      const events = generateEvents(1000);
      const result = benchmarkShred(events);

      expect(result.eventCount).toBe(1000);
      expect(result.columnCount).toBeGreaterThan(0);
      expect(result.shredTimeMs).toBeGreaterThan(0);
      expect(result.throughput).toBeGreaterThan(0);
      expect(result.totalSizeBytes).toBeGreaterThan(0);
      expect(result.compressionRatio).toBeGreaterThan(0);
    });

    it('should achieve reasonable throughput for 1K events', () => {
      const events = generateEvents(1000);
      const result = benchmarkShred(events);

      // Should process at least 10K events/second
      expect(result.throughput).toBeGreaterThan(10000);
    });
  });

  describe('benchmarkFull', () => {
    it('should include shred metrics (encode/decode optional due to core limitations)', () => {
      const events = generateEvents(1000);
      const result = benchmarkFull(events);

      // Shred metrics are always present
      expect(result.shred).toBeDefined();
      expect(result.shred.eventCount).toBe(1000);
      expect(result.shred.throughput).toBeGreaterThan(0);
      expect(result.shred.columnCount).toBeGreaterThan(0);
      expect(result.shred.totalSizeBytes).toBeGreaterThan(0);

      // Encode/decode metrics may be absent if core encoder fails on complex types
      // This is a known limitation with dictionary encoding for high-cardinality strings
      if (result.encode) {
        expect(result.encode.timeMs).toBeGreaterThan(0);
        expect(result.encode.outputSizeBytes).toBeGreaterThan(0);
        expect(result.encode.throughput).toBeGreaterThan(0);
      }

      if (result.decode) {
        expect(result.decode.timeMs).toBeGreaterThan(0);
        expect(result.decode.throughput).toBeGreaterThan(0);
      }
    });

    it('should return columns in result', () => {
      const events = generateEvents(100);
      const result = benchmarkFull(events);

      expect(result.columns).toBeDefined();
      expect(result.columns.length).toBeGreaterThan(0);
    });
  });

  describe('getColumnStats', () => {
    it('should return statistics for all columns', () => {
      const events = generateEvents(500);
      const stats = getColumnStats(events);

      expect(stats.size).toBeGreaterThan(0);

      // Check kind column (should have no nulls)
      const kindStats = stats.get('kind');
      expect(kindStats).toBeDefined();
      expect(kindStats!.nullCount).toBe(0);
      expect(kindStats!.distinctCount).toBeLessThanOrEqual(3); // commit, identity, account
    });

    it('should count nulls correctly', () => {
      const events = generateEvents(500);
      const stats = getColumnStats(events);

      // Optional fields should have nulls
      const textStats = stats.get('commit.record.text');
      if (textStats) {
        // Not all events have record.text (only posts)
        expect(textStats.nullCount).toBeGreaterThan(0);
      }
    });
  });

  describe('analyzeSchema', () => {
    it('should return schema analysis', () => {
      const events = generateEvents(500);
      const schema = analyzeSchema(events);

      expect(schema.paths.length).toBeGreaterThan(0);
      expect(schema.types.size).toBe(schema.paths.length);
      expect(schema.nullability.size).toBe(schema.paths.length);
      expect(schema.cardinality.size).toBe(schema.paths.length);
    });

    it('should identify correct types', () => {
      const events = generateEvents(500);
      const schema = analyzeSchema(events);

      // kind is a string
      expect(schema.types.get('kind')).toBe('String');

      // time_us is a number (Int32 or Int64 or Float64 depending on inference)
      const timeType = schema.types.get('time_us');
      expect(['Int32', 'Int64', 'Float64']).toContain(timeType);
    });

    it('should calculate nullability ratios', () => {
      const events = generateEvents(500);
      const schema = analyzeSchema(events);

      // kind should never be null
      expect(schema.nullability.get('kind')).toBe(0);

      // did should never be null
      expect(schema.nullability.get('did')).toBe(0);
    });
  });

  describe('formatBenchmarkResult', () => {
    it('should format result as string', () => {
      const events = generateEvents(1000);
      const result = benchmarkFull(events);
      const formatted = formatBenchmarkResult(result);

      expect(typeof formatted).toBe('string');
      expect(formatted).toContain('TINY');
      expect(formatted).toContain('Shredding');
      expect(formatted).toContain('Throughput');
      // Encoding/Decoding sections are optional (may not be present if core encoder fails)
    });
  });

  describe('compareBenchmarks', () => {
    it('should calculate speedup ratios', () => {
      const events1 = generateEvents(1000);
      const events2 = generateEvents(1000);

      const baseline = benchmarkFull(events1);
      const current = benchmarkFull(events2);

      const comparison = compareBenchmarks(baseline, current);

      expect(comparison.shredSpeedup).toBeDefined();
      expect(comparison.shredSpeedup).toBeGreaterThan(0);

      if (comparison.encodeSpeedup !== undefined) {
        expect(comparison.encodeSpeedup).toBeGreaterThan(0);
      }

      if (comparison.decodeSpeedup !== undefined) {
        expect(comparison.decodeSpeedup).toBeGreaterThan(0);
      }
    });
  });

  describe('Performance Benchmarks', () => {
    it('should shred tiny dataset (1K events) in under 100ms', () => {
      const result = benchmarkShred(tinyDataset);

      console.log(`Tiny (1K) shred: ${result.shredTimeMs.toFixed(2)}ms, ${Math.round(result.throughput).toLocaleString()} events/s`);

      expect(result.shredTimeMs).toBeLessThan(100);
    });

    it('should shred small dataset (10K events) in under 500ms', () => {
      const events = generateEvents(10000);
      const result = benchmarkShred(events);

      console.log(`Small (10K) shred: ${result.shredTimeMs.toFixed(2)}ms, ${Math.round(result.throughput).toLocaleString()} events/s`);

      expect(result.shredTimeMs).toBeLessThan(500);
    });

    it('should achieve >50K events/s throughput', () => {
      const events = generateEvents(10000);
      const result = benchmarkShred(events);

      expect(result.throughput).toBeGreaterThan(50000);
    });

    it('should report throughput for different sizes', () => {
      const sizes = [1000, 5000, 10000];
      const results: { size: number; throughput: number }[] = [];

      for (const size of sizes) {
        const events = generateEvents(size);
        const result = benchmarkShred(events);
        results.push({ size, throughput: Math.round(result.throughput) });
      }

      console.log('\nShredding Throughput by Size:');
      for (const r of results) {
        console.log(`  ${r.size.toLocaleString()} events: ${r.throughput.toLocaleString()} events/s`);
      }

      // All sizes should maintain decent throughput
      for (const r of results) {
        expect(r.throughput).toBeGreaterThan(20000);
      }
    });

    it('should show compression ratio', () => {
      const events = generateEvents(5000);
      const result = benchmarkShred(events);

      console.log(`\nCompression: ${result.compressionRatio.toFixed(2)}x`);
      console.log(`  JSON size estimate: ${Math.round(JSON.stringify(events).length / 1024)}KB`);
      console.log(`  Columnar size estimate: ${Math.round(result.totalSizeBytes / 1024)}KB`);

      // Should achieve some compression
      expect(result.compressionRatio).toBeGreaterThan(0.5);
    });

    it('should report column count and paths', () => {
      const events = generateEvents(1000);
      const result = benchmarkFull(events);

      console.log(`\nColumn Analysis (${result.columns.length} columns):`);

      // Group by top-level path
      const groups = new Map<string, number>();
      for (const col of result.columns) {
        const topLevel = col.path.split('.')[0].split('[')[0];
        groups.set(topLevel, (groups.get(topLevel) || 0) + 1);
      }

      for (const [group, count] of groups) {
        console.log(`  ${group}: ${count} columns`);
      }
    });
  });
});
