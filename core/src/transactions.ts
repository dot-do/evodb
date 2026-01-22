/**
 * Transaction API with ACID guarantees for EvoDB
 *
 * TDD Issue: evodb-61v3
 *
 * This module provides:
 * - Transaction interface with begin/commit/rollback
 * - TransactionManager class for managing transaction lifecycle
 * - Basic MVCC-style isolation (read committed)
 * - Lock-based concurrency control
 * - Savepoint support for nested transactions
 *
 * @example
 * ```typescript
 * import { TransactionManager, IsolationLevel } from '@evodb/core';
 *
 * const manager = new TransactionManager();
 * const tx = manager.begin({ isolationLevel: IsolationLevel.ReadCommitted });
 *
 * tx.addOperation({ type: 'insert', table: 'users', data: { name: 'Alice' } });
 * await tx.commit();
 * ```
 */

import { EvoDBError } from './errors.js';
import { captureStackTrace } from './stack-trace.js';

// =============================================================================
// Types and Interfaces
// =============================================================================

/**
 * Transaction state enum
 */
export enum TransactionState {
  /** Transaction is active and accepting operations */
  Active = 'active',
  /** Transaction is being committed */
  Committing = 'committing',
  /** Transaction has been successfully committed */
  Committed = 'committed',
  /** Transaction is being rolled back */
  RollingBack = 'rolling_back',
  /** Transaction has been rolled back */
  RolledBack = 'rolled_back',
}

/**
 * Isolation level for transactions
 */
export enum IsolationLevel {
  /** Read committed - default, prevents dirty reads */
  ReadCommitted = 'read_committed',
  /** Repeatable read - prevents non-repeatable reads */
  RepeatableRead = 'repeatable_read',
  /** Serializable - strictest isolation level */
  Serializable = 'serializable',
}

/**
 * Transaction options
 */
export interface TransactionOptions {
  /** Isolation level for the transaction */
  isolationLevel?: IsolationLevel;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Whether the transaction is read-only */
  readOnly?: boolean;
}

/**
 * Operation type within a transaction
 */
export type OperationType = 'insert' | 'update' | 'delete';

/**
 * Represents a single operation within a transaction
 */
export interface TransactionOperation {
  /** Type of operation */
  type: OperationType;
  /** Target table name */
  table: string;
  /** Primary key for update/delete operations */
  key?: string;
  /** Data for insert/update operations */
  data: Record<string, unknown>;
  /** Simulate an error during commit (for testing) */
  simulateError?: string;
  /** Transaction ID that created this operation */
  transactionId?: string;
  /** Timestamp when operation was added */
  timestamp?: number;
}

/**
 * Savepoint for nested transaction support
 */
export interface Savepoint {
  /** Savepoint name */
  name: string;
  /** Index in the operations array at time of savepoint creation */
  index: number;
}

/**
 * Lock record for tracking resource locks
 */
interface LockRecord {
  /** Table name */
  table: string;
  /** Resource key (e.g., row ID) */
  key: string;
  /** Transaction ID holding the lock */
  transactionId: string;
  /** Lock acquisition time */
  acquiredAt: number;
}

// =============================================================================
// TransactionError
// =============================================================================

/**
 * Error thrown when a transaction operation fails
 */
export class TransactionError extends EvoDBError {
  constructor(message: string, code: string = 'TRANSACTION_ERROR', details?: Record<string, unknown>) {
    super(message, code, details);
    this.name = 'TransactionError';
    captureStackTrace(this, TransactionError);
  }
}

// =============================================================================
// Transaction Class
// =============================================================================

/**
 * Represents a single database transaction
 */
export class Transaction {
  /** Unique transaction identifier */
  public readonly id: string;

  /** Isolation level for this transaction */
  public readonly isolationLevel: IsolationLevel;

  /** Transaction start time (Unix timestamp) */
  public readonly startTime: number;

  /** Transaction end time (set on commit/rollback) */
  public endTime?: number;

  /** Current transaction state */
  private _state: TransactionState = TransactionState.Active;

  /** Operations pending in this transaction */
  private operations: TransactionOperation[] = [];

  /** Savepoints created within this transaction */
  private savepoints: Map<string, Savepoint> = new Map();

  /** Locks held by this transaction */
  private locks: Map<string, LockRecord> = new Map();

  /** Reference to the transaction manager */
  private readonly manager: TransactionManager;

  /** Transaction options */
  private readonly options: TransactionOptions;

  constructor(
    id: string,
    manager: TransactionManager,
    options: TransactionOptions = {}
  ) {
    this.id = id;
    this.manager = manager;
    this.options = options;
    this.isolationLevel = options.isolationLevel ?? IsolationLevel.ReadCommitted;
    this.startTime = Date.now();
  }

  /**
   * Get current transaction state
   */
  get state(): TransactionState {
    return this._state;
  }

  /**
   * Add an operation to this transaction
   */
  addOperation(operation: TransactionOperation): void {
    if (this._state !== TransactionState.Active) {
      throw new TransactionError(
        `Cannot add operation to ${this._state} transaction`,
        'INVALID_STATE',
        { transactionId: this.id, state: this._state }
      );
    }

    // Check if we need a lock for this operation
    if (operation.key && (operation.type === 'update' || operation.type === 'delete')) {
      if (!this.hasLock(operation.table, operation.key)) {
        // Try to acquire the lock
        const acquired = this.tryAcquireLock(operation.table, operation.key);
        if (!acquired) {
          throw new TransactionError(
            `Cannot acquire lock on ${operation.table}:${operation.key}`,
            'LOCK_CONFLICT',
            { table: operation.table, key: operation.key }
          );
        }
      }
    }

    this.operations.push({
      ...operation,
      transactionId: this.id,
      timestamp: Date.now(),
    });
  }

  /**
   * Get all operations in this transaction
   */
  getOperations(): TransactionOperation[] {
    return [...this.operations];
  }

  /**
   * Get operations for a specific table from this transaction
   */
  getOwnOperations(table: string): TransactionOperation[] {
    return this.operations.filter(op => op.table === table);
  }

  /**
   * Get visible operations from committed transactions
   * Under read committed isolation, sees all committed changes
   */
  getVisibleOperations(table: string): TransactionOperation[] {
    return this.manager.getCommittedOperations(table);
  }

  /**
   * Commit this transaction
   */
  async commit(): Promise<void> {
    if (this._state !== TransactionState.Active) {
      throw new TransactionError(
        `Cannot commit ${this._state} transaction`,
        'INVALID_STATE',
        { transactionId: this.id, state: this._state }
      );
    }

    this._state = TransactionState.Committing;

    try {
      // Check for simulated errors (for testing atomicity)
      for (const op of this.operations) {
        if (op.simulateError) {
          throw new TransactionError(
            `Simulated error: ${op.simulateError}`,
            op.simulateError,
            { operation: op }
          );
        }
      }

      // Apply all operations atomically
      await this.manager.applyOperations(this.id, this.operations);

      this._state = TransactionState.Committed;
      this.endTime = Date.now();

      // Release all locks
      this.releaseLocks();

      // Remove from active transactions
      this.manager.removeTransaction(this);

    } catch (error) {
      // On any error, rollback
      this._state = TransactionState.RolledBack;
      this.endTime = Date.now();
      this.operations = [];
      this.releaseLocks();
      this.manager.removeTransaction(this);
      throw error;
    }
  }

  /**
   * Rollback this transaction
   */
  async rollback(): Promise<void> {
    if (this._state === TransactionState.Committed) {
      throw new TransactionError(
        'Cannot rollback committed transaction',
        'INVALID_STATE',
        { transactionId: this.id, state: this._state }
      );
    }

    if (this._state === TransactionState.RolledBack) {
      // Idempotent - already rolled back
      return;
    }

    this._state = TransactionState.RollingBack;

    // Discard all operations
    this.operations = [];

    // Release all locks
    this.releaseLocks();

    this._state = TransactionState.RolledBack;
    this.endTime = Date.now();

    // Remove from active transactions
    this.manager.removeTransaction(this);
  }

  /**
   * Create a savepoint
   */
  savepoint(name: string): Savepoint {
    if (this._state !== TransactionState.Active) {
      throw new TransactionError(
        `Cannot create savepoint in ${this._state} transaction`,
        'INVALID_STATE',
        { transactionId: this.id, state: this._state }
      );
    }

    const sp: Savepoint = {
      name,
      index: this.operations.length,
    };

    this.savepoints.set(name, sp);
    return sp;
  }

  /**
   * Rollback to a savepoint
   */
  async rollbackToSavepoint(savepoint: Savepoint): Promise<void> {
    if (this._state !== TransactionState.Active) {
      throw new TransactionError(
        `Cannot rollback to savepoint in ${this._state} transaction`,
        'INVALID_STATE',
        { transactionId: this.id, state: this._state }
      );
    }

    const sp = this.savepoints.get(savepoint.name);
    if (!sp || sp.index !== savepoint.index) {
      throw new TransactionError(
        `Savepoint '${savepoint.name}' not found or invalid`,
        'INVALID_SAVEPOINT',
        { savepoint: savepoint.name }
      );
    }

    // Truncate operations to savepoint index
    this.operations = this.operations.slice(0, sp.index);

    // Remove all savepoints created after this one
    for (const [name, existingSp] of this.savepoints) {
      if (existingSp.index > sp.index) {
        this.savepoints.delete(name);
      }
    }
  }

  /**
   * Acquire a lock on a resource
   */
  acquireLock(table: string, key: string): void {
    const lockKey = `${table}:${key}`;

    if (this.manager.isLocked(table, key) && this.manager.getLockholder(table, key) !== this.id) {
      throw new TransactionError(
        `Resource ${lockKey} is locked by another transaction`,
        'LOCK_CONFLICT',
        { table, key, holder: this.manager.getLockholder(table, key) }
      );
    }

    const lock: LockRecord = {
      table,
      key,
      transactionId: this.id,
      acquiredAt: Date.now(),
    };

    this.locks.set(lockKey, lock);
    this.manager.registerLock(lock);
  }

  /**
   * Try to acquire a lock, returns false if already locked
   */
  tryAcquireLock(table: string, key: string): boolean {
    if (this.manager.isLocked(table, key) && this.manager.getLockholder(table, key) !== this.id) {
      return false;
    }

    try {
      this.acquireLock(table, key);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if this transaction holds a lock
   */
  hasLock(table: string, key: string): boolean {
    const lockKey = `${table}:${key}`;
    return this.locks.has(lockKey);
  }

  /**
   * Release all locks held by this transaction
   */
  private releaseLocks(): void {
    for (const lock of this.locks.values()) {
      this.manager.releaseLock(lock);
    }
    this.locks.clear();
  }
}

// =============================================================================
// TransactionManager Class
// =============================================================================

/**
 * Manages transaction lifecycle and state
 */
export class TransactionManager {
  /** Counter for generating unique transaction IDs */
  private transactionCounter = 0;

  /** Active transactions */
  private activeTransactions: Map<string, Transaction> = new Map();

  /** Completed transaction history */
  private transactionHistory: Transaction[] = [];

  /** Current locks */
  private locks: Map<string, LockRecord> = new Map();

  /** Committed operations by table */
  private committedOperations: Map<string, TransactionOperation[]> = new Map();

  /**
   * Begin a new transaction
   */
  begin(options: TransactionOptions = {}): Transaction {
    const id = `tx-${Date.now()}-${++this.transactionCounter}`;
    const tx = new Transaction(id, this, options);
    this.activeTransactions.set(id, tx);
    return tx;
  }

  /**
   * Get all active transactions
   */
  getActiveTransactions(): Transaction[] {
    return Array.from(this.activeTransactions.values());
  }

  /**
   * Get transaction history (completed transactions)
   */
  getTransactionHistory(): Transaction[] {
    return [...this.transactionHistory];
  }

  /**
   * Get committed operations for a table
   */
  getCommittedOperations(table: string): TransactionOperation[] {
    return this.committedOperations.get(table) ?? [];
  }

  /**
   * Check if a resource is locked
   */
  isLocked(table: string, key: string): boolean {
    return this.locks.has(`${table}:${key}`);
  }

  /**
   * Get the transaction ID holding a lock
   */
  getLockholder(table: string, key: string): string | undefined {
    return this.locks.get(`${table}:${key}`)?.transactionId;
  }

  /**
   * Register a lock (called by Transaction)
   * @internal
   */
  registerLock(lock: LockRecord): void {
    this.locks.set(`${lock.table}:${lock.key}`, lock);
  }

  /**
   * Release a lock (called by Transaction)
   * @internal
   */
  releaseLock(lock: LockRecord): void {
    this.locks.delete(`${lock.table}:${lock.key}`);
  }

  /**
   * Apply operations from a committed transaction
   * @internal
   */
  async applyOperations(transactionId: string, operations: TransactionOperation[]): Promise<void> {
    // Group operations by table
    for (const op of operations) {
      const tableOps = this.committedOperations.get(op.table) ?? [];
      tableOps.push({
        ...op,
        transactionId,
        timestamp: Date.now(),
      });
      this.committedOperations.set(op.table, tableOps);
    }
  }

  /**
   * Remove a transaction from the active list
   * @internal
   */
  removeTransaction(tx: Transaction): void {
    this.activeTransactions.delete(tx.id);
    this.transactionHistory.push(tx);
  }
}

// =============================================================================
// Exports
// =============================================================================

export type {
  TransactionOperation,
  Savepoint,
  TransactionOptions,
};
