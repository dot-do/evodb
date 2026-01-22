/**
 * Tests for Transaction API with ACID guarantees
 *
 * TDD Issue: evodb-61v3
 *
 * This test suite covers:
 * - Transaction lifecycle (begin/commit/rollback)
 * - Nested transactions with savepoints
 * - Isolation levels (read committed)
 * - Atomicity guarantees (all or nothing)
 * - Integration with EvoDB class
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  Transaction,
  TransactionManager,
  TransactionState,
  IsolationLevel,
  TransactionError,
  TransactionOptions,
} from '../transactions.js';
import { EvoDB } from '../evodb.js';

// =============================================================================
// Transaction Lifecycle Tests
// =============================================================================

describe('Transaction API', () => {
  let manager: TransactionManager;

  beforeEach(() => {
    manager = new TransactionManager();
  });

  describe('begin()', () => {
    it('should create a new transaction', () => {
      const tx = manager.begin();

      expect(tx).toBeDefined();
      expect(tx.id).toBeDefined();
      expect(tx.state).toBe(TransactionState.Active);
    });

    it('should assign unique transaction IDs', () => {
      const tx1 = manager.begin();
      const tx2 = manager.begin();

      expect(tx1.id).not.toBe(tx2.id);
    });

    it('should accept transaction options', () => {
      const options: TransactionOptions = {
        isolationLevel: IsolationLevel.ReadCommitted,
        timeout: 5000,
      };
      const tx = manager.begin(options);

      expect(tx.isolationLevel).toBe(IsolationLevel.ReadCommitted);
    });

    it('should set default isolation level', () => {
      const tx = manager.begin();

      expect(tx.isolationLevel).toBe(IsolationLevel.ReadCommitted);
    });

    it('should track start time', () => {
      const beforeTime = Date.now();
      const tx = manager.begin();
      const afterTime = Date.now();

      expect(tx.startTime).toBeGreaterThanOrEqual(beforeTime);
      expect(tx.startTime).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('commit()', () => {
    it('should persist changes', async () => {
      const tx = manager.begin();

      // Simulate adding operations to the transaction
      tx.addOperation({ type: 'insert', table: 'users', data: { name: 'Alice' } });

      await tx.commit();

      expect(tx.state).toBe(TransactionState.Committed);
    });

    it('should transition state to Committed', async () => {
      const tx = manager.begin();
      await tx.commit();

      expect(tx.state).toBe(TransactionState.Committed);
    });

    it('should throw if transaction is not active', async () => {
      const tx = manager.begin();
      await tx.commit();

      await expect(tx.commit()).rejects.toThrow(TransactionError);
    });

    it('should throw if transaction was rolled back', async () => {
      const tx = manager.begin();
      await tx.rollback();

      await expect(tx.commit()).rejects.toThrow(TransactionError);
    });

    it('should release locks on commit', async () => {
      const tx = manager.begin();
      tx.acquireLock('users', 'user-1');

      await tx.commit();

      expect(tx.hasLock('users', 'user-1')).toBe(false);
    });

    it('should record commit time', async () => {
      const tx = manager.begin();
      await tx.commit();

      expect(tx.endTime).toBeDefined();
      expect(tx.endTime).toBeGreaterThanOrEqual(tx.startTime);
    });
  });

  describe('rollback()', () => {
    it('should discard changes', async () => {
      const tx = manager.begin();
      tx.addOperation({ type: 'insert', table: 'users', data: { name: 'Alice' } });

      await tx.rollback();

      expect(tx.state).toBe(TransactionState.RolledBack);
      expect(tx.getOperations()).toHaveLength(0);
    });

    it('should transition state to RolledBack', async () => {
      const tx = manager.begin();
      await tx.rollback();

      expect(tx.state).toBe(TransactionState.RolledBack);
    });

    it('should throw if transaction is already committed', async () => {
      const tx = manager.begin();
      await tx.commit();

      await expect(tx.rollback()).rejects.toThrow(TransactionError);
    });

    it('should be idempotent for rolled back transactions', async () => {
      const tx = manager.begin();
      await tx.rollback();

      // Should not throw on second rollback
      await expect(tx.rollback()).resolves.toBeUndefined();
    });

    it('should release locks on rollback', async () => {
      const tx = manager.begin();
      tx.acquireLock('users', 'user-1');

      await tx.rollback();

      expect(tx.hasLock('users', 'user-1')).toBe(false);
    });

    it('should record rollback time', async () => {
      const tx = manager.begin();
      await tx.rollback();

      expect(tx.endTime).toBeDefined();
    });
  });

  describe('nested transactions with savepoints', () => {
    it('should create savepoint within transaction', () => {
      const tx = manager.begin();
      const savepoint = tx.savepoint('sp1');

      expect(savepoint).toBeDefined();
      expect(savepoint.name).toBe('sp1');
    });

    it('should rollback to savepoint', async () => {
      const tx = manager.begin();
      tx.addOperation({ type: 'insert', table: 'users', data: { name: 'Alice' } });

      const sp = tx.savepoint('sp1');
      tx.addOperation({ type: 'insert', table: 'users', data: { name: 'Bob' } });

      await tx.rollbackToSavepoint(sp);

      // Should only have the first operation
      expect(tx.getOperations()).toHaveLength(1);
      expect(tx.getOperations()[0].data.name).toBe('Alice');
    });

    it('should support multiple savepoints', () => {
      const tx = manager.begin();
      const sp1 = tx.savepoint('sp1');
      const sp2 = tx.savepoint('sp2');
      const sp3 = tx.savepoint('sp3');

      expect(sp1.name).toBe('sp1');
      expect(sp2.name).toBe('sp2');
      expect(sp3.name).toBe('sp3');
    });

    it('should throw on invalid savepoint name', async () => {
      const tx = manager.begin();
      const sp = { name: 'nonexistent', index: 0 };

      await expect(tx.rollbackToSavepoint(sp)).rejects.toThrow(TransactionError);
    });

    it('should release savepoint on commit', async () => {
      const tx = manager.begin();
      const sp = tx.savepoint('sp1');

      await tx.commit();

      // After commit, rollback to savepoint should fail
      await expect(tx.rollbackToSavepoint(sp)).rejects.toThrow(TransactionError);
    });

    it('should release nested savepoints on parent rollback', async () => {
      const tx = manager.begin();
      const sp1 = tx.savepoint('sp1');
      tx.savepoint('sp2');

      await tx.rollbackToSavepoint(sp1);

      // sp2 should no longer exist
      const sp2Ref = { name: 'sp2', index: 1 };
      await expect(tx.rollbackToSavepoint(sp2Ref)).rejects.toThrow(TransactionError);
    });

    it('should track savepoint operation index', () => {
      const tx = manager.begin();
      tx.addOperation({ type: 'insert', table: 'users', data: { id: 1 } });
      tx.addOperation({ type: 'insert', table: 'users', data: { id: 2 } });

      const sp = tx.savepoint('sp1');

      expect(sp.index).toBe(2); // After 2 operations
    });
  });

  describe('isolation: read committed', () => {
    it('should not see uncommitted changes from other transactions', async () => {
      const tx1 = manager.begin();
      const tx2 = manager.begin();

      tx1.addOperation({ type: 'insert', table: 'users', data: { name: 'Alice' } });

      // tx2 should not see tx1's uncommitted insert
      const visibleOps = tx2.getVisibleOperations('users');
      expect(visibleOps).toHaveLength(0);
    });

    it('should see committed changes from other transactions', async () => {
      const tx1 = manager.begin();
      tx1.addOperation({ type: 'insert', table: 'users', data: { name: 'Alice' } });
      await tx1.commit();

      const tx2 = manager.begin();
      const visibleOps = tx2.getVisibleOperations('users');

      // tx2 should see tx1's committed insert
      expect(visibleOps).toHaveLength(1);
      expect(visibleOps[0].data.name).toBe('Alice');
    });

    it('should see own uncommitted changes', () => {
      const tx = manager.begin();
      tx.addOperation({ type: 'insert', table: 'users', data: { name: 'Alice' } });

      const ownOps = tx.getOwnOperations('users');
      expect(ownOps).toHaveLength(1);
    });

    it('should handle concurrent reads correctly', async () => {
      // Start tx1 and make changes
      const tx1 = manager.begin();
      tx1.addOperation({ type: 'insert', table: 'users', data: { name: 'Alice' } });

      // Start tx2 before tx1 commits
      const tx2 = manager.begin();

      // tx1 commits
      await tx1.commit();

      // tx2's view should be consistent - may or may not see tx1's changes
      // depending on exact read committed semantics (statement-level vs transaction-level)
      const tx2Ops = tx2.getVisibleOperations('users');

      // Under read committed, tx2 should see tx1's committed changes
      // on the next statement
      expect(tx2Ops).toHaveLength(1);
    });

    it('should prevent dirty reads', async () => {
      const tx1 = manager.begin();
      tx1.addOperation({ type: 'update', table: 'users', key: 'user-1', data: { name: 'Changed' } });

      const tx2 = manager.begin();
      const visible = tx2.getVisibleOperations('users');

      // tx2 should not see tx1's uncommitted update
      const hasUncommittedChange = visible.some(op => op.data.name === 'Changed');
      expect(hasUncommittedChange).toBe(false);

      await tx1.rollback();
    });
  });

  describe('atomicity: all or nothing', () => {
    it('should apply all operations on commit', async () => {
      const tx = manager.begin();
      tx.addOperation({ type: 'insert', table: 'users', data: { id: 1, name: 'Alice' } });
      tx.addOperation({ type: 'insert', table: 'users', data: { id: 2, name: 'Bob' } });
      tx.addOperation({ type: 'insert', table: 'users', data: { id: 3, name: 'Charlie' } });

      await tx.commit();

      const committedOps = manager.getCommittedOperations('users');
      expect(committedOps).toHaveLength(3);
    });

    it('should discard all operations on rollback', async () => {
      const tx = manager.begin();
      tx.addOperation({ type: 'insert', table: 'users', data: { id: 1, name: 'Alice' } });
      tx.addOperation({ type: 'insert', table: 'users', data: { id: 2, name: 'Bob' } });

      await tx.rollback();

      const committedOps = manager.getCommittedOperations('users');
      expect(committedOps).toHaveLength(0);
    });

    it('should rollback on error during commit', async () => {
      const tx = manager.begin();
      tx.addOperation({ type: 'insert', table: 'users', data: { id: 1, name: 'Alice' } });

      // Simulate an error during commit (e.g., constraint violation)
      tx.addOperation({
        type: 'insert',
        table: 'users',
        data: { id: 1, name: 'Duplicate' }, // Same ID - would violate unique constraint
        simulateError: 'UNIQUE_CONSTRAINT_VIOLATION'
      });

      await expect(tx.commit()).rejects.toThrow();

      // Transaction should be rolled back
      expect(tx.state).toBe(TransactionState.RolledBack);

      // No operations should be committed
      const committedOps = manager.getCommittedOperations('users');
      expect(committedOps).toHaveLength(0);
    });

    it('should maintain consistent state after partial failure', async () => {
      // Initial state
      const tx1 = manager.begin();
      tx1.addOperation({ type: 'insert', table: 'accounts', data: { id: 1, balance: 1000 } });
      await tx1.commit();

      // Transfer that will fail
      const tx2 = manager.begin();
      tx2.addOperation({ type: 'update', table: 'accounts', key: '1', data: { balance: 500 } });
      tx2.addOperation({
        type: 'update',
        table: 'accounts',
        key: '2', // Non-existent account
        data: { balance: 500 },
        simulateError: 'NOT_FOUND'
      });

      await expect(tx2.commit()).rejects.toThrow();

      // Original balance should be unchanged
      const ops = manager.getCommittedOperations('accounts');
      const latestBalance = ops.find(op => op.data.id === 1)?.data.balance;
      expect(latestBalance).toBe(1000);
    });

    it('should handle concurrent transaction conflicts', async () => {
      // Initial state
      const setup = manager.begin();
      setup.addOperation({ type: 'insert', table: 'inventory', data: { item: 'widget', count: 10 } });
      await setup.commit();

      // Two concurrent transactions try to decrement the same item
      const tx1 = manager.begin();
      const tx2 = manager.begin();

      tx1.acquireLock('inventory', 'widget');
      tx1.addOperation({ type: 'update', table: 'inventory', key: 'widget', data: { count: 9 } });

      // tx2 tries to acquire the same lock
      const lockAcquired = tx2.tryAcquireLock('inventory', 'widget');
      expect(lockAcquired).toBe(false);

      // tx2 should fail or wait
      expect(() => {
        tx2.addOperation({ type: 'update', table: 'inventory', key: 'widget', data: { count: 9 } });
      }).toThrow(TransactionError);

      await tx1.commit();
    });
  });
});

// =============================================================================
// EvoDB Integration Tests
// =============================================================================

describe('EvoDB Transaction Integration', () => {
  let db: EvoDB;

  beforeEach(() => {
    db = new EvoDB({ mode: 'development' });
  });

  describe('transaction() method', () => {
    it('should execute operations in a transaction', async () => {
      await db.transaction(async (tx) => {
        await tx.insert('users', { name: 'Alice' });
        await tx.insert('users', { name: 'Bob' });
      });

      const users = await db.query('users');
      expect(users).toHaveLength(2);
    });

    it('should rollback on error', async () => {
      try {
        await db.transaction(async (tx) => {
          await tx.insert('users', { name: 'Alice' });
          throw new Error('Simulated error');
        });
      } catch {
        // Expected error
      }

      const users = await db.query('users');
      expect(users).toHaveLength(0);
    });

    it('should return transaction result', async () => {
      const result = await db.transaction(async (tx) => {
        const [user] = await tx.insert('users', { name: 'Alice' });
        return user;
      });

      expect(result.name).toBe('Alice');
    });

    it('should support nested transactions via savepoints', async () => {
      await db.transaction(async (tx) => {
        await tx.insert('users', { name: 'Alice' });

        try {
          await tx.nestedTransaction(async (nestedTx) => {
            await nestedTx.insert('users', { name: 'Bob' });
            throw new Error('Nested error');
          });
        } catch {
          // Nested transaction rolled back, but outer continues
        }

        await tx.insert('users', { name: 'Charlie' });
      });

      const users = await db.query('users');
      // Alice and Charlie should be there, Bob rolled back
      expect(users).toHaveLength(2);
      expect(users.map((u: Record<string, unknown>) => u.name).sort()).toEqual(['Alice', 'Charlie']);
    });
  });

  describe('explicit transaction API', () => {
    it('should support explicit begin/commit', async () => {
      const tx = db.beginTransaction();

      await tx.insert('users', { name: 'Alice' });
      await tx.commit();

      const users = await db.query('users');
      expect(users).toHaveLength(1);
    });

    it('should support explicit begin/rollback', async () => {
      const tx = db.beginTransaction();

      await tx.insert('users', { name: 'Alice' });
      await tx.rollback();

      const users = await db.query('users');
      expect(users).toHaveLength(0);
    });

    it('should isolate transaction changes', async () => {
      const tx = db.beginTransaction();
      await tx.insert('users', { name: 'Alice' });

      // Query outside transaction should not see uncommitted changes
      const usersOutside = await db.query('users');
      expect(usersOutside).toHaveLength(0);

      // Query inside transaction should see own changes
      const usersInside = await tx.query('users');
      expect(usersInside).toHaveLength(1);

      await tx.commit();

      // Now query outside should see committed changes
      const usersAfter = await db.query('users');
      expect(usersAfter).toHaveLength(1);
    });
  });
});

// =============================================================================
// TransactionManager State Tests
// =============================================================================

describe('TransactionManager', () => {
  let manager: TransactionManager;

  beforeEach(() => {
    manager = new TransactionManager();
  });

  describe('transaction tracking', () => {
    it('should track active transactions', () => {
      const tx1 = manager.begin();
      const tx2 = manager.begin();

      expect(manager.getActiveTransactions()).toHaveLength(2);
      expect(manager.getActiveTransactions()).toContain(tx1);
      expect(manager.getActiveTransactions()).toContain(tx2);
    });

    it('should remove transaction from active list on commit', async () => {
      const tx = manager.begin();
      await tx.commit();

      expect(manager.getActiveTransactions()).toHaveLength(0);
    });

    it('should remove transaction from active list on rollback', async () => {
      const tx = manager.begin();
      await tx.rollback();

      expect(manager.getActiveTransactions()).toHaveLength(0);
    });

    it('should maintain transaction history', async () => {
      const tx1 = manager.begin();
      await tx1.commit();

      const tx2 = manager.begin();
      await tx2.rollback();

      const history = manager.getTransactionHistory();
      expect(history).toHaveLength(2);
    });
  });

  describe('lock management', () => {
    it('should track locks across transactions', () => {
      const tx1 = manager.begin();
      tx1.acquireLock('users', 'user-1');

      expect(manager.isLocked('users', 'user-1')).toBe(true);
      expect(manager.getLockholder('users', 'user-1')).toBe(tx1.id);
    });

    it('should release locks when transaction ends', async () => {
      const tx = manager.begin();
      tx.acquireLock('users', 'user-1');
      await tx.commit();

      expect(manager.isLocked('users', 'user-1')).toBe(false);
    });

    it('should prevent duplicate lock acquisition', () => {
      const tx1 = manager.begin();
      const tx2 = manager.begin();

      tx1.acquireLock('users', 'user-1');

      expect(() => tx2.acquireLock('users', 'user-1')).toThrow(TransactionError);
    });
  });

  describe('committed operations', () => {
    it('should store committed operations by table', async () => {
      const tx = manager.begin();
      tx.addOperation({ type: 'insert', table: 'users', data: { name: 'Alice' } });
      tx.addOperation({ type: 'insert', table: 'posts', data: { title: 'Hello' } });
      await tx.commit();

      expect(manager.getCommittedOperations('users')).toHaveLength(1);
      expect(manager.getCommittedOperations('posts')).toHaveLength(1);
    });

    it('should order committed operations by commit time', async () => {
      const tx1 = manager.begin();
      tx1.addOperation({ type: 'insert', table: 'users', data: { name: 'Alice' } });
      await tx1.commit();

      const tx2 = manager.begin();
      tx2.addOperation({ type: 'insert', table: 'users', data: { name: 'Bob' } });
      await tx2.commit();

      const ops = manager.getCommittedOperations('users');
      expect(ops[0].data.name).toBe('Alice');
      expect(ops[1].data.name).toBe('Bob');
    });
  });
});
