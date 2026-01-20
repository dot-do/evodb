/**
 * @evodb/core - Partition Modes Tests
 *
 * Tests for the three partition modes:
 * - do-sqlite: 2MB max, optimized for DO SQLite blobs
 * - standard: 500MB max, standard edge cache
 * - enterprise: 5GB max, enterprise edge cache
 */

import { describe, it, expect } from 'vitest';
import {
  // Types
  type PartitionMode,
  type AccountTier,
  type PartitionModeConfig,

  // Constants
  DO_SQLITE_MAX_BYTES,
  STANDARD_MAX_BYTES,
  ENTERPRISE_MAX_BYTES,
  DO_SQLITE_BLOCK_SIZE,
  STANDARD_BLOCK_SIZE,
  ENTERPRISE_BLOCK_SIZE,
  PARTITION_MODE_CONFIGS,

  // Config getters
  getPartitionModeConfig,

  // Core functions
  calculatePartitions,
  getPartitionPath,
  getAllPartitionPaths,
  parsePartitionPath,
  selectPartitionMode,

  // Utilities
  formatBytes,
  fitsInSinglePartition,
  getRecommendedBlockSize,
  validateModeForDataSize,
  calculatePartitionBoundaries,
  estimateDataSize,
  getModeByMaxSize,
} from '../partition-modes.js';

// =============================================================================
// Constants Tests
// =============================================================================

describe('Partition Mode Constants', () => {
  describe('Size Limits', () => {
    it('should define DO-SQLite max as 2MB', () => {
      expect(DO_SQLITE_MAX_BYTES).toBe(2 * 1024 * 1024);
    });

    it('should define standard max as 500MB', () => {
      expect(STANDARD_MAX_BYTES).toBe(500 * 1024 * 1024);
    });

    it('should define enterprise max as 5GB', () => {
      expect(ENTERPRISE_MAX_BYTES).toBe(5 * 1024 * 1024 * 1024);
    });
  });

  describe('Block Sizes', () => {
    it('should define DO-SQLite block size as 256KB', () => {
      expect(DO_SQLITE_BLOCK_SIZE).toBe(256 * 1024);
    });

    it('should define standard block size as 4MB', () => {
      expect(STANDARD_BLOCK_SIZE).toBe(4 * 1024 * 1024);
    });

    it('should define enterprise block size as 16MB', () => {
      expect(ENTERPRISE_BLOCK_SIZE).toBe(16 * 1024 * 1024);
    });
  });

  describe('Mode Configurations', () => {
    it('should have configurations for all three modes', () => {
      expect(PARTITION_MODE_CONFIGS['do-sqlite']).toBeDefined();
      expect(PARTITION_MODE_CONFIGS['standard']).toBeDefined();
      expect(PARTITION_MODE_CONFIGS['enterprise']).toBeDefined();
    });

    it('should have correct mode identifiers', () => {
      expect(PARTITION_MODE_CONFIGS['do-sqlite'].mode).toBe('do-sqlite');
      expect(PARTITION_MODE_CONFIGS['standard'].mode).toBe('standard');
      expect(PARTITION_MODE_CONFIGS['enterprise'].mode).toBe('enterprise');
    });

    it('should mark DO-SQLite as using DO storage', () => {
      const config = PARTITION_MODE_CONFIGS['do-sqlite'];
      expect(config.usesDOSqlite).toBe(true);
      expect(config.usesR2).toBe(false);
    });

    it('should mark standard and enterprise as using R2', () => {
      expect(PARTITION_MODE_CONFIGS['standard'].usesR2).toBe(true);
      expect(PARTITION_MODE_CONFIGS['standard'].usesDOSqlite).toBe(false);
      expect(PARTITION_MODE_CONFIGS['enterprise'].usesR2).toBe(true);
      expect(PARTITION_MODE_CONFIGS['enterprise'].usesDOSqlite).toBe(false);
    });
  });
});

// =============================================================================
// Configuration Getter Tests
// =============================================================================

describe('getPartitionModeConfig', () => {
  it('should return DO-SQLite config', () => {
    const config = getPartitionModeConfig('do-sqlite');
    expect(config.mode).toBe('do-sqlite');
    expect(config.maxPartitionSizeBytes).toBe(DO_SQLITE_MAX_BYTES);
  });

  it('should return standard config', () => {
    const config = getPartitionModeConfig('standard');
    expect(config.mode).toBe('standard');
    expect(config.maxPartitionSizeBytes).toBe(STANDARD_MAX_BYTES);
  });

  it('should return enterprise config', () => {
    const config = getPartitionModeConfig('enterprise');
    expect(config.mode).toBe('enterprise');
    expect(config.maxPartitionSizeBytes).toBe(ENTERPRISE_MAX_BYTES);
  });
});

// =============================================================================
// Partition Calculation Tests
// =============================================================================

describe('calculatePartitions', () => {
  describe('DO-SQLite Mode', () => {
    it('should calculate single partition for data under 2MB', () => {
      const result = calculatePartitions(1024 * 1024, 'do-sqlite'); // 1MB
      expect(result.partitionCount).toBe(1);
      expect(result.isSinglePartition).toBe(true);
      expect(result.mode).toBe('do-sqlite');
    });

    it('should calculate multiple partitions for data over 2MB', () => {
      const result = calculatePartitions(5 * 1024 * 1024, 'do-sqlite'); // 5MB
      expect(result.partitionCount).toBe(3); // ceil(5/2) = 3
      expect(result.isSinglePartition).toBe(false);
    });

    it('should handle exact 2MB boundary', () => {
      const result = calculatePartitions(DO_SQLITE_MAX_BYTES, 'do-sqlite');
      expect(result.partitionCount).toBe(1);
      expect(result.isSinglePartition).toBe(true);
    });

    it('should handle 2MB + 1 byte', () => {
      const result = calculatePartitions(DO_SQLITE_MAX_BYTES + 1, 'do-sqlite');
      expect(result.partitionCount).toBe(2);
      expect(result.isSinglePartition).toBe(false);
    });
  });

  describe('Standard Mode', () => {
    it('should calculate single partition for data under 500MB', () => {
      const result = calculatePartitions(100 * 1024 * 1024, 'standard'); // 100MB
      expect(result.partitionCount).toBe(1);
      expect(result.isSinglePartition).toBe(true);
    });

    it('should calculate multiple partitions for 1GB', () => {
      const result = calculatePartitions(1024 * 1024 * 1024, 'standard'); // 1GB = 1024MB
      expect(result.partitionCount).toBe(3); // ceil(1024/500) = 3
    });

    it('should calculate partitions for 2.5GB', () => {
      const result = calculatePartitions(2.5 * 1024 * 1024 * 1024, 'standard');
      expect(result.partitionCount).toBe(6); // ceil(2560/500) = 6
    });
  });

  describe('Enterprise Mode', () => {
    it('should calculate single partition for data under 5GB', () => {
      const result = calculatePartitions(2 * 1024 * 1024 * 1024, 'enterprise'); // 2GB
      expect(result.partitionCount).toBe(1);
      expect(result.isSinglePartition).toBe(true);
    });

    it('should calculate multiple partitions for 10GB', () => {
      const result = calculatePartitions(10 * 1024 * 1024 * 1024, 'enterprise'); // 10GB
      expect(result.partitionCount).toBe(2); // ceil(10/5) = 2
    });

    it('should handle very large data (50GB)', () => {
      const result = calculatePartitions(50 * 1024 * 1024 * 1024, 'enterprise'); // 50GB
      expect(result.partitionCount).toBe(10); // ceil(50/5) = 10
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero data size', () => {
      const result = calculatePartitions(0, 'standard');
      expect(result.partitionCount).toBe(1);
      expect(result.partitionSizeBytes).toBe(0);
      expect(result.isSinglePartition).toBe(true);
    });

    it('should handle negative data size', () => {
      const result = calculatePartitions(-100, 'standard');
      expect(result.partitionCount).toBe(1);
      expect(result.isSinglePartition).toBe(true);
    });

    it('should include row count estimate when provided', () => {
      const result = calculatePartitions(100 * 1024 * 1024, 'standard', 50000);
      expect(result.rowsPerPartition).toBe(50000);
    });

    it('should use target rows when count not provided', () => {
      const result = calculatePartitions(100 * 1024 * 1024, 'standard');
      expect(result.rowsPerPartition).toBe(PARTITION_MODE_CONFIGS['standard'].targetRowsPerPartition);
    });
  });
});

// =============================================================================
// Partition Path Tests
// =============================================================================

describe('getPartitionPath', () => {
  describe('DO-SQLite Mode Paths', () => {
    it('should generate blob path for DO-SQLite mode', () => {
      const result = getPartitionPath('com/example/api/users', 0, 'do-sqlite');
      expect(result.path).toBe('com/example/api/users/blobs/part-00000.bin');
      expect(result.mode).toBe('do-sqlite');
    });

    it('should zero-pad partition IDs', () => {
      const result = getPartitionPath('tables/test', 42, 'do-sqlite');
      expect(result.path).toBe('tables/test/blobs/part-00042.bin');
      expect(result.partitionId).toBe(42);
    });
  });

  describe('Standard/Enterprise Mode Paths', () => {
    it('should generate data path for standard mode', () => {
      const result = getPartitionPath('com/example/api/users', 0, 'standard');
      expect(result.path).toBe('com/example/api/users/data/part-00000.bin');
    });

    it('should generate data path for enterprise mode', () => {
      const result = getPartitionPath('com/example/api/users', 5, 'enterprise');
      expect(result.path).toBe('com/example/api/users/data/part-00005.bin');
    });
  });

  describe('Custom Extensions', () => {
    it('should support custom file extension', () => {
      const result = getPartitionPath('tables/test', 0, 'standard', 'parquet');
      expect(result.path).toBe('tables/test/data/part-00000.parquet');
      expect(result.extension).toBe('parquet');
    });
  });

  describe('Path Normalization', () => {
    it('should normalize trailing slashes', () => {
      const result = getPartitionPath('tables/test/', 0, 'standard');
      expect(result.path).toBe('tables/test/data/part-00000.bin');
      expect(result.tableLocation).toBe('tables/test');
    });

    it('should handle multiple trailing slashes', () => {
      const result = getPartitionPath('tables/test///', 0, 'standard');
      expect(result.tableLocation).toBe('tables/test');
    });
  });
});

describe('getAllPartitionPaths', () => {
  it('should generate paths for all partitions', () => {
    const paths = getAllPartitionPaths('tables/test', 3, 'standard');
    expect(paths).toHaveLength(3);
    expect(paths[0].path).toBe('tables/test/data/part-00000.bin');
    expect(paths[1].path).toBe('tables/test/data/part-00001.bin');
    expect(paths[2].path).toBe('tables/test/data/part-00002.bin');
  });

  it('should return empty array for zero partitions', () => {
    const paths = getAllPartitionPaths('tables/test', 0, 'standard');
    expect(paths).toHaveLength(0);
  });
});

describe('parsePartitionPath', () => {
  it('should parse standard mode path', () => {
    const result = parsePartitionPath('com/example/api/users/data/part-00005.bin');
    expect(result).not.toBeNull();
    expect(result!.tableLocation).toBe('com/example/api/users');
    expect(result!.partitionId).toBe(5);
    expect(result!.extension).toBe('bin');
    expect(result!.mode).toBe('standard');
  });

  it('should parse DO-SQLite mode path', () => {
    const result = parsePartitionPath('tables/test/blobs/part-00042.bin');
    expect(result).not.toBeNull();
    expect(result!.mode).toBe('do-sqlite');
    expect(result!.partitionId).toBe(42);
  });

  it('should parse custom extension', () => {
    const result = parsePartitionPath('tables/test/data/part-00000.parquet');
    expect(result).not.toBeNull();
    expect(result!.extension).toBe('parquet');
  });

  it('should return null for invalid paths', () => {
    expect(parsePartitionPath('invalid/path')).toBeNull();
    expect(parsePartitionPath('tables/test/part-00000.bin')).toBeNull();
    expect(parsePartitionPath('')).toBeNull();
  });
});

// =============================================================================
// Mode Selection Tests
// =============================================================================

describe('selectPartitionMode', () => {
  describe('Small Data (under 10MB)', () => {
    it('should select DO-SQLite for very small data', () => {
      const result = selectPartitionMode(1024 * 1024); // 1MB
      expect(result.mode).toBe('do-sqlite');
      expect(result.reason).toContain('single DO-SQLite partition');
    });

    it('should select DO-SQLite when preferDOSqlite is true', () => {
      const result = selectPartitionMode(5 * 1024 * 1024, 'pro', { preferDOSqlite: true });
      expect(result.mode).toBe('do-sqlite');
    });

    it('should select DO-SQLite for realtime query pattern', () => {
      const result = selectPartitionMode(5 * 1024 * 1024, 'pro', { queryPattern: 'realtime' });
      expect(result.mode).toBe('do-sqlite');
    });
  });

  describe('Medium Data (10MB - 10GB)', () => {
    it('should select standard for 100MB', () => {
      const result = selectPartitionMode(100 * 1024 * 1024, 'pro');
      expect(result.mode).toBe('standard');
      expect(result.reason).toContain('standard mode efficiently');
    });

    it('should select standard for 1GB', () => {
      const result = selectPartitionMode(1024 * 1024 * 1024, 'pro');
      expect(result.mode).toBe('standard');
    });

    it('should suggest enterprise as alternative when available', () => {
      const result = selectPartitionMode(1024 * 1024 * 1024, 'enterprise');
      expect(result.mode).toBe('standard');
      expect(result.alternatives.some(a => a.mode === 'enterprise')).toBe(true);
    });
  });

  describe('Large Data (over 10GB)', () => {
    it('should select enterprise for large data when available', () => {
      const result = selectPartitionMode(20 * 1024 * 1024 * 1024, 'enterprise'); // 20GB
      expect(result.mode).toBe('enterprise');
      expect(result.reason).toContain('enterprise cache limits');
    });

    it('should fall back to standard when enterprise not available', () => {
      const result = selectPartitionMode(20 * 1024 * 1024 * 1024, 'pro'); // 20GB
      expect(result.mode).toBe('standard');
      expect(result.reason).toContain('multiple standard partitions');
      expect(result.alternatives.some(a => a.mode === 'enterprise')).toBe(true);
    });
  });

  describe('Forced Mode', () => {
    it('should use forced mode regardless of data size', () => {
      const result = selectPartitionMode(10 * 1024 * 1024 * 1024, 'pro', {
        forceMode: 'do-sqlite',
      });
      expect(result.mode).toBe('do-sqlite');
      expect(result.reason).toContain('Forced mode');
    });
  });

  describe('Account Tiers', () => {
    it('should work with free tier', () => {
      const result = selectPartitionMode(100 * 1024 * 1024, 'free');
      expect(result.mode).toBe('standard');
    });

    it('should work with business tier', () => {
      const result = selectPartitionMode(100 * 1024 * 1024, 'business');
      expect(result.mode).toBe('standard');
    });
  });
});

// =============================================================================
// Utility Function Tests
// =============================================================================

describe('formatBytes', () => {
  it('should format bytes', () => {
    expect(formatBytes(0)).toBe('0 Bytes');
    expect(formatBytes(512)).toBe('512 Bytes');
  });

  it('should format kilobytes', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(2048)).toBe('2 KB');
  });

  it('should format megabytes', () => {
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
    expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5 MB');
  });

  it('should format gigabytes', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
    expect(formatBytes(5 * 1024 * 1024 * 1024)).toBe('5 GB');
  });

  it('should format terabytes', () => {
    expect(formatBytes(1024 * 1024 * 1024 * 1024)).toBe('1 TB');
  });
});

describe('fitsInSinglePartition', () => {
  it('should return true for data under mode limit', () => {
    expect(fitsInSinglePartition(1024 * 1024, 'do-sqlite')).toBe(true); // 1MB < 2MB
    expect(fitsInSinglePartition(100 * 1024 * 1024, 'standard')).toBe(true); // 100MB < 500MB
    expect(fitsInSinglePartition(2 * 1024 * 1024 * 1024, 'enterprise')).toBe(true); // 2GB < 5GB
  });

  it('should return false for data over mode limit', () => {
    expect(fitsInSinglePartition(3 * 1024 * 1024, 'do-sqlite')).toBe(false); // 3MB > 2MB
    expect(fitsInSinglePartition(600 * 1024 * 1024, 'standard')).toBe(false); // 600MB > 500MB
    expect(fitsInSinglePartition(6 * 1024 * 1024 * 1024, 'enterprise')).toBe(false); // 6GB > 5GB
  });

  it('should return true for exact boundary', () => {
    expect(fitsInSinglePartition(DO_SQLITE_MAX_BYTES, 'do-sqlite')).toBe(true);
    expect(fitsInSinglePartition(STANDARD_MAX_BYTES, 'standard')).toBe(true);
    expect(fitsInSinglePartition(ENTERPRISE_MAX_BYTES, 'enterprise')).toBe(true);
  });
});

describe('getRecommendedBlockSize', () => {
  it('should return correct block sizes', () => {
    expect(getRecommendedBlockSize('do-sqlite')).toBe(DO_SQLITE_BLOCK_SIZE);
    expect(getRecommendedBlockSize('standard')).toBe(STANDARD_BLOCK_SIZE);
    expect(getRecommendedBlockSize('enterprise')).toBe(ENTERPRISE_BLOCK_SIZE);
  });
});

describe('validateModeForDataSize', () => {
  it('should validate without warnings for efficient sizes', () => {
    const result = validateModeForDataSize(1024 * 1024, 'do-sqlite'); // 1MB
    expect(result.valid).toBe(true);
    expect(result.warning).toBeUndefined();
  });

  it('should warn when size exceeds efficient range', () => {
    const result = validateModeForDataSize(20 * 1024 * 1024, 'do-sqlite'); // 20MB
    expect(result.valid).toBe(true);
    expect(result.warning).toContain('exceeds efficient range');
  });

  it('should warn when size is below efficient range', () => {
    const result = validateModeForDataSize(100 * 1024, 'standard'); // 100KB
    expect(result.valid).toBe(true);
    expect(result.warning).toContain('below efficient range');
  });
});

describe('calculatePartitionBoundaries', () => {
  it('should return single boundary for single partition', () => {
    const boundaries = calculatePartitionBoundaries(1000, 1024 * 1024, 'standard'); // 1MB = 1 partition
    expect(boundaries).toEqual([1000]);
  });

  it('should distribute rows evenly', () => {
    const boundaries = calculatePartitionBoundaries(1000, 3 * DO_SQLITE_MAX_BYTES, 'do-sqlite');
    // 3 * 2MB = 6MB -> ceil(6/2) = 3 partitions for do-sqlite
    expect(boundaries.length).toBe(3);
    expect(boundaries.reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it('should handle remainder distribution', () => {
    const boundaries = calculatePartitionBoundaries(1001, 3 * DO_SQLITE_MAX_BYTES, 'do-sqlite');
    // 3 partitions: total should be 1001
    expect(boundaries.reduce((a, b) => a + b, 0)).toBe(1001);
    // First partition should have the extra row
    expect(boundaries[0]).toBeGreaterThanOrEqual(boundaries[boundaries.length - 1]);
  });
});

describe('estimateDataSize', () => {
  it('should calculate data size from row count and avg size', () => {
    expect(estimateDataSize(1000, 100)).toBe(100000);
    expect(estimateDataSize(1000000, 50)).toBe(50000000);
  });

  it('should handle zero rows', () => {
    expect(estimateDataSize(0, 100)).toBe(0);
  });
});

describe('getModeByMaxSize', () => {
  it('should return do-sqlite for sizes up to 2MB', () => {
    expect(getModeByMaxSize(1024 * 1024)).toBe('do-sqlite');
    expect(getModeByMaxSize(DO_SQLITE_MAX_BYTES)).toBe('do-sqlite');
  });

  it('should return standard for sizes up to 500MB', () => {
    expect(getModeByMaxSize(100 * 1024 * 1024)).toBe('standard');
    expect(getModeByMaxSize(STANDARD_MAX_BYTES)).toBe('standard');
  });

  it('should return enterprise for sizes up to 5GB', () => {
    expect(getModeByMaxSize(1024 * 1024 * 1024)).toBe('enterprise');
    expect(getModeByMaxSize(ENTERPRISE_MAX_BYTES)).toBe('enterprise');
  });

  it('should return null for sizes over 5GB', () => {
    expect(getModeByMaxSize(10 * 1024 * 1024 * 1024)).toBeNull();
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Integration: Full Workflow', () => {
  it('should handle complete partition workflow for small table', () => {
    const dataSize = 1024 * 1024; // 1MB
    const rowCount = 10000;

    // 1. Select mode
    const selection = selectPartitionMode(dataSize, 'pro');
    expect(selection.mode).toBe('do-sqlite');

    // 2. Calculate partitions
    const calc = calculatePartitions(dataSize, selection.mode, rowCount);
    expect(calc.partitionCount).toBe(1);
    expect(calc.rowsPerPartition).toBe(rowCount);

    // 3. Generate paths
    const paths = getAllPartitionPaths('my/table', calc.partitionCount, selection.mode);
    expect(paths.length).toBe(1);
    expect(paths[0].path).toContain('blobs');

    // 4. Parse path back
    const parsed = parsePartitionPath(paths[0].path);
    expect(parsed).not.toBeNull();
    expect(parsed!.mode).toBe('do-sqlite');
  });

  it('should handle complete partition workflow for large table', () => {
    const dataSize = 2 * 1024 * 1024 * 1024; // 2GB
    const rowCount = 50000000;

    // 1. Select mode
    const selection = selectPartitionMode(dataSize, 'pro');
    expect(selection.mode).toBe('standard');

    // 2. Calculate partitions
    const calc = calculatePartitions(dataSize, selection.mode, rowCount);
    // 2GB = 2048MB, ceil(2048/500) = 5 partitions
    expect(calc.partitionCount).toBe(5);
    expect(calc.isSinglePartition).toBe(false);

    // 3. Generate paths
    const paths = getAllPartitionPaths('analytics/events', calc.partitionCount, selection.mode);
    expect(paths.length).toBe(5);
    paths.forEach((p, i) => {
      expect(p.partitionId).toBe(i);
      expect(p.path).toContain('data');
    });

    // 4. Calculate boundaries
    const boundaries = calculatePartitionBoundaries(rowCount, dataSize, selection.mode);
    expect(boundaries.length).toBe(5);
    expect(boundaries.reduce((a, b) => a + b, 0)).toBe(rowCount);
  });

  it('should handle enterprise mode for very large table', () => {
    const dataSize = 15 * 1024 * 1024 * 1024; // 15GB
    const rowCount = 500000000;

    // 1. Select mode with enterprise tier
    const selection = selectPartitionMode(dataSize, 'enterprise');
    expect(selection.mode).toBe('enterprise');

    // 2. Calculate partitions
    const calc = calculatePartitions(dataSize, selection.mode, rowCount);
    expect(calc.partitionCount).toBe(3); // ceil(15/5) = 3

    // 3. Validate mode
    const validation = validateModeForDataSize(dataSize, selection.mode);
    expect(validation.valid).toBe(true);

    // 4. Get recommended block size
    const blockSize = getRecommendedBlockSize(selection.mode);
    expect(blockSize).toBe(ENTERPRISE_BLOCK_SIZE);
  });
});

// =============================================================================
// Trade-off Documentation Tests
// =============================================================================

describe('Trade-offs: DO-SQLite Mode', () => {
  it('has lowest latency for small datasets', () => {
    const config = getPartitionModeConfig('do-sqlite');
    expect(config.cacheTtlHintSeconds).toBe(0); // No external cache needed
    expect(config.usesDOSqlite).toBe(true);
  });

  it('is limited to 2MB per partition', () => {
    const config = getPartitionModeConfig('do-sqlite');
    expect(config.maxPartitionSizeBytes).toBe(2 * 1024 * 1024);
  });

  it('is optimized for up to 10MB total data', () => {
    const config = getPartitionModeConfig('do-sqlite');
    expect(config.maxEfficientDataSizeBytes).toBe(10 * 1024 * 1024);
  });
});

describe('Trade-offs: Standard Mode', () => {
  it('provides good balance for medium workloads', () => {
    const config = getPartitionModeConfig('standard');
    expect(config.maxPartitionSizeBytes).toBe(500 * 1024 * 1024);
    expect(config.targetRowsPerPartition).toBe(1_000_000);
  });

  it('requires R2 for storage', () => {
    const config = getPartitionModeConfig('standard');
    expect(config.usesR2).toBe(true);
  });

  it('has reasonable cache TTL', () => {
    const config = getPartitionModeConfig('standard');
    expect(config.cacheTtlHintSeconds).toBe(3600); // 1 hour
  });
});

describe('Trade-offs: Enterprise Mode', () => {
  it('provides maximum cache efficiency', () => {
    const config = getPartitionModeConfig('enterprise');
    expect(config.maxPartitionSizeBytes).toBe(5 * 1024 * 1024 * 1024);
    expect(config.targetRowsPerPartition).toBe(10_000_000);
  });

  it('has longer cache TTL for stability', () => {
    const config = getPartitionModeConfig('enterprise');
    expect(config.cacheTtlHintSeconds).toBe(86400); // 24 hours
  });

  it('is efficient for data over 100MB', () => {
    const config = getPartitionModeConfig('enterprise');
    expect(config.minEfficientDataSizeBytes).toBe(100 * 1024 * 1024);
  });
});
