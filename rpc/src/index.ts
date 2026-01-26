/**
 * @dotdo/poc-lakehouse-rpc
 *
 * DO-to-DO RPC with WebSocket Hibernation for distributed lakehouse CDC aggregation.
 *
 * This package provides the infrastructure for streaming CDC (Change Data Capture)
 * events from child Durable Objects to a parent aggregator DO, which buffers and
 * flushes data to R2 for Iceberg table storage.
 *
 * Key Features:
 * - WebSocket Hibernation: 95% cost reduction on idle connections
 * - Binary Protocol: Efficient encoding for high-throughput CDC streaming
 * - Automatic Batching: Client-side batching with configurable thresholds
 * - Buffer Management: Parent-side buffering with configurable flush triggers
 * - Fallback Storage: Local DO storage fallback when R2 is unavailable
 * - Deduplication: Prevent duplicate entries from retries
 *
 * Architecture:
 * ```
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                          Child DOs (Shards)                             │
 * │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐       │
 * │  │ Shard 1 │  │ Shard 2 │  │ Shard 3 │  │ Shard N │  │  ...    │       │
 * │  │ (JSON)  │  │ (JSON)  │  │ (JSON)  │  │ (JSON)  │  │         │       │
 * │  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘       │
 * │       │            │            │            │            │            │
 * │       │  WebSocket │ Hibernation│ (95% cost │discount)   │            │
 * │       ▼            ▼            ▼            ▼            ▼            │
 * │  ┌───────────────────────────────────────────────────────────────┐     │
 * │  │                     Parent DO (Aggregator)                     │     │
 * │  │  - Receives CDC batches via WebSocket                          │     │
 * │  │  - Buffers in memory                                           │     │
 * │  │  - Flushes to R2 as Parquet/Iceberg                           │     │
 * │  │  - Falls back to local storage on R2 failure                   │     │
 * │  └───────────────────────────────────────────────────────────────┘     │
 * │                              │                                         │
 * │                              ▼                                         │
 * │                        ┌──────────┐                                    │
 * │                        │    R2    │                                    │
 * │                        │ (Iceberg)│                                    │
 * │                        └──────────┘                                    │
 * └─────────────────────────────────────────────────────────────────────────┘
 * ```
 *
 * @example Basic Usage
 * ```typescript
 * // wrangler.jsonc
 * {
 *   "durable_objects": {
 *     "bindings": [{
 *       "name": "LAKEHOUSE_PARENT",
 *       "class_name": "LakehouseParentDO"
 *     }]
 *   }
 * }
 *
 * // worker.ts
 * import { LakehouseParentDO } from '@dotdo/poc-lakehouse-rpc';
 *
 * export { LakehouseParentDO };
 *
 * export default {
 *   async fetch(request: Request, env: Env) {
 *     const id = env.LAKEHOUSE_PARENT.idFromName('aggregator');
 *     const stub = env.LAKEHOUSE_PARENT.get(id);
 *     return stub.fetch(request);
 *   }
 * };
 * ```
 *
 * @packageDocumentation
 */

// =============================================================================
// Types
// =============================================================================

export {
  // WAL types
  type WalEntry,
  type WalOperation,
  WalOperationCode,

  // RPC message types
  type RpcMessage,
  type RpcMessageType,
  type CDCBatchMessage,
  type ConnectMessage,
  type HeartbeatMessage,
  type FlushRequestMessage,
  type AckMessage,
  type NackMessage,
  type StatusMessage,
  type AckStatus,
  type AckDetails,
  type NackReason,

  // Buffer types
  type BufferedBatch,
  type BufferStats,
  type ParentState,
  type FlushResult,
  type FlushTrigger,

  // Configuration types
  type ParentConfig,
  type ChildConfig,
  type ClientCapabilities,
  type ConfigValidationResult,
  DEFAULT_PARENT_CONFIG,
  DEFAULT_CHILD_CONFIG,
  DEFAULT_CLIENT_CAPABILITIES,
  BUFFER_CONFIG_BOUNDS,
  validateParentConfig,

  // WebSocket attachment
  type WebSocketAttachment,
  CapabilityFlags,
  encodeCapabilities,
  decodeCapabilities,

  // Errors
  LakehouseRpcError,
  ConnectionError,
  BufferOverflowError,
  FlushError,
  ProtocolError,

  // Type guards and utilities
  type ClientRpcMessage,
  type ServerRpcMessage,
  type AnyRpcMessage,
  isCDCBatchMessage,
  isAckMessage,
  isNackMessage,
  isConnectMessage,
  isHeartbeatMessage,
  generateBatchId,
  generateCorrelationId,
} from './types.js';

// =============================================================================
// Protocol
// =============================================================================

export {
  ProtocolCodec,
  getCodec,
  encodeMessage,
  decodeMessage,
  isBinaryEncoded,
} from './protocol.js';

// =============================================================================
// Buffer Management
// =============================================================================

export {
  CDCBufferManager,
  type ChildConnectionState,
  type BufferSnapshot,
  type DedupStats,
  type DedupConfig,
  DEFAULT_DEDUP_CONFIG,
} from './buffer.js';

// =============================================================================
// Client
// =============================================================================

export {
  LakehouseRpcClient,
  createRpcClient,
  type ClientState,
  type ClientStats,
  type OnHandlerErrorCallback,
  type EventEmitterConfig,
} from './client.js';

// =============================================================================
// Server (Parent DO)
// =============================================================================

export {
  LakehouseParentDO,
  type LakehouseParentEnv,
} from './server.js';

// =============================================================================
// Fallback Storage
// =============================================================================

export {
  FallbackStorage,
  FallbackRecoveryManager,
  type DOStorage,
  type RecoveryConfig,
  DEFAULT_RECOVERY_CONFIG,
} from './fallback.js';
