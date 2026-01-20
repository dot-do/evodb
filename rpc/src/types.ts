/**
 * Lakehouse RPC Types
 *
 * Type definitions for DO-to-DO RPC communication with WebSocket hibernation.
 * Designed for Child DO -> Parent DO CDC aggregation in a distributed lakehouse.
 *
 * Architecture:
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
 */

import type {
  RpcWalEntry as CoreRpcWalEntry,
  RpcWalOperation as CoreRpcWalOperation,
  RpcWalOperationCodeValue as CoreRpcWalOperationCodeValue,
} from '@evodb/core';
import { RpcWalOperationCode as CoreRpcWalOperationCode } from '@evodb/core';

// =============================================================================
// WAL Entry Types (unified from @evodb/core)
// =============================================================================

/**
 * Operation types for WAL entries.
 * Uses unified type from @evodb/core.
 */
export type WalOperation = CoreRpcWalOperation;

/**
 * Numeric representation of WAL operations for efficient binary encoding.
 * Uses unified constant from @evodb/core.
 */
export const WalOperationCode = CoreRpcWalOperationCode;

export type WalOperationCodeValue = CoreRpcWalOperationCodeValue;

/**
 * A single WAL (Write-Ahead Log) entry from a Child DO.
 * Uses unified RpcWalEntry type from @evodb/core.
 *
 * These entries are captured from SQLite triggers in the Child DO's
 * columnar JSON storage and sent to the Parent DO for aggregation.
 */
export type WalEntry<T = unknown> = CoreRpcWalEntry<T>;

// =============================================================================
// RPC Message Types (Child -> Parent)
// =============================================================================

/**
 * Message type discriminator for RPC protocol
 */
export type RpcMessageType =
  | 'cdc_batch'
  | 'ack'
  | 'nack'
  | 'heartbeat'
  | 'connect'
  | 'disconnect'
  | 'flush_request'
  | 'status';

/**
 * Base interface for all RPC messages
 */
export interface RpcMessage {
  /** Message type discriminator */
  type: RpcMessageType;

  /** Message timestamp */
  timestamp: number;

  /** Optional correlation ID for request/response matching */
  correlationId?: string;
}

/**
 * CDC Batch message - Child DO sends WAL entries to Parent
 *
 * This is the primary message type for streaming CDC data from
 * Child DOs to the Parent DO aggregator.
 */
export interface CDCBatchMessage extends RpcMessage {
  type: 'cdc_batch';

  /** ID of the source Durable Object */
  sourceDoId: string;

  /** Human-readable name of the source shard (optional) */
  sourceShardName?: string;

  /** WAL entries in this batch */
  entries: WalEntry[];

  /** Sequence number of this batch (for ordering and deduplication) */
  sequenceNumber: number;

  /** First entry sequence in this batch */
  firstEntrySequence: number;

  /** Last entry sequence in this batch */
  lastEntrySequence: number;

  /** Total size of entries in bytes (approximate) */
  sizeBytes: number;

  /** Whether this is a retry */
  isRetry: boolean;

  /** Retry count (0 for first attempt) */
  retryCount: number;
}

/**
 * Connect message - Child DO initiates connection to Parent
 */
export interface ConnectMessage extends RpcMessage {
  type: 'connect';

  /** ID of the connecting Durable Object */
  sourceDoId: string;

  /** Human-readable name of the source shard */
  sourceShardName?: string;

  /** Last acknowledged sequence number (for resumption) */
  lastAckSequence: number;

  /** Protocol version */
  protocolVersion: number;

  /** Client capabilities */
  capabilities: ClientCapabilities;
}

/**
 * Heartbeat message - Keep connection alive during hibernation
 */
export interface HeartbeatMessage extends RpcMessage {
  type: 'heartbeat';

  /** ID of the source Durable Object */
  sourceDoId: string;

  /** Last acknowledged sequence number */
  lastAckSequence: number;

  /** Number of pending entries in client buffer */
  pendingEntries: number;
}

/**
 * Flush request message - Child requests Parent to flush buffers
 */
export interface FlushRequestMessage extends RpcMessage {
  type: 'flush_request';

  /** ID of the requesting Durable Object */
  sourceDoId: string;

  /** Reason for flush request */
  reason: 'manual' | 'shutdown' | 'buffer_full' | 'time_threshold';
}

// =============================================================================
// RPC Message Types (Parent -> Child)
// =============================================================================

/**
 * Acknowledgment message - Parent acknowledges receipt of CDC batch
 */
export interface AckMessage extends RpcMessage {
  type: 'ack';

  /** Sequence number being acknowledged */
  sequenceNumber: number;

  /** Status of the acknowledged batch */
  status: AckStatus;

  /** ID of the batch that was acknowledged */
  batchId?: string;

  /** Additional details about the acknowledgment */
  details?: AckDetails;
}

/**
 * Acknowledgment status
 */
export type AckStatus =
  | 'ok' // Batch received and will be processed
  | 'buffered' // Batch buffered in memory, not yet persisted
  | 'persisted' // Batch persisted to R2
  | 'duplicate' // Batch was already received (deduplication)
  | 'fallback'; // Batch stored in local fallback storage

/**
 * Additional acknowledgment details
 */
export interface AckDetails {
  /** Number of entries processed */
  entriesProcessed: number;

  /** Current buffer utilization (0-1) */
  bufferUtilization: number;

  /** Estimated time until next flush (ms) */
  timeUntilFlush?: number;

  /** R2 path where data was persisted (if persisted) */
  persistedPath?: string;
}

/**
 * Negative acknowledgment - Parent rejects batch
 */
export interface NackMessage extends RpcMessage {
  type: 'nack';

  /** Sequence number being rejected */
  sequenceNumber: number;

  /** Reason for rejection */
  reason: NackReason;

  /** Error message */
  errorMessage: string;

  /** Whether client should retry */
  shouldRetry: boolean;

  /** Suggested retry delay in milliseconds */
  retryDelayMs?: number;
}

/**
 * Reasons for negative acknowledgment
 */
export type NackReason =
  | 'buffer_full' // Parent buffer is full
  | 'rate_limited' // Too many requests from this client
  | 'invalid_sequence' // Sequence number out of order
  | 'invalid_format' // Message format error
  | 'internal_error' // Internal server error
  | 'shutting_down'; // Parent is shutting down

/**
 * Status response message
 */
export interface StatusMessage extends RpcMessage {
  type: 'status';

  /** Current parent DO state */
  state: ParentState;

  /** Buffer statistics */
  buffer: BufferStats;

  /** Connected children */
  connectedChildren: number;

  /** Last flush time */
  lastFlushTime?: number;

  /** Next scheduled flush time */
  nextFlushTime?: number;
}

// =============================================================================
// Client Capabilities
// =============================================================================

/**
 * Capabilities advertised by the client during connection
 */
export interface ClientCapabilities {
  /** Supports binary protocol */
  binaryProtocol: boolean;

  /** Supports compression */
  compression: boolean;

  /** Supports batching */
  batching: boolean;

  /** Maximum batch size client can send */
  maxBatchSize: number;

  /** Maximum message size client can send */
  maxMessageSize: number;
}

/**
 * Default client capabilities
 */
export const DEFAULT_CLIENT_CAPABILITIES: ClientCapabilities = {
  binaryProtocol: true,
  compression: false,
  batching: true,
  maxBatchSize: 1000,
  maxMessageSize: 4 * 1024 * 1024, // 4MB
};

// =============================================================================
// Buffer Types (Parent DO)
// =============================================================================

/**
 * A buffered batch in the Parent DO
 */
export interface BufferedBatch {
  /** Unique batch ID */
  batchId: string;

  /** ID of the source Durable Object */
  sourceDoId: string;

  /** Source shard name (optional) */
  sourceShardName?: string;

  /** WAL entries in this batch */
  entries: WalEntry[];

  /** When the batch was received */
  receivedAt: number;

  /** Sequence number of this batch */
  sequenceNumber: number;

  /** Whether the batch has been persisted to R2 */
  persisted: boolean;

  /** Whether the batch is in fallback storage */
  inFallback: boolean;

  /** Size of the batch in bytes */
  sizeBytes: number;
}

/**
 * Buffer statistics
 */
export interface BufferStats {
  /** Total number of batches in buffer */
  batchCount: number;

  /** Total number of entries across all batches */
  entryCount: number;

  /** Total size in bytes */
  totalSizeBytes: number;

  /** Buffer utilization (0-1) */
  utilization: number;

  /** Oldest batch timestamp */
  oldestBatchTime?: number;

  /** Newest batch timestamp */
  newestBatchTime?: number;
}

/**
 * Parent DO state
 */
export type ParentState =
  | 'idle' // No active connections, buffer may have data
  | 'receiving' // Actively receiving data
  | 'flushing' // Flushing to R2
  | 'recovering' // Recovering from fallback storage
  | 'error'; // Error state

// =============================================================================
// Flush Types
// =============================================================================

/**
 * Result of flushing buffers to R2
 */
export interface FlushResult {
  /** Whether the flush was successful */
  success: boolean;

  /** Number of batches flushed */
  batchesFlushed: number;

  /** Number of entries flushed */
  entriesFlushed: number;

  /** Total bytes written */
  bytesWritten: number;

  /** R2 paths where data was written */
  paths: string[];

  /** Duration of flush operation in milliseconds */
  durationMs: number;

  /** Error message if flush failed */
  error?: string;

  /** Whether fallback storage was used */
  usedFallback: boolean;
}

/**
 * Flush trigger reasons
 */
export type FlushTrigger =
  | 'threshold_entries' // Entry count threshold reached
  | 'threshold_size' // Size threshold reached
  | 'threshold_time' // Time threshold reached
  | 'manual' // Manual flush request
  | 'shutdown' // Graceful shutdown
  | 'memory_pressure'; // Memory pressure detected

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Parent DO configuration
 */
export interface ParentConfig {
  /** R2 bucket name for data storage */
  r2BucketName: string;

  /** Base path in R2 for Iceberg table */
  r2BasePath: string;

  /** Maximum entries before flush */
  flushThresholdEntries: number;

  /** Maximum size in bytes before flush */
  flushThresholdBytes: number;

  /** Maximum age of buffer before flush (ms) */
  flushThresholdMs: number;

  /** Interval for scheduled flushes (ms) */
  flushIntervalMs: number;

  /** Maximum buffer size in bytes */
  maxBufferSize: number;

  /** Enable local fallback storage on R2 failure */
  enableFallback: boolean;

  /** Maximum fallback storage size */
  maxFallbackSize: number;

  /** Enable deduplication */
  enableDeduplication: boolean;

  /** Deduplication window in milliseconds */
  deduplicationWindowMs: number;
}

/**
 * Default parent configuration
 */
export const DEFAULT_PARENT_CONFIG: ParentConfig = {
  r2BucketName: 'lakehouse-data',
  r2BasePath: 'tables/cdc',
  flushThresholdEntries: 10000,
  flushThresholdBytes: 32 * 1024 * 1024, // 32MB
  flushThresholdMs: 60_000, // 1 minute
  flushIntervalMs: 30_000, // 30 seconds
  maxBufferSize: 128 * 1024 * 1024, // 128MB
  enableFallback: true,
  maxFallbackSize: 64 * 1024 * 1024, // 64MB
  enableDeduplication: true,
  deduplicationWindowMs: 300_000, // 5 minutes
};

/**
 * Child DO (client) configuration
 */
export interface ChildConfig {
  /** Parent DO stub or URL */
  parentDoUrl: string;

  /** Maximum batch size (entries) */
  maxBatchSize: number;

  /** Maximum batch size (bytes) */
  maxBatchBytes: number;

  /** Batch timeout before sending (ms) */
  batchTimeoutMs: number;

  /** Retry attempts on failure */
  maxRetries: number;

  /** Initial retry delay (ms) */
  initialRetryDelayMs: number;

  /** Maximum retry delay (ms) */
  maxRetryDelayMs: number;

  /** Exponential backoff multiplier */
  backoffMultiplier: number;

  /** Enable automatic reconnection */
  autoReconnect: boolean;

  /** Reconnection delay (ms) */
  reconnectDelayMs: number;

  /** Maximum reconnection attempts */
  maxReconnectAttempts: number;

  /** Heartbeat interval (ms) */
  heartbeatIntervalMs: number;

  /** Maximum number of pending batches awaiting acknowledgment (prevents unbounded growth) */
  maxPendingBatches: number;

  /** TTL for pending batches in milliseconds (batches older than this are cleaned up) */
  pendingBatchTtlMs: number;

  /** Interval for automatic pending batch cleanup in milliseconds */
  pendingBatchCleanupIntervalMs: number;

  /** Optional callback for custom error handling when event handlers throw */
  onHandlerError?: (event: string, error: Error) => void;
}

/**
 * Default child configuration
 */
export const DEFAULT_CHILD_CONFIG: ChildConfig = {
  parentDoUrl: '',
  maxBatchSize: 1000,
  maxBatchBytes: 4 * 1024 * 1024, // 4MB
  batchTimeoutMs: 1000, // 1 second
  maxRetries: 3,
  initialRetryDelayMs: 100,
  maxRetryDelayMs: 10_000, // 10 seconds
  backoffMultiplier: 2,
  autoReconnect: true,
  reconnectDelayMs: 1000,
  maxReconnectAttempts: 10,
  heartbeatIntervalMs: 30_000, // 30 seconds
  maxPendingBatches: 100, // Prevent unbounded growth
  pendingBatchTtlMs: 30_000, // 30 seconds TTL for pending batches
  pendingBatchCleanupIntervalMs: 5_000, // Cleanup every 5 seconds
};

// =============================================================================
// WebSocket Attachment Types
// =============================================================================

/**
 * Data stored with hibernating WebSocket connection
 *
 * This data survives DO hibernation and is used to restore
 * connection state when the DO wakes up.
 *
 * IMPORTANT: Must be structured-clone compatible and <= 2048 bytes
 */
export interface WebSocketAttachment {
  /** ID of the connected child DO */
  childDoId: string;

  /** Name of the child shard */
  childShardName?: string;

  /** Last acknowledged sequence number */
  lastAckSequence: number;

  /** Connection timestamp */
  connectedAt: number;

  /** Protocol version */
  protocolVersion: number;

  /** Client capabilities flags (compressed) */
  capabilityFlags: number;
}

/**
 * Capability flags for compact storage in WebSocket attachment
 */
export const CapabilityFlags = {
  BINARY_PROTOCOL: 0x01,
  COMPRESSION: 0x02,
  BATCHING: 0x04,
} as const;

/**
 * Encode client capabilities to flags
 */
export function encodeCapabilities(caps: ClientCapabilities): number {
  let flags = 0;
  if (caps.binaryProtocol) flags |= CapabilityFlags.BINARY_PROTOCOL;
  if (caps.compression) flags |= CapabilityFlags.COMPRESSION;
  if (caps.batching) flags |= CapabilityFlags.BATCHING;
  return flags;
}

/**
 * Decode flags to client capabilities
 */
export function decodeCapabilities(flags: number): Partial<ClientCapabilities> {
  return {
    binaryProtocol: (flags & CapabilityFlags.BINARY_PROTOCOL) !== 0,
    compression: (flags & CapabilityFlags.COMPRESSION) !== 0,
    batching: (flags & CapabilityFlags.BATCHING) !== 0,
  };
}

// =============================================================================
// Error Types
// =============================================================================

/**
 * Base error class for lakehouse RPC
 */
export class LakehouseRpcError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'LakehouseRpcError';
  }
}

/**
 * Connection error
 */
export class ConnectionError extends LakehouseRpcError {
  constructor(message: string, retryable: boolean = true) {
    super(message, 'CONNECTION_ERROR', retryable);
    this.name = 'ConnectionError';
  }
}

/**
 * Buffer overflow error
 */
export class BufferOverflowError extends LakehouseRpcError {
  constructor(message: string) {
    super(message, 'BUFFER_OVERFLOW', true);
    this.name = 'BufferOverflowError';
  }
}

/**
 * Flush error
 */
export class FlushError extends LakehouseRpcError {
  constructor(
    message: string,
    public readonly usedFallback: boolean
  ) {
    super(message, 'FLUSH_ERROR', true);
    this.name = 'FlushError';
  }
}

/**
 * Protocol error
 */
export class ProtocolError extends LakehouseRpcError {
  constructor(message: string) {
    super(message, 'PROTOCOL_ERROR', false);
    this.name = 'ProtocolError';
  }
}

// =============================================================================
// Utility Types
// =============================================================================

/**
 * Union type of all client messages (Child -> Parent)
 */
export type ClientRpcMessage =
  | CDCBatchMessage
  | ConnectMessage
  | HeartbeatMessage
  | FlushRequestMessage;

/**
 * Union type of all server messages (Parent -> Child)
 */
export type ServerRpcMessage = AckMessage | NackMessage | StatusMessage;

/**
 * All RPC message types
 */
export type AnyRpcMessage = ClientRpcMessage | ServerRpcMessage;

/**
 * Type guard for CDC batch message
 */
export function isCDCBatchMessage(msg: RpcMessage): msg is CDCBatchMessage {
  return msg.type === 'cdc_batch';
}

/**
 * Type guard for ack message
 */
export function isAckMessage(msg: RpcMessage): msg is AckMessage {
  return msg.type === 'ack';
}

/**
 * Type guard for nack message
 */
export function isNackMessage(msg: RpcMessage): msg is NackMessage {
  return msg.type === 'nack';
}

/**
 * Type guard for connect message
 */
export function isConnectMessage(msg: RpcMessage): msg is ConnectMessage {
  return msg.type === 'connect';
}

/**
 * Type guard for heartbeat message
 */
export function isHeartbeatMessage(msg: RpcMessage): msg is HeartbeatMessage {
  return msg.type === 'heartbeat';
}

/**
 * Generate a unique batch ID
 */
export function generateBatchId(sourceDoId: string, sequence: number): string {
  return `${sourceDoId.slice(0, 8)}_${sequence}_${Date.now().toString(36)}`;
}

/**
 * Generate a unique correlation ID
 */
export function generateCorrelationId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
