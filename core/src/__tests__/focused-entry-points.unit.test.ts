/**
 * @evodb/core - Focused Entry Points Tests
 *
 * TDD Issue: evodb-9s8
 * Tests that focused submodule entry points are properly configured
 * for tree-shaking optimization.
 *
 * Problem: Root index.ts uses 'export *' from 18 modules.
 * Users get 460KB when they may only need 8KB.
 *
 * Solution: Focused entry points allow users to import only what they need:
 *   import { encode } from '@evodb/core/encoding';  // ~8KB
 *   // Instead of
 *   import { encode } from '@evodb/core';           // 460KB
 *
 * Note: Some tests that verify package.json and file existence are skipped
 * in the Cloudflare Workers environment since readFileSync is not available.
 * Those tests run in the Node.js CI environment.
 */

import { describe, it, expect } from 'vitest';

describe('Focused Entry Points (evodb-9s8)', () => {
  describe('focused exports verification', () => {
    /**
     * These tests verify that submodule entry points export focused subsets.
     * We test by dynamically importing and checking for expected exports.
     */

    it('types entry point exports Type enum and branded types', async () => {
      const types = await import('../../types/index.js');

      // Core enums
      expect(types.Type).toBeDefined();
      expect(types.Encoding).toBeDefined();
      expect(types.WalOp).toBeDefined();

      // Constants
      expect(types.MAGIC).toBeDefined();
      expect(types.VERSION).toBeDefined();

      // Branded type constructors (BlockId, TableId only - evodb-cn6)
      expect(types.blockId).toBeDefined();
      expect(types.tableId).toBeDefined();

      // Type guards for branded types (BlockId, TableId only - evodb-cn6)
      expect(types.isValidBlockId).toBeDefined();
      expect(types.isValidTableId).toBeDefined();

      // Type conversion utilities
      expect(types.typeEnumToString).toBeDefined();
      expect(types.stringToTypeEnum).toBeDefined();

      // Should NOT export unrelated items (like encode, shred)
      expect((types as unknown as Record<string, unknown>)['encode']).toBeUndefined();
      expect((types as unknown as Record<string, unknown>)['shred']).toBeUndefined();
      expect((types as unknown as Record<string, unknown>)['createDOAdapter']).toBeUndefined();
    });

    it('encoding entry point exports encode/decode operations', async () => {
      const encoding = await import('../../encoding/index.js');

      // Core encoding functions
      expect(encoding.encode).toBeDefined();
      expect(encoding.decode).toBeDefined();
      expect(encoding.encodeDict).toBeDefined();
      expect(encoding.encodeDelta).toBeDefined();

      // Fast decode paths
      expect(encoding.fastDecodeInt32).toBeDefined();
      expect(encoding.fastDecodeFloat64).toBeDefined();
      expect(encoding.batchDecode).toBeDefined();

      // Sparse null bitmap (Issue evodb-qp6)
      expect(encoding.SparseNullSet).toBeDefined();
      expect(encoding.unpackBitsSparse).toBeDefined();
      expect(encoding.isAllNull).toBeDefined();
      expect(encoding.hasNoNulls).toBeDefined();

      // Decode validation (Issue evodb-imj)
      expect(encoding.validateDecodeCount).toBeDefined();
      expect(encoding.validateBufferCapacity).toBeDefined();

      // Runtime type validation (Issue evodb-4v3)
      expect(encoding.validateColumn).toBeDefined();
      expect(encoding.isValueTypeValid).toBeDefined();

      // String interning
      expect(encoding.LRUStringPool).toBeDefined();
      expect(encoding.internString).toBeDefined();

      // Should NOT export shredding or storage items
      expect((encoding as unknown as Record<string, unknown>)['shred']).toBeUndefined();
      expect((encoding as unknown as Record<string, unknown>)['createDOAdapter']).toBeUndefined();
      expect((encoding as unknown as Record<string, unknown>)['Type']).toBeUndefined();
    });

    it('shredding entry point exports shred/unshred operations', async () => {
      const shredding = await import('../../shredding/index.js');

      // Core functions
      expect(shredding.shred).toBeDefined();
      expect(shredding.unshred).toBeDefined();
      expect(shredding.extractPath).toBeDefined();
      expect(shredding.extractPaths).toBeDefined();
      expect(shredding.coerceToType).toBeDefined();
      expect(shredding.appendRows).toBeDefined();
      expect(shredding.buildPathIndex).toBeDefined();

      // Should NOT export encoding or storage items
      expect((shredding as unknown as Record<string, unknown>)['encode']).toBeUndefined();
      expect((shredding as unknown as Record<string, unknown>)['createDOAdapter']).toBeUndefined();
      expect((shredding as unknown as Record<string, unknown>)['Type']).toBeUndefined();
    });

    it('query entry point exports filter/sort/aggregate operations', async () => {
      const query = await import('../../query/index.js');

      // Filter operations
      expect(query.evaluateFilter).toBeDefined();
      expect(query.evaluateFilters).toBeDefined();
      expect(query.createFilterEvaluator).toBeDefined();
      expect(query.compileFilters).toBeDefined();
      expect(query.evaluateCompiledFilters).toBeDefined();

      // Sort operations
      expect(query.sortRows).toBeDefined();
      expect(query.limitRows).toBeDefined();
      expect(query.compareForSort).toBeDefined();

      // Aggregation operations
      expect(query.computeAggregate).toBeDefined();
      expect(query.computeAggregations).toBeDefined();
      expect(query.createAggregationEngine).toBeDefined();

      // Query engine selector
      expect(query.selectQueryEngine).toBeDefined();
      expect(query.needsQueryEngine).toBeDefined();
      expect(query.EngineType).toBeDefined();

      // Utilities
      expect(query.getNestedValue).toBeDefined();
      expect(query.setNestedValue).toBeDefined();
      expect(query.queryOps).toBeDefined();

      // Should NOT export unrelated items
      expect((query as unknown as Record<string, unknown>)['encode']).toBeUndefined();
      expect((query as unknown as Record<string, unknown>)['shred']).toBeUndefined();
      expect((query as unknown as Record<string, unknown>)['Type']).toBeUndefined();
    });

    it('storage entry point exports storage adapters', async () => {
      const storage = await import('../../storage/index.js');

      // StorageProvider interface (unified, recommended)
      expect(storage.R2StorageProvider).toBeDefined();
      expect(storage.InMemoryStorageProvider).toBeDefined();
      expect(storage.createStorageProvider).toBeDefined();
      expect(storage.createInMemoryProvider).toBeDefined();
      expect(storage.StorageProviderError).toBeDefined();
      expect(storage.NotFoundError).toBeDefined();

      // Adapter functions
      expect(storage.providerToStorage).toBeDefined();
      expect(storage.storageToProvider).toBeDefined();

      // DO adapters
      expect(storage.createDOAdapter).toBeDefined();
      expect(storage.createDOKVAdapter).toBeDefined();
      expect(storage.createMemoryAdapter).toBeDefined();

      // ID utilities
      expect(storage.makeBlockId).toBeDefined();
      expect(storage.parseBlockId).toBeDefined();
      expect(storage.makeWalId).toBeDefined();
      expect(storage.parseWalId).toBeDefined();

      // Circuit breaker (Issue evodb-9t6)
      expect(storage.CircuitBreaker).toBeDefined();
      expect(storage.CircuitBreakerStorage).toBeDefined();
      expect(storage.CircuitState).toBeDefined();
      expect(storage.CircuitBreakerError).toBeDefined();

      // Verify createStorage exists (factory function for legacy interface)
      expect(storage.createStorage).toBeDefined();
      expect(storage.createMemoryStorage).toBeDefined();

      // Should NOT export unrelated items
      expect((storage as unknown as Record<string, unknown>)['encode']).toBeUndefined();
      expect((storage as unknown as Record<string, unknown>)['shred']).toBeUndefined();
      expect((storage as unknown as Record<string, unknown>)['Type']).toBeUndefined();
    });

    it('errors entry point exports error classes only', async () => {
      const errors = await import('../../errors/index.js');

      // Core error classes
      expect(errors.EvoDBError).toBeDefined();
      expect(errors.QueryError).toBeDefined();
      expect(errors.StorageError).toBeDefined();
      expect(errors.ValidationError).toBeDefined();
      expect(errors.TimeoutError).toBeDefined();

      // Specialized error classes
      expect(errors.CorruptedBlockError).toBeDefined();
      expect(errors.EncodingValidationError).toBeDefined();

      // Storage error utilities
      expect(errors.StorageErrorCode).toBeDefined();
      expect(errors.isStorageErrorCode).toBeDefined();

      // Stack trace utilities
      expect(errors.captureStackTrace).toBeDefined();

      // Should NOT export unrelated items
      expect((errors as unknown as Record<string, unknown>)['encode']).toBeUndefined();
      expect((errors as unknown as Record<string, unknown>)['shred']).toBeUndefined();
      expect((errors as unknown as Record<string, unknown>)['Type']).toBeUndefined();
    });

    it('constants entry point exports size constants', async () => {
      const constants = await import('../../constants/index.js');

      // Size constants - verify actual values
      expect(constants.KB).toBe(1024);
      expect(constants.MB).toBe(1024 * 1024);
      expect(constants.GB).toBe(1024 * 1024 * 1024);

      // Should NOT export unrelated items
      expect((constants as unknown as Record<string, unknown>)['encode']).toBeUndefined();
      expect((constants as unknown as Record<string, unknown>)['shred']).toBeUndefined();
      expect((constants as unknown as Record<string, unknown>)['Type']).toBeUndefined();
    });

    it('guards entry point exports type guard functions', async () => {
      const guards = await import('../../guards/index.js');

      // Core type guards
      expect(guards.isArray).toBeDefined();
      expect(guards.isRecord).toBeDefined();
      expect(guards.isNumber).toBeDefined();
      expect(guards.isString).toBeDefined();
      expect(guards.isBoolean).toBeDefined();
      expect(guards.isNullish).toBeDefined();
      expect(guards.isNotNullish).toBeDefined();
      expect(guards.isFunction).toBeDefined();
      expect(guards.isDate).toBeDefined();
      expect(guards.isUint8Array).toBeDefined();

      // Advanced type guards
      expect(guards.isNumberTuple).toBeDefined();
      expect(guards.isArrayOf).toBeDefined();
      expect(guards.hasProperty).toBeDefined();
      expect(guards.hasProperties).toBeDefined();

      // Assertion helpers
      expect(guards.assertArray).toBeDefined();
      expect(guards.assertRecord).toBeDefined();
      expect(guards.assertNumber).toBeDefined();
      expect(guards.assertString).toBeDefined();

      // Should NOT export unrelated items
      expect((guards as unknown as Record<string, unknown>)['encode']).toBeUndefined();
      expect((guards as unknown as Record<string, unknown>)['shred']).toBeUndefined();
      expect((guards as unknown as Record<string, unknown>)['Type']).toBeUndefined();
    });

    it('evodb entry point exports high-level facade', async () => {
      const evodb = await import('../../evodb/index.js');

      // High-level facade
      expect(evodb.EvoDB).toBeDefined();
      expect(evodb.QueryBuilder).toBeDefined();

      // Should NOT export low-level items directly
      expect((evodb as unknown as Record<string, unknown>)['encode']).toBeUndefined();
      expect((evodb as unknown as Record<string, unknown>)['Type']).toBeUndefined();
    });

    it('block entry point exports block format operations', async () => {
      const block = await import('../../block/index.js');

      // Block operations
      expect(block.writeBlock).toBeDefined();
      expect(block.readBlock).toBeDefined();
      expect(block.getBlockStats).toBeDefined();

      // Should NOT export unrelated items
      expect((block as unknown as Record<string, unknown>)['encode']).toBeUndefined();
      expect((block as unknown as Record<string, unknown>)['shred']).toBeUndefined();
    });

    it('wal entry point exports WAL operations', async () => {
      const wal = await import('../../wal/index.js');

      // WAL operations
      expect(wal.createWalEntry).toBeDefined();
      expect(wal.serializeWalEntry).toBeDefined();
      expect(wal.deserializeWalEntry).toBeDefined();

      // Should NOT export unrelated items
      expect((wal as unknown as Record<string, unknown>)['encode']).toBeUndefined();
      expect((wal as unknown as Record<string, unknown>)['shred']).toBeUndefined();
    });

    it('schema entry point exports schema operations', async () => {
      const schema = await import('../../schema/index.js');

      // Schema operations
      expect(schema.inferSchema).toBeDefined();

      // Should NOT export unrelated items
      expect((schema as unknown as Record<string, unknown>)['encode']).toBeUndefined();
      expect((schema as unknown as Record<string, unknown>)['shred']).toBeUndefined();
    });

    it('merge entry point exports merge operations', async () => {
      const merge = await import('../../merge/index.js');

      // Merge operations
      expect(merge.mergeBlocks).toBeDefined();
      expect(merge.shouldMerge).toBeDefined();
      expect(merge.selectBlocksForMerge).toBeDefined();
      expect(merge.createMergeScheduler).toBeDefined();
      expect(merge.getMergeStats).toBeDefined();

      // Should NOT export unrelated items
      expect((merge as unknown as Record<string, unknown>)['encode']).toBeUndefined();
      expect((merge as unknown as Record<string, unknown>)['shred']).toBeUndefined();
    });

    it('partition entry point exports partition operations', async () => {
      const partition = await import('../../partition/index.js');

      // Partition operations
      expect(partition.calculatePartitions).toBeDefined();

      // Should NOT export unrelated items
      expect((partition as unknown as Record<string, unknown>)['encode']).toBeUndefined();
      expect((partition as unknown as Record<string, unknown>)['shred']).toBeUndefined();
    });

    it('snippet entry point exports snippet operations', async () => {
      const snippet = await import('../../snippet/index.js');

      // Snippet operations
      expect(snippet.encodeSnippetColumn).toBeDefined();
      expect(snippet.decodeSnippetColumn).toBeDefined();

      // Should NOT export unrelated items
      expect((snippet as unknown as Record<string, unknown>)['encode']).toBeUndefined();
      expect((snippet as unknown as Record<string, unknown>)['shred']).toBeUndefined();
    });

    it('logging entry point exports logging utilities', async () => {
      const logging = await import('../../logging/index.js');

      // Logging utilities
      expect(logging).toBeDefined();

      // Should NOT export unrelated items
      expect((logging as unknown as Record<string, unknown>)['encode']).toBeUndefined();
      expect((logging as unknown as Record<string, unknown>)['shred']).toBeUndefined();
    });

    it('tracing entry point exports tracing utilities', async () => {
      const tracing = await import('../../tracing/index.js');

      // Tracing exports
      expect(tracing).toBeDefined();

      // Should NOT export unrelated items
      expect((tracing as unknown as Record<string, unknown>)['encode']).toBeUndefined();
      expect((tracing as unknown as Record<string, unknown>)['shred']).toBeUndefined();
    });
  });

  describe('export isolation verification', () => {
    /**
     * These tests verify that each entry point truly provides isolation -
     * importing from one entry point should not pull in exports from others.
     */

    it('encoding exports should not include types module exports', async () => {
      const encoding = await import('../../encoding/index.js');
      const encodingKeys = Object.keys(encoding);

      // Types module exports that should NOT be in encoding
      const typeModuleExports = [
        'Type',
        'Encoding', // This is re-exported from types but should not be in encoding
        'WalOp',
        'MAGIC',
        'VERSION',
        'blockId',
        'schemaId',
      ];

      for (const key of typeModuleExports) {
        expect(
          encodingKeys.includes(key),
          `encoding should not export '${key}' from types module`
        ).toBe(false);
      }
    });

    it('shredding exports should not include encoding module exports', async () => {
      const shredding = await import('../../shredding/index.js');
      const shreddingKeys = Object.keys(shredding);

      // Encoding module exports that should NOT be in shredding
      const encodingModuleExports = [
        'encode',
        'decode',
        'SparseNullSet',
        'LRUStringPool',
        'fastDecodeInt32',
      ];

      for (const key of encodingModuleExports) {
        expect(
          shreddingKeys.includes(key),
          `shredding should not export '${key}' from encoding module`
        ).toBe(false);
      }
    });

    it('query exports should not include storage module exports', async () => {
      const query = await import('../../query/index.js');
      const queryKeys = Object.keys(query);

      // Storage module exports that should NOT be in query
      const storageModuleExports = [
        'createDOAdapter',
        'R2StorageProvider',
        'CircuitBreaker',
        'MemoryStorage',
      ];

      for (const key of storageModuleExports) {
        expect(
          queryKeys.includes(key),
          `query should not export '${key}' from storage module`
        ).toBe(false);
      }
    });

    it('errors exports should not include any non-error exports', async () => {
      const errors = await import('../../errors/index.js');
      const errorKeys = Object.keys(errors);

      // Unrelated exports that should NOT be in errors
      const unrelatedExports = [
        'encode',
        'decode',
        'shred',
        'unshred',
        'createDOAdapter',
        'Type',
        'KB',
        'MB',
      ];

      for (const key of unrelatedExports) {
        expect(
          errorKeys.includes(key),
          `errors should not export '${key}'`
        ).toBe(false);
      }
    });
  });

  describe('functional verification of focused imports', () => {
    /**
     * These tests verify that the focused imports actually work
     * for common use cases described in the documentation.
     */

    it('can use encoding entry point for encode/decode only', async () => {
      const encoding = await import('../../encoding/index.js');

      // Verify the encode and decode functions exist and are callable
      expect(encoding.encode).toBeDefined();
      expect(typeof encoding.encode).toBe('function');

      expect(encoding.decode).toBeDefined();
      expect(typeof encoding.decode).toBe('function');

      // Verify encoding utilities exist
      expect(encoding.encodeDict).toBeDefined();
      expect(encoding.encodeDelta).toBeDefined();

      // Verify sparse null bitmap utilities
      expect(encoding.SparseNullSet).toBeDefined();
      expect(encoding.isAllNull).toBeDefined();
      expect(encoding.hasNoNulls).toBeDefined();
    });

    it('can use shredding entry point for JSON operations only', async () => {
      const { shred, unshred } = await import('../../shredding/index.js');

      // Create sample data
      const rows = [
        { id: 1, name: 'Alice', score: 95 },
        { id: 2, name: 'Bob', score: 87 },
      ];

      // Shred and unshred - columns = one per field (id, name, score)
      const columns = shred(rows);
      expect(columns).toBeDefined();
      expect(columns.length).toBe(3); // 3 columns: id, name, score

      const restored = unshred(columns);
      expect(restored).toEqual(rows);
    });

    it('can use query entry point for filtering only', async () => {
      const { evaluateFilter } = await import('../../query/index.js');

      // evaluateFilter takes (value, filter) - the value is the actual value, not the row
      // Filter uses 'operator' (like 'gt', 'eq') not 'op'
      expect(evaluateFilter(95, { column: 'score', operator: 'gt', value: 90 })).toBe(true);
      expect(evaluateFilter(95, { column: 'score', operator: 'lt', value: 90 })).toBe(false);
      expect(evaluateFilter('Alice', { column: 'name', operator: 'eq', value: 'Alice' })).toBe(true);
    });

    it('can use constants entry point for size calculations', async () => {
      const { KB, MB, GB } = await import('../../constants/index.js');

      // Size calculations
      expect(5 * KB).toBe(5120);
      expect(2 * MB).toBe(2097152);
      expect(1 * GB).toBe(1073741824);

      // DO SQLite blob limit
      const DO_SQLITE_LIMIT = 2 * MB;
      expect(DO_SQLITE_LIMIT).toBe(2097152);
    });

    it('can use guards entry point for runtime validation', async () => {
      const { isArray, isRecord, isString, isNumber } = await import(
        '../../guards/index.js'
      );

      // Type guards work correctly
      expect(isArray([1, 2, 3])).toBe(true);
      expect(isArray('not an array')).toBe(false);

      expect(isRecord({ key: 'value' })).toBe(true);
      expect(isRecord(null)).toBe(false);

      expect(isString('hello')).toBe(true);
      expect(isString(123)).toBe(false);

      expect(isNumber(42)).toBe(true);
      expect(isNumber('42')).toBe(false);
    });
  });
});
