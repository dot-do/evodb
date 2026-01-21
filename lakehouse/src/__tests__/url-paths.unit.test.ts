/**
 * @evodb/lakehouse - URL-based R2 Paths Tests
 *
 * Tests for URL parsing and R2 path conversion utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  parseUrl,
  urlToR2Path,
  r2PathToUrl,
  buildPartitionPath,
  parsePartitionPath,
  manifestPath,
  dataDir,
  snapshotsDir,
  type PartitionValue,
} from '../index.js';

describe('URL-based R2 Paths', () => {
  describe('parseUrl', () => {
    it('should parse full URL to R2 path', () => {
      const result = parseUrl('https://api.example.com/users');

      expect(result.hostname).toBe('api.example.com');
      expect(result.path).toBe('users');
      expect(result.r2Path).toBe('com/example/api/users');
    });

    it('should parse URL without path', () => {
      const result = parseUrl('https://api.example.com');

      expect(result.hostname).toBe('api.example.com');
      expect(result.path).toBe('');
      expect(result.r2Path).toBe('com/example/api');
    });

    it('should parse hostname only', () => {
      const result = parseUrl('api.example.com');

      expect(result.hostname).toBe('api.example.com');
      expect(result.r2Path).toBe('com/example/api');
    });

    it('should parse hostname with path (no protocol)', () => {
      const result = parseUrl('api.example.com/v1/data');

      expect(result.hostname).toBe('api.example.com');
      expect(result.path).toBe('v1/data');
      expect(result.r2Path).toBe('com/example/api/v1/data');
    });

    it('should handle deep paths', () => {
      const result = parseUrl('https://api.example.com/v1/users/profile');

      expect(result.r2Path).toBe('com/example/api/v1/users/profile');
    });

    it('should handle subdomains', () => {
      const result = parseUrl('https://staging.api.example.com/data');

      expect(result.r2Path).toBe('com/example/api/staging/data');
    });
  });

  describe('urlToR2Path', () => {
    it('should reverse hostname segments', () => {
      expect(urlToR2Path('api.example.com')).toBe('com/example/api');
      expect(urlToR2Path('www.example.com')).toBe('com/example/www');
      expect(urlToR2Path('example.com')).toBe('com/example');
    });

    it('should append path segments', () => {
      expect(urlToR2Path('api.example.com', 'users')).toBe('com/example/api/users');
      expect(urlToR2Path('api.example.com', 'v1/data')).toBe('com/example/api/v1/data');
    });

    it('should handle empty path', () => {
      expect(urlToR2Path('api.example.com', '')).toBe('com/example/api');
    });

    it('should normalize case', () => {
      expect(urlToR2Path('API.Example.COM', 'Users')).toBe('com/example/api/Users');
    });
  });

  describe('r2PathToUrl', () => {
    it('should reverse R2 path back to hostname', () => {
      const result = r2PathToUrl('com/example/api');

      expect(result.hostname).toBe('api.example.com');
      expect(result.path).toBe('');
    });

    it('should extract path with pathDepth', () => {
      const result = r2PathToUrl('com/example/api/users', 1);

      expect(result.hostname).toBe('api.example.com');
      expect(result.path).toBe('users');
    });

    it('should handle deeper path extraction', () => {
      const result = r2PathToUrl('com/example/api/v1/users/data', 3);

      expect(result.hostname).toBe('api.example.com');
      expect(result.path).toBe('v1/users/data');
    });
  });

  describe('buildPartitionPath', () => {
    it('should build Hive-style partition path', () => {
      const partitions: PartitionValue[] = [
        { name: 'year', value: 2026 },
        { name: 'month', value: 1 },
        { name: 'day', value: 19 },
      ];

      expect(buildPartitionPath(partitions)).toBe('year=2026/month=1/day=19');
    });

    it('should handle null values', () => {
      const partitions: PartitionValue[] = [
        { name: 'region', value: null },
      ];

      expect(buildPartitionPath(partitions)).toBe('region=__null__');
    });

    it('should handle string values', () => {
      const partitions: PartitionValue[] = [
        { name: 'country', value: 'USA' },
        { name: 'state', value: 'CA' },
      ];

      expect(buildPartitionPath(partitions)).toBe('country=USA/state=CA');
    });

    it('should handle empty partitions', () => {
      expect(buildPartitionPath([])).toBe('');
    });
  });

  describe('parsePartitionPath', () => {
    it('should parse Hive-style partition path', () => {
      const partitions = parsePartitionPath('year=2026/month=1/day=19');

      expect(partitions).toHaveLength(3);
      expect(partitions[0]).toEqual({ name: 'year', value: 2026 });
      expect(partitions[1]).toEqual({ name: 'month', value: 1 });
      expect(partitions[2]).toEqual({ name: 'day', value: 19 });
    });

    it('should parse null values', () => {
      const partitions = parsePartitionPath('region=__null__');

      expect(partitions[0]).toEqual({ name: 'region', value: null });
    });

    it('should handle string values', () => {
      const partitions = parsePartitionPath('country=USA');

      expect(partitions[0]).toEqual({ name: 'country', value: 'USA' });
    });

    it('should handle empty path', () => {
      expect(parsePartitionPath('')).toEqual([]);
    });
  });

  describe('manifestPath / dataDir / snapshotsDir', () => {
    it('should build correct manifest path', () => {
      expect(manifestPath('com/example/api/users')).toBe('com/example/api/users/_manifest.json');
    });

    it('should build correct data directory path', () => {
      expect(dataDir('com/example/api/users')).toBe('com/example/api/users/data');
    });

    it('should build correct snapshots directory path', () => {
      expect(snapshotsDir('com/example/api/users')).toBe('com/example/api/users/snapshots');
    });
  });
});
