/**
 * Strategy Pattern Exports
 *
 * This module provides the strategy interfaces and implementations
 * for LakehouseWriter's main concerns:
 * - Buffer management
 * - Block writing
 * - Compaction
 */

// Interfaces
export type {
  CDCBufferStrategy,
  BlockWriter,
  BlockWriteResult,
  CompactionStrategy,
  CompactionMetrics,
  ManifestManager,
  ManifestBlockEntry,
  WriterOrchestratorConfig,
  WriterMetrics,
} from './interfaces.js';

// Buffer Strategies
export {
  SizeBasedBufferStrategy,
  TimeBasedBufferStrategy,
  HybridBufferStrategy,
  createBufferStrategy,
  createBufferStrategyOfType,
  type BufferStrategyOptions,
  type BufferStrategyType,
} from './buffer-strategy.js';

// Block Writers
export {
  R2BlockWriterAdapter,
  InMemoryBlockWriter,
  createBlockWriter,
} from './block-writer.js';

// Compaction Strategies
export {
  SizeBasedCompaction,
  TimeBasedCompaction,
  LsnBasedCompaction,
  NoOpCompaction,
  createCompactionStrategy,
  createCompactionStrategyOfType,
  type CompactionStrategyOptions,
  type CompactionStrategyType,
} from './compaction-strategy.js';
