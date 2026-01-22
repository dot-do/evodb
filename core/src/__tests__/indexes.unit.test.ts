/**
 * Tests for Secondary Index Support
 *
 * TDD Issue: evodb-40of
 *
 * This test suite covers:
 * - Index creation and deletion
 * - Index utilization in queries
 * - Index maintenance on data modifications
 * - Multiple index types (B-tree, Hash)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  IndexManager,
  Index,
  IndexOptions,
  IndexType,
  IndexMetadata,
  IndexError,
  createIndexManager,
} from '../indexes.js';

// =============================================================================
// Index Creation Tests
// =============================================================================

describe('Secondary Indexes', () => {
  let indexManager: IndexManager;

  beforeEach(() => {
    indexManager = createIndexManager();
  });

  describe('createIndex()', () => {
    it('should create index on single column', async () => {
      await indexManager.createIndex('users', ['email']);

      const indexes = await indexManager.listIndexes('users');
      expect(indexes).toHaveLength(1);
      expect(indexes[0].columns).toEqual(['email']);
    });

    it('should create index on multiple columns (composite index)', async () => {
      await indexManager.createIndex('orders', ['user_id', 'created_at']);

      const indexes = await indexManager.listIndexes('orders');
      expect(indexes).toHaveLength(1);
      expect(indexes[0].columns).toEqual(['user_id', 'created_at']);
    });

    it('should create btree index by default', async () => {
      await indexManager.createIndex('users', ['email']);

      const indexes = await indexManager.listIndexes('users');
      expect(indexes[0].type).toBe('btree');
    });

    it('should create hash index when specified', async () => {
      await indexManager.createIndex('users', ['email'], { type: 'hash' });

      const indexes = await indexManager.listIndexes('users');
      expect(indexes[0].type).toBe('hash');
    });

    it('should auto-generate index name if not provided', async () => {
      await indexManager.createIndex('users', ['email']);

      const indexes = await indexManager.listIndexes('users');
      expect(indexes[0].name).toBe('idx_users_email');
    });

    it('should use custom index name when provided', async () => {
      await indexManager.createIndex('users', ['email'], { name: 'users_email_idx' });

      const indexes = await indexManager.listIndexes('users');
      expect(indexes[0].name).toBe('users_email_idx');
    });

    it('should create unique index when specified', async () => {
      await indexManager.createIndex('users', ['email'], { unique: true });

      const indexes = await indexManager.listIndexes('users');
      expect(indexes[0].unique).toBe(true);
    });

    it('should throw error when creating duplicate index', async () => {
      await indexManager.createIndex('users', ['email']);

      await expect(
        indexManager.createIndex('users', ['email'])
      ).rejects.toThrow(IndexError);
    });

    it('should throw error for empty columns array', async () => {
      await expect(
        indexManager.createIndex('users', [])
      ).rejects.toThrow(IndexError);
    });

    it('should throw error for invalid table name', async () => {
      await expect(
        indexManager.createIndex('', ['email'])
      ).rejects.toThrow(IndexError);
    });

    it('should record creation timestamp', async () => {
      const beforeTime = Date.now();
      await indexManager.createIndex('users', ['email']);
      const afterTime = Date.now();

      const indexes = await indexManager.listIndexes('users');
      expect(indexes[0].createdAt).toBeGreaterThanOrEqual(beforeTime);
      expect(indexes[0].createdAt).toBeLessThanOrEqual(afterTime);
    });
  });

  // =============================================================================
  // Index Deletion Tests
  // =============================================================================

  describe('dropIndex()', () => {
    it('should remove existing index', async () => {
      await indexManager.createIndex('users', ['email']);
      await indexManager.dropIndex('users', 'idx_users_email');

      const indexes = await indexManager.listIndexes('users');
      expect(indexes).toHaveLength(0);
    });

    it('should throw error when dropping non-existent index', async () => {
      await expect(
        indexManager.dropIndex('users', 'non_existent_idx')
      ).rejects.toThrow(IndexError);
    });

    it('should remove only the specified index', async () => {
      await indexManager.createIndex('users', ['email']);
      await indexManager.createIndex('users', ['name']);
      await indexManager.dropIndex('users', 'idx_users_email');

      const indexes = await indexManager.listIndexes('users');
      expect(indexes).toHaveLength(1);
      expect(indexes[0].columns).toEqual(['name']);
    });

    it('should support ifExists option to avoid errors', async () => {
      await expect(
        indexManager.dropIndex('users', 'non_existent_idx', { ifExists: true })
      ).resolves.toBeUndefined();
    });
  });

  // =============================================================================
  // Index Listing Tests
  // =============================================================================

  describe('listIndexes()', () => {
    it('should return empty array for table with no indexes', async () => {
      const indexes = await indexManager.listIndexes('users');
      expect(indexes).toEqual([]);
    });

    it('should return all indexes for a table', async () => {
      await indexManager.createIndex('users', ['email']);
      await indexManager.createIndex('users', ['name']);
      await indexManager.createIndex('users', ['created_at']);

      const indexes = await indexManager.listIndexes('users');
      expect(indexes).toHaveLength(3);
    });

    it('should only return indexes for specified table', async () => {
      await indexManager.createIndex('users', ['email']);
      await indexManager.createIndex('orders', ['user_id']);

      const userIndexes = await indexManager.listIndexes('users');
      expect(userIndexes).toHaveLength(1);
      expect(userIndexes[0].columns).toEqual(['email']);
    });

    it('should return complete index metadata', async () => {
      await indexManager.createIndex('users', ['email'], {
        type: 'hash',
        unique: true,
        name: 'users_email_unique'
      });

      const indexes = await indexManager.listIndexes('users');
      const index = indexes[0];

      expect(index.name).toBe('users_email_unique');
      expect(index.columns).toEqual(['email']);
      expect(index.type).toBe('hash');
      expect(index.unique).toBe(true);
      expect(index.createdAt).toBeDefined();
    });
  });

  // =============================================================================
  // Query Optimization Tests (Index Usage)
  // =============================================================================

  describe('query uses index when available', () => {
    it('should indicate when query can use index', async () => {
      await indexManager.createIndex('users', ['email']);

      const queryPlan = indexManager.getQueryPlan('users', { email: 'test@example.com' });

      expect(queryPlan.usesIndex).toBe(true);
      expect(queryPlan.indexName).toBe('idx_users_email');
    });

    it('should not use index when filter columns do not match', async () => {
      await indexManager.createIndex('users', ['email']);

      const queryPlan = indexManager.getQueryPlan('users', { name: 'Alice' });

      expect(queryPlan.usesIndex).toBe(false);
      expect(queryPlan.scanType).toBe('full');
    });

    it('should select most specific index for composite queries', async () => {
      await indexManager.createIndex('orders', ['user_id']);
      await indexManager.createIndex('orders', ['user_id', 'status']);

      const queryPlan = indexManager.getQueryPlan('orders', { user_id: '123', status: 'active' });

      // Should prefer the composite index that covers both columns
      expect(queryPlan.indexName).toBe('idx_orders_user_id_status');
    });

    it('should use leftmost prefix of composite index', async () => {
      await indexManager.createIndex('orders', ['user_id', 'status', 'created_at']);

      // Query on just user_id should still use the index
      const queryPlan = indexManager.getQueryPlan('orders', { user_id: '123' });

      expect(queryPlan.usesIndex).toBe(true);
      expect(queryPlan.indexName).toBe('idx_orders_user_id_status_created_at');
    });

    it('should not use index for non-prefix columns', async () => {
      await indexManager.createIndex('orders', ['user_id', 'status', 'created_at']);

      // Query on just status (not the leftmost column) cannot use the index
      const queryPlan = indexManager.getQueryPlan('orders', { status: 'active' });

      expect(queryPlan.usesIndex).toBe(false);
    });

    it('should prefer btree index for range queries', async () => {
      await indexManager.createIndex('orders', ['amount'], { type: 'btree', name: 'idx_amount_btree' });
      await indexManager.createIndex('orders', ['amount'], { type: 'hash', name: 'idx_amount_hash' });

      const queryPlan = indexManager.getQueryPlan('orders', { amount: { $gt: 100 } });

      expect(queryPlan.indexName).toBe('idx_amount_btree');
    });

    it('should prefer hash index for equality queries when available', async () => {
      await indexManager.createIndex('users', ['email'], { type: 'btree', name: 'idx_email_btree' });
      await indexManager.createIndex('users', ['email'], { type: 'hash', name: 'idx_email_hash' });

      const queryPlan = indexManager.getQueryPlan('users', { email: 'test@example.com' });

      expect(queryPlan.indexName).toBe('idx_email_hash');
    });
  });

  // =============================================================================
  // Index Maintenance Tests
  // =============================================================================

  describe('index is maintained on insert/update/delete', () => {
    it('should update index on insert', async () => {
      await indexManager.createIndex('users', ['email']);

      // Simulate inserting a row
      indexManager.onInsert('users', { id: '1', email: 'alice@example.com', name: 'Alice' });

      // Index should have the new entry
      const entries = indexManager.getIndexEntries('users', 'idx_users_email');
      expect(entries).toContainEqual({ key: 'alice@example.com', rowId: '1' });
    });

    it('should update index on bulk insert', async () => {
      await indexManager.createIndex('users', ['email']);

      const rows = [
        { id: '1', email: 'alice@example.com' },
        { id: '2', email: 'bob@example.com' },
        { id: '3', email: 'charlie@example.com' },
      ];

      indexManager.onBulkInsert('users', rows);

      const entries = indexManager.getIndexEntries('users', 'idx_users_email');
      expect(entries).toHaveLength(3);
    });

    it('should update index on update (old value removed, new value added)', async () => {
      await indexManager.createIndex('users', ['email']);

      // Insert initial row
      indexManager.onInsert('users', { id: '1', email: 'old@example.com' });

      // Update the row
      indexManager.onUpdate('users', '1',
        { email: 'old@example.com' },
        { email: 'new@example.com' }
      );

      const entries = indexManager.getIndexEntries('users', 'idx_users_email');
      expect(entries).not.toContainEqual({ key: 'old@example.com', rowId: '1' });
      expect(entries).toContainEqual({ key: 'new@example.com', rowId: '1' });
    });

    it('should not update index when non-indexed column changes', async () => {
      await indexManager.createIndex('users', ['email']);

      indexManager.onInsert('users', { id: '1', email: 'alice@example.com', name: 'Alice' });

      // Update non-indexed column
      indexManager.onUpdate('users', '1', { name: 'Alice' }, { name: 'Alicia' });

      // Index should remain unchanged
      const entries = indexManager.getIndexEntries('users', 'idx_users_email');
      expect(entries).toHaveLength(1);
      expect(entries[0]).toEqual({ key: 'alice@example.com', rowId: '1' });
    });

    it('should remove entry from index on delete', async () => {
      await indexManager.createIndex('users', ['email']);

      indexManager.onInsert('users', { id: '1', email: 'alice@example.com' });
      indexManager.onDelete('users', '1', { email: 'alice@example.com' });

      const entries = indexManager.getIndexEntries('users', 'idx_users_email');
      expect(entries).toHaveLength(0);
    });

    it('should maintain composite index correctly', async () => {
      await indexManager.createIndex('orders', ['user_id', 'status']);

      indexManager.onInsert('orders', { id: '1', user_id: 'u1', status: 'pending' });
      indexManager.onInsert('orders', { id: '2', user_id: 'u1', status: 'completed' });

      const entries = indexManager.getIndexEntries('orders', 'idx_orders_user_id_status');
      expect(entries).toHaveLength(2);
      expect(entries).toContainEqual({ key: ['u1', 'pending'], rowId: '1' });
      expect(entries).toContainEqual({ key: ['u1', 'completed'], rowId: '2' });
    });

    it('should enforce unique constraint on insert', async () => {
      await indexManager.createIndex('users', ['email'], { unique: true });

      indexManager.onInsert('users', { id: '1', email: 'alice@example.com' });

      expect(() => {
        indexManager.onInsert('users', { id: '2', email: 'alice@example.com' });
      }).toThrow(IndexError);
    });

    it('should enforce unique constraint on update', async () => {
      await indexManager.createIndex('users', ['email'], { unique: true });

      indexManager.onInsert('users', { id: '1', email: 'alice@example.com' });
      indexManager.onInsert('users', { id: '2', email: 'bob@example.com' });

      expect(() => {
        indexManager.onUpdate('users', '2',
          { email: 'bob@example.com' },
          { email: 'alice@example.com' }
        );
      }).toThrow(IndexError);
    });

    it('should handle null values in indexed columns', async () => {
      await indexManager.createIndex('users', ['email']);

      indexManager.onInsert('users', { id: '1', email: null });

      const entries = indexManager.getIndexEntries('users', 'idx_users_email');
      expect(entries).toContainEqual({ key: null, rowId: '1' });
    });

    it('should update all affected indexes on modification', async () => {
      await indexManager.createIndex('users', ['email']);
      await indexManager.createIndex('users', ['name']);

      indexManager.onInsert('users', { id: '1', email: 'alice@example.com', name: 'Alice' });

      const emailEntries = indexManager.getIndexEntries('users', 'idx_users_email');
      const nameEntries = indexManager.getIndexEntries('users', 'idx_users_name');

      expect(emailEntries).toContainEqual({ key: 'alice@example.com', rowId: '1' });
      expect(nameEntries).toContainEqual({ key: 'Alice', rowId: '1' });
    });
  });

  // =============================================================================
  // Index Type Tests
  // =============================================================================

  describe('index types', () => {
    it('should support btree index type', async () => {
      await indexManager.createIndex('users', ['created_at'], { type: 'btree' });

      const indexes = await indexManager.listIndexes('users');
      expect(indexes[0].type).toBe('btree');
    });

    it('should support hash index type', async () => {
      await indexManager.createIndex('users', ['email'], { type: 'hash' });

      const indexes = await indexManager.listIndexes('users');
      expect(indexes[0].type).toBe('hash');
    });

    it('should throw error for unsupported index type', async () => {
      await expect(
        indexManager.createIndex('users', ['email'], { type: 'fulltext' as IndexType })
      ).rejects.toThrow(IndexError);
    });
  });

  // =============================================================================
  // Index Statistics Tests
  // =============================================================================

  describe('index statistics', () => {
    it('should track index entry count', async () => {
      await indexManager.createIndex('users', ['email']);

      indexManager.onInsert('users', { id: '1', email: 'alice@example.com' });
      indexManager.onInsert('users', { id: '2', email: 'bob@example.com' });

      const stats = indexManager.getIndexStats('users', 'idx_users_email');
      expect(stats.entryCount).toBe(2);
    });

    it('should track unique value count', async () => {
      await indexManager.createIndex('orders', ['status']);

      indexManager.onInsert('orders', { id: '1', status: 'pending' });
      indexManager.onInsert('orders', { id: '2', status: 'pending' });
      indexManager.onInsert('orders', { id: '3', status: 'completed' });

      const stats = indexManager.getIndexStats('orders', 'idx_orders_status');
      expect(stats.uniqueValueCount).toBe(2); // 'pending' and 'completed'
    });

    it('should estimate index size', async () => {
      await indexManager.createIndex('users', ['email']);

      indexManager.onInsert('users', { id: '1', email: 'alice@example.com' });

      const stats = indexManager.getIndexStats('users', 'idx_users_email');
      expect(stats.estimatedSizeBytes).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// Index Interface Type Tests
// =============================================================================

describe('Index types', () => {
  it('should have correct Index interface shape', () => {
    const index: Index = {
      name: 'idx_users_email',
      columns: ['email'],
      type: 'btree',
    };

    expect(index.name).toBe('idx_users_email');
    expect(index.columns).toEqual(['email']);
    expect(index.type).toBe('btree');
  });

  it('should have correct IndexOptions interface shape', () => {
    const options: IndexOptions = {
      name: 'custom_idx',
      type: 'hash',
      unique: true,
    };

    expect(options.name).toBe('custom_idx');
    expect(options.type).toBe('hash');
    expect(options.unique).toBe(true);
  });

  it('should have correct IndexMetadata interface shape', () => {
    const metadata: IndexMetadata = {
      name: 'idx_users_email',
      columns: ['email'],
      type: 'btree',
      unique: false,
      createdAt: Date.now(),
    };

    expect(metadata.name).toBe('idx_users_email');
    expect(metadata.unique).toBe(false);
    expect(metadata.createdAt).toBeGreaterThan(0);
  });
});
