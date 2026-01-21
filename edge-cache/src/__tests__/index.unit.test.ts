/**
 * Tests for index.ts (types, constants, and utility functions)
 */

import { describe, it, expect } from 'vitest';
import {
  MAX_FILE_SIZE,
  DEFAULT_TTL,
  DEFAULT_CDN_BASE_URL,
  DEFAULT_CONFIG,
  getCacheHeaders,
  parseCacheTag,
  isWithinSizeLimit,
  getRequiredMode,
  formatBytes,
} from '../index.js';

describe('Constants', () => {
  describe('MAX_FILE_SIZE', () => {
    it('should define standard mode as 500MB', () => {
      expect(MAX_FILE_SIZE.standard).toBe(500 * 1024 * 1024);
    });

    it('should define enterprise mode as 5GB', () => {
      expect(MAX_FILE_SIZE.enterprise).toBe(5 * 1024 * 1024 * 1024);
    });
  });

  describe('DEFAULT_TTL', () => {
    it('should be 24 hours in seconds', () => {
      expect(DEFAULT_TTL).toBe(86400);
    });
  });

  describe('DEFAULT_CDN_BASE_URL', () => {
    it('should be cdn.workers.do', () => {
      expect(DEFAULT_CDN_BASE_URL).toBe('https://cdn.workers.do');
    });
  });

  describe('DEFAULT_CONFIG', () => {
    it('should have expected defaults', () => {
      expect(DEFAULT_CONFIG.cdnBaseUrl).toBe('https://cdn.workers.do');
      expect(DEFAULT_CONFIG.defaultMode).toBe('standard');
      expect(DEFAULT_CONFIG.defaultTtl).toBe(86400);
      expect(DEFAULT_CONFIG.maxConcurrentPrefetch).toBe(5);
      expect(DEFAULT_CONFIG.enableBackgroundPrefetch).toBe(true);
      expect(DEFAULT_CONFIG.hotnessThreshold).toBe(0.7);
    });
  });
});

describe('getCacheHeaders', () => {
  it('should return correct cache headers with default TTL', () => {
    const headers = getCacheHeaders('users', 'year=2024');

    expect(headers['Cache-Control']).toBe('public, max-age=86400');
    expect(headers['CF-Cache-Tag']).toBe('evodb:users:year=2024');
  });

  it('should respect custom TTL', () => {
    const headers = getCacheHeaders('orders', 'month=01', 3600);

    expect(headers['Cache-Control']).toBe('public, max-age=3600');
    expect(headers['CF-Cache-Tag']).toBe('evodb:orders:month=01');
  });

  it('should handle complex partition names', () => {
    const headers = getCacheHeaders('events', 'year=2024/month=12/day=25');

    expect(headers['CF-Cache-Tag']).toBe('evodb:events:year=2024/month=12/day=25');
  });
});

describe('parseCacheTag', () => {
  it('should parse a valid cache tag', () => {
    const result = parseCacheTag('evodb:users:year=2024');

    expect(result).toEqual({
      namespace: 'evodb',
      table: 'users',
      partition: 'year=2024',
    });
  });

  it('should return null for invalid cache tag (wrong prefix)', () => {
    const result = parseCacheTag('other:users:year=2024');

    expect(result).toBeNull();
  });

  it('should return null for invalid cache tag (wrong format)', () => {
    const result = parseCacheTag('evodb:users');

    expect(result).toBeNull();
  });

  it('should return null for empty string', () => {
    const result = parseCacheTag('');

    expect(result).toBeNull();
  });
});

describe('isWithinSizeLimit', () => {
  it('should return true for small files in standard mode', () => {
    expect(isWithinSizeLimit(100 * 1024 * 1024, 'standard')).toBe(true); // 100MB
  });

  it('should return true for files at standard mode limit', () => {
    expect(isWithinSizeLimit(500 * 1024 * 1024, 'standard')).toBe(true); // 500MB
  });

  it('should return false for files exceeding standard mode limit', () => {
    expect(isWithinSizeLimit(501 * 1024 * 1024, 'standard')).toBe(false); // 501MB
  });

  it('should return true for large files in enterprise mode', () => {
    expect(isWithinSizeLimit(2 * 1024 * 1024 * 1024, 'enterprise')).toBe(true); // 2GB
  });

  it('should return true for files at enterprise mode limit', () => {
    expect(isWithinSizeLimit(5 * 1024 * 1024 * 1024, 'enterprise')).toBe(true); // 5GB
  });

  it('should return false for files exceeding enterprise mode limit', () => {
    expect(isWithinSizeLimit(6 * 1024 * 1024 * 1024, 'enterprise')).toBe(false); // 6GB
  });
});

describe('getRequiredMode', () => {
  it('should return standard for small files', () => {
    expect(getRequiredMode(100 * 1024 * 1024)).toBe('standard'); // 100MB
  });

  it('should return standard for files at standard limit', () => {
    expect(getRequiredMode(500 * 1024 * 1024)).toBe('standard'); // 500MB
  });

  it('should return enterprise for files above standard limit', () => {
    expect(getRequiredMode(501 * 1024 * 1024)).toBe('enterprise'); // 501MB
  });

  it('should return enterprise for files at enterprise limit', () => {
    expect(getRequiredMode(5 * 1024 * 1024 * 1024)).toBe('enterprise'); // 5GB
  });

  it('should return null for files exceeding enterprise limit', () => {
    expect(getRequiredMode(6 * 1024 * 1024 * 1024)).toBeNull(); // 6GB
  });
});

describe('formatBytes', () => {
  it('should format bytes', () => {
    expect(formatBytes(500)).toBe('500 B');
  });

  it('should format kilobytes', () => {
    expect(formatBytes(1024)).toBe('1.00 KB');
    expect(formatBytes(2048)).toBe('2.00 KB');
  });

  it('should format megabytes', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.00 MB');
    expect(formatBytes(500 * 1024 * 1024)).toBe('500.00 MB');
  });

  it('should format gigabytes', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.00 GB');
    expect(formatBytes(5 * 1024 * 1024 * 1024)).toBe('5.00 GB');
  });

  it('should format terabytes', () => {
    expect(formatBytes(1024 * 1024 * 1024 * 1024)).toBe('1.00 TB');
  });

  it('should handle zero', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('should handle fractional values', () => {
    expect(formatBytes(1536)).toBe('1.50 KB');
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.50 MB');
  });
});
