/**
 * Tests for replacing unsafe `as unknown` casts with proper type guards
 *
 * Issue: evodb-u602 - TDD: Replace unsafe as unknown casts with type guards
 *
 * This test file follows TDD methodology:
 * 1. RED: Tests written for type guards that don't exist yet
 * 2. GREEN: Implement type guards to make tests pass
 * 3. REFACTOR: Improve implementation and use in production code
 */

import { describe, it, expect } from 'vitest';
import {
  isArray,
  isRecord,
  isNumber,
  isString,
  hasProperty,
  hasProperties,
} from '../guards.js';

// =============================================================================
// Type Guard for Manifest Validation
// =============================================================================

/**
 * Type guard to check if a value is a valid TableManifest structure.
 *
 * This replaces the unsafe pattern:
 *   const manifest = parsed as unknown as TableManifest;
 *
 * With a safe runtime check:
 *   if (isTableManifest(parsed)) {
 *     // parsed is now typed as TableManifest
 *   }
 */
function isTableManifest(value: unknown): value is {
  schemaVersion: number;
  formatVersion: 1;
  tableId: string;
  location: string;
  currentSchemaId: number;
  schemas: unknown[];
  partitionSpec: unknown;
  currentSnapshotId: string | null;
  snapshots: unknown[];
  stats: unknown;
  properties: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
} {
  if (!isRecord(value)) return false;

  // Check required number fields
  if (!isNumber(value.schemaVersion)) return false;
  if (value.formatVersion !== 1) return false;
  if (!isNumber(value.currentSchemaId)) return false;
  if (!isNumber(value.createdAt)) return false;
  if (!isNumber(value.updatedAt)) return false;

  // Check required string fields
  if (!isString(value.tableId)) return false;
  if (!isString(value.location)) return false;

  // Check array fields
  if (!isArray(value.schemas)) return false;
  if (!isArray(value.snapshots)) return false;

  // Check currentSnapshotId (string | null)
  if (value.currentSnapshotId !== null && !isString(value.currentSnapshotId)) return false;

  // Check nested objects
  if (!isRecord(value.partitionSpec)) return false;
  if (!isRecord(value.stats)) return false;
  if (!isRecord(value.properties)) return false;

  return true;
}

describe('Type Guards for Unsafe Cast Replacement', () => {
  describe('isTableManifest', () => {
    it('returns true for valid manifest structure', () => {
      const validManifest = {
        schemaVersion: 1,
        formatVersion: 1,
        tableId: 'test-uuid',
        location: 'com/example/table',
        currentSchemaId: 1,
        schemas: [{ schemaId: 1, path: '_schema/v1.json' }],
        partitionSpec: { specId: 0, fields: [] },
        currentSnapshotId: null,
        snapshots: [],
        stats: { totalRows: 0, totalFiles: 0, totalSizeBytes: 0, lastSnapshotTimestamp: null },
        properties: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      expect(isTableManifest(validManifest)).toBe(true);
    });

    it('returns true for manifest with active snapshot', () => {
      const manifestWithSnapshot = {
        schemaVersion: 1,
        formatVersion: 1,
        tableId: 'test-uuid',
        location: 'com/example/table',
        currentSchemaId: 1,
        schemas: [{ schemaId: 1, path: '_schema/v1.json' }],
        partitionSpec: { specId: 0, fields: [] },
        currentSnapshotId: 'snapshot-uuid',
        snapshots: [{ snapshotId: 'snapshot-uuid', timestamp: Date.now(), parentSnapshotId: null }],
        stats: { totalRows: 100, totalFiles: 5, totalSizeBytes: 1024, lastSnapshotTimestamp: Date.now() },
        properties: { 'custom.prop': 'value' },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      expect(isTableManifest(manifestWithSnapshot)).toBe(true);
    });

    it('returns false for null', () => {
      expect(isTableManifest(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isTableManifest(undefined)).toBe(false);
    });

    it('returns false for non-object', () => {
      expect(isTableManifest('string')).toBe(false);
      expect(isTableManifest(123)).toBe(false);
      expect(isTableManifest([])).toBe(false);
    });

    it('returns false when formatVersion is not 1', () => {
      const invalidFormat = {
        schemaVersion: 1,
        formatVersion: 2, // Invalid
        tableId: 'test-uuid',
        location: 'com/example/table',
        currentSchemaId: 1,
        schemas: [],
        partitionSpec: {},
        currentSnapshotId: null,
        snapshots: [],
        stats: {},
        properties: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      expect(isTableManifest(invalidFormat)).toBe(false);
    });

    it('returns false when required string fields are wrong type', () => {
      const invalidTableId = {
        schemaVersion: 1,
        formatVersion: 1,
        tableId: 123, // Should be string
        location: 'com/example/table',
        currentSchemaId: 1,
        schemas: [],
        partitionSpec: {},
        currentSnapshotId: null,
        snapshots: [],
        stats: {},
        properties: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      expect(isTableManifest(invalidTableId)).toBe(false);
    });

    it('returns false when schemas is not an array', () => {
      const invalidSchemas = {
        schemaVersion: 1,
        formatVersion: 1,
        tableId: 'test-uuid',
        location: 'com/example/table',
        currentSchemaId: 1,
        schemas: 'not-an-array', // Invalid
        partitionSpec: {},
        currentSnapshotId: null,
        snapshots: [],
        stats: {},
        properties: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      expect(isTableManifest(invalidSchemas)).toBe(false);
    });

    it('returns false when currentSnapshotId is wrong type (not string or null)', () => {
      const invalidSnapshotId = {
        schemaVersion: 1,
        formatVersion: 1,
        tableId: 'test-uuid',
        location: 'com/example/table',
        currentSchemaId: 1,
        schemas: [],
        partitionSpec: {},
        currentSnapshotId: 123, // Should be string | null
        snapshots: [],
        stats: {},
        properties: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      expect(isTableManifest(invalidSnapshotId)).toBe(false);
    });

    it('returns false when nested objects are not records', () => {
      const invalidStats = {
        schemaVersion: 1,
        formatVersion: 1,
        tableId: 'test-uuid',
        location: 'com/example/table',
        currentSchemaId: 1,
        schemas: [],
        partitionSpec: {},
        currentSnapshotId: null,
        snapshots: [],
        stats: [], // Should be object
        properties: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      expect(isTableManifest(invalidStats)).toBe(false);
    });
  });
});

// =============================================================================
// Type Guard for Filter Array Values
// =============================================================================

describe('isFilterValues - Array Type Guard for GraphQL Filter Values', () => {
  /**
   * Type guard to safely check if a value is an array for filter operations.
   *
   * This replaces patterns like:
   *   return { column, operator: 'in', values: value as unknown[] };
   *
   * With:
   *   if (isArray(value)) {
   *     return { column, operator: 'in', values: value };
   *   }
   */

  it('returns true for empty array', () => {
    expect(isArray([])).toBe(true);
  });

  it('returns true for array with values', () => {
    expect(isArray([1, 2, 3])).toBe(true);
    expect(isArray(['a', 'b', 'c'])).toBe(true);
    expect(isArray([null, 'mixed', 123])).toBe(true);
  });

  it('returns false for non-arrays', () => {
    expect(isArray(null)).toBe(false);
    expect(isArray(undefined)).toBe(false);
    expect(isArray({})).toBe(false);
    expect(isArray('string')).toBe(false);
    expect(isArray(123)).toBe(false);
  });

  it('demonstrates safe filter value handling', () => {
    function createInFilter(column: string, value: unknown) {
      if (!isArray(value)) {
        throw new Error(`Expected array for 'in' operator, got ${typeof value}`);
      }
      return { column, operator: 'in', values: value };
    }

    // Valid case
    expect(createInFilter('status', ['active', 'pending'])).toEqual({
      column: 'status',
      operator: 'in',
      values: ['active', 'pending'],
    });

    // Invalid case - should throw
    expect(() => createInFilter('status', 'not-an-array')).toThrow(
      "Expected array for 'in' operator"
    );
  });
});

// =============================================================================
// Type Guard for Range Filter $in Values
// =============================================================================

describe('isRangeFilterInValues - Full Text Search Filter', () => {
  /**
   * Type guard for validating range filter $in arrays.
   *
   * Replaces:
   *   if ('$in' in rangeFilter && !((rangeFilter.$in as unknown[]).includes(docValue)))
   *
   * With proper type checking first.
   */

  function isRangeFilterWithIn(filter: unknown): filter is { $in: unknown[] } {
    return (
      isRecord(filter) &&
      hasProperty(filter, '$in') &&
      isArray(filter.$in)
    );
  }

  it('returns true for filter with $in array', () => {
    expect(isRangeFilterWithIn({ $in: [1, 2, 3] })).toBe(true);
    expect(isRangeFilterWithIn({ $in: ['a', 'b'] })).toBe(true);
    expect(isRangeFilterWithIn({ $in: [] })).toBe(true);
  });

  it('returns false for filter without $in', () => {
    expect(isRangeFilterWithIn({})).toBe(false);
    expect(isRangeFilterWithIn({ $gt: 5 })).toBe(false);
  });

  it('returns false for filter with non-array $in', () => {
    expect(isRangeFilterWithIn({ $in: 'not-array' })).toBe(false);
    expect(isRangeFilterWithIn({ $in: 123 })).toBe(false);
    expect(isRangeFilterWithIn({ $in: null })).toBe(false);
  });

  it('returns false for non-objects', () => {
    expect(isRangeFilterWithIn(null)).toBe(false);
    expect(isRangeFilterWithIn(undefined)).toBe(false);
    expect(isRangeFilterWithIn('string')).toBe(false);
  });

  it('demonstrates safe range filter handling', () => {
    function matchesFilter(docValue: unknown, filter: unknown): boolean {
      if (!isRecord(filter)) return true;

      // Handle $in operator
      if (hasProperty(filter, '$in')) {
        if (!isArray(filter.$in)) {
          throw new Error('$in value must be an array');
        }
        return filter.$in.includes(docValue);
      }

      // Handle $gt operator
      if (hasProperty(filter, '$gt') && isNumber(filter.$gt)) {
        if (!isNumber(docValue)) return false;
        return docValue > filter.$gt;
      }

      return true;
    }

    // $in filter tests
    expect(matchesFilter(2, { $in: [1, 2, 3] })).toBe(true);
    expect(matchesFilter(5, { $in: [1, 2, 3] })).toBe(false);

    // $gt filter tests
    expect(matchesFilter(10, { $gt: 5 })).toBe(true);
    expect(matchesFilter(3, { $gt: 5 })).toBe(false);

    // Invalid $in should throw
    expect(() => matchesFilter(1, { $in: 'not-array' })).toThrow('$in value must be an array');
  });
});

// =============================================================================
// Type Guard for Internal Metric Structures
// =============================================================================

describe('isInternalMetric - Observability Internal Structure', () => {
  /**
   * Type guard for internal metric structures.
   *
   * Replaces:
   *   const internalMetric = metric as unknown as InternalMetric;
   *   if (internalMetric._values) { ... }
   *
   * With a proper type guard that checks the internal structure exists.
   */

  interface InternalMetricLike {
    _values?: Map<string, number>;
  }

  function isInternalMetric(value: unknown): value is InternalMetricLike {
    if (!isRecord(value)) return false;
    // _values is optional, but if present must be a Map
    if (value._values !== undefined && !(value._values instanceof Map)) {
      return false;
    }
    return true;
  }

  it('returns true for object without _values (valid internal metric)', () => {
    expect(isInternalMetric({})).toBe(true);
    expect(isInternalMetric({ get: () => 0 })).toBe(true);
  });

  it('returns true for object with _values Map', () => {
    const metricWithValues = {
      _values: new Map([['label1', 42]]),
    };
    expect(isInternalMetric(metricWithValues)).toBe(true);
  });

  it('returns false when _values is not a Map', () => {
    expect(isInternalMetric({ _values: {} })).toBe(false);
    expect(isInternalMetric({ _values: [] })).toBe(false);
    expect(isInternalMetric({ _values: 'string' })).toBe(false);
  });

  it('returns false for non-objects', () => {
    expect(isInternalMetric(null)).toBe(false);
    expect(isInternalMetric(undefined)).toBe(false);
    expect(isInternalMetric('string')).toBe(false);
  });

  it('demonstrates safe internal metric access', () => {
    function getAllMetricValues(metric: unknown): Map<string, number> {
      if (isInternalMetric(metric) && metric._values) {
        return metric._values;
      }
      return new Map();
    }

    const metricWithValues = { _values: new Map([['key', 100]]) };
    const metricWithout = { get: () => 50 };

    expect(getAllMetricValues(metricWithValues).get('key')).toBe(100);
    expect(getAllMetricValues(metricWithout).size).toBe(0);
  });
});

// =============================================================================
// Type Guard for Internal Histogram Structures
// =============================================================================

describe('isInternalHistogram - Histogram Internal Structure', () => {
  interface InternalHistogramData {
    count: number;
    sum: number;
    buckets: number[];
  }

  interface InternalHistogramLike {
    _data?: Map<string, InternalHistogramData>;
  }

  function isHistogramData(value: unknown): value is InternalHistogramData {
    return (
      isRecord(value) &&
      isNumber(value.count) &&
      isNumber(value.sum) &&
      isArray(value.buckets)
    );
  }

  function isInternalHistogram(value: unknown): value is InternalHistogramLike {
    if (!isRecord(value)) return false;
    // _data is optional, but if present must be a Map
    if (value._data !== undefined && !(value._data instanceof Map)) {
      return false;
    }
    return true;
  }

  it('returns true for object without _data', () => {
    expect(isInternalHistogram({})).toBe(true);
    expect(isInternalHistogram({ buckets: [0.1, 0.5, 1.0] })).toBe(true);
  });

  it('returns true for object with _data Map', () => {
    const histogram = {
      _data: new Map([['label', { count: 10, sum: 50, buckets: [1, 2, 3] }]]),
    };
    expect(isInternalHistogram(histogram)).toBe(true);
  });

  it('returns false when _data is not a Map', () => {
    expect(isInternalHistogram({ _data: {} })).toBe(false);
    expect(isInternalHistogram({ _data: [] })).toBe(false);
  });

  it('validates histogram data structure', () => {
    expect(isHistogramData({ count: 10, sum: 50, buckets: [1, 2, 3] })).toBe(true);
    expect(isHistogramData({ count: '10', sum: 50, buckets: [] })).toBe(false);
    expect(isHistogramData({ count: 10, sum: 50 })).toBe(false);
    expect(isHistogramData(null)).toBe(false);
  });
});

// =============================================================================
// Demonstrating Safe Deserialization Pattern
// =============================================================================

describe('Safe Manifest Deserialization Pattern', () => {
  /**
   * Demonstrates the safe pattern for deserializing manifests.
   *
   * BEFORE (unsafe):
   * ```typescript
   * const manifest = parsed as unknown as TableManifest;
   * ```
   *
   * AFTER (safe):
   * ```typescript
   * if (!isTableManifest(parsed)) {
   *   throw new ManifestError('Invalid manifest structure');
   * }
   * // parsed is now safely typed as TableManifest
   * ```
   */

  function safeDeserializeManifest(json: string): unknown {
    const parsed = JSON.parse(json) as Record<string, unknown>;

    if (!isTableManifest(parsed)) {
      throw new Error('Invalid manifest structure');
    }

    return parsed;
  }

  it('deserializes valid manifest JSON', () => {
    const validJson = JSON.stringify({
      schemaVersion: 1,
      formatVersion: 1,
      tableId: 'test-id',
      location: 'test/location',
      currentSchemaId: 1,
      schemas: [],
      partitionSpec: {},
      currentSnapshotId: null,
      snapshots: [],
      stats: {},
      properties: {},
      createdAt: 1000,
      updatedAt: 2000,
    });

    const result = safeDeserializeManifest(validJson);
    expect(result).toBeDefined();
  });

  it('throws for invalid manifest JSON', () => {
    const invalidJson = JSON.stringify({
      formatVersion: 2, // Invalid
      tableId: 'test-id',
    });

    expect(() => safeDeserializeManifest(invalidJson)).toThrow('Invalid manifest structure');
  });

  it('throws for non-object JSON', () => {
    expect(() => safeDeserializeManifest('"just a string"')).toThrow('Invalid manifest structure');
    expect(() => safeDeserializeManifest('[1, 2, 3]')).toThrow('Invalid manifest structure');
  });
});

// =============================================================================
// Combined Type Guards Module Export Test
// =============================================================================

describe('Type Guards Integration', () => {
  it('demonstrates combining multiple type guards', () => {
    /**
     * This test shows how to combine existing type guards to create
     * domain-specific validators.
     */

    // Snapshot reference validator
    function isSnapshotRef(value: unknown): value is {
      snapshotId: string;
      timestamp: number;
      parentSnapshotId: string | null;
    } {
      return (
        hasProperties(value, ['snapshotId', 'timestamp', 'parentSnapshotId']) &&
        isString(value.snapshotId) &&
        isNumber(value.timestamp) &&
        (value.parentSnapshotId === null || isString(value.parentSnapshotId))
      );
    }

    // Valid snapshot refs
    expect(isSnapshotRef({
      snapshotId: 'snap-1',
      timestamp: Date.now(),
      parentSnapshotId: null,
    })).toBe(true);

    expect(isSnapshotRef({
      snapshotId: 'snap-2',
      timestamp: Date.now(),
      parentSnapshotId: 'snap-1',
    })).toBe(true);

    // Invalid snapshot refs
    expect(isSnapshotRef({ snapshotId: 123 })).toBe(false);
    expect(isSnapshotRef(null)).toBe(false);
    expect(isSnapshotRef({
      snapshotId: 'snap-1',
      timestamp: 'not-a-number',
      parentSnapshotId: null,
    })).toBe(false);
  });
});
