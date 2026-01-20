/**
 * @evodb/core/wal - Write-Ahead Log operations
 *
 * This submodule exports WAL (Write-Ahead Log) functionality for
 * durability and recovery.
 *
 * @module wal
 */

export {
  createWalEntry,
  serializeWalEntry,
  deserializeWalEntry,
  batchWalEntries,
  unbatchWalEntries,
  getWalRange,
} from '../wal.js';
