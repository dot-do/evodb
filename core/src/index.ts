// @evodb/core
// Ultra-minimal columnar JSON storage for Cloudflare DO SQLite blobs
//
// This package is organized into submodules for better maintainability.
// All exports are re-exported here for backward compatibility.
//
// Submodule imports are also available:
//   import { Type } from '@evodb/core/types';
//   import { encode, decode } from '@evodb/core/encoding';
//   import { shred, unshred } from '@evodb/core/shredding';
//   import { writeBlock, readBlock } from '@evodb/core/block';
//   import { createDOAdapter } from '@evodb/core/storage';
//   import { createWalEntry } from '@evodb/core/wal';
//   import { inferSchema } from '@evodb/core/schema';
//   import { evaluateFilters, QueryExecutor } from '@evodb/core/query';
//   import { EvoDB, QueryBuilder } from '@evodb/core/evodb';
//   import { encodeSnippetColumn } from '@evodb/core/snippet';
//   import { calculatePartitions } from '@evodb/core/partition';
//   import { mergeBlocks } from '@evodb/core/merge';
//   import { KB, MB, GB } from '@evodb/core/constants';
//   import { EvoDBError, QueryError } from '@evodb/core/errors';
//   import { isArray, isRecord } from '@evodb/core/guards';
//   import { createLogger } from '@evodb/core/logging';

// =============================================================================
// Errors (typed exception classes)
// =============================================================================

export * from './errors/index.js';

// =============================================================================
// EvoDB High-Level Facade
// =============================================================================

export * from './evodb/index.js';

// =============================================================================
// Core Types
// =============================================================================

export * from './types/index.js';

// =============================================================================
// JSON Shredding
// =============================================================================

export * from './shredding/index.js';

// =============================================================================
// Encoding
// =============================================================================

export * from './encoding/index.js';

// =============================================================================
// Block Format
// =============================================================================

export * from './block/index.js';

// =============================================================================
// WAL
// =============================================================================

export * from './wal/index.js';

// =============================================================================
// Schema
// =============================================================================

export * from './schema/index.js';

// =============================================================================
// Storage
// =============================================================================

export * from './storage/index.js';

// =============================================================================
// Merge/Compaction
// =============================================================================

export * from './merge/index.js';

// =============================================================================
// Partition Modes
// Three deployment targets: DO-SQLite (2MB), Standard (500MB), Enterprise (5GB)
// =============================================================================

export * from './partition/index.js';

// =============================================================================
// Query Operations
// Shared across @evodb/query and @evodb/reader
// =============================================================================

export * from './query/index.js';

// =============================================================================
// Snippet-Optimized Format
// Optimized for Cloudflare Snippets: 5ms CPU, 32MB RAM, 5 subrequests
// =============================================================================

export * from './snippet/index.js';

// =============================================================================
// Common Constants
// =============================================================================

export * from './constants/index.js';

// =============================================================================
// Type Guards (runtime validation for type safety)
// =============================================================================

export * from './guards/index.js';

// =============================================================================
// Structured Logging
// =============================================================================

export * from './logging/index.js';

// =============================================================================
// Observability Metrics (Prometheus export)
// =============================================================================

export * from './metrics.js';

// =============================================================================
// Distributed Tracing (OpenTelemetry compatible)
// =============================================================================

export * from './tracing/index.js';
